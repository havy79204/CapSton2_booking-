const crypto = require('crypto')

let fetchFn
try {
    fetchFn = global.fetch || require('node-fetch')
    if (fetchFn && fetchFn.default) fetchFn = fetchFn.default
} catch {
    fetchFn = global.fetch
}

const fetch = fetchFn

function stripDataUrlPrefix(imageDataUrl = '') {
    return String(imageDataUrl || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
}

function resolveProvider() {
    return String(process.env.CONTROLNET_PROVIDER || process.env.STABLE_DIFFUSION_PROVIDER || 'automatic1111').trim().toLowerCase()
}

function resolveEndpoint() {
    return String(
        process.env.CONTROLNET_API_URL ||
        process.env.STABLE_DIFFUSION_API_URL ||
        ''
    ).trim()
}

function ensureHttpEndpoint(endpoint) {
    if (!endpoint) {
        const err = new Error('Missing CONTROLNET_API_URL (or STABLE_DIFFUSION_API_URL)')
        err.statusCode = 503
        throw err
    }
    return endpoint.replace(/\/+$/, '')
}

function defaultControlnetUnit(imageBase64) {
    return {
        enabled: true,
        input_image: imageBase64,
        module: String(process.env.CONTROLNET_MODULE || 'none'),
        model: String(process.env.CONTROLNET_MODEL || 'control_v11p_sd15_inpaint [ebff9138]'),
        weight: Number(process.env.CONTROLNET_WEIGHT || 1),
        resize_mode: 'Crop and Resize',
        lowvram: false,
        processor_res: Number(process.env.CONTROLNET_PROCESSOR_RES || 512),
        threshold_a: Number(process.env.CONTROLNET_THRESHOLD_A || 64),
        threshold_b: Number(process.env.CONTROLNET_THRESHOLD_B || 64),
        guidance_start: Number(process.env.CONTROLNET_GUIDANCE_START || 0),
        guidance_end: Number(process.env.CONTROLNET_GUIDANCE_END || 1),
        control_mode: Number(process.env.CONTROLNET_CONTROL_MODE || 0),
        pixel_perfect: true,
    }
}

function buildAutomatic1111Payload({ imageDataUrl, prompt, negativePrompt, overlayPlan }) {
    const imageBase64 = stripDataUrlPrefix(imageDataUrl)

    return {
        init_images: [imageBase64],
        prompt,
        negative_prompt: negativePrompt,
        sampler_name: String(process.env.CONTROLNET_SAMPLER || 'DPM++ 2M Karras'),
        steps: Number(process.env.CONTROLNET_STEPS || 28),
        cfg_scale: Number(process.env.CONTROLNET_CFG_SCALE || 7),
        denoising_strength: Number(process.env.CONTROLNET_DENOISE || 0.58),
        width: Number(process.env.CONTROLNET_WIDTH || 768),
        height: Number(process.env.CONTROLNET_HEIGHT || 1024),
        restore_faces: false,
        alwayson_scripts: {
            controlnet: {
                args: [{
                    ...defaultControlnetUnit(imageBase64),
                    extra_nail_overlay_plan: {
                        overlays: overlayPlan ?.overlays || [],
                        frameHint: overlayPlan ?.frameHint || {},
                    },
                }, ],
            },
        },
    }
}

async function generateWithAutomatic1111({ endpoint, imageDataUrl, templateImageDataUrl, prompt, negativePrompt, overlayPlan, selectedService }) {
    const base = ensureHttpEndpoint(endpoint)
    const isFullPath = /\/sdapi\/v1\/img2img$/i.test(base)
    const url = isFullPath ? base : `${base}/sdapi/v1/img2img`

    const payload = buildAutomatic1111Payload({ imageDataUrl, prompt, negativePrompt, overlayPlan })
    const templateImageBase64 = stripDataUrlPrefix(templateImageDataUrl || '')
    if (templateImageBase64) {
        payload.style_reference_image = templateImageBase64
    }
    if (selectedService && typeof selectedService === 'object') {
        payload.extra_generation_params = {
            ...(payload.extra_generation_params || {}),
            selected_service: {
                id: selectedService.id || selectedService.serviceId || selectedService.ServiceId || null,
                name: selectedService.name || selectedService.Name || null,
            },
        }
    }
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Automatic1111 HTTP ${response.status}: ${text.slice(0, 220)}`)
    }

    const body = await response.json().catch(() => null)
    const img = body ?.images ?.[0]
    if (!img) return null

    return {
        provider: 'controlnet-automatic1111',
        payload,
        imageDataUrl: `data:image/png;base64,${img}`,
        meta: {
            info: body ?.info || null,
            parameters: body ?.parameters || null,
        },
    }
}

function injectTemplateVariables(obj, vars) {
    const text = JSON.stringify(obj)
    const out = text
        .replace(/__INPUT_IMAGE_BASE64__/g, String(vars.inputImageBase64 || ''))
        .replace(/__TEMPLATE_IMAGE_BASE64__/g, String(vars.templateImageBase64 || ''))
        .replace(/__PROMPT__/g, String(vars.prompt || ''))
        .replace(/__NEGATIVE_PROMPT__/g, String(vars.negativePrompt || ''))
    return JSON.parse(out)
}

function readComfyWorkflowTemplate() {
    const raw = String(process.env.CONTROLNET_COMFY_WORKFLOW_JSON || '').trim()
    if (!raw) {
        const err = new Error('Missing CONTROLNET_COMFY_WORKFLOW_JSON for ComfyUI provider')
        err.statusCode = 503
        throw err
    }

    try {
        return JSON.parse(raw)
    } catch {
        const err = new Error('CONTROLNET_COMFY_WORKFLOW_JSON is invalid JSON')
        err.statusCode = 500
        throw err
    }
}

async function fetchComfyOutputImage(base, imageMeta) {
    const query = new URLSearchParams({
        filename: String(imageMeta.filename || ''),
        subfolder: String(imageMeta.subfolder || ''),
        type: String(imageMeta.type || 'output'),
    })
    const viewUrl = `${base}/view?${query.toString()}`
    const r = await fetch(viewUrl)
    if (!r.ok) return null
    const buffer = Buffer.from(await r.arrayBuffer())
    return `data:image/png;base64,${buffer.toString('base64')}`
}

async function generateWithComfyUI({ endpoint, imageDataUrl, templateImageDataUrl, prompt, negativePrompt }) {
    const base = ensureHttpEndpoint(endpoint)
    const template = readComfyWorkflowTemplate()
    const inputImageBase64 = stripDataUrlPrefix(imageDataUrl)
    const templateImageBase64 = stripDataUrlPrefix(templateImageDataUrl || '')

    const promptGraph = injectTemplateVariables(template, {
        inputImageBase64,
        prompt,
        negativePrompt,
        templateImageBase64,
    })

    const clientId = crypto.randomUUID()
    const startRes = await fetch(`${base}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptGraph, client_id: clientId }),
    })

    if (!startRes.ok) {
        const text = await startRes.text().catch(() => '')
        throw new Error(`ComfyUI HTTP ${startRes.status}: ${text.slice(0, 220)}`)
    }

    const startBody = await startRes.json().catch(() => null)
    const promptId = startBody ?.prompt_id
    if (!promptId) {
        throw new Error('ComfyUI response missing prompt_id')
    }

    const timeoutMs = Number(process.env.CONTROLNET_COMFY_TIMEOUT_MS || 90000)
    const pollIntervalMs = Number(process.env.CONTROLNET_COMFY_POLL_MS || 1800)
    const startAt = Date.now()

    while (Date.now() - startAt < timeoutMs) {
        const histRes = await fetch(`${base}/history/${encodeURIComponent(promptId)}`)
        if (histRes.ok) {
            const histBody = await histRes.json().catch(() => null)
            const item = histBody ?.[promptId]
            const outputs = item ?.outputs || {}
            const nodeValues = Object.values(outputs)

            for (const node of nodeValues) {
                if (!node || typeof node !== 'object') continue
                const firstImg = Array.isArray(node.images) ? node.images[0] : null
                if (firstImg ?.filename) {
                    const imageDataUrl = await fetchComfyOutputImage(base, firstImg)
                    if (imageDataUrl) {
                        return {
                            provider: 'controlnet-comfyui',
                            payload: { prompt: promptGraph, client_id: clientId },
                            imageDataUrl,
                            meta: { promptId },
                        }
                    }
                }
            }
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error('ComfyUI generation timeout')
}

async function generateWithControlNet(params = {}) {
    if (!fetch) return null

    const endpoint = resolveEndpoint()
    if (!endpoint) return null

    const provider = resolveProvider()
    if (provider === 'comfyui') {
        return generateWithComfyUI({ endpoint, ...params })
    }

    return generateWithAutomatic1111({ endpoint, ...params })
}

module.exports = {
    generateWithControlNet,
}
