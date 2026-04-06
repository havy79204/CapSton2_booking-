const { asyncHandler } = require('../../utils/asyncHandler')
const aiTryOnService = require('../../services/aiTryOn.service')

const getTryOnServices = asyncHandler(async(req, res) => {
    const limit = Math.min(Math.max(Number(req.query ?.limit || 24), 1), 60)
    const data = await aiTryOnService.listTryOnServices({ limit })
    res.json({ ok: true, data })
})

const getTryOnTemplates = asyncHandler(async(req, res) => {
    const limit = Math.min(Math.max(Number(req.query ?.limit || 200), 1), 1000)
    const data = await aiTryOnService.listTryOnTemplates({ limit })
    res.json({ ok: true, data })
})

const postAnalyzeHand = asyncHandler(async(req, res) => {
    const { imageDataUrl, handHint } = req.body || {}
    const data = await aiTryOnService.analyzeHandAndNails({ imageDataUrl, handHint })
    res.json({ ok: true, data })
})

const postPreviewTryOn = asyncHandler(async(req, res) => {
    const { imageDataUrl, handHint, design } = req.body || {}
    const data = await aiTryOnService.createTryOnPreview({ imageDataUrl, handHint, design })
    res.json({ ok: true, data })
})

const postGenerateTryOn = asyncHandler(async(req, res) => {
    const { imageDataUrl, handHint, design, userPrompt, selectedService, templateImageDataUrl, templateImageUrl, analysis, overlayPlan } = req.body || {}
    const data = await aiTryOnService.generateNailTryOnImage({
        imageDataUrl,
        handHint,
        design,
        userPrompt,
        selectedService,
        templateImageDataUrl,
        templateImageUrl,
        analysis,
        overlayPlan,
    })
    res.json({ ok: true, data })
})

module.exports = {
    getTryOnServices,
    postAnalyzeHand,
    postPreviewTryOn,
    postGenerateTryOn,
    getTryOnTemplates,
}
