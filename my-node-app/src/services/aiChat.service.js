// `node-fetch` v3 is ESM and may export a default; prefer global fetch when available.
let fetchFn
try {
  fetchFn = global.fetch || require('node-fetch')
  if (fetchFn && fetchFn.default) fetchFn = fetchFn.default
} catch (e) {
  fetchFn = global.fetch
}

// fallback alias
const fetch = fetchFn
const { query, newId } = require('../config/query')
const customerCommerceService = require('./customerCommerce.service')
const settingsService = require('./settings.service')
const aiClient = require('./aiClient')
const simpleCache = require('./simpleCache')
const fs = require('fs/promises')
const path = require('path')

const GEMINI_KEY = process.env.GEMINI_API_KEY
const ACTIVE_BOOKING_STATUSES = ['pending', 'booked', 'confirmed', 'c']

function getAIChatUploadDir() {
  return path.join(__dirname, '..', '..', 'uploads', 'ai-chat')
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim()
  const m = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const base64 = m[2]
  const buf = Buffer.from(base64, 'base64')
  const ext = kind === 'jpeg' ? 'jpg' : kind
  return { buf, ext, mime: `image/${ext === 'jpg' ? 'jpeg' : ext}` }
}

async function saveChatImageFromDataUrl({ dataUrl } = {}) {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    const err = new Error('Invalid image data URL. Use PNG, JPG, or WEBP.')
    err.statusCode = 400
    throw err
  }

  if (!parsed.buf || parsed.buf.length < 5 * 1024) {
    const err = new Error('Image too small or empty. Please upload a clear photo.')
    err.statusCode = 400
    throw err
  }

  if (parsed.buf.length > 6 * 1024 * 1024) {
    const err = new Error('Image too large (max 6MB).')
    err.statusCode = 413
    throw err
  }

  const dir = getAIChatUploadDir()
  await fs.mkdir(dir, { recursive: true })
  const fileName = `nail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, parsed.buf)
  return {
    imageUrl: `/uploads/ai-chat/${fileName}`,
    mimeType: parsed.mime,
  }
}

async function findSuggestedProductsByKeywords(keywords = []) {
  const ks = Array.isArray(keywords) ? keywords.map((k) => String(k || '').trim()).filter(Boolean) : []
  if (!ks.length) return []

  const binds = {}
  const conds = ks.slice(0, 6).map((k, i) => {
    const key = `k${i}`
    binds[key] = `%${k}%`
    return `(p.Name LIKE @${key} OR ISNULL(p.Description, '') LIKE @${key})`
  })

  let res = await query(
    `SELECT TOP 4
        p.ProductId,
        p.Name,
        p.Price,
        p.Stock,
        COALESCE(img.ImageUrl, p.ImageUrl) AS ImageUrl
     FROM Products p
     OUTER APPLY (
       SELECT TOP 1 pi.ImageUrl
       FROM ProductImages pi
       WHERE pi.ProductId = p.ProductId
       ORDER BY ISNULL(pi.SortOrder, 2147483647), pi.ImageId
     ) img
     WHERE ${conds.join(' OR ')}
     ORDER BY p.Stock DESC, p.Name ASC`,
    binds
  ).catch(() => null)

  if (!res || !Array.isArray(res.recordset)) {
    res = await query(
      `SELECT TOP 4 p.ProductId, p.Name, p.Price, p.ImageUrl, p.Stock
       FROM Products p
       WHERE ${conds.join(' OR ')}
       ORDER BY p.Stock DESC, p.Name ASC`,
      binds
    ).catch(() => ({ recordset: [] }))
  }

  return (res.recordset || []).map((r) => ({
    ProductId: r.ProductId,
    Name: r.Name,
    Price: Number(r.Price || 0),
    ImageUrl: r.ImageUrl || null,
    Stock: Number(r.Stock || 0),
  }))
}

async function findSuggestedServicesByKeywords(keywords = []) {
  const ks = Array.isArray(keywords) ? keywords.map((k) => String(k || '').trim()).filter(Boolean) : []
  if (!ks.length) return []

  const binds = {}
  const conds = ks.slice(0, 6).map((k, i) => {
    const key = `s${i}`
    binds[key] = `%${k}%`
    return `(s.Name LIKE @${key} OR ISNULL(s.Description, '') LIKE @${key})`
  })

  const res = await query(
    `SELECT TOP 4 s.ServiceId, s.Name, s.Price, s.DurationMinutes, s.Description
     FROM Services s
     WHERE ${conds.join(' OR ')}
       AND (s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) NOT IN ('deleted','delete','inactive'))
     ORDER BY s.Name ASC`,
    binds
  ).catch(() => ({ recordset: [] }))

  return (res.recordset || []).map((r) => ({
    ServiceId: r.ServiceId,
    Name: r.Name,
    Price: Number(r.Price || 0),
    DurationMinutes: Number(r.DurationMinutes || 0),
    Description: r.Description || '',
  }))
}

function extractPromptKeywords(prompt = '') {
  const raw = String(prompt || '').toLowerCase()
  if (!raw) return []

  const baseTokens = (raw.match(/[\p{L}\p{N}]+/gu) || [])
  const stop = new Set([
    'toi', 'tôi', 'la', 'là', 'muon', 'muốn', 'va', 'và', 'cho', 'xin', 'nhu', 'như', 'de', 'để', 'duoc', 'được',
    'khong', 'không', 'co', 'có', 'giup', 'giúp', 'voi', 'với', 'anh', 'ảnh', 'mong', 'móng', 'tay', 'nua', 'nữa',
  ])

  const tokens = baseTokens.filter((t) => t.length >= 3 && !stop.has(t)).slice(0, 8)
  const hints = []

  if (/sơn|son|màu|mau|nude|ombre|cat.?eye|gel/i.test(raw)) {
    hints.push('gel', 'nude', 'ombre', 'cat eye', 'top coat')
  }
  if (/yếu|yeu|gãy|gay|mỏng|mong|khô|kho/i.test(raw)) {
    hints.push('repair', 'cuticle oil', 'nail hardener', 'manicure')
  }
  if (/sản phẩm|san pham|product|dầu gội|dau goi|dầu xả|dau xa|serum|kem|mặt nạ|mat na/i.test(raw)) {
    hints.push('product', 'hair care', 'nourishing', 'repair', 'variant')
  }
  if (/dịch vụ|dich vu|service|combo|gội|goi|massage|spa|chăm sóc|cham soc/i.test(raw)) {
    hints.push('service', 'combo', 'care', 'treatment')
  }

  return [...new Set([...tokens, ...hints])]
}

async function analyzeNailImageWithAI({ imageDataUrl, userPrompt = '' } = {}) {
  const discovered = await discoverAvailableModels()
  const models = discovered.generateContentModels.length
    ? discovered.generateContentModels
    : ['gemini-1.5-flash', 'gemini-1.5-flash-latest']

  const analysisInstruction = [
    'Bạn là AI Assistant cho salon làm đẹp, có thể phân tích ảnh móng, sản phẩm và dịch vụ.',
    'Bước 1: xác định domain ảnh: nail | product | service | other và điền vào field detected_domain.',
    'Bước 2: nếu là nail thì phân tích nail_health (moisture, structure, regrowth_mm, risk_level).',
    'Bước 3: nếu là product/service thì mô tả ngắn nội dung ảnh và đưa keyword gợi ý mua/sử dụng trong keywords + advice.',
    'Không được trả lời sai domain (ví dụ ảnh sản phẩm thì không nói là ảnh móng tay).',
    'Nếu khách có đặt câu hỏi kèm ảnh, hãy trả lời ngắn gọn đúng câu hỏi trong field question_answer.',
    'Đầu ra BẮT BUỘC là JSON thuần theo schema:',
    '{"detected_domain":"nail|product|service|other","is_hand_image":boolean,"image_quality":"good|medium|poor","nail_health":{"moisture":"dry|normal|oily","structure":"weak|normal|strong","regrowth_mm":number,"risk_level":"low|medium|high"},"keywords":[string],"visual_tags":[string],"dominant_colors":["#RRGGBB"],"advice":[string],"summary":string,"customer_message":string,"question_answer":string}',
    `Ngữ cảnh thêm từ khách: ${String(userPrompt || '')}`,
  ].join('\n')
async function matchProductsByImageAnalysis(analysis = {}) {
  // analysis: { keywords: [], visual_tags: [], dominant_colors: ['#rrggbb'] }
  const ks = Array.isArray(analysis?.keywords) ? analysis.keywords.map((k) => String(k || '').trim()).filter(Boolean) : []
  const tags = Array.isArray(analysis?.visual_tags) ? analysis.visual_tags.map((t) => String(t || '').trim()).filter(Boolean) : []
  const colors = Array.isArray(analysis?.dominant_colors) ? analysis.dominant_colors.map((c) => String(c || '').replace('#', '').trim()).filter(Boolean) : []

  const tokens = [...new Set([...ks.slice(0, 6), ...tags.slice(0, 6)])].slice(0, 8)
  if (!tokens.length && !colors.length) return []

  const binds = {}
  const conds = tokens.map((k, i) => {
    const key = `ik${i}`
    binds[key] = `%${k}%`
    return `(p.Name LIKE @${key} OR ISNULL(p.Description, '') LIKE @${key} OR ISNULL(pi.ImageUrl, '') LIKE @${key})`
  })

  // also try matching by color strings appearing in filenames or metadata
  const colorConds = colors.map((c, i) => {
    const key = `ic${i}`
    binds[key] = `%${c}%`
    return `(ISNULL(pi.ImageUrl, '') LIKE @${key})`
  })

  const whereParts = [...conds, ...colorConds].length ? `WHERE ${[...conds, ...colorConds].join(' OR ')}` : ''

  const sql = `SELECT TOP 8 p.ProductId, p.Name, p.Price, p.Stock, COALESCE(pi.ImageUrl, p.ImageUrl) AS ImageUrl
    FROM Products p
    LEFT JOIN ProductImages pi ON pi.ProductId = p.ProductId
    ${whereParts}
    ORDER BY p.Stock DESC, p.Name ASC`

  const res = await query(sql, binds).catch(() => ({ recordset: [] }))
  return (res.recordset || []).map((r) => ({
    ProductId: r.ProductId,
    Name: r.Name,
    Price: Number(r.Price || 0),
    ImageUrl: r.ImageUrl || null,
    Stock: Number(r.Stock || 0),
  }))
}

  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(GEMINI_KEY)
  const errors = []

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const maxTokensEnv = process.env.GEMINI_MAX_TOKENS
      const maxTokens = (maxTokensEnv === undefined || maxTokensEnv === null || String(maxTokensEnv).trim() === '')
        ? 1200
        : (String(maxTokensEnv).toLowerCase() === 'unlimited' || Number(maxTokensEnv) === 0)
          ? null
          : Number(maxTokensEnv)

      const genCfg = { temperature: 0.2 }
      if (Number.isFinite(maxTokens) && maxTokens > 0) genCfg.maxOutputTokens = maxTokens

      const result = await aiClient.guard(() => model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: analysisInstruction },
              {
                inlineData: {
                  mimeType: parseImageDataUrl(imageDataUrl)?.mime || 'image/jpeg',
                  data: String(imageDataUrl || '').split(',')[1] || '',
                },
              },
            ],
          },
        ],
        generationConfig: genCfg,
      }), { cost: 1 })

      const text = String(result?.response?.text?.() || '').trim()
      if (!text) continue

      const normalized = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
      const parsed = JSON.parse(normalized)
      return parsed
    } catch (err) {
      errors.push(`vision:${modelName}:${String(err?.message || err)}`)
    }
  }

  return {
    detected_domain: 'other',
    is_hand_image: false,
    image_quality: 'poor',
    nail_health: { moisture: 'normal', structure: 'normal', regrowth_mm: 0, risk_level: 'medium' },
    keywords: ['product', 'service', 'care'],
    advice: ['Ảnh chưa đủ rõ để nhận diện chính xác. Bạn có thể gửi lại ảnh rõ hơn để mình phân tích tốt hơn.'],
    summary: 'Không nhận diện rõ nội dung ảnh.',
    customer_message: 'Mình chưa phân tích được ảnh chính xác. Bạn hãy gửi ảnh rõ nét hơn để mình hỗ trợ đúng sản phẩm/dịch vụ nhé.',
    question_answer: userPrompt ? 'Mình chưa thể trả lời chính xác câu hỏi từ ảnh hiện tại. Bạn chụp lại ảnh rõ hơn giúp mình nhé.' : '',
    _debug: errors.join(' | '),
  }
}

function toIsoDate(d) {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalize(text) {
  return String(text || '').trim().toLowerCase()
}

function normalizeForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildLookupTokens(prompt = '') {
  const genericStop = new Set([
    'san', 'pham', 'product', 'gia', 'price', 'bao', 'nhieu', 'cua', 'cho', 'toi', 'minh', 'shop',
    'dich', 'vu', 'service', 'la', 'bao', 'nhieu', 'tien',
  ])
  const normalizedPromptTokens = normalizeForCompare(prompt).split(/\s+/).filter((t) => t.length >= 2)
  const keywordTokens = extractPromptKeywords(prompt)
    .map((k) => normalizeForCompare(k))
    .flatMap((k) => k.split(/\s+/))
    .filter((t) => t.length >= 2)

  return [...new Set([...normalizedPromptTokens, ...keywordTokens])]
    .filter((t) => !genericStop.has(t))
    .slice(0, 8)
}

function detectIntent(prompt) {
  const t = normalize(prompt)
  if (/đặt lịch|dat lich|khung giờ|khung gio|lúc|luc|mấy giờ|may gio/.test(t)) return 'booking'
  if (/sản phẩm|san pham|product|danh mục|danh muc|category|biến thể|variant|đơn hàng|don hang|order/i.test(t)) return 'product_info'
  if (/giá|bao nhiêu|bao nhieu|thời gian|thoi gian|mất bao lâu|mat bao lau/.test(t)) return 'service_info'
  if (/hot|phù hợp|phu hop|nên|nen|gợi ý|goi y|tư vấn|tu van/.test(t)) return 'service_advice'
  if (/giờ mở cửa|gio mo cua|địa chỉ|dia chi|chính sách|chinh sach/.test(t)) return 'faq'
  return 'general'
}

function parseNaturalDateTime(prompt) {
  const t = normalize(prompt)
  const now = new Date()
  let base = new Date(now)

  if (t.includes('ngày kia') || t.includes('ngay kia')) {
    base.setDate(base.getDate() + 2)
  } else if (t.includes('mai') || t.includes('tomorrow')) {
    base.setDate(base.getDate() + 1)
  }

  const m = t.match(/(\d{1,2})\s*(?:h|:|giờ|gio)?\s*(\d{1,2})?/)
  if (!m) return null

  let hour = Number(m[1])
  let minute = m[2] !== undefined ? Number(m[2]) : 0
  if (Number.isNaN(hour) || hour > 23 || Number.isNaN(minute) || minute > 59) return null

  if ((t.includes('chiều') || t.includes('chieu') || t.includes('tối') || t.includes('toi')) && hour < 12) {
    hour += 12
  }
  if ((t.includes('sáng') || t.includes('sang')) && hour === 12) hour = 0

  const date = toIsoDate(base)
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return { date, time }
}

function parseAssistantMessageContent(messageType, content) {
  if (String(messageType || '').toLowerCase() === 'analysis') {
    try {
      const parsed = JSON.parse(String(content || '{}'))
      return String(parsed?.text || parsed?.questionAnswer || '').trim() || String(content || '').trim()
    } catch {
      return String(content || '').trim()
    }
  }
  return String(content || '').trim()
}

function isShortAffirmativePrompt(prompt = '') {
  const t = normalizeForCompare(prompt)
  return /^(co|ok|oke|yes|uh|uhm|um|dong y|duoc|roi|vang|da|co a|co nhe)$/.test(t)
}

function findMentionedEntityByLastAi(lastAiText = '', entities = [], idKey = 'ProductId') {
  const source = normalizeForCompare(lastAiText)
  if (!source || !Array.isArray(entities) || !entities.length) return null

  let best = null
  let bestLen = -1
  for (const item of entities) {
    const nameNorm = normalizeForCompare(item?.Name)
    if (!nameNorm) continue
    if (!source.includes(nameNorm)) continue
    if (nameNorm.length > bestLen) {
      best = item
      bestLen = nameNorm.length
    }
  }

  if (best) return best
  const fallback = entities.find((x) => x && x[idKey]) || entities[0]
  return fallback || null
}

async function getSessionConversationContext(sessionId) {
  const sid = Number(sessionId || 0)
  if (!sid) return { history: [], lastAi: '', lastUser: '' }

  const res = await query(
    `SELECT TOP 12 MessageId, Sender, Content, MessageType, CreatedAt
     FROM AIChatMessages
     WHERE SessionId = @sessionId
     ORDER BY MessageId DESC`,
    { sessionId: sid }
  ).catch(() => ({ recordset: [] }))

  const rows = (res.recordset || []).slice().reverse()
  const history = rows.map((r) => {
    const sender = String(r.Sender || '').toLowerCase() === 'ai' ? 'AI' : 'Khách'
    const text = parseAssistantMessageContent(r.MessageType, r.Content)
    return `${sender}: ${String(text || '').slice(0, 300)}`
  }).filter((x) => x && !x.endsWith(': '))

  const lastAiRow = rows.slice().reverse().find((r) => String(r.Sender || '').toLowerCase() === 'ai')
  const lastUserRow = rows.slice().reverse().find((r) => String(r.Sender || '').toLowerCase() !== 'ai')

  return {
    history,
    lastAi: parseAssistantMessageContent(lastAiRow?.MessageType, lastAiRow?.Content),
    lastUser: String(lastUserRow?.Content || '').trim(),
  }
}

async function getServiceContext(prompt) {
  const q = normalize(prompt)
  const like = `%${q.slice(0, 100)}%`

  let res = await query(
    `SELECT TOP 30
        s.ServiceId,
        s.Name,
        s.Price,
        s.DurationMinutes,
        s.Description,
        s.Status,
        (
          SELECT COUNT(1)
          FROM BookingServices bs
          JOIN Bookings b ON b.BookingId = bs.BookingId
          WHERE bs.ServiceId = s.ServiceId
            AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('pending','booked','confirmed','c')
        ) AS Popularity,
        (
          SELECT AVG(CAST(sr.Rating AS FLOAT))
          FROM SalonReviews sr
          WHERE sr.ServiceId = s.ServiceId
        ) AS AvgRating
      FROM Services s
      WHERE (s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) NOT IN ('deleted','delete','inactive'))
        AND (@q = '' OR s.Name LIKE @like OR ISNULL(s.Description, '') LIKE @like)
      ORDER BY Popularity DESC, s.Name ASC`,
    { q, like }
  ).catch(() => ({ recordset: [] }))

  if (!(res.recordset || []).length) {
    res = await query(
      `SELECT TOP 30
          s.ServiceId,
          s.Name,
          s.Price,
          s.DurationMinutes,
          s.Description,
          s.Status,
          (
            SELECT COUNT(1)
            FROM BookingServices bs
            JOIN Bookings b ON b.BookingId = bs.BookingId
            WHERE bs.ServiceId = s.ServiceId
              AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('pending','booked','confirmed','c')
          ) AS Popularity,
          (
            SELECT AVG(CAST(sr.Rating AS FLOAT))
            FROM SalonReviews sr
            WHERE sr.ServiceId = s.ServiceId
          ) AS AvgRating
        FROM Services s
        WHERE (s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) NOT IN ('deleted','delete','inactive'))
        ORDER BY Popularity DESC, s.Name ASC`
    ).catch(() => ({ recordset: [] }))
  }

  const services = (res.recordset || []).map((r) => ({
    ServiceId: r.ServiceId,
    Name: r.Name,
    Price: Number(r.Price || 0),
    DurationMinutes: Number(r.DurationMinutes || 0),
    Description: r.Description || '',
    Popularity: Number(r.Popularity || 0),
    AvgRating: r.AvgRating === null || r.AvgRating === undefined ? null : Number(r.AvgRating),
  }))

  return services
}

async function getProductContext(prompt) {
  const q = normalize(prompt)
  const like = `%${q.slice(0, 100)}%`
  const lookupTokens = buildLookupTokens(prompt)
  const tokenBinds = {}
  const tokenConds = lookupTokens.map((k, i) => {
    const key = `pk${i}`
    tokenBinds[key] = `%${k}%`
    return `(p.Name COLLATE Latin1_General_CI_AI LIKE @${key} OR ISNULL(p.Description, '') COLLATE Latin1_General_CI_AI LIKE @${key})`
  })
  const tokenWhere = tokenConds.length ? ` OR ${tokenConds.join(' OR ')}` : ''

  let res = await query(
    `SELECT TOP 20
        p.ProductId,
        p.Name,
        p.Price,
        p.Description,
        p.Stock,
        p.Status,
        COALESCE(img.ImageUrl, p.ImageUrl) AS ImageUrl
      FROM Products p
      OUTER APPLY (
        SELECT TOP 1 pi.ImageUrl
        FROM ProductImages pi
        WHERE pi.ProductId = p.ProductId
        ORDER BY ISNULL(pi.SortOrder, 2147483647), pi.ImageId
      ) img
      WHERE (p.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) = 'active')
        AND (@q = '' OR p.Name LIKE @like OR ISNULL(p.Description, '') LIKE @like${tokenWhere})
      ORDER BY p.Stock DESC, p.Name ASC`,
    { q, like, ...tokenBinds }
  ).catch(() => null)

  if (!res || !Array.isArray(res.recordset) || !res.recordset.length) {
    res = await query(
      `SELECT TOP 20
          p.ProductId,
          p.Name,
          p.Price,
          p.Description,
          p.Stock,
          p.Status,
          p.ImageUrl
       FROM Products p
       WHERE (p.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) = 'active')
       ORDER BY p.Stock DESC, p.Name ASC`,
      {}
    ).catch(() => ({ recordset: [] }))
  }

  return (res.recordset || []).map((r) => ({
    ProductId: r.ProductId,
    Name: r.Name,
    Price: Number(r.Price || 0),
    Description: r.Description || '',
    Stock: Number(r.Stock || 0),
    ImageUrl: r.ImageUrl || null,
  }))
}

async function getOrderCatalogContext(prompt = '') {
  const q = normalize(prompt)
  const like = `%${q.slice(0, 100)}%`
  const lookupTokens = buildLookupTokens(prompt)
  const tokenBinds = {}
  const tokenConds = lookupTokens.map((k, i) => {
    const key = `ocp${i}`
    tokenBinds[key] = `%${k}%`
    return `(
      p.Name COLLATE Latin1_General_CI_AI LIKE @${key}
      OR ISNULL(p.Description, '') COLLATE Latin1_General_CI_AI LIKE @${key}
      OR ISNULL(c.Name, '') COLLATE Latin1_General_CI_AI LIKE @${key}
    )`
  })
  const tokenWhere = tokenConds.length ? ` OR ${tokenConds.join(' OR ')}` : ''

  const [productStats, categoryStats, imageStats, variantStats, orderStats, topOrdered, matchedProducts] = await Promise.all([
    query(
      `SELECT
          COUNT(1) AS TotalProducts,
          COALESCE(SUM(CASE WHEN COALESCE(p.Status, 'active') = 'active' THEN 1 ELSE 0 END), 0) AS ActiveProducts
       FROM Products p`
    ).catch(() => ({ recordset: [] })),
    query(`SELECT COUNT(1) AS TotalCategories FROM ProductCategories`).catch(() => ({ recordset: [] })),
    query(`SELECT COUNT(1) AS TotalProductImages FROM ProductImages`).catch(() => ({ recordset: [] })),
    query(`SELECT COUNT(1) AS TotalVariants FROM ProductVariants`).catch(() => ({ recordset: [] })),
    query(
      `SELECT
          COUNT(1) AS TotalOrders,
          COALESCE(SUM(COALESCE(oi.Quantity, 0)), 0) AS TotalSoldQuantity
       FROM Orders o
       LEFT JOIN OrderItems oi ON oi.OrderId = o.OrderId`
    ).catch(() => ({ recordset: [] })),
    query(
      `SELECT TOP 5
          p.ProductId,
          p.Name,
          SUM(COALESCE(oi.Quantity, 0)) AS SoldQty
       FROM OrderItems oi
       LEFT JOIN Products p ON p.ProductId = oi.ProductId
       GROUP BY p.ProductId, p.Name
       ORDER BY SUM(COALESCE(oi.Quantity, 0)) DESC, p.Name ASC`
    ).catch(() => ({ recordset: [] })),
    query(
      `SELECT TOP 12
          p.ProductId,
          p.Name,
          p.Price,
          p.Stock,
          c.Name AS CategoryName,
          COALESCE(img.ImageUrl, p.ImageUrl) AS ImageUrl,
          COALESCE(v.VariantCount, 0) AS VariantCount
       FROM Products p
       LEFT JOIN ProductCategories c ON c.CategoryId = p.CategoryId
       OUTER APPLY (
         SELECT TOP 1 pi.ImageUrl
         FROM ProductImages pi
         WHERE pi.ProductId = p.ProductId
         ORDER BY ISNULL(pi.SortOrder, 2147483647), pi.ImageId
       ) img
       OUTER APPLY (
         SELECT COUNT(1) AS VariantCount
         FROM ProductVariants pv
         WHERE pv.ProductId = p.ProductId
       ) v
       WHERE (@q = '' OR p.Name LIKE @like OR ISNULL(p.Description, '') LIKE @like OR ISNULL(c.Name, '') LIKE @like${tokenWhere})
       ORDER BY p.Name ASC`,
      { q, like, ...tokenBinds }
    ).catch(() => ({ recordset: [] })),
  ])

  let matchedProductRows = matchedProducts.recordset || []
  if (!matchedProductRows.length) {
    const broad = await query(
      `SELECT TOP 12
          p.ProductId,
          p.Name,
          p.Price,
          p.Stock,
          c.Name AS CategoryName,
          COALESCE(img.ImageUrl, p.ImageUrl) AS ImageUrl,
          COALESCE(v.VariantCount, 0) AS VariantCount
       FROM Products p
       LEFT JOIN ProductCategories c ON c.CategoryId = p.CategoryId
       OUTER APPLY (
         SELECT TOP 1 pi.ImageUrl
         FROM ProductImages pi
         WHERE pi.ProductId = p.ProductId
         ORDER BY ISNULL(pi.SortOrder, 2147483647), pi.ImageId
       ) img
       OUTER APPLY (
         SELECT COUNT(1) AS VariantCount
         FROM ProductVariants pv
         WHERE pv.ProductId = p.ProductId
       ) v
       ORDER BY p.Name ASC`
    ).catch(() => ({ recordset: [] }))
    matchedProductRows = broad.recordset || []
  }

  return {
    totals: {
      products: Number(productStats.recordset?.[0]?.TotalProducts || 0),
      activeProducts: Number(productStats.recordset?.[0]?.ActiveProducts || 0),
      categories: Number(categoryStats.recordset?.[0]?.TotalCategories || 0),
      images: Number(imageStats.recordset?.[0]?.TotalProductImages || 0),
      variants: Number(variantStats.recordset?.[0]?.TotalVariants || 0),
      orders: Number(orderStats.recordset?.[0]?.TotalOrders || 0),
      soldQuantity: Number(orderStats.recordset?.[0]?.TotalSoldQuantity || 0),
    },
    topOrderedProducts: (topOrdered.recordset || []).map((r) => ({
      ProductId: r.ProductId,
      Name: r.Name || '',
      SoldQty: Number(r.SoldQty || 0),
    })),
    matchedProducts: matchedProductRows.map((r) => ({
      ProductId: r.ProductId,
      Name: r.Name || '',
      Price: Number(r.Price || 0),
      Stock: Number(r.Stock || 0),
      CategoryName: r.CategoryName || null,
      ImageUrl: r.ImageUrl || null,
      VariantCount: Number(r.VariantCount || 0),
    })),
  }
}

function findMentionedServices(prompt, services) {
  const t = normalizeForCompare(prompt)
  const byName = services.filter((s) => t.includes(normalizeForCompare(s.Name)))
  if (byName.length) return byName
  return services.slice(0, 3)
}

function findBestMatchedProduct(prompt, products = [], orderCatalogCtx = {}) {
  const promptText = normalizeForCompare(prompt)
  const tokens = buildLookupTokens(prompt)

  const map = new Map()
  for (const p of products || []) {
    if (p?.ProductId !== undefined && p?.ProductId !== null) map.set(`id:${p.ProductId}`, p)
  }
  for (const p of orderCatalogCtx?.matchedProducts || []) {
    if (p?.ProductId !== undefined && p?.ProductId !== null) {
      map.set(`id:${p.ProductId}`, { ...p, Description: p.Description || '', Stock: Number(p.Stock || 0) })
    }
  }

  const candidates = [...map.values()]
  if (!candidates.length) return null

  let best = null
  let bestScore = -1
  for (const p of candidates) {
    const nameNorm = normalizeForCompare(p.Name)
    if (!nameNorm) continue
    let score = 0
    if (promptText.includes(nameNorm)) score += 100
    for (const tk of tokens) {
      if (nameNorm.includes(tk)) score += 10
    }
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }

  return bestScore > 0 ? best : null
}

function isAskingPrice(prompt = '') {
  const t = normalizeForCompare(prompt)
  return /\bgia\b|\bprice\b|bao nhieu tien|gia tien|don gia/.test(t)
}

function isProductQuery(prompt = '') {
  const t = normalizeForCompare(prompt)
  return /\bsan pham\b|\bproduct\b|\bhang\b|\bsku\b/.test(t)
}

function isServiceQuery(prompt = '') {
  const t = normalizeForCompare(prompt)
  return /\bdich vu\b|\bservice\b/.test(t)
}

function detectAddToCartIntent(prompt = '') {
  const t = normalizeForCompare(prompt)
  return /mua|them vao gio|cho vao gio|dat mua|lay cho toi|lay cho minh|toi muon mua/.test(t)
}

function parseRequestedQuantity(prompt = '') {
  const t = normalizeForCompare(prompt)
  const m = t.match(/(\d{1,3})\s*(chai|hop|san pham|sp|cai)?\b/)
  if (!m) return 1
  const n = Number(m[1])
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(99, Math.trunc(n)))
}

async function tryAutoAddProductToCart({ prompt, userId, products, orderCatalogCtx }) {
  if (!detectAddToCartIntent(prompt)) return ''
  if (!userId) return 'Bạn cần đăng nhập để mình thêm sản phẩm vào giỏ hàng giúp bạn.'

  const matchedProduct = findBestMatchedProduct(prompt, products, orderCatalogCtx)
  if (!matchedProduct?.ProductId) {
    return 'Mình chưa xác định được chính xác sản phẩm cần mua. Bạn gửi lại tên sản phẩm rõ hơn giúp mình nhé.'
  }

  const quantity = parseRequestedQuantity(prompt)

  try {
    const cart = await customerCommerceService.addCartItem(userId, {
      productId: matchedProduct.ProductId,
      quantity,
    })

    const added = Array.isArray(cart?.Items)
      ? cart.Items.find((x) => String(x?.ProductId || '') === String(matchedProduct.ProductId))
      : null

    const currentQty = Number(added?.Quantity || quantity)
    const lineTotal = Number(added?.LineTotal || Number(matchedProduct.Price || 0) * currentQty)

    return [
      `Đã thêm ${quantity} sản phẩm ${matchedProduct.Name} vào giỏ hàng cho bạn.`,
      `Trong giỏ hiện có ${currentQty} sản phẩm này, tạm tính ${formatVnd(lineTotal)}.`,
      'Bạn muốn mình hỗ trợ checkout luôn không?',
    ].join(' ')
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase()
    if (msg.includes('unauthorized') || msg.includes('user not found')) {
      return 'Tài khoản hiện chưa hợp lệ để thêm giỏ hàng. Bạn đăng nhập lại giúp mình nhé.'
    }
    if (msg.includes('out of stock') || msg.includes('het hang')) {
      return `Sản phẩm ${matchedProduct.Name} hiện đang hết hàng, mình chưa thể thêm vào giỏ.`
    }
    if (msg.includes('quantity exceeds stock')) {
      return `Số lượng bạn chọn vượt quá tồn kho của ${matchedProduct.Name}. Bạn giảm số lượng giúp mình nhé.`
    }
    return `Mình chưa thể thêm ${matchedProduct.Name} vào giỏ lúc này. Bạn thử lại sau ít phút nhé.`
  }
}

async function getSalonSettingsContext() {
  try {
    const map = await settingsService.getSettingsMap()
    const allowed = Object.entries(map || {})
      .filter(([k]) => /address|địa|dia|phone|email|open|hour|policy|chính sách|chinh sach/i.test(String(k)))
      .slice(0, 20)
    return Object.fromEntries(allowed)
  } catch {
    return {}
  }
}

async function getUserBookingContext(userId) {
  if (!userId) return []
  const res = await query(
    `SELECT TOP 5 BookingId, BookingTime, Status, Notes
     FROM Bookings
     WHERE CustomerUserId = @userId
     ORDER BY BookingTime DESC`,
    { userId: String(userId) }
  ).catch(() => ({ recordset: [] }))
  return res.recordset || []
}

async function getBookingAvailabilityContext(dt) {
  if (!dt?.date || !dt?.time) return { requested: null, countAtRequested: null, alternatives: [] }

  const requested = new Date(`${dt.date}T${dt.time}:00`)
  if (Number.isNaN(requested.getTime())) return { requested: null, countAtRequested: null, alternatives: [] }

  const dayRes = await query(
    `SELECT BookingTime
     FROM Bookings
     WHERE CAST(BookingTime AS DATE) = @d
       AND LOWER(LTRIM(RTRIM(ISNULL(Status, '')))) IN ('pending','booked','confirmed','c')`,
    { d: dt.date }
  ).catch(() => ({ recordset: [] }))

  const booked = new Set(
    (dayRes.recordset || []).map((r) => {
      const b = new Date(r.BookingTime)
      return `${String(b.getHours()).padStart(2, '0')}:${String(b.getMinutes()).padStart(2, '0')}`
    })
  )

  const requestedHm = `${String(requested.getHours()).padStart(2, '0')}:${String(requested.getMinutes()).padStart(2, '0')}`
  const countAtRequested = booked.has(requestedHm) ? 1 : 0

  const alternatives = []
  for (let h = 9; h <= 20; h += 1) {
    for (const m of [0, 30]) {
      const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      if (!booked.has(hm)) alternatives.push(hm)
      if (alternatives.length >= 5) break
    }
    if (alternatives.length >= 5) break
  }

  return {
    requested: { date: dt.date, time: dt.time },
    countAtRequested,
    alternatives,
  }
}

async function getDetailedAvailabilityForDate(dateIso, windowStartHour = 9, windowEndHour = 12, staffIdFilter = null) {
  if (!dateIso) return { date: null, slots: [] }
  // normalize dateIso to YYYY-MM-DD
  const d = new Date(dateIso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return { date: null, slots: [] }
  const date = dateIso

  // fetch staff availability rows for that exact date
  const binds = { date }
  const staffWhere = staffIdFilter ? 'AND sa.StaffId = @staffId' : ''
  if (staffIdFilter) binds.staffId = staffIdFilter

  const staffRes = await query(
    `SELECT sa.StaffId, sa.StartHour, sa.EndHour, u.Name
     FROM StaffAvailability sa
     LEFT JOIN Staff st ON st.StaffId = sa.StaffId
     LEFT JOIN Users u ON u.UserId = st.UserId
     WHERE sa.WeekStartDate = @date
     ${staffWhere}`,
    binds
  ).catch(() => ({ recordset: [] }))

  const staffRows = (staffRes.recordset || []).map((r) => ({
    staffId: r.StaffId,
    name: r.Name || `NV-${r.StaffId}`,
    startHour: Number.isFinite(Number(r.StartHour)) ? Number(r.StartHour) : null,
    endHour: Number.isFinite(Number(r.EndHour)) ? Number(r.EndHour) : null,
  }))

  // If staffIdFilter provided but no staffRows found => staff has no schedule
  if (staffIdFilter && (!staffRows || !staffRows.length)) {
    return { date, slots: [], staffMissing: true }
  }

  // fetch bookings on that date (with assigned staff if any)
  const bookingRes = await query(
    `SELECT b.BookingTime, bs.StaffId
     FROM Bookings b
     LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
     WHERE CAST(b.BookingTime AS DATE) = @date
       AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('pending','booked','confirmed','c')`,
    { date }
  ).catch(() => ({ recordset: [] }))

  const bookedMap = new Map() // key: staffId or '*' for unassigned, value: Set of slotStarts 'HH:MM'
  for (const r of bookingRes.recordset || []) {
    const bt = r.BookingTime ? new Date(r.BookingTime) : null
    if (!bt || Number.isNaN(bt.getTime())) continue
    const hm = `${String(bt.getHours()).padStart(2, '0')}:00`
    const sid = r.StaffId || '*'
    if (!bookedMap.has(sid)) bookedMap.set(sid, new Set())
    bookedMap.get(sid).add(hm)
  }

  const slots = []
  for (let h = windowStartHour; h < windowEndHour; h += 1) {
    const slotStart = `${String(h).padStart(2, '0')}:00`
    const slotEnd = `${String(h + 1).padStart(2, '0')}:00`
    const available = []
    for (const s of staffRows) {
      if (s.startHour === null || s.endHour === null) continue
      // staff available if their availability covers the whole slot
      if (s.startHour <= h && s.endHour >= (h + 1)) {
        // check if this staff has a booking at this slot
        const bookedSet = bookedMap.get(s.staffId) || new Set()
        if (!bookedSet.has(slotStart)) available.push(s.name)
      }
    }
    slots.push({ start: slotStart, end: slotEnd, available })
  }

  return { date, slots }
}

async function findStaffByName(prompt) {
  const q = normalize(prompt)
  if (!q) return null
  // try simple LIKE match on Users.Name
  const like = `%${q.slice(0, 100)}%`
  const res = await query(
    `SELECT TOP 5 s.StaffId, u.Name
     FROM Staff s
     LEFT JOIN Users u ON u.UserId = s.UserId
     WHERE (@q = '' OR u.Name LIKE @like)
     ORDER BY u.Name ASC`,
    { q, like }
  ).catch(() => ({ recordset: [] }))

  const rows = res.recordset || []
  if (!rows.length) return null

  // prefer exact substring match of last token
  const tokens = q.split(/\s+/).filter(Boolean).slice(-2)
  for (const t of tokens.reverse()) {
    const found = rows.find((r) => normalizeForCompare(r.Name || '').includes(normalizeForCompare(t)))
    if (found) return { staffId: found.StaffId, name: found.Name }
  }

  // fallback to first row
  return { staffId: rows[0].StaffId, name: rows[0].Name }
}

function detectWindowFromPrompt(prompt = '') {
  const t = normalize(prompt)
  if (/sáng|sang|buổi sáng|sang mai|sáng mai/.test(t)) return { start: 9, end: 12 }
  if (/chiều|chieu|buổi chiều/.test(t)) return { start: 13, end: 17 }
  if (/tối|toi|buổi tối/.test(t)) return { start: 18, end: 20 }
  return null
}

function shouldAutoCreateBooking(prompt) {
  const t = normalize(prompt)
  return /xác nhận|xac nhan|đặt luôn|dat luon|chốt lịch|chot lich|ok đặt/.test(t)
}

function buildSystemPrompt({ intent, userPrompt, services, products, orderCatalogCtx, bookingCtx, settingsCtx, userBookingCtx, conversationCtx }) {
  const serviceJson = JSON.stringify(services.slice(0, 20))
  const productJson = JSON.stringify((products || []).slice(0, 20))
  const orderCatalogJson = JSON.stringify(orderCatalogCtx || {})
  const bookingJson = JSON.stringify(bookingCtx || {})
  const settingsJson = JSON.stringify(settingsCtx || {})
  const userBookingJson = JSON.stringify(userBookingCtx || [])
  const conversationJson = JSON.stringify((conversationCtx?.history || []).slice(-8))

  return [
    'Bạn là trợ lý CSKH cho salon nail.',
    'Mục tiêu: tư vấn dịch vụ, cung cấp thông tin giá/thời lượng, hỗ trợ đặt lịch, trả lời FAQ.',
    'Chỉ dùng dữ liệu nội bộ được cung cấp bên dưới; không bịa thông tin ngoài hệ thống.',
    'Nếu thiếu dữ liệu, nói rõ là hệ thống chưa có thông tin đó.',
    'Giọng điệu lịch sự, tư vấn ngắn gọn, thực tế.',
    `Intent: ${intent}`,
    `Dịch vụ (DB): ${serviceJson}`,
    `Sản phẩm (DB: Products + ProductImages): ${productJson}`,
    `Đơn hàng/Catalog (DB: Orders, OrderItems, ProductCategories, ProductImages, ProductVariants): ${orderCatalogJson}`,
    `Lịch hẹn/ngày giờ (DB): ${bookingJson}`,
    `Thông tin salon/FAQ (DB): ${settingsJson}`,
    `Lịch sử đặt lịch khách (DB): ${userBookingJson}`,
    `Ngữ cảnh hội thoại gần đây: ${conversationJson}`,
    `Câu hỏi khách: ${userPrompt}`,
    'Nếu câu hiện tại ngắn như "có", "ok", "ừ", hãy hiểu theo ngữ cảnh hội thoại gần nhất thay vì trả lời lại từ đầu.',
    'Nếu khách hỏi giá/thời gian thì ưu tiên trả số liệu cụ thể (VNĐ, phút).',
    'Nếu giờ yêu cầu đã bận, gợi ý các khung giờ thay thế từ dữ liệu.',
  ].join('\n')
}

function formatVnd(value) {
  const n = Number(value || 0)
  return `${n.toLocaleString('vi-VN')} VNĐ`
}

function localFallbackResponse({
  intent,
  prompt,
  products,
  orderCatalogCtx,
  services,
  mentionedServices,
  bookingCtx,
  settingsCtx,
  parsedDateTime,
}) {
  const t = normalize(prompt)
  const totals = orderCatalogCtx?.totals || {}

  if (/bao nhiêu sản phẩm|bao nhieu san pham|tổng sản phẩm|tong san pham|số lượng sản phẩm|so luong san pham|total products/i.test(t)) {
    const totalProducts = Number(totals.products || 0)
    const activeProducts = Number(totals.activeProducts || 0)
    if (totalProducts > 0) return `Hiện tại hệ thống có ${totalProducts} sản phẩm, trong đó ${activeProducts} sản phẩm đang hoạt động.`
    return 'Hiện mình chưa lấy được số lượng sản phẩm từ hệ thống.'
  }

  if (/danh mục|danh muc|category|loại sản phẩm|loai san pham/i.test(t)) {
    const totalCategories = Number(totals.categories || 0)
    if (totalCategories > 0) return `Hiện có ${totalCategories} danh mục sản phẩm trong hệ thống.`
  }

  if (/đơn hàng|don hang|order|đã bán|da ban|bán được|ban duoc/i.test(t)) {
    const orders = Number(totals.orders || 0)
    const soldQty = Number(totals.soldQuantity || 0)
    if (orders > 0 || soldQty > 0) {
      return `Hiện hệ thống ghi nhận ${orders} đơn hàng và tổng số lượng đã bán là ${soldQty} sản phẩm.`
    }
  }

  if (/sản phẩm|san pham|product/i.test(t) && Array.isArray(products) && products.length) {
    const top = products.slice(0, 3).map((p) => `${p.Name} (${formatVnd(p.Price)})`).join('; ')
    return `Một số sản phẩm bạn có thể tham khảo: ${top}. Bạn muốn mình lọc theo danh mục hoặc khoảng giá không?`
  }

  if (intent === 'service_info') {
    const s = mentionedServices[0] || services[0]
    if (!s) return 'Hiện mình chưa lấy được dữ liệu dịch vụ từ hệ thống. Bạn thử lại sau ít phút nhé.'
    return `Dịch vụ ${s.Name} có giá ${formatVnd(s.Price)} và thời gian thực hiện khoảng ${s.DurationMinutes || 30} phút. ${s.Description ? `Mô tả: ${s.Description}` : ''}`.trim()
  }

  if (intent === 'booking') {
    if (parsedDateTime?.date && parsedDateTime?.time) {
      if (Number(bookingCtx?.countAtRequested || 0) > 0) {
        const alt = (bookingCtx?.alternatives || []).slice(0, 3).join(', ')
        return `Khung giờ ${parsedDateTime.time} ngày ${parsedDateTime.date} hiện đang bận. Bạn có thể chọn: ${alt || 'khung giờ khác trong ngày'} .`
      }
      return `Khung giờ ${parsedDateTime.time} ngày ${parsedDateTime.date} hiện có thể đặt. Bạn hãy nhắn: "Xác nhận đặt lịch" để mình tạo lịch cho bạn.`
    }
    return 'Bạn cho mình xin ngày và giờ cụ thể (ví dụ: 17h ngày mai) để mình kiểm tra lịch trống nhé.'
  }

  if (intent === 'faq') {
    const address = settingsCtx?.SalonAddress || settingsCtx?.Address || settingsCtx?.SalonLocation || 'đang cập nhật'
    const phone = settingsCtx?.SalonPhone || settingsCtx?.Phone || settingsCtx?.OwnerPhone || 'đang cập nhật'
    const open = settingsCtx?.OpenHours || settingsCtx?.WorkingHours || settingsCtx?.BusinessHours || 'đang cập nhật'
    return `Thông tin salon: Địa chỉ ${address}; SĐT ${phone}; Giờ mở cửa ${open}.`
  }

  // service_advice/general fallback
  if (/móng yếu|mong yeu/.test(t)) {
    const s = mentionedServices[0] || services[0]
    if (s) return `Với móng yếu, bạn có thể bắt đầu với ${s.Name} để giữ độ tự nhiên và hạn chế tổn thương móng. Giá tham khảo ${formatVnd(s.Price)}.`
    return 'Với móng yếu, bạn nên ưu tiên các dịch vụ nhẹ, dưỡng và hạn chế mài mạnh.'
  }

  if (services.length) {
    const tops = services.slice(0, 3).map((s) => `${s.Name} (${formatVnd(s.Price)})`).join('; ')
    return `Một số dịch vụ phù hợp bạn có thể tham khảo: ${tops}. Bạn muốn mình gợi ý theo nhu cầu cụ thể (đi tiệc, nhẹ nhàng, bền màu) không?`
  }

  return 'Hiện mình chưa lấy được dữ liệu để tư vấn chi tiết. Bạn thử lại sau ít phút nhé.'
}

function getDeterministicCatalogAnswer(prompt, orderCatalogCtx) {
  const t = normalize(prompt)
  const totals = orderCatalogCtx?.totals || {}

  if (/bao nhiêu sản phẩm|bao nhieu san pham|tổng sản phẩm|tong san pham|số lượng sản phẩm|so luong san pham|total products/i.test(t)) {
    const totalProducts = Number(totals.products || 0)
    const activeProducts = Number(totals.activeProducts || 0)
    return totalProducts > 0
      ? `Hiện tại hệ thống có ${totalProducts} sản phẩm, trong đó ${activeProducts} sản phẩm đang hoạt động.`
      : 'Hiện mình chưa lấy được số lượng sản phẩm từ hệ thống.'
  }

  if (/bao nhiêu danh mục|bao nhieu danh muc|tổng danh mục|tong danh muc|category/i.test(t)) {
    const totalCategories = Number(totals.categories || 0)
    if (totalCategories > 0) return `Hiện có ${totalCategories} danh mục sản phẩm trong hệ thống.`
  }

  if (/bao nhiêu đơn hàng|bao nhieu don hang|tổng đơn hàng|tong don hang|đã bán bao nhiêu|da ban bao nhieu/i.test(t)) {
    const orders = Number(totals.orders || 0)
    const soldQty = Number(totals.soldQuantity || 0)
    if (orders > 0 || soldQty > 0) {
      return `Hiện hệ thống ghi nhận ${orders} đơn hàng và tổng số lượng đã bán là ${soldQty} sản phẩm.`
    }
  }

  return ''
}

function getDeterministicProductOrServicePriceAnswer({ prompt, products, orderCatalogCtx, services, mentionedServices }) {
  if (!isAskingPrice(prompt)) return ''

  if (isProductQuery(prompt) || (!isServiceQuery(prompt) && /\b(ma|sp|sku)\b/i.test(prompt))) {
    const matchedProduct = findBestMatchedProduct(prompt, products, orderCatalogCtx)
    if (matchedProduct && Number.isFinite(Number(matchedProduct.Price))) {
      const stock = Number(matchedProduct.Stock || 0)
      const stockText = stock > 0 ? `Còn ${stock} sản phẩm trong kho.` : 'Hiện đang hết hàng.'
      return `Giá sản phẩm ${matchedProduct.Name} là ${formatVnd(matchedProduct.Price)}. ${stockText}`
    }
    return 'Mình chưa tìm thấy đúng sản phẩm bạn đang hỏi trong dữ liệu hiện tại. Bạn gửi lại tên sản phẩm chính xác giúp mình nhé.'
  }

  const matchedService = (mentionedServices || [])[0]
  if (matchedService && (isServiceQuery(prompt) || /thoi gian|bao lau|duration/.test(normalizeForCompare(prompt)))) {
    return `Dịch vụ ${matchedService.Name} có giá ${formatVnd(matchedService.Price)} và thời gian thực hiện khoảng ${matchedService.DurationMinutes || 30} phút.`
  }

  return ''
}

function getDeterministicFollowupAnswer({ prompt, conversationCtx, products, orderCatalogCtx, services }) {
  if (!isShortAffirmativePrompt(prompt)) return ''

  const lastAi = String(conversationCtx?.lastAi || '').trim()
  if (!lastAi) return ''

  const productMap = new Map()
  for (const p of products || []) {
    if (p?.ProductId) productMap.set(String(p.ProductId), p)
  }
  for (const p of orderCatalogCtx?.matchedProducts || []) {
    if (p?.ProductId && !productMap.has(String(p.ProductId))) productMap.set(String(p.ProductId), p)
  }
  const allProducts = [...productMap.values()]

  const chosenProduct = findMentionedEntityByLastAi(lastAi, allProducts, 'ProductId')
  if (chosenProduct?.Name) {
    const stock = Number(chosenProduct.Stock || 0)
    const desc = String(chosenProduct.Description || '').trim()
    const stockText = stock > 0 ? `Tồn kho hiện tại: ${stock}.` : 'Hiện đang tạm hết hàng.'
    return [
      `Tuyệt vời. Về sản phẩm ${chosenProduct.Name}: giá ${formatVnd(chosenProduct.Price)}.`,
      stockText,
      desc ? `Thông tin thêm: ${desc}` : 'Nếu bạn muốn, mình có thể thêm sản phẩm này vào giỏ ngay cho bạn.',
    ].join(' ')
  }

  const chosenService = findMentionedEntityByLastAi(lastAi, services || [], 'ServiceId')
  if (chosenService?.Name) {
    return `Tuyệt, dịch vụ ${chosenService.Name} có giá ${formatVnd(chosenService.Price)} và thời gian khoảng ${chosenService.DurationMinutes || 30} phút. Bạn muốn mình gợi ý lịch trống gần nhất không?`
  }

  return 'Tuyệt, mình đang hỗ trợ tiếp theo ngữ cảnh trước đó. Bạn muốn xem chi tiết về sản phẩm nào (giá, tồn kho, cách dùng) để mình trả lời ngay?'
}

let modelDiscoveryCache = {
  expiresAt: 0,
  data: null,
}

async function discoverAvailableModels() {
  const now = Date.now()
  if (modelDiscoveryCache.data && modelDiscoveryCache.expiresAt > now) return modelDiscoveryCache.data

  const discovered = {
    generateContentModels: [],
    generateTextModels: [],
    generateMessageModels: [],
    debug: '',
  }

  if (!fetch || !GEMINI_KEY) {
    modelDiscoveryCache = { data: discovered, expiresAt: now + 60 * 1000 }
    return discovered
  }

  const apiKey = encodeURIComponent(GEMINI_KEY)
  const listUrls = [
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
  ]

  const errors = []
  for (const url of listUrls) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        errors.push(`${url.replace(apiKey, '***')} => ${res.status} ${txt}`)
        continue
      }

      const data = await res.json().catch(() => ({}))
      const models = Array.isArray(data?.models) ? data.models : []

      for (const m of models) {
        const fullName = String(m?.name || '')
        const name = fullName.replace(/^models\//, '')
        const methods = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : []
        if (!name) continue

        if (methods.includes('generateContent') && !discovered.generateContentModels.includes(name)) {
          discovered.generateContentModels.push(name)
        }
        if (methods.includes('generateText') && !discovered.generateTextModels.includes(name)) {
          discovered.generateTextModels.push(name)
        }
        if (methods.includes('generateMessage') && !discovered.generateMessageModels.includes(name)) {
          discovered.generateMessageModels.push(name)
        }
      }
    } catch (err) {
      errors.push(`${url.replace(apiKey, '***')} => ${String(err?.message || err)}`)
    }
  }

  discovered.debug = errors.join(' | ')

  const prefer = (arr) => arr.sort((a, b) => {
    const pa = /gemini/i.test(a) ? 0 : 1
    const pb = /gemini/i.test(b) ? 0 : 1
    if (pa !== pb) return pa - pb
    return a.localeCompare(b)
  })

  discovered.generateContentModels = prefer([...new Set(discovered.generateContentModels)])
  discovered.generateTextModels = prefer([...new Set(discovered.generateTextModels)])
  discovered.generateMessageModels = prefer([...new Set(discovered.generateMessageModels)])

  modelDiscoveryCache = {
    data: discovered,
    expiresAt: now + 10 * 60 * 1000,
  }

  return discovered
}

async function tryGeminiSdk(fullPrompt, discoveredModels = null) {
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(GEMINI_KEY)
  const discovered = discoveredModels || await discoverAvailableModels()
  const models = discovered.generateContentModels.length
    ? discovered.generateContentModels
    : ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro']
  const errors = []

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const maxTokensEnv = process.env.GEMINI_MAX_TOKENS
      const maxTokens = (maxTokensEnv === undefined || maxTokensEnv === null || String(maxTokensEnv).trim() === '')
        ? 700
        : (String(maxTokensEnv).toLowerCase() === 'unlimited' || Number(maxTokensEnv) === 0)
          ? null
          : Number(maxTokensEnv)

      const genCfg = { temperature: 0.25 }
      if (Number.isFinite(maxTokens) && maxTokens > 0) genCfg.maxOutputTokens = maxTokens

      const result = await aiClient.guard(() => model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: genCfg,
      }), { cost: 1 })
      const text = result?.response?.text?.() || ''
      if (String(text).trim()) return String(text).trim()
    } catch (err) {
      errors.push(`sdk:${modelName}:${String(err?.message || err)}`)
    }
  }

  const e = new Error('SDK failed')
  e.debug = errors.join(' | ')
  throw e
}

async function tryGeminiHttp(fullPrompt, discoveredModels = null) {
  if (!fetch) throw new Error('fetch not available on server')

  const apiKey = encodeURIComponent(GEMINI_KEY)
  const discovered = discoveredModels || await discoverAvailableModels()
  const attempts = []

  // prepare generationConfig based on GEMINI_MAX_TOKENS env var
  const maxTokensEnvHttp = process.env.GEMINI_MAX_TOKENS
  const maxTokensHttp = (maxTokensEnvHttp === undefined || maxTokensEnvHttp === null || String(maxTokensEnvHttp).trim() === '')
    ? 700
    : (String(maxTokensEnvHttp).toLowerCase() === 'unlimited' || Number(maxTokensEnvHttp) === 0)
      ? null
      : Number(maxTokensEnvHttp)

  const genCfgHttp = { temperature: 0.25 }
  if (Number.isFinite(maxTokensHttp) && maxTokensHttp > 0) genCfgHttp.maxOutputTokens = maxTokensHttp

  for (const modelName of discovered.generateContentModels) {
    attempts.push({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
      body: {
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: genCfgHttp,
      },
      parser: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content || '',
    })
  }

  for (const modelName of discovered.generateTextModels) {
    const body = {
      prompt: { text: fullPrompt },
      temperature: 0.25,
      candidateCount: 1,
    }
    if (Number.isFinite(maxTokensHttp) && maxTokensHttp > 0) body.maxOutputTokens = maxTokensHttp
    attempts.push({
      url: `https://generativelanguage.googleapis.com/v1beta3/models/${modelName}:generateText`,
      body,
      parser: (data) => data?.candidates?.[0]?.output || '',
    })
  }

  for (const modelName of discovered.generateMessageModels) {
    attempts.push({
      url: `https://generativelanguage.googleapis.com/v1beta3/models/${modelName}:generateMessage`,
      body: {
        prompt: {
          messages: [{ author: 'user', content: fullPrompt }],
        },
        temperature: 0.25,
        candidateCount: 1,
      },
      parser: (data) => data?.candidates?.[0]?.content || '',
    })
  }

  if (!attempts.length) {
    // hard fallback if discovery returns empty
    attempts.push(
      {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
        body: {
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: genCfgHttp,
        },
        parser: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content || '',
      },
      {
        url: 'https://generativelanguage.googleapis.com/v1beta3/models/text-bison-001:generateText',
        body: {
          prompt: { text: fullPrompt },
          temperature: 0.25,
          candidateCount: 1,
          ...(Number.isFinite(maxTokensHttp) && maxTokensHttp > 0 ? { maxOutputTokens: maxTokensHttp } : {}),
        },
        parser: (data) => data?.candidates?.[0]?.output || '',
      }
    )
  }

  const errors = []
  // Check quota before making HTTP attempts
  try {
    if (await aiClient.isSuspended()) {
      const q = await aiClient.getQuota()
      const err = new Error('AI quota suspended')
      err.code = 'QUOTA_EXCEEDED'
      err.quota = q
      throw err
    }
  } catch (e) {
    throw e
  }
  for (const item of attempts) {
    const url = `${item.url}?key=${apiKey}`
    try {
      // respect GEMINI_MAX_TOKENS env var; if set to 'unlimited' or 0 omit maxOutputTokens
      const maxTokensEnv = process.env.GEMINI_MAX_TOKENS
      const maxTokens = (maxTokensEnv === undefined || maxTokensEnv === null || String(maxTokensEnv).trim() === '')
        ? (item.body.generationConfig && item.body.generationConfig.maxOutputTokens) || null
        : (String(maxTokensEnv).toLowerCase() === 'unlimited' || Number(maxTokensEnv) === 0)
          ? null
          : Number(maxTokensEnv)

      const body = JSON.parse(JSON.stringify(item.body))
      if (body.generationConfig) {
        if (Number.isFinite(maxTokens) && maxTokens > 0) {
          body.generationConfig.maxOutputTokens = maxTokens
        } else {
          delete body.generationConfig.maxOutputTokens
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const headers = {}
      try {
        res.headers && res.headers.forEach && res.headers.forEach((v, k) => { headers[k] = v })
      } catch {
        // no-op
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        errors.push({ url: `${item.url}?key=***`, status: res.status, body: txt, headers })
        continue
      }

      const data = await res.json().catch(() => null)
      const text = item.parser ? item.parser(data) : ''
      if (String(text).trim()) {
        // increment quota for successful useful response
        try { await aiClient.increment(1) } catch (_) { /* ignore */ }
        return String(text).trim()
      }
    } catch (err) {
      errors.push({ url: `${item.url}?key=***`, error: String(err?.message || err) })
    }
  }

  const e = new Error('HTTP fallback failed')
  e.debug = errors.map((x) => `${x.url} => ${x.status || ''} ${x.body || x.error || ''}`).join(' | ')
  throw e
}

async function createSession(userId, title) {
  const uid = String(userId ?? '').trim()
  const t = String(title || '').trim()
  if (!uid) {
    const err = new Error('Authentication required')
    err.statusCode = 401
    throw err
  }
  // If no title provided, store NULL for now — will be auto-filled on first message
  const titleParam = t || null
  const res = await query(
    `INSERT INTO ChatSessions (UserId, NameSessions) OUTPUT INSERTED.SessionId VALUES (@userId, @title)`,
    { userId: uid, title: titleParam },
  )
  const sessionId = res.recordset?.[0]?.SessionId
  return { SessionId: sessionId }
}

async function listSessions(userId) {
  const uid = String(userId ?? '').trim()
  if (!uid) return []
  // only return sessions owned by the authenticated user
  const res = await query(
    `SELECT SessionId, UserId, CreatedAt, ISNULL(NameSessions, '') AS title FROM ChatSessions WHERE UserId = @userId ORDER BY CreatedAt DESC`,
    { userId: uid },
  )
  return (res.recordset || [])
}

async function renameSession(sessionId, userId, title) {
  const uid = userId ?? null
  if (!sessionId || !title) {
    const err = new Error('Missing parameters')
    err.statusCode = 400
    throw err
  }
  await query(
    `UPDATE ChatSessions SET NameSessions = @title WHERE SessionId = @sessionId AND ((@userId IS NULL AND UserId IS NULL) OR UserId = @userId)`,
    { sessionId, title, userId: uid },
  )
  const res = await query(`SELECT SessionId, ISNULL(NameSessions, '') AS title, CreatedAt FROM ChatSessions WHERE SessionId = @sessionId`, { sessionId })
  return res.recordset?.[0] || null
}

async function deleteSession(sessionId, userId) {
  const uid = userId ?? null
  if (!sessionId) {
    const err = new Error('Missing sessionId')
    err.statusCode = 400
    throw err
  }

  // delete AIResults linked to messages in this session
  await query(`DELETE FROM AIResults WHERE MessageId IN (SELECT MessageId FROM AIChatMessages WHERE SessionId = @sessionId)`, { sessionId })
  // delete chat images
  await query(`DELETE FROM AIChatImages WHERE MessageId IN (SELECT MessageId FROM AIChatMessages WHERE SessionId = @sessionId)`, { sessionId })
  // delete messages
  await query(`DELETE FROM AIChatMessages WHERE SessionId = @sessionId`, { sessionId })
  // delete session
  await query(`DELETE FROM ChatSessions WHERE SessionId = @sessionId AND ((@userId IS NULL AND UserId IS NULL) OR UserId = @userId)`, { sessionId, userId: uid })

  return { success: true }
}

async function getMessages(sessionId) {
  const res = await query(
    `SELECT
        m.MessageId,
        m.SessionId,
        m.Sender,
        m.Content,
        m.MessageType,
        m.CreatedAt,
        img.ImageUrl
     FROM AIChatMessages m
     OUTER APPLY (
       SELECT TOP 1 ImageUrl
       FROM AIChatImages i
       WHERE i.MessageId = m.MessageId
       ORDER BY i.ImageId DESC
     ) img
     WHERE m.SessionId = @sessionId
     ORDER BY m.CreatedAt ASC, m.MessageId ASC`,
    { sessionId },
  )
  return res.recordset || []
}

async function postUserMessage(sessionId, userId, content, messageType = 'text') {
  // insert user message
  const uid = userId ?? null
  await query(
    `INSERT INTO AIChatMessages (SessionId, Sender, Content, MessageType) VALUES (@sessionId, @sender, @content, @messageType)`,
    { sessionId, sender: 'user', content, messageType, userId: uid },
  )

  // If the session has no name yet, set it from the first user message (first 15 chars)
  try {
    await query(
      `UPDATE ChatSessions SET NameSessions = LEFT(@content, 15) WHERE SessionId = @sessionId AND (NameSessions IS NULL OR LTRIM(RTRIM(ISNULL(NameSessions, ''))) = '')`,
      { sessionId, content: String(content || '').trim() },
    )
  } catch (e) {
    // ignore update errors; session name is optional
  }

  // call Gemini (if available)
  const aiText = await generateAIResponse(content, uid, { sessionId })

  // save AI response message
  const aiRes = await query(
    `INSERT INTO AIChatMessages (SessionId, Sender, Content, MessageType) VALUES (@sessionId, @sender, @content, @messageType); SELECT SCOPE_IDENTITY() AS MessageId`,
    { sessionId, sender: 'ai', content: aiText, messageType: 'text' },
  )

  const messageId = aiRes.recordset?.[0]?.MessageId || null

  // store simple AI result record
  if (messageId) {
    await query(
      `INSERT INTO AIResults (MessageId, Description) VALUES (@messageId, @description)`,
      { messageId, description: aiText },
    )
  }

  return { ai: aiText }
}

async function postUserImageMessage(sessionId, userId, { imageDataUrl, imageDataUrls, caption } = {}) {
  const uid = userId ?? null
  if (!sessionId) {
    const err = new Error('Missing sessionId')
    err.statusCode = 400
    throw err
  }
  const images = (Array.isArray(imageDataUrls) ? imageDataUrls : [imageDataUrl])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 3)

  if (!images.length) {
    const err = new Error('Missing imageDataUrl')
    err.statusCode = 400
    throw err
  }

  const savedImages = await Promise.all(images.map((dataUrl) => saveChatImageFromDataUrl({ dataUrl })))

  for (let i = 0; i < savedImages.length; i += 1) {
    const userMessageRes = await query(
      `INSERT INTO AIChatMessages (SessionId, Sender, Content, MessageType)
       VALUES (@sessionId, @sender, @content, @messageType);
       SELECT SCOPE_IDENTITY() AS MessageId`,
      {
        sessionId,
        sender: 'user',
        content: String(
          i === 0 && caption
            ? caption
            : savedImages.length > 1
              ? `Khách hàng gửi ảnh (${i + 1}/${savedImages.length})`
              : 'Khách hàng gửi ảnh'
        ).trim(),
        messageType: 'image',
        userId: uid,
      }
    )

    const userMessageId = userMessageRes.recordset?.[0]?.MessageId
    if (userMessageId) {
      await query(
        `INSERT INTO AIChatImages (MessageId, ImageUrl) VALUES (@messageId, @imageUrl)`,
        { messageId: userMessageId, imageUrl: savedImages[i].imageUrl }
      )
      // If this is the first message in the session and the session has no name, set it
      if (i === 0) {
        try {
          const firstContent = String(
            i === 0 && caption
              ? caption
              : savedImages.length > 1
                ? `Khách hàng gửi ảnh (${i + 1}/${savedImages.length})`
                : 'Khách hàng gửi ảnh'
          ).trim()
          await query(
            `UPDATE ChatSessions SET NameSessions = LEFT(@content, 15) WHERE SessionId = @sessionId AND (NameSessions IS NULL OR LTRIM(RTRIM(ISNULL(NameSessions, ''))) = '')`,
            { sessionId, content: firstContent },
          )
        } catch (e) {
          // ignore
        }
      }
    }
  }

  const analyses = await Promise.all(images.map((img, idx) => analyzeNailImageWithAI({ imageDataUrl: img, userPrompt: idx === 0 ? (caption || '') : '' })))

  const analysisKeywords = analyses.flatMap((a) => (Array.isArray(a?.keywords) ? a.keywords : []))
  const promptKeywords = extractPromptKeywords(caption || '')
  const keywords = [...new Set([...analysisKeywords, ...promptKeywords])]

  let questionAnswer = analyses.map((a) => String(a?.question_answer || '').trim()).find(Boolean) || ''
  if (!questionAnswer && String(caption || '').trim()) {
    const healthHints = analyses.slice(0, 3).map((a, idx) => {
      const h = a?.nail_health || {}
      return [
        `Ảnh ${idx + 1}: chất lượng=${a?.image_quality || 'unknown'}, moisture=${h?.moisture || 'unknown'}, structure=${h?.structure || 'unknown'}, risk=${h?.risk_level || 'unknown'}, regrowth_mm=${h?.regrowth_mm ?? 'unknown'}`,
      ].join(' ')
    }).join('\n')

    const imageContext = [
      'Ngữ cảnh các ảnh đã phân tích:',
      healthHints,
      `Câu hỏi của khách: ${String(caption || '').trim()}`,
      'Hãy trả lời trực tiếp câu hỏi khách bằng tiếng Việt, ngắn gọn, thực tế, ưu tiên gợi ý sản phẩm/dịch vụ phù hợp.',
    ].join('\n')

    questionAnswer = await generateAIResponse(imageContext, uid, { sessionId })
  }

  const [suggestedProducts, suggestedServices] = await Promise.all([
    findSuggestedProductsByKeywords(keywords.length ? keywords : ['product', 'care', 'repair', 'serum', 'oil']),
    findSuggestedServicesByKeywords(keywords.length ? keywords : ['service', 'care', 'treatment', 'manicure', 'combo']),
  ])

  const allAdvice = [...new Set(analyses.flatMap((a) => (Array.isArray(a?.advice) ? a.advice : [])))].slice(0, 8)
  const customerMessages = analyses
    .map((a) => String(a?.customer_message || '').trim())
    .filter(Boolean)
  const fallbackMessage = analyses.length > 1
    ? `AI đã phân tích ${analyses.length} ảnh của bạn. Dưới đây là gợi ý phù hợp.`
    : 'AI đã phân tích ảnh của bạn. Dưới đây là gợi ý phù hợp.'

  const imageQuality = analyses.some((a) => a?.image_quality === 'poor')
    ? 'poor'
    : analyses.some((a) => a?.image_quality === 'medium')
      ? 'medium'
      : 'good'

  const firstHealth = analyses.map((a) => a?.nail_health).find(Boolean) || null
  const isHandImage = analyses.every((a) => Boolean(a?.is_hand_image))
  const detectedDomains = [...new Set(analyses.map((a) => String(a?.detected_domain || '').trim()).filter(Boolean))]

  const aiPayload = {
    type: 'image-analysis',
    text: [questionAnswer, ...customerMessages].filter(Boolean).join('\n\n') || fallbackMessage,
    questionAnswer: questionAnswer || '',
    analysis: {
      isHandImage,
      imageQuality,
      nailHealth: firstHealth,
      advice: allAdvice,
    },
    detectedDomains,
    analyzedImageCount: analyses.length,
    suggestedProducts,
    suggestedServices,
  }

  const aiTextForResult = `${aiPayload.text}\n${(aiPayload.analysis?.advice || []).join('\n')}`.trim()

  const aiMessageRes = await query(
    `INSERT INTO AIChatMessages (SessionId, Sender, Content, MessageType)
     VALUES (@sessionId, @sender, @content, @messageType);
     SELECT SCOPE_IDENTITY() AS MessageId`,
    {
      sessionId,
      sender: 'ai',
      content: JSON.stringify(aiPayload),
      messageType: 'analysis',
    }
  )

  const aiMessageId = aiMessageRes.recordset?.[0]?.MessageId || null
  if (aiMessageId) {
    const nh = aiPayload.analysis?.nailHealth || {}
    const rs = await query(
      `INSERT INTO AIResults (MessageId, NailCondition, Description)
       VALUES (@messageId, @nailCondition, @description);
       SELECT SCOPE_IDENTITY() AS ResultId`,
      {
        messageId: aiMessageId,
        nailCondition: nh?.structure || 'normal',
        description: aiTextForResult,
      }
    ).catch(() => ({ recordset: [] }))

    const resultId = rs.recordset?.[0]?.ResultId || null
    if (resultId) {
      for (const s of suggestedServices.slice(0, 4)) {
        await query(
          `INSERT INTO AISuggestions (ResultId, Type, RefId, Name, Description, Score)
           VALUES (@resultId, @type, @refId, @name, @description, @score)`,
          {
            resultId,
            type: 'service',
            refId: null,
            name: s.Name,
            description: s.Description || null,
            score: 0.8,
          }
        ).catch(() => {})
      }
      for (const p of suggestedProducts.slice(0, 4)) {
        await query(
          `INSERT INTO AISuggestions (ResultId, Type, RefId, Name, Description, Score)
           VALUES (@resultId, @type, @refId, @name, @description, @score)`,
          {
            resultId,
            type: 'product',
            refId: null,
            name: p.Name,
            description: null,
            score: 0.82,
          }
        ).catch(() => {})
      }
    }
  }

  return {
    ok: true,
    imageUrl: savedImages[0]?.imageUrl || null,
    imageUrls: savedImages.map((s) => s.imageUrl),
    analysis: aiPayload,
  }
}

async function generateAIResponse(prompt, userId = null, options = {}) {
  try {
    if (!GEMINI_KEY) return `AI (offline): ${prompt}`

    const sessionId = Number(options?.sessionId || 0) || null

    const intent = detectIntent(prompt)
    const parsedDateTime = parseNaturalDateTime(prompt)

    const [services, products, orderCatalogCtx, bookingCtx, settingsCtx, userBookingCtx, conversationCtx] = await Promise.all([
      // cache service/product/catalog/settings for short duration to reduce DB/AI calls
      simpleCache.getOrSet(`services:${normalizeForCompare(prompt).slice(0,60)}`, process.env.CACHE_TTL_SECONDS || 300, () => getServiceContext(prompt)),
      simpleCache.getOrSet(`products:${normalizeForCompare(prompt).slice(0,120)}`, process.env.CACHE_TTL_SECONDS || 300, () => getProductContext(prompt)),
      simpleCache.getOrSet(`orderCatalog:${normalizeForCompare(prompt).slice(0,120)}`, process.env.CACHE_TTL_SECONDS || 300, () => getOrderCatalogContext(prompt)),
      getBookingAvailabilityContext(parsedDateTime),
      simpleCache.getOrSet('salonSettings:v1', process.env.CACHE_TTL_SECONDS || 300, () => getSalonSettingsContext()),
      getUserBookingContext(userId),
      getSessionConversationContext(sessionId),
    ])

    const mentionedServices = findMentionedServices(prompt, services)
    const deterministicCatalogAnswer = getDeterministicCatalogAnswer(prompt, orderCatalogCtx)
    if (deterministicCatalogAnswer) return deterministicCatalogAnswer

    const deterministicPriceAnswer = getDeterministicProductOrServicePriceAnswer({
      prompt,
      products,
      orderCatalogCtx,
      services,
      mentionedServices,
    })
    if (deterministicPriceAnswer) return deterministicPriceAnswer

    const deterministicFollowupAnswer = getDeterministicFollowupAnswer({
      prompt,
      conversationCtx,
      products,
      orderCatalogCtx,
      services,
    })
    if (deterministicFollowupAnswer) return deterministicFollowupAnswer

    const autoAddToCartAnswer = await tryAutoAddProductToCart({
      prompt,
      userId,
      products,
      orderCatalogCtx,
    })
    if (autoAddToCartAnswer) return autoAddToCartAnswer

    // If user asks for free slots in a natural window (e.g., "sáng mai có khung giờ nào trống"),
    // compute detailed hourly availability from DB and return a deterministic reply.
    try {
      const window = detectWindowFromPrompt(prompt)
      const wantsWindowInfo = Boolean(window && /khung giờ|khung gio|mấy giờ|may gio|trống|trong|còn trống|có/.test(normalize(prompt)))
      if (intent === 'booking' && wantsWindowInfo) {
        // determine date: prefer parsedDateTime.date, otherwise use natural keywords (mai/ngày kia)
        let dateIso = parsedDateTime?.date || null
        if (!dateIso) {
          // look for 'mai' or 'ngày kia'
          const t = normalize(prompt)
          const now = new Date()
          if (t.includes('ngày kia') || t.includes('ngay kia')) {
            const dt = new Date(now); dt.setDate(dt.getDate() + 2); dateIso = toIsoDate(dt)
          } else if (t.includes('mai') || t.includes('tomorrow')) {
            const dt = new Date(now); dt.setDate(dt.getDate() + 1); dateIso = toIsoDate(dt)
          }
        }
        if (dateIso) {
          // detect whether the user mentioned a specific staff
          const maybeStaff = await findStaffByName(prompt)
          let avail
          if (maybeStaff) {
            avail = await getDetailedAvailabilityForDate(dateIso, window.start, window.end, maybeStaff.staffId)
            if (avail && avail.staffMissing) {
              return `Nhân viên ${maybeStaff.name} không có lịch làm vào ngày ${dateIso}.`
            }

            // format availability only for that staff
            if (avail && Array.isArray(avail.slots) && avail.slots.length) {
              const lines = [`Khung giờ cho ${maybeStaff.name} ngày ${avail.date}:`]
              let anyFree = false
              for (const s of avail.slots) {
                // available array lists staff names available in this slot
                const isFree = Array.isArray(s.available) && s.available.includes(maybeStaff.name)
                if (isFree) {
                  anyFree = true
                  lines.push(`${s.start}-${s.end}: Rảnh`)
                }
              }
              if (!anyFree) return `Nhân viên ${maybeStaff.name} không rảnh khung giờ nào trong khoảng ${window.start}h-${window.end}h ngày ${dateIso}.`
              return lines.join('\n')
            }
            // fallback
            return `Nhân viên ${maybeStaff.name} không có lịch làm rõ ràng cho ngày ${dateIso}.`
          }

          // no specific staff mentioned: return all staff availability
          avail = await getDetailedAvailabilityForDate(dateIso, window.start, window.end)
          if (avail && Array.isArray(avail.slots) && avail.slots.length) {
            const lines = [`Khung giờ trống cho ngày ${avail.date}:`]
            for (const s of avail.slots) {
              if (Array.isArray(s.available) && s.available.length) {
                lines.push(`${s.start}-${s.end}: Nhân viên rảnh: ${s.available.join(', ')}`)
              } else {
                lines.push(`${s.start}-${s.end}: Không có nhân viên rảnh`)
              }
            }
            return lines.join('\n')
          }
          // fallback to bookingCtx alternatives (times without staff mapping)
          if (bookingCtx && Array.isArray(bookingCtx.alternatives) && bookingCtx.alternatives.length) {
            return `Ngày ${dateIso} có các khung giờ trống (gợi ý): ${bookingCtx.alternatives.join(', ')}`
          }
          return `Mình chưa tìm thấy khung giờ trống rõ ràng cho ngày ${dateIso}. Bạn muốn mình liệt kê khung giờ theo giờ cụ thể (ví dụ: 9h đến 12h) không?`
        }
      }
    } catch (availErr) {
      // ignore and continue to AI generation
      console.warn('availability check failed', String(availErr?.message || availErr))
    }

    if (intent === 'booking' && shouldAutoCreateBooking(prompt) && userId && parsedDateTime && mentionedServices.length) {
      try {
        const booking = await customerCommerceService.createBooking(userId, {
          date: parsedDateTime.date,
          time: parsedDateTime.time,
          serviceItems: mentionedServices.slice(0, 2).map((s) => ({ serviceId: s.ServiceId, quantity: 1 })),
          notes: 'Booked via AI assistant',
        })
        return `Mình đã tạo lịch thành công cho bạn. Mã đặt lịch: ${booking?.BookingId || booking?.id || 'N/A'}. Thời gian: ${parsedDateTime.time} ngày ${parsedDateTime.date}.`
      } catch (bookErr) {
        return `Mình chưa thể tạo lịch tự động: ${String(bookErr?.message || 'thiếu dữ liệu đặt lịch')}. Bạn vui lòng chọn thêm chuyên viên hoặc xác nhận lại dịch vụ.`
      }
    }

    const fullPrompt = buildSystemPrompt({
      intent,
      userPrompt: prompt,
      services,
      products,
      orderCatalogCtx,
      bookingCtx,
      settingsCtx,
      userBookingCtx,
      conversationCtx,
    })

    const discoveredModels = await discoverAvailableModels()

    try {
      return await tryGeminiSdk(fullPrompt, discoveredModels)
    } catch (sdkErr) {
      try {
        return await tryGeminiHttp(fullPrompt, discoveredModels)
      } catch (httpErr) {
        // Graceful local fallback so chatbox can continue serving users even when AI endpoint is unavailable.
        const fallback = localFallbackResponse({
          intent,
          prompt,
          products,
          orderCatalogCtx,
          services,
          mentionedServices,
          bookingCtx,
          settingsCtx,
          parsedDateTime,
        })
        const discoveryInfo = discoveredModels?.debug ? `\nModel discovery: ${discoveredModels.debug}` : ''
        return `${fallback}\n\n(Lưu ý: AI bên ngoài tạm thời không sẵn sàng, hệ thống đang trả lời bằng dữ liệu nội bộ.)${discoveryInfo}`
      }
    }
  } catch (err) {
    // Friendly message for quota suspension
    if (err && (err.code === 'QUOTA_EXCEEDED' || (err.quota && err.quota.suspended))) {
      const q = err.quota || await aiClient.getQuota().catch(() => null)
      const period = q?.period || 'unknown'
      const count = q?.count ?? 'unknown'
      const limit = aiClient.FREE_LIMIT || 'unknown'
      return `AI tạm dừng vì đã đạt giới hạn miễn phí (${count}/${limit}) trong kỳ ${period}. Vui lòng nạp thêm hoặc thử lại kỳ sau.`
    }
    return `AI exception: ${String(err.message || err)}`
  }
}

module.exports = {
  createSession,
  listSessions,
  getMessages,
  postUserMessage,
  postUserImageMessage,
  generateAIResponse,
  renameSession,
  deleteSession,
}

// Export internal analyzer for local testing and diagnostics
module.exports.analyzeNailImageWithAI = analyzeNailImageWithAI
