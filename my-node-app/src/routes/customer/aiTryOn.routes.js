const express = require('express')
const controller = require('../../controllers/customer/aiTryOn.controller')

const router = express.Router()

const requireAuth = require('../../middleware/auth').requireAuth

router.get('/ai-tryon/services', requireAuth, controller.getTryOnServices)
router.post('/ai-tryon/analyze', requireAuth, controller.postAnalyzeHand)
router.post('/ai-tryon/preview', requireAuth, controller.postPreviewTryOn)
router.post('/ai-tryon/generate', requireAuth, controller.postGenerateTryOn)

module.exports = router