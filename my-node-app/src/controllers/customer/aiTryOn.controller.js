const { asyncHandler } = require('../../utils/asyncHandler')
const aiTryOnService = require('../../services/aiTryOn.service')
const { sanitizeCustomerResponse } = require('./responseSanitizer')

const getTryOnServices = asyncHandler(async(req, res) => {
    const limit = Math.min(Math.max(Number(req.query ?.limit || 24), 1), 60)
    const data = await aiTryOnService.listTryOnServices({ limit })
    res.json({ data: sanitizeCustomerResponse(data) })
})

const getTryOnTemplates = asyncHandler(async(req, res) => {
    const limit = Math.min(Math.max(Number(req.query ?.limit || 200), 1), 1000)
    const data = await aiTryOnService.listTryOnTemplates({ limit })
    res.json({ data: sanitizeCustomerResponse(data) })
})

const postAnalyzeHand = asyncHandler(async(req, res) => {
    const { imageDataUrl, handHint } = req.body || {}
    const data = await aiTryOnService.analyzeHandAndNails({ imageDataUrl, handHint })
    res.json({ data: sanitizeCustomerResponse(data) })
})

const postPreviewTryOn = asyncHandler(async(req, res) => {
    const { imageDataUrl, handHint, design } = req.body || {}
    const data = await aiTryOnService.createTryOnPreview({ imageDataUrl, handHint, design })
    res.json({ data: sanitizeCustomerResponse(data) })
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
    res.json({ data: sanitizeCustomerResponse(data) })
})

const getTryOnHistory = asyncHandler(async (req, res) => {
    const userId = req.user?.UserId || req.user?.userId || null
    const limit = Math.min(Math.max(Number(req.query?.limit || 50), 1), 200)
    const offset = Math.max(0, Number(req.query?.offset || 0))
    const data = await aiTryOnService.listTryOnHistory({ userId, limit, offset })
    res.json({ data: sanitizeCustomerResponse(data) })
})

const getTryOnById = asyncHandler(async (req, res) => {
    const id = String(req.params?.id || '')
    if (!id) return res.status(400).json({ message: 'Missing id' })
    const data = await aiTryOnService.getTryOnRecordById({ id })
    res.json({ data: sanitizeCustomerResponse(data) })
})

const deleteTryOnById = asyncHandler(async (req, res) => {
    const id = String(req.params?.id || '')
    if (!id) return res.status(400).json({ message: 'Missing id' })
    const userId = req.user?.UserId || req.user?.userId || null
    await aiTryOnService.deleteTryOnRecord({ id, userId })
    res.json({ data: { success: true } })
})

module.exports = {
    getTryOnServices,
    postAnalyzeHand,
    postPreviewTryOn,
    postGenerateTryOn,
    getTryOnTemplates,
    getTryOnHistory,
    getTryOnById,
    deleteTryOnById,
}
