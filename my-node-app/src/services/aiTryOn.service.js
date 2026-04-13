const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { query, newId } = require('../config/query')
let sharp
try {
    sharp = require('sharp')
} catch {
    sharp = null
}

let fetchFn
try {
    fetchFn = global.fetch || require('node-fetch')
    if (fetchFn && fetchFn.default) fetchFn = fetchFn.default
} catch {
    fetchFn = global.fetch
}

const fetch = fetchFn
const GEMINI_KEY = String(process.env.GEMINI_API_KEY || '').trim()
const ALLOW_DETECTION_FALLBACK = !['0', 'false', 'off', 'no'].includes(String(process.env.AI_TRYON_ALLOW_FALLBACK || '1').trim().toLowerCase())
const { generateWithControlNet } = require('./controlNet.adapter')
let geminiModelCache = { at: 0, data: [] }

function getTryOnUploadDir() {
    return path.join(__dirname, '..', '..', 'uploads', 'ai-tryon')
}

function parseImageDataUrl(dataUrl) {
    const raw = String(dataUrl || '').trim()
    const m = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i)
    if (!m) return null
    const kind = m[1].toLowerCase()
    const base64 = m[2]
    const ext = kind === 'jpeg' ? 'jpg' : kind
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    return { base64, ext, mime }
}

function escapeXml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function normalizeFingerName(value = '') {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return ''
    if (raw.includes('thumb')) return 'thumb'
    if (raw.includes('index')) return 'index'
    if (raw.includes('middle')) return 'middle'
    if (raw.includes('ring')) return 'ring'
    if (raw.includes('pinky') || raw.includes('little')) return 'pinky'
    return raw
}

function polygonToBoundsPx(polygon = [], width = 0, height = 0, padding = 0.08) {
    if (!Array.isArray(polygon) || polygon.length < 3 || width <= 0 || height <= 0) return null
    const xs = polygon.map((p) => clamp01(p ?.x, 0.5))
    const ys = polygon.map((p) => clamp01(p ?.y, 0.5))
    const minX = Math.max(0, Math.min(...xs) - padding)
    const minY = Math.max(0, Math.min(...ys) - padding)
    const maxX = Math.min(1, Math.max(...xs) + padding)
    const maxY = Math.min(1, Math.max(...ys) + padding)

    const left = Math.max(0, Math.floor(minX * width))
    const top = Math.max(0, Math.floor(minY * height))
    const w = Math.max(1, Math.ceil((maxX - minX) * width))
    const h = Math.max(1, Math.ceil((maxY - minY) * height))

    return {
        left,
        top,
        width: Math.min(w, Math.max(1, width - left)),
        height: Math.min(h, Math.max(1, height - top)),
    }
}

async function buildFingerTextureMap({ templateImageDataUrl = '', templateAnalysis = null } = {}) {
    if (!sharp) return {}
    const parsed = parseImageDataUrl(templateImageDataUrl)
    if (!parsed) return {}

    const nails = normalizeNails(templateAnalysis || {})
    if (!nails.length) return {}

    const input = Buffer.from(parsed.base64, 'base64')
    if (!input.length) return {}

    const meta = await sharp(input).metadata()
    const width = Number(meta.width || 0)
    const height = Number(meta.height || 0)
    if (width <= 0 || height <= 0) return {}

    const map = {}
    for (const nail of nails) {
        const finger = normalizeFingerName(nail ?.finger)
        if (!finger || map[finger]) continue

        const bounds = polygonToBoundsPx(nail ?.polygon, width, height, 0.08)
        if (!bounds) continue

        try {
            const crop = await sharp(input)
                .extract(bounds)
                .resize(300, 300, { fit: 'cover' })
                .png()
                .toBuffer()
            map[finger] = {
                dataUrl: `data:image/png;base64,${crop.toString('base64')}`,
                angleDeg: Number.isFinite(Number(nail ?.angleDeg)) ? Number(nail.angleDeg) : 0,
            }
        } catch {
            // Ignore per-finger extraction errors and keep remaining fingers.
        }
    }

    return map
}

function normalizeFingerTextureEntry(entry = null) {
    if (!entry) return null

    if (typeof entry === 'string') {
        const parsed = parseImageDataUrl(entry)
        if (!parsed) return null
        return { parsed, angleDeg: 0 }
    }

    if (typeof entry === 'object') {
        const parsed = parseImageDataUrl(entry.dataUrl || entry.imageDataUrl || '')
        if (!parsed) return null
        return {
            parsed,
            angleDeg: Number.isFinite(Number(entry.angleDeg)) ? Number(entry.angleDeg) : 0,
        }
    }

    return null
}

function canUseTemplateForFingerMapping(analysis = {}) {
    if (!analysis || typeof analysis !== 'object') return false
    if (!analysis.isHandDetected) return false

    const nails = normalizeNails(analysis)
    const good = nails.filter((n) => Number(n ?.confidence || 0) >= 0.35).length
    return good >= 3
}

function findFallbackTextureFinger(targetFinger = '', availableFingers = []) {
    const normalizedTarget = normalizeFingerName(targetFinger)
    const candidates = Array.isArray(availableFingers) ? availableFingers.map((x) => normalizeFingerName(x)).filter(Boolean) : []
    if (!normalizedTarget || !candidates.length) return ''
    if (candidates.includes(normalizedTarget)) return normalizedTarget

    const order = ['thumb', 'index', 'middle', 'ring', 'pinky']
    const targetIdx = order.indexOf(normalizedTarget)
    if (targetIdx < 0) return candidates[0]

    let best = candidates[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const finger of candidates) {
        const idx = order.indexOf(finger)
        if (idx < 0) continue
        const d = Math.abs(idx - targetIdx)
        if (d < bestDistance) {
            bestDistance = d
            best = finger
        }
    }

    return best
}

function hasFloralIntent({ design = {}, userPrompt = '' } = {}) {
    const text = [
        String(design ?.name || ''),
        String(userPrompt || ''),
    ].join(' ').toLowerCase()
    return /flower|floral|daisy|petal|hoa|bong hoa|cuc/i.test(text)
}

function buildOverlaySvg({ width, height, overlayPlan, templateImageDataUrl = '', fingerTextureMap = {}, similarityStrength = 0.82, coverageBoost = 1, useLabels = true }) {
    const overlays = Array.isArray(overlayPlan ?.overlays) ? overlayPlan.overlays : []
    const templateParsed = parseImageDataUrl(templateImageDataUrl)
    const hasTemplateTexture = Boolean(templateParsed ?.base64)
    const strength = Math.max(0.2, Math.min(1, Number(similarityStrength) || 0.82))
    const coverage = Math.max(0.85, Math.min(1.3, Number(coverageBoost) || 1))
    const fingerTextureEntries = Object.entries(fingerTextureMap || {})
        .map(([k, v]) => [normalizeFingerName(k), normalizeFingerTextureEntry(v)])
        .filter(([k, v]) => Boolean(k && v ?.parsed ?.base64))
    const hasFingerTemplateTexture = fingerTextureEntries.length > 0
    const availableTextureFingers = fingerTextureEntries.map(([finger]) => finger)
    const resolveTextureForFinger = (fingerName) => {
        const normalized = normalizeFingerName(fingerName)
        if (!normalized || !hasFingerTemplateTexture) return null

        const exact = fingerTextureEntries.find(([x]) => x === normalized)
        if (exact) return { finger: normalized, sourceFinger: normalized, entry: exact[1] }

        const fallbackFinger = findFallbackTextureFinger(normalized, availableTextureFingers)
        const fallback = fallbackFinger ? fingerTextureEntries.find(([x]) => x === fallbackFinger) : null
        if (!fallback) return null

        return { finger: normalized, sourceFinger: fallbackFinger, entry: fallback[1] }
    }

    const overlayPatterns = overlays
        .map((ov, index) => {
            const finger = normalizeFingerName(ov ?.finger)
            if (!finger) return ''
            const textureInfo = resolveTextureForFinger(finger)
            const entry = textureInfo ?.entry
            if (!entry ?.parsed ?.base64) return ''

            const cx = Math.round(clamp01(ov ?.transform ?.x, 0.5) * width)
            const cy = Math.round(clamp01(ov ?.transform ?.y, 0.5) * height)
            const targetAngle = Number.isFinite(Number(ov ?.transform ?.rotationDeg)) ? Number(ov.transform.rotationDeg) : 0
            const sourceAngle = Number.isFinite(Number(entry.angleDeg)) ? Number(entry.angleDeg) : 0
            const delta = Number((targetAngle - sourceAngle).toFixed(2))
            const id = `tplTex-${finger}-${textureInfo ?.sourceFinger || 'x'}-${index}`

            return [
                `  <pattern id="${id}" x="0" y="0" width="${width}" height="${height}" patternUnits="userSpaceOnUse" patternTransform="rotate(${delta} ${cx} ${cy})">`,
                `    <image href="data:${entry.parsed.mime};base64,${entry.parsed.base64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`,
                '  </pattern>',
            ].join('')
        })
        .filter(Boolean)

    const defs = hasTemplateTexture && hasFingerTemplateTexture ? [
            '<defs>',
            ...overlayPatterns,
            '</defs>',
        ].join('') :
        ''

    const polygons = overlays
        .map((ov, overlayIndex) => {
            const points = Array.isArray(ov ?.polygon) ? ov.polygon : []
            if (points.length < 3) return ''

            const fill = String(ov ?.style ?.colorPalette ?.[0] || '#ec4899')
            const opacity = Number.isFinite(Number(ov ?.style ?.opacity)) ?
                Math.max(0.2, Math.min(0.95, Number(ov.style.opacity))) :
                0.62

            const list = points
                .map((p) => `${Math.round(Number(p.x || 0) * width)},${Math.round(Number(p.y || 0) * height)}`)
                .join(' ')

            const label = escapeXml(String(ov ?.finger || ''))
            const finger = normalizeFingerName(ov ?.finger)
            const textureInfo = resolveTextureForFinger(finger)
            const hasFingerPattern = Boolean(textureInfo ?.entry)
            const fingerPatternId = hasFingerPattern ? `tplTex-${finger}-${textureInfo ?.sourceFinger || 'x'}-${overlayIndex}` : ''
            const lx = Math.round(Number(points[0] ?.x || 0) * width)
            const ly = Math.round(Number(points[0] ?.y || 0) * height) - 4

            const baseTemplateOpacity = Math.min(0.97, Math.max(0.72, opacity * strength * coverage))
            const baseSolidOpacity = Math.min(0.96, Math.max(0.2, opacity * coverage))
            const useTextureFill = Boolean(hasTemplateTexture && hasFingerPattern && fingerPatternId)
            const basePoly = useTextureFill ?
                `<polygon points="${list}" fill="url(#${fingerPatternId})" fill-opacity="${baseTemplateOpacity.toFixed(3)}" stroke="#ffffff" stroke-opacity="0.68" stroke-width="1" />` :
                `<polygon points="${list}" fill="${escapeXml(fill)}" fill-opacity="${baseSolidOpacity.toFixed(3)}" stroke="#ffffff" stroke-opacity="0.72" stroke-width="1" />`

            const tintOpacity = useTextureFill ?
                (0.05 + (1 - strength) * 0.12 + Math.max(0, coverage - 1) * 0.05) :
                (0.1 + Math.max(0, coverage - 1) * 0.06)
            const colorTint = `<polygon points="${list}" fill="${escapeXml(fill)}" fill-opacity="${Math.min(0.18, tintOpacity).toFixed(3)}" stroke="none" />`
            const softGloss = `<polygon points="${list}" fill="#ffffff" fill-opacity="${(0.03 + strength * 0.03).toFixed(3)}" stroke="none" />`

            return [
                basePoly,
                colorTint,
                softGloss,
                useLabels && label ? `<text x="${lx}" y="${ly}" fill="#ffffff" font-size="10">${label}</text>` : '',
            ].join('')
        })
        .join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  ${polygons}
</svg>`
}

async function renderLocalOverlayFallbackImage({ imageDataUrl, overlayPlan, templateImageDataUrl = '', fingerTextureMap = {}, similarityStrength = 0.82, coverageBoost = 1, useLabels = true }) {
    if (!sharp) return null
    const parsed = parseImageDataUrl(imageDataUrl)
    if (!parsed) return null

    const src = Buffer.from(parsed.base64, 'base64')
    if (!src.length) return null

    const img = sharp(src)
    const meta = await img.metadata()
    const width = Number(meta.width || 1024)
    const height = Number(meta.height || 1024)
    const svg = buildOverlaySvg({ width, height, overlayPlan, templateImageDataUrl, fingerTextureMap, similarityStrength, coverageBoost, useLabels })
    const composed = await img
        .composite([{ input: Buffer.from(svg), top: 0, left: 0, blend: 'over' }])
        .png()
        .toBuffer()

    return `data:image/png;base64,${composed.toString('base64')}`
}

function extToMime(ext = '') {
    const x = String(ext || '').toLowerCase().replace(/^\./, '')
    if (x === 'jpg' || x === 'jpeg') return 'image/jpeg'
    if (x === 'png') return 'image/png'
    if (x === 'webp') return 'image/webp'
    return 'application/octet-stream'
}

async function resolveTemplateImageDataUrl({ templateImageDataUrl = '', templateImageUrl = '' } = {}) {
    if (parseImageDataUrl(templateImageDataUrl)) {
        return String(templateImageDataUrl)
    }

    const rawUrl = String(templateImageUrl || '').trim()
    if (!rawUrl) return ''

    // Prefer local disk read for uploaded assets to avoid external HTTP fetch.
    if (rawUrl.startsWith('/uploads/')) {
        const relative = rawUrl.replace(/^\/+/, '').replace(/\//g, path.sep)
        const abs = path.join(__dirname, '..', '..', relative)
        const fileBuffer = await fs.readFile(abs)
        const mime = extToMime(path.extname(abs))
        return `data:${mime};base64,${fileBuffer.toString('base64')}`
    }

    if (!/^https?:\/\//i.test(rawUrl) || !fetch) return ''

    const res = await fetch(rawUrl)
    if (!res.ok) return ''

    const buf = Buffer.from(await res.arrayBuffer())
    const contentType = String(res.headers ?.get ?.('content-type') || '').toLowerCase()
    const mime = contentType.startsWith('image/') ? contentType : extToMime(path.extname(rawUrl))
    if (!mime.startsWith('image/')) return ''

    return `data:${mime};base64,${buf.toString('base64')}`
}

function normalizePublicImageUrl(rawUrl) {
    if (!rawUrl) return null

    const value = String(rawUrl).trim()
    if (!value) return null
    if (/^https?:\/\//i.test(value)) return value

    const unixPath = value.replace(/\\/g, '/')
    if (unixPath.startsWith('/')) return unixPath
    return `/${unixPath}`
}

function clamp01(value, fallback = 0) {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    if (n < 0) return 0
    if (n > 1) return 1
    return n
}

function parseGeminiJson(text) {
    const raw = String(text || '').trim()
    if (!raw) return null

    const candidates = [
        raw,
        raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim(),
    ]

    for (const item of candidates) {
        try {
            return JSON.parse(item)
        } catch {
            // ignore
        }
    }

    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(raw.slice(start, end + 1))
        } catch {
            return null
        }
    }

    return null
}

function buildFallbackDetection(reason = '') {
    const warn = String(reason || '').trim()
    return {
        isHandDetected: true,
        handedness: 'unknown',
        detectionConfidence: 0.42,
        fingers: [
            { name: 'thumb', detected: true, confidence: 0.45 },
            { name: 'index', detected: true, confidence: 0.45 },
            { name: 'middle', detected: true, confidence: 0.45 },
            { name: 'ring', detected: true, confidence: 0.45 },
            { name: 'pinky', detected: true, confidence: 0.45 },
        ],
        nails: [
            { finger: 'thumb', confidence: 0.4, angleDeg: 0, polygon: [{ x: 0.25, y: 0.55 }, { x: 0.32, y: 0.55 }, { x: 0.32, y: 0.63 }, { x: 0.25, y: 0.63 }] },
            { finger: 'index', confidence: 0.4, angleDeg: 0, polygon: [{ x: 0.40, y: 0.42 }, { x: 0.47, y: 0.42 }, { x: 0.47, y: 0.50 }, { x: 0.40, y: 0.50 }] },
            { finger: 'middle', confidence: 0.4, angleDeg: 0, polygon: [{ x: 0.52, y: 0.38 }, { x: 0.59, y: 0.38 }, { x: 0.59, y: 0.46 }, { x: 0.52, y: 0.46 }] },
            { finger: 'ring', confidence: 0.4, angleDeg: 0, polygon: [{ x: 0.63, y: 0.42 }, { x: 0.70, y: 0.42 }, { x: 0.70, y: 0.50 }, { x: 0.63, y: 0.50 }] },
            { finger: 'pinky', confidence: 0.4, angleDeg: 0, polygon: [{ x: 0.73, y: 0.50 }, { x: 0.79, y: 0.50 }, { x: 0.79, y: 0.57 }, { x: 0.73, y: 0.57 }] },
        ],
        segmentation: { handMaskQuality: 'poor', nailMaskQuality: 'poor' },
        qualityWarnings: [
            'Fallback nail detection was used due to Gemini response issues.',
            ...(warn ? [warn.slice(0, 220)] : []),
        ],
    }
}

function getGeminiVisionModelCandidates() {
    const fromEnv = String(process.env.GEMINI_VISION_MODELS || '').trim()
    if (fromEnv) {
        return fromEnv.split(',').map((x) => x.trim()).filter(Boolean)
    }

    // Keep this list modern and avoid deprecated 2.0-flash endpoint that returns 404.
    return [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-1.5-flash',
    ]
}

function getGeminiImageModelCandidates() {
    const fromEnv = String(process.env.GEMINI_IMAGE_MODELS || '').trim()
    if (fromEnv) {
        return fromEnv.split(',').map((x) => x.trim()).filter(Boolean)
    }

    return [
        'gemini-2.5-flash-image',
        'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image-preview',
    ]
}

function normalizeModelName(raw = '') {
    return String(raw || '').replace(/^models\//, '').trim()
}

async function listGeminiModels() {
    if (!fetch || !GEMINI_KEY) return []

    const now = Date.now()
    if (Array.isArray(geminiModelCache.data) && now - Number(geminiModelCache.at || 0) < 10 * 60 * 1000) {
        return geminiModelCache.data
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_KEY)}`
        const res = await fetch(url)
        if (!res.ok) return []
        const json = await res.json().catch(() => null)
        const items = Array.isArray(json ?.models) ? json.models : []
        geminiModelCache = { at: now, data: items }
        return items
    } catch {
        return []
    }
}

async function resolveAvailableGeminiImageModels() {
    const requested = getGeminiImageModelCandidates().map(normalizeModelName).filter(Boolean)
    const models = await listGeminiModels()
    if (!models.length) return requested

    const byName = new Map(
        models.map((m) => [normalizeModelName(m ?.name), Array.isArray(m ?.supportedGenerationMethods) ? m.supportedGenerationMethods : []])
    )

    const isGenerateContentCapable = (name) => byName.get(name) ?.includes('generateContent')
    const validRequested = requested.filter((name) => isGenerateContentCapable(name))
    if (validRequested.length) return validRequested

    const discovered = Array.from(byName.entries())
        .filter(([, methods]) => methods.includes('generateContent'))
        .map(([name]) => name)
        .filter((name) => /image|banana/i.test(name))

    if (discovered.length) return discovered

    // Last resort: try flash models that may still return image parts with responseModalities.
    return Array.from(byName.entries())
        .filter(([, methods]) => methods.includes('generateContent'))
        .map(([name]) => name)
        .filter((name) => /gemini-2\.5-flash|gemini-3.*flash/i.test(name))
        .slice(0, 3)
}

function extractGeminiImageDataUrl(responseLike) {
    const candidates = responseLike ?.candidates || []
    for (const cand of candidates) {
        const parts = cand ?.content ?.parts || []
        for (const part of parts) {
            const b64 = part ?.inlineData ?.data
            const mime = part ?.inlineData ?.mimeType || 'image/png'
            if (b64) return `data:${mime};base64,${b64}`
        }
    }
    return null
}

function normalizeNails(analysis = {}) {
    const nails = Array.isArray(analysis.nails) ? analysis.nails : []
    const normalized = []

    for (const existing of nails) {
        const polygon = Array.isArray(existing ?.polygon) ?
            existing.polygon.slice(0, 8).map((p) => ({ x: clamp01(p ?.x, 0.5), y: clamp01(p ?.y, 0.5) })) : []

        if (polygon.length < 3) continue

        normalized.push({
            finger: normalizeFingerName(existing ?.finger) || String(existing ?.finger || '').toLowerCase() || 'unknown',
            confidence: Number.isFinite(Number(existing ?.confidence)) ? Number(existing.confidence) : 0,
            polygon,
            angleDeg: Number.isFinite(Number(existing ?.angleDeg)) ? Number(existing.angleDeg) : 0,
        })
    }

    return normalized
}

function normalizeDesign(design = {}) {
    if (!design || typeof design !== 'object') return {}
    return design
}

function buildOverlayPlan(analysis = {}, design = {}) {
    const safeDesign = normalizeDesign(design)
    const designName = String(safeDesign.name || safeDesign.id || 'Custom Design')
    const colorPalette = Array.isArray(safeDesign.colorPalette) ? safeDesign.colorPalette.slice(0, 6) : []
    const textureUrl = safeDesign.textureUrl || null
    const finish = String(safeDesign.finish || 'glossy')
    const opacity = Number.isFinite(Number(safeDesign.opacity)) ? Math.min(1, Math.max(0.2, Number(safeDesign.opacity))) : 0.95

    const overlays = normalizeNails(analysis).map((nail) => {
        const xs = nail.polygon.map((p) => p.x)
        const ys = nail.polygon.map((p) => p.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)

        return {
            finger: nail.finger,
            confidence: nail.confidence,
            transform: {
                x: Number(((minX + maxX) / 2).toFixed(5)),
                y: Number(((minY + maxY) / 2).toFixed(5)),
                width: Number((maxX - minX).toFixed(5)),
                height: Number((maxY - minY).toFixed(5)),
                rotationDeg: Number((nail.angleDeg || 0).toFixed(2)),
            },
            polygon: nail.polygon,
            style: {
                designName,
                finish,
                opacity,
                colorPalette,
                textureUrl,
            },
        }
    })

    return {
        renderer: 'client-overlay-v1',
        realtime: true,
        overlays,
        frameHint: {
            alphaFeather: 0.18,
            edgeSoftness: 0.12,
            blendMode: 'soft-light',
        },
    }
}

function buildDetectionInstruction(handHint = '') {
    return [
        'Bạn là computer-vision assistant cho AI Try-On Nail.',
        'Phân tích ảnh bàn tay, trả về JSON thuần theo schema bên dưới. Không trả markdown.',
        'Schema bắt buộc:',
        '{',
        '  "isHandDetected": boolean,',
        '  "handedness": "left"|"right"|"unknown",',
        '  "detectionConfidence": number,',
        '  "fingers": [{"name":"thumb|index|middle|ring|pinky","detected":boolean,"confidence":number}],',
        '  "nails": [{"finger":"thumb|index|middle|ring|pinky","confidence":number,"angleDeg":number,"polygon":[{"x":number,"y":number}]}],',
        '  "segmentation": {"handMaskQuality":"good|medium|poor","nailMaskQuality":"good|medium|poor"},',
        '  "qualityWarnings": [string]',
        '}',
        'Tất cả tọa độ phải chuẩn hóa trong [0,1], theo kích thước ảnh gốc.',
        'Mỗi móng phải có polygon ít nhất 4 điểm.',
        `Ngữ cảnh thêm từ app: ${String(handHint || '').slice(0, 200)}`,
    ].join('\n')
}

async function callGeminiVisionJson({ imageDataUrl, instruction }) {
    if (!GEMINI_KEY) {
        const err = new Error('Missing GEMINI_API_KEY')
        err.statusCode = 503
        throw err
    }

    const parsed = parseImageDataUrl(imageDataUrl)
    if (!parsed) {
        const err = new Error('Invalid image data URL. Use PNG, JPG, JPEG, or WEBP.')
        err.statusCode = 400
        throw err
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(GEMINI_KEY)
    const modelNames = getGeminiVisionModelCandidates()
    const errors = []

    for (const modelName of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName })
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: instruction },
                        { inlineData: { mimeType: parsed.mime, data: parsed.base64 } },
                    ],
                }, ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1800,
                    responseMimeType: 'application/json',
                },
            })

            const parts = result ?.response ?.candidates ?.[0] ?.content ?.parts || []
            const fromParts = parts
                .map((p) => String(p ?.text || '').trim())
                .filter(Boolean)
                .join('\n')
            const text = String(fromParts || result ?.response ?.text ?.() || '').trim()
            const json = parseGeminiJson(text)
            if (json) return json
            errors.push(`${modelName}:invalid-json`)
        } catch (error) {
            errors.push(`${modelName}:${String(error?.message || error)}`)
        }
    }

    const err = new Error(`Gemini vision failed: ${errors.join(' | ')}`)
    err.statusCode = 502
    throw err
}

async function saveImageDataUrl(dataUrl, prefix = 'tryon') {
    const parsed = parseImageDataUrl(dataUrl)
    if (!parsed) return null

    const buf = Buffer.from(parsed.base64, 'base64')
    if (!buf.length) return null

    await fs.mkdir(getTryOnUploadDir(), { recursive: true })
    const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${parsed.ext}`
    const abs = path.join(getTryOnUploadDir(), fileName)
    await fs.writeFile(abs, buf)
    return `/uploads/ai-tryon/${fileName}`
}

async function tryGenerateWithGemini({ imageDataUrl, prompt, templateImageDataUrl = '' }) {
    if (!GEMINI_KEY) return { imageDataUrl: null, errors: ['Missing GEMINI_API_KEY'] }

    const parsed = parseImageDataUrl(imageDataUrl)
    if (!parsed) return { imageDataUrl: null, errors: ['Invalid imageDataUrl'] }
    const templateParsed = parseImageDataUrl(templateImageDataUrl)

    const models = await resolveAvailableGeminiImageModels()
    const errors = []

    // Prefer SDK for better compatibility with current API surface.
    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai')
        const genAI = new GoogleGenerativeAI(GEMINI_KEY)

        for (const modelName of models) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName })
                const result = await model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: parsed.mime, data: parsed.base64 } },
                            ...(templateParsed ? [{ inlineData: { mimeType: templateParsed.mime, data: templateParsed.base64 } }] : []),
                        ],
                    }, ],
                    generationConfig: {
                        responseModalities: ['TEXT', 'IMAGE'],
                        temperature: 0.15,
                    },
                })

                const fromSdk = extractGeminiImageDataUrl(result ?.response)
                if (fromSdk) {
                    return { imageDataUrl: fromSdk, errors }
                }
                errors.push(`${modelName}:no-image-part-sdk`)
            } catch (error) {
                errors.push(`${modelName}:sdk:${String(error?.message || error)}`)
            }
        }
    } catch (error) {
        errors.push(`sdk-init:${String(error?.message || error)}`)
    }

    if (!fetch) {
        return { imageDataUrl: null, errors }
    }

    for (const modelName of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`

        const payload = {
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: parsed.mime, data: parsed.base64 } },
                    ...(templateParsed ? [{ inlineData: { mimeType: templateParsed.mime, data: templateParsed.base64 } }] : []),
                ],
            }, ],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                temperature: 0.15,
            },
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            errors.push(`${modelName}:rest:http-${res.status}:${txt.slice(0, 160)}`)
            continue
        }

        const body = await res.json().catch(() => null)
        const fromRest = extractGeminiImageDataUrl(body)
        if (fromRest) return { imageDataUrl: fromRest, errors }

        errors.push(`${modelName}:rest:no-image-part`)
    }

    return { imageDataUrl: null, errors }
}


async function maybeUrlToDataUrl(value, defaultMime = 'image/png') {
    if (!value) return null
    const raw = String(value).trim()
    if (!raw) return null
    if (/^data:image\//i.test(raw)) return raw
    if (!/^https?:\/\//i.test(raw) || !fetch) return null

    const res = await fetch(raw)
    if (!res.ok) return null
    const contentType = String(res.headers ?.get ?.('content-type') || '').toLowerCase()
    const mime = contentType.startsWith('image/') ? contentType : defaultMime
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${mime};base64,${buf.toString('base64')}`
}

function normalizePossibleUrl(value) {
    if (!value) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value ?.href === 'string') return String(value.href).trim()
    if (typeof value ?.url === 'string') return String(value.url).trim()
    if (typeof value ?.toString === 'function') {
        const s = String(value.toString() || '').trim()
        if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s
    }
    return ''
}

function collectImageLikeValues(payload, out = [], depth = 0) {
    if (depth > 4 || payload == null) return out

    if (Array.isArray(payload)) {
        for (const item of payload) collectImageLikeValues(item, out, depth + 1)
        return out
    }

    const direct = normalizePossibleUrl(payload)
    if (direct) {
        out.push(direct)
        return out
    }

    if (typeof payload === 'object') {
        const keys = ['url', 'image', 'output', 'output_image', 'images', 'data']
        for (const key of keys) {
            if (key in payload) collectImageLikeValues(payload[key], out, depth + 1)
        }

        // Fallback scan for nested structures with unknown keys.
        for (const v of Object.values(payload)) {
            if (typeof v === 'object') collectImageLikeValues(v, out, depth + 1)
        }
    }

    return out
}




// Replicate image generation removed per project decision (use Gemini + ControlNet/local overlay).

function normalizeDetection(raw) {
    const nails = normalizeNails(raw)
    const fingers = Array.isArray(raw ?.fingers) ? raw.fingers : []

    return {
        isHandDetected: Boolean(raw ?.isHandDetected),
        handedness: ['left', 'right'].includes(String(raw ?.handedness || '').toLowerCase()) ?
            String(raw.handedness).toLowerCase() : 'unknown',
        detectionConfidence: Number.isFinite(Number(raw ?.detectionConfidence)) ? Number(raw.detectionConfidence) : 0.5,
        fingers: ['thumb', 'index', 'middle', 'ring', 'pinky'].map((name) => {
            const found = fingers.find((f) => String(f ?.name || '').toLowerCase() === name)
            return {
                name,
                detected: found ? Boolean(found.detected) : true,
                confidence: found && Number.isFinite(Number(found.confidence)) ? Number(found.confidence) : 0.5,
            }
        }),
        nails,
        segmentation: {
            handMaskQuality: ['good', 'medium', 'poor'].includes(String(raw ?.segmentation ?.handMaskQuality || '')) ?
                String(raw.segmentation.handMaskQuality) : 'medium',
            nailMaskQuality: ['good', 'medium', 'poor'].includes(String(raw ?.segmentation ?.nailMaskQuality || '')) ?
                String(raw.segmentation.nailMaskQuality) : 'medium',
        },
        qualityWarnings: Array.isArray(raw ?.qualityWarnings) ?
            raw.qualityWarnings.slice(0, 8).map((x) => String(x || '').trim()).filter(Boolean) : [],
    }
}

function isLikelyFallbackAnalysis(analysis = {}) {
    const warnings = Array.isArray(analysis ?.qualityWarnings) ? analysis.qualityWarnings : []
    const warningText = warnings.map((x) => String(x || '').toLowerCase()).join(' | ')
    const lowConfidence = Number(analysis ?.detectionConfidence || 0) < 0.55
    return lowConfidence || warningText.includes('fallback nail detection') || warningText.includes('gemini analyze failed')
}

function isAnalysisReliableForOverlay(analysis = {}) {
    if (!analysis || typeof analysis !== 'object') return false
    if (!analysis.isHandDetected) return false
    if (isLikelyFallbackAnalysis(analysis)) return false

    const nails = normalizeNails(analysis)
    const good = nails.filter((n) => Number(n ?.confidence || 0) >= 0.55).length
    return good >= 3
}

function isOverlayPlanReliable(analysis = {}, overlayPlan = null) {
    if (!analysis || typeof analysis !== 'object') return false
    if (!analysis.isHandDetected) return false

    const sanitized = sanitizeOverlayPlan(analysis, overlayPlan)
    if (!sanitized) return false

    const overlays = Array.isArray(sanitized ?.overlays) ? sanitized.overlays : []
    if (overlays.length < 3) return false

    const areas = overlays
        .map((ov) => {
            const points = Array.isArray(ov ?.polygon) ? ov.polygon : []
            if (points.length < 3) return 0
            const xs = points.map((p) => clamp01(p ?.x, 0.5))
            const ys = points.map((p) => clamp01(p ?.y, 0.5))
            return Math.max(0, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)))
        })
        .filter((x) => Number.isFinite(x) && x > 0)

    if (!areas.length) return false
    const avgArea = areas.reduce((a, b) => a + b, 0) / areas.length
    return avgArea >= 0.004 && avgArea <= 0.09
}

async function analyzeHandAndNails({ imageDataUrl, handHint = '' } = {}) {
    const parsed = parseImageDataUrl(imageDataUrl)
    if (!parsed) {
        const err = new Error('imageDataUrl is required and must be a valid data URL.')
        err.statusCode = 400
        throw err
    }

    const size = Buffer.byteLength(parsed.base64, 'base64')
    if (size > 9 * 1024 * 1024) {
        const err = new Error('Image too large. Max size is 9MB.')
        err.statusCode = 413
        throw err
    }

    let raw
    try {
        raw = await callGeminiVisionJson({ imageDataUrl, instruction: buildDetectionInstruction(handHint) })
    } catch (error) {
        if (!ALLOW_DETECTION_FALLBACK) throw error
        raw = buildFallbackDetection(`Gemini analyze failed: ${String(error?.message || error)}`)
    }

    const analysis = normalizeDetection(raw)
    const uploadedImageUrl = await saveImageDataUrl(imageDataUrl, 'input')

    return {
        analysis,
        uploadedImageUrl,
        debug: {
            provider: 'gemini-vision',
        },
    }
}

async function createTryOnPreview({ imageDataUrl, handHint = '', design = {} } = {}) {
    const detected = await analyzeHandAndNails({ imageDataUrl, handHint })
    const rawOverlayPlan = buildOverlayPlan(detected.analysis, normalizeDesign(design))
    const overlayPlan = sanitizeOverlayPlan(detected.analysis, rawOverlayPlan)

    return {
        ...detected,
        overlayPlan,
        renderInstructions: {
            mode: 'realtime-overlay',
            targetFps: 24,
            engine: 'client-gpu',
            note: 'App render trực tiếp bằng overlayPlan theo tọa độ chuẩn hóa.',
        },
    }
}

async function buildPreviewFromClientHint({ imageDataUrl, design = {}, analysis = null, overlayPlan = null } = {}) {
    const safeDesign = normalizeDesign(design)
    const uploadedImageUrl = await saveImageDataUrl(imageDataUrl, 'input')
    const safeOverlayPlan = overlayPlan && typeof overlayPlan === 'object' ? overlayPlan : null

    if (safeOverlayPlan) {
        const safeAnalysis = analysis && typeof analysis === 'object' ?
            normalizeDetection(analysis) :
            buildFallbackDetection('Client overlay plan was used')

        return {
            analysis: safeAnalysis,
            uploadedImageUrl,
            overlayPlan: sanitizeOverlayPlan(safeAnalysis, safeOverlayPlan),
            renderInstructions: {
                mode: 'realtime-overlay',
                targetFps: 24,
                engine: 'client-gpu',
                note: 'Client overlayPlan được tái sử dụng cho bước generate.',
            },
        }
    }

    if (analysis && typeof analysis === 'object') {
        const safeAnalysis = normalizeDetection(analysis)
        return {
            analysis: safeAnalysis,
            uploadedImageUrl,
            overlayPlan: sanitizeOverlayPlan(safeAnalysis, buildOverlayPlan(safeAnalysis, safeDesign)),
            renderInstructions: {
                mode: 'realtime-overlay',
                targetFps: 24,
                engine: 'client-gpu',
                note: 'Client analysis được tái sử dụng cho bước generate.',
            },
        }
    }

    return null
}

function buildImageGenerationPrompt({ design = {}, overlayPlan, userPrompt = '' }) {
    const safeDesign = normalizeDesign(design)
    const colorText = Array.isArray(safeDesign.colorPalette) && safeDesign.colorPalette.length ?
        `color palette ${safeDesign.colorPalette.join(', ')}` :
        'natural salon color palette'

    return [
        'Edit this hand photo for realistic nail try-on with very high identity preservation.',
        'MUST keep same hand pose, finger thickness, skin tone, lighting, shadows and background exactly.',
        'Keep natural nail bed/cuticle anatomy, but allow extending free-edge nail length to match template style when template nails are longer.',
        'MUST apply style ONLY on current nail plates from provided overlays. Do not reshape fingers or nails.',
        'MUST keep cuticle boundaries and side-wall contours of each nail accurate and sharp.',
        'All visible nails must be fully rendered and styled; do not skip any visible nail.',
        'Do not paint skin, finger joints, or any area outside nail plate boundaries.',
        'Polish layer should fully cover each nail plate from cuticle to tip with clean anti-aliased edges.',
        'If uncertain, preserve original pixels outside nail regions unchanged.',
        `Style: ${String(safeDesign.name || 'premium gel nail')} with ${colorText}, finish ${String(safeDesign.finish || 'glossy')}.`,
        'Photorealistic, high detail, clean edges, natural reflections, no extra fingers, no hand deformation.',
        'Target style similarity to reference: at least 95% while preserving original hand anatomy.',
        `Nail mapping data: ${JSON.stringify((overlayPlan?.overlays || []).map((o) => ({ finger: o.finger, transform: o.transform })))}`,
        `Customer request: ${String(userPrompt || '').slice(0, 220)}`,
    ].join('\n')
}

function buildTemplateStyleInstruction({ hasTemplateReference = false, floralIntent = false } = {}) {
    if (!hasTemplateReference) return ''

    const lines = [
        'Use the template image as strict style reference for nail-art details.',
        'Do not simplify, remove, or merge decorative accents from the template.',
        'Transfer the same count of decorated nails and similar motif placement style.',
        'Keep decorations visible on every detected nail unless template clearly leaves that nail plain.',
        'If template has 3D charms/rhinestones/bows, keep those accents visible with similar size and placement on corresponding nails.',
        'Do not collapse different motifs into one repeated simple motif; preserve motif diversity from template.',
        'Match nail extension length proportion to template when template nails are visibly longer.',
    ]

    if (floralIntent) {
        lines.push('Template contains floral nail art: render flower accents on at least TWO nails (not one).')
        lines.push('Match flower petal shape, white/yellow tone, and motif scale similar to reference.')
    }

    return lines.join('\n')
}

function buildTemplateCoverageInstruction({ hasTemplateReference = false, mappedCount = 0, overlayCount = 0, userPrompt = '' } = {}) {
    if (!hasTemplateReference) return ''

    const text = String(userPrompt || '').toLowerCase()
    const wantsAllNails = /all\s*5|all\s*nails|5\s*nails|đều|toàn bộ|tat ca|ca\s*5/.test(text)
    const likelyFullSet = Number(mappedCount) >= 3 || wantsAllNails
    if (!likelyFullSet) return ''

    return [
        `Coverage rule: apply decorative style to ALL visible nails (${overlayCount}/${overlayCount}).`,
        'Do not leave any visible nail plain when template appears full-set decorated.',
        'If any nail is missed in first pass, regenerate so final image has complete set coverage.',
    ].join('\n')
}

function buildServiceText(selectedService = null) {
    if (!selectedService || typeof selectedService !== 'object') return ''
    const name = String(selectedService.name || selectedService.Name || '').trim()
    const description = String(selectedService.description || selectedService.Description || '').trim()
    const price = Number(selectedService.price || selectedService.Price || 0)
    const duration = Number(selectedService.durationMinutes || selectedService.DurationMinutes || 0)

    const fields = []
    if (name) fields.push(`service name: ${name}`)
    if (description) fields.push(`service description: ${description}`)
    if (price > 0) fields.push(`service price: ${price}`)
    if (duration > 0) fields.push(`service duration minutes: ${duration}`)

    return fields.join('\n')
}

function getPolygonCenter(polygon = []) {
    const points = Array.isArray(polygon) ? polygon : []
    if (!points.length) return { x: 0.5, y: 0.5 }
    const sx = points.reduce((s, p) => s + clamp01(p ?.x, 0.5), 0)
    const sy = points.reduce((s, p) => s + clamp01(p ?.y, 0.5), 0)
    return { x: sx / points.length, y: sy / points.length }
}

function scalePolygonAroundCenter(polygon = [], scaleX = 1, scaleY = 1) {
    const points = Array.isArray(polygon) ? polygon : []
    if (!points.length) return []
    const c = getPolygonCenter(points)
    return points.map((p) => ({
        x: clamp01(c.x + (clamp01(p ?.x, c.x) - c.x) * scaleX, c.x),
        y: clamp01(c.y + (clamp01(p ?.y, c.y) - c.y) * scaleY, c.y),
    }))
}

function overlayFromPolygon(baseOverlay = {}, finger = 'unknown', polygon = []) {
    const points = Array.isArray(polygon) ? polygon : []
    const xs = points.map((p) => clamp01(p ?.x, 0.5))
    const ys = points.map((p) => clamp01(p ?.y, 0.5))
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    return {
        ...baseOverlay,
        finger,
        polygon: points,
        transform: {
            x: Number(((minX + maxX) / 2).toFixed(5)),
            y: Number(((minY + maxY) / 2).toFixed(5)),
            width: Number((maxX - minX).toFixed(5)),
            height: Number((maxY - minY).toFixed(5)),
            rotationDeg: Number((baseOverlay ?.transform ?.rotationDeg || 0).toFixed(2)),
        },
    }
}

function ensureFiveFingerOverlayPlan(overlayPlan = null) {
    const safePlan = sanitizeOverlayPlan({}, overlayPlan) || overlayPlan
    if (!safePlan || typeof safePlan !== 'object') return { overlayPlan: safePlan, synthesized: 0 }

    const order = ['thumb', 'index', 'middle', 'ring', 'pinky']
    const src = Array.isArray(safePlan ?.overlays) ? safePlan.overlays : []
    const byFinger = new Map()

    for (const ov of src) {
        const finger = normalizeFingerName(ov ?.finger)
        if (!finger || !order.includes(finger)) continue
        const prev = byFinger.get(finger)
        const currConf = Number(ov ?.confidence || 0)
        const prevConf = Number(prev ?.confidence || 0)
        if (!prev || currConf >= prevConf) byFinger.set(finger, ov)
    }

    if (byFinger.size >= 5 || byFinger.size === 0) {
        return { overlayPlan: { ...safePlan, overlays: Array.from(byFinger.values()) }, synthesized: 0 }
    }

    const canonicalCenters = {
        thumb: { x: 0.24, y: 0.62 },
        index: { x: 0.40, y: 0.48 },
        middle: { x: 0.52, y: 0.43 },
        ring: { x: 0.63, y: 0.47 },
        pinky: { x: 0.74, y: 0.56 },
    }

    const pairs = Array.from(byFinger.entries()).map(([finger, ov]) => ({
        finger,
        canonical: canonicalCenters[finger],
        real: getPolygonCenter(ov ?.polygon),
    })).filter((x) => x.canonical)

    const canXs = pairs.map((p) => p.canonical.x)
    const canYs = pairs.map((p) => p.canonical.y)
    const realXs = pairs.map((p) => p.real.x)
    const realYs = pairs.map((p) => p.real.y)

    const canMinX = Math.min(...canXs)
    const canMaxX = Math.max(...canXs)
    const canMinY = Math.min(...canYs)
    const canMaxY = Math.max(...canYs)
    const realMinX = Math.min(...realXs)
    const realMaxX = Math.max(...realXs)
    const realMinY = Math.min(...realYs)
    const realMaxY = Math.max(...realYs)

    const spanCanX = Math.max(0.06, canMaxX - canMinX)
    const spanCanY = Math.max(0.06, canMaxY - canMinY)
    const spanRealX = Math.max(0.06, realMaxX - realMinX)
    const spanRealY = Math.max(0.06, realMaxY - realMinY)

    const scaleX = spanRealX / spanCanX
    const scaleY = spanRealY / spanCanY
    const offsetX = realMinX - canMinX * scaleX
    const offsetY = realMinY - canMinY * scaleY

    const predictCenter = (finger) => {
        const c = canonicalCenters[finger] || { x: 0.5, y: 0.5 }
        return {
            x: clamp01(offsetX + c.x * scaleX, c.x),
            y: clamp01(offsetY + c.y * scaleY, c.y),
        }
    }

    let synthesized = 0
    for (const targetFinger of order) {
        if (byFinger.has(targetFinger)) continue

        const targetIdx = order.indexOf(targetFinger)
        const sourceFinger = Array.from(byFinger.keys()).sort((a, b) => {
            return Math.abs(order.indexOf(a) - targetIdx) - Math.abs(order.indexOf(b) - targetIdx)
        })[0]
        const sourceOverlay = sourceFinger ? byFinger.get(sourceFinger) : null
        if (!sourceOverlay) continue

        const srcCenter = getPolygonCenter(sourceOverlay ?.polygon)
        const dstCenter = predictCenter(targetFinger)
        const dx = dstCenter.x - srcCenter.x
        const dy = dstCenter.y - srcCenter.y
        const moved = (Array.isArray(sourceOverlay ?.polygon) ? sourceOverlay.polygon : []).map((p) => ({
            x: clamp01(clamp01(p ?.x, srcCenter.x) + dx, srcCenter.x + dx),
            y: clamp01(clamp01(p ?.y, srcCenter.y) + dy, srcCenter.y + dy),
        }))

        // Synthesize missing nails slightly longer to better match long template styles.
        const elongated = scalePolygonAroundCenter(moved, 1.06, 1.2)
        const synthetic = overlayFromPolygon({
            ...sourceOverlay,
            confidence: Math.max(0.18, Number(sourceOverlay ?.confidence || 0) * 0.72),
        }, targetFinger, elongated)

        byFinger.set(targetFinger, synthetic)
        synthesized += 1
    }

    const overlays = order.map((finger) => byFinger.get(finger)).filter(Boolean)
    return { overlayPlan: { ...safePlan, overlays }, synthesized }
}

async function listTryOnServices({ limit = 24 } = {}) {
    const max = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 60)) : 24
    const hasServiceImages = await query(
        `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ServiceImages'`
    ).then((r) => Boolean(r.recordset?.length)).catch(() => false)

    const sql = hasServiceImages ?
        `SELECT TOP (${max})
         s.ServiceId,
         s.Name,
         s.Description,
         s.Price,
         s.DurationMinutes,
         s.ImageUrl AS PrimaryImageUrl,
         si.ImageUrl AS ExtraImageUrl
       FROM Services s
       LEFT JOIN ServiceImages si ON si.ServiceId = s.ServiceId
       WHERE s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) = 'active'
       ORDER BY s.Name ASC, si.ImageId ASC` :
        `SELECT TOP (${max})
         s.ServiceId,
         s.Name,
         s.Description,
         s.Price,
         s.DurationMinutes,
         s.ImageUrl AS PrimaryImageUrl,
         NULL AS ExtraImageUrl
       FROM Services s
       WHERE s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) = 'active'
       ORDER BY s.Name ASC`

    const res = await query(sql, {}).catch(() => ({ recordset: [] }))
    const out = new Map()

    for (const row of(res.recordset || [])) {
        const key = String(row.ServiceId || '')
        if (!key) continue

        if (!out.has(key)) {
            out.set(key, {
                serviceId: row.ServiceId,
                name: row.Name || '',
                description: row.Description || '',
                price: Number(row.Price || 0),
                durationMinutes: Number(row.DurationMinutes || 0),
                imageUrl: normalizePublicImageUrl(row.PrimaryImageUrl) || null,
            })
        }

        const x = out.get(key)
        if (!x.imageUrl && row.ExtraImageUrl) {
            x.imageUrl = normalizePublicImageUrl(row.ExtraImageUrl)
        }
    }

    return Array.from(out.values())
}

async function generateNailTryOnImage({ imageDataUrl, handHint = '', design = {}, userPrompt = '', selectedService = null, templateImageDataUrl = '', templateImageUrl = '', analysis = null, overlayPlan = null } = {}) {
    const safeDesign = normalizeDesign(design)
    const hintedPreview = await buildPreviewFromClientHint({ imageDataUrl, design: safeDesign, analysis, overlayPlan })
    const preview = hintedPreview || await createTryOnPreview({ imageDataUrl, handHint, design: safeDesign })
    const resolvedTemplateImageDataUrl = await resolveTemplateImageDataUrl({ templateImageDataUrl, templateImageUrl }).catch(() => '')
    const repairedOverlay = ensureFiveFingerOverlayPlan(preview ?.overlayPlan)
    const workingOverlayPlan = repairedOverlay ?.overlayPlan || preview ?.overlayPlan
    let fingerTextureMap = {}
    let templateMappedCount = 0
    const serviceText = buildServiceText(selectedService)
    const floralIntent = hasFloralIntent({ design: safeDesign, userPrompt })
    let prompt = ''
    let negativePrompt = 'deformed hand, extra fingers, extra nails, blurry, watermark, text, logo, missing nail art details, simplified pattern, lost floral accents, plain unstyled nails'

    let generatedImageDataUrl = null
    let provider = 'none'
    const warnings = []
    const overlayReliable = isOverlayPlanReliable(preview.analysis, workingOverlayPlan)
    const enableLocalOverlayComposer = ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_TRYON_ENABLE_LOCAL_OVERLAY_COMPOSER || '1').trim().toLowerCase())
    const enableOverlayReinforcement = enableLocalOverlayComposer &&
        !['0', 'false', 'no', 'off'].includes(String(process.env.AI_TRYON_ENABLE_OVERLAY_REINFORCEMENT || '1').trim().toLowerCase())
    const similarityStrength = Number.isFinite(Number(process.env.AI_TRYON_SIMILARITY_STRENGTH)) ?
        Math.max(0.5, Math.min(1, Number(process.env.AI_TRYON_SIMILARITY_STRENGTH))) :
        0.99
    const overlayCoverageBoost = Number.isFinite(Number(process.env.AI_TRYON_OVERLAY_COVERAGE_BOOST)) ?
        Math.max(0.9, Math.min(1.25, Number(process.env.AI_TRYON_OVERLAY_COVERAGE_BOOST))) :
        1.18
    const allowLowConfidenceOverlayTransfer = !['0', 'false', 'no', 'off'].includes(String(process.env.AI_TRYON_ALLOW_LOW_CONFIDENCE_OVERLAY || '0').trim().toLowerCase())
    const isFallbackOverlayAnalysis = isLikelyFallbackAnalysis(preview.analysis)
    const allowGuardedLowConfidenceTransfer = allowLowConfidenceOverlayTransfer && !isFallbackOverlayAnalysis

    if (Number(repairedOverlay ?.synthesized || 0) > 0) {
        warnings.push(`OverlayRepair: synthesized ${repairedOverlay.synthesized} missing nail overlay(s) to keep full-set coverage.`)
    }

    if (!overlayReliable) {
        warnings.push('OverlayQuality: low confidence nail mapping detected; using guarded reinforcement to reduce missed nails.')
    }
    if (isFallbackOverlayAnalysis) {
        warnings.push('OverlayQuality: fallback nail detection found, skip aggressive overlay transfer to avoid block artifacts.')
    }

    if (resolvedTemplateImageDataUrl) {
        try {
            const templateAnalyze = await analyzeHandAndNails({ imageDataUrl: resolvedTemplateImageDataUrl, handHint: 'template nail style image' })
            if (canUseTemplateForFingerMapping(templateAnalyze ?.analysis)) {
                fingerTextureMap = await buildFingerTextureMap({
                    templateImageDataUrl: resolvedTemplateImageDataUrl,
                    templateAnalysis: templateAnalyze ?.analysis,
                })
                const matchedCount = Object.keys(fingerTextureMap).length
                templateMappedCount = matchedCount
                warnings.push(`FingerMatch: mapped ${matchedCount}/5 fingers from template image.`)
                if (matchedCount < 2) {
                    warnings.push('FingerMatch: low template-finger matches, decorative transfer may be weaker.')
                }
            } else {
                warnings.push('FingerMatch: template nail detection confidence too low, skip per-finger mapping.')
            }
        } catch (error) {
            warnings.push(`FingerMatch: ${String(error?.message || error)}`)
        }
    }

    const overlayCount = Array.isArray(workingOverlayPlan ?.overlays) ? workingOverlayPlan.overlays.length : 0
    prompt = [
        buildImageGenerationPrompt({ design: safeDesign, overlayPlan: workingOverlayPlan, userPrompt }),
        serviceText ? `Selected salon service:\n${serviceText}` : '',
        buildTemplateStyleInstruction({ hasTemplateReference: Boolean(resolvedTemplateImageDataUrl), floralIntent }),
        buildTemplateCoverageInstruction({
            hasTemplateReference: Boolean(resolvedTemplateImageDataUrl),
            mappedCount: templateMappedCount,
            overlayCount,
            userPrompt,
        }),
        resolvedTemplateImageDataUrl ? `Template transfer requirement: preserve decorations and extension style across all visible nails (mapping ${templateMappedCount}/5).` : '',
        resolvedTemplateImageDataUrl ? 'Use the extra reference nail image as style guide while preserving the user hand shape.' : '',
    ].filter(Boolean).join('\n\n')

    try {
        const controlNetResult = await generateWithControlNet({
            imageDataUrl,
            templateImageDataUrl: resolvedTemplateImageDataUrl,
            prompt,
            negativePrompt,
            overlayPlan: workingOverlayPlan,
            selectedService,
        })

        if (controlNetResult ?.imageDataUrl) {
            generatedImageDataUrl = controlNetResult.imageDataUrl
            provider = String(controlNetResult.provider || 'controlnet')
        }
    } catch (error) {
        warnings.push(`ControlNet: ${String(error?.message || error)}`)
    }

    if (!generatedImageDataUrl) {
        try {
            const geminiResult = await tryGenerateWithGemini({ imageDataUrl, prompt, templateImageDataUrl: resolvedTemplateImageDataUrl })
            generatedImageDataUrl = geminiResult ?.imageDataUrl || null
            if (generatedImageDataUrl) provider = 'gemini-image-generation'
            if (!generatedImageDataUrl && Array.isArray(geminiResult ?.errors) && geminiResult.errors.length) {
                warnings.push(`GeminiImageDetail: ${geminiResult.errors.join(' | ')}`)
            }
        } catch (error) {
            warnings.push(`GeminiImage: ${String(error?.message || error)}`)
        }
    }

    // Replicate/Flux image refine removed: using Gemini + ControlNet + local-overlay only.
    // If you need a post-refinement step, implement a Gemini-driven enhancer or keep client-side overlay reinforcement.

    if (!generatedImageDataUrl && (overlayReliable || allowGuardedLowConfidenceTransfer) && enableLocalOverlayComposer) {
        try {
            const fallbackSimilarity = overlayReliable ? similarityStrength : Math.max(0.82, similarityStrength * 0.9)
            const fallbackCoverage = overlayReliable ? overlayCoverageBoost : Math.min(1.1, Math.max(1.0, overlayCoverageBoost * 0.9))
            generatedImageDataUrl = await renderLocalOverlayFallbackImage({
                imageDataUrl,
                overlayPlan: workingOverlayPlan,
                templateImageDataUrl: resolvedTemplateImageDataUrl,
                fingerTextureMap,
                similarityStrength: fallbackSimilarity,
                coverageBoost: fallbackCoverage,
                useLabels: false,
            })
            if (generatedImageDataUrl) {
                provider = 'local-overlay-fallback'
                warnings.push(`AI image provider unavailable, used local overlay fallback render (strength ${fallbackSimilarity.toFixed(2)}, coverage ${fallbackCoverage.toFixed(2)}).`)
            }
        } catch (error) {
            warnings.push(`LocalFallback: ${String(error?.message || error)}`)
        }
    } else if (!generatedImageDataUrl && (overlayReliable || allowGuardedLowConfidenceTransfer) && !enableLocalOverlayComposer) {
        warnings.push('LocalFallback: disabled (AI_TRYON_ENABLE_LOCAL_OVERLAY_COMPOSER=false) to prevent polygon artifacts.')
    } else if (!generatedImageDataUrl && !overlayReliable) {
        warnings.push('LocalFallback: skipped because overlay quality is low (prevents misplaced shapes).')
    }

    if (!generatedImageDataUrl) {
        warnings.push('No image generation provider available. Local overlay fallback is disabled to avoid visual artifacts.')
    }

    // Enforce stronger style similarity on successful AI output.
    if (generatedImageDataUrl && resolvedTemplateImageDataUrl && provider !== 'local-overlay-fallback' && enableOverlayReinforcement && (overlayReliable || allowGuardedLowConfidenceTransfer)) {
        try {
            const reinforceSimilarity = overlayReliable ? similarityStrength : Math.max(0.84, similarityStrength * 0.92)
            const reinforceCoverage = overlayReliable ? overlayCoverageBoost : Math.min(1.12, Math.max(1.02, overlayCoverageBoost * 0.92))
            const reinforced = await renderLocalOverlayFallbackImage({
                imageDataUrl: generatedImageDataUrl,
                overlayPlan: workingOverlayPlan,
                templateImageDataUrl: resolvedTemplateImageDataUrl,
                fingerTextureMap,
                similarityStrength: reinforceSimilarity,
                coverageBoost: reinforceCoverage,
                useLabels: false,
            })
            if (reinforced) {
                generatedImageDataUrl = reinforced
                warnings.push(`SimilarityBoost: applied template reinforcement at strength ${reinforceSimilarity.toFixed(2)} and coverage ${reinforceCoverage.toFixed(2)}.`)
            }
        } catch (error) {
            warnings.push(`SimilarityBoost: ${String(error?.message || error)}`)
        }
    } else if (generatedImageDataUrl && resolvedTemplateImageDataUrl && provider !== 'local-overlay-fallback' && !overlayReliable && !allowGuardedLowConfidenceTransfer) {
        warnings.push('SimilarityBoost: skipped due to low-quality overlay mapping to avoid visual artifacts.')
    } else if (generatedImageDataUrl && resolvedTemplateImageDataUrl && provider !== 'local-overlay-fallback' && !enableOverlayReinforcement) {
        warnings.push('SimilarityBoost: disabled by configuration (set AI_TRYON_ENABLE_OVERLAY_REINFORCEMENT=true to enable).')
    }

    const generatedImageUrl = generatedImageDataUrl ?
        await saveImageDataUrl(generatedImageDataUrl, 'render') :
        null

    // Save template reference image (if present) as its own file so history can show it
    let savedTemplateImageUrl = null
    try {
        if (resolvedTemplateImageDataUrl) {
            savedTemplateImageUrl = await saveImageDataUrl(resolvedTemplateImageDataUrl, 'template')
        }
    } catch (e) {
        // ignore template save errors
        savedTemplateImageUrl = null
    }

    // Persist try-on record to DB (if DB available)
    try {
        const tryOnId = newId()
        const paramsJson = JSON.stringify({ design: safeDesign || {}, userPrompt: String(userPrompt || ''), selectedService })
        await query(`
            INSERT INTO TryOnRecords (TryOnId, UserId, SourceImageUrl, TemplateImageUrl, ResultImageUrl, DesignId, Params)
            VALUES (@tryOnId, @userId, @sourceImageUrl, @templateImageUrl, @resultImageUrl, @designId, @params)
        `, {
            tryOnId,
            userId: null,
            sourceImageUrl: preview?.uploadedImageUrl || null,
            templateImageUrl: savedTemplateImageUrl || null,
            resultImageUrl: generatedImageUrl || null,
            designId: safeDesign?.id || null,
            params: paramsJson,
        }).catch(() => {})
    } catch (e) {
        // ignore DB errors, keep try-on flow working
    }

    return {
        ...preview,
        overlayPlan: workingOverlayPlan,
        generation: {
            provider,
            prompt,
            negativePrompt,
            generatedImageDataUrl,
            generatedImageUrl,
            templateReferenceUsed: Boolean(resolvedTemplateImageDataUrl),
            warnings,
        },
    }
}

// --- Persistence helpers for try-on history ---
async function listTryOnHistory({ userId = null, limit = 50, offset = 0 } = {}) {
    const sqlText = `SELECT TryOnId, UserId, SourceImageUrl, TemplateImageUrl, ResultImageUrl, DesignId, Params, CreatedAt FROM TryOnRecords WHERE (@userId IS NULL OR UserId = @userId) ORDER BY CreatedAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    try {
        const res = await query(sqlText, { userId: userId || null, limit: Number(limit || 50), offset: Number(offset || 0) })
        return (res.recordset || []).map((r) => ({
            tryOnId: r.TryOnId,
            userId: r.UserId,
            sourceImageUrl: r.SourceImageUrl,
            templateImageUrl: r.TemplateImageUrl || null,
            resultImageUrl: r.ResultImageUrl,
            designId: r.DesignId,
            params: r.Params,
            createdAt: r.CreatedAt,
        }))
    } catch (e) {
        return []
    }
}

async function getTryOnRecordById({ id } = {}) {
    if (!id) return null
    try {
        const res = await query(`SELECT TryOnId, UserId, SourceImageUrl, TemplateImageUrl, ResultImageUrl, DesignId, Params, CreatedAt FROM TryOnRecords WHERE TryOnId = @id`, { id })
        const row = (res.recordset || [])[0]
        if (!row) return null
        return {
            tryOnId: row.TryOnId,
            userId: row.UserId,
            sourceImageUrl: row.SourceImageUrl,
            templateImageUrl: row.TemplateImageUrl || null,
            resultImageUrl: row.ResultImageUrl,
            designId: row.DesignId,
            params: row.Params,
            createdAt: row.CreatedAt,
        }
    } catch (e) {
        return null
    }
}

async function deleteTryOnRecord({ id, userId = null } = {}) {
    if (!id) return
    try {
        await query(`DELETE FROM TryOnRecords WHERE TryOnId = @id AND (@userId IS NULL OR UserId = @userId)`, { id, userId: userId || null })
    } catch (e) {
        // ignore
    }
}

module.exports = {
    listTryOnServices,
    analyzeHandAndNails,
    createTryOnPreview,
    generateNailTryOnImage,
    // history
    listTryOnHistory,
    getTryOnRecordById,
    deleteTryOnRecord,
}

function sanitizeOverlayPlan(analysis = {}, overlayPlan = null) {
    if (!overlayPlan || typeof overlayPlan !== 'object') return null

    const overlays = Array.isArray(overlayPlan ?.overlays) ? overlayPlan.overlays : []
    const evaluate = (ov) => {
        const points = Array.isArray(ov ?.polygon) ? ov.polygon : []
        if (points.length < 3) return null

        const xs = points.map((p) => clamp01(p ?.x, 0.5))
        const ys = points.map((p) => clamp01(p ?.y, 0.5))
        const width = Math.max(...xs) - Math.min(...xs)
        const height = Math.max(...ys) - Math.min(...ys)
        const area = Math.max(0, width * height)
        const ratio = Math.max(width, height) / Math.max(1e-6, Math.min(width, height))
        const confidence = Number(ov ?.confidence || 0)
        const finger = normalizeFingerName(ov ?.finger) || String(ov ?.finger || '').toLowerCase() || 'unknown'

        return {
            ov,
            points,
            width,
            height,
            area,
            ratio,
            confidence: Number.isFinite(confidence) ? confidence : 0,
            finger,
        }
    }

    const scored = overlays.map((ov) => evaluate(ov)).filter(Boolean)

    const pickUniqueByFinger = (candidates) => {
        const byFinger = new Map()
        for (const c of candidates) {
            const prev = byFinger.get(c.finger)
            if (!prev || c.confidence > prev.confidence) {
                byFinger.set(c.finger, c)
            }
        }
        return Array.from(byFinger.values()).slice(0, 5).map((x) => x.ov)
    }

    // Strict pass for normal quality
    const strictCandidates = scored.filter((m) => {
        if (m.area < 0.0012 || m.area > 0.09) return false
        if (m.ratio < 0.95 || m.ratio > 7.5) return false
        if (m.confidence < 0.2) return false
        return true
    })
    let cleaned = pickUniqueByFinger(strictCandidates)

    // Relaxed rescue pass: prevent dropping to only 3 nails on real user hands
    if (cleaned.length < 4) {
        const relaxedCandidates = scored.filter((m) => {
            if (m.area < 0.00045 || m.area > 0.14) return false
            if (m.ratio < 0.7 || m.ratio > 9.5) return false
            if (m.confidence < 0.05) return false
            return true
        })
        cleaned = pickUniqueByFinger(relaxedCandidates)
    }

    if (!cleaned.length) return null
    return {
        ...overlayPlan,
        overlays: cleaned,
    }
}