const express = require('express')
const controller = require('../../controllers/customer/aiChat.controller')

const router = express.Router()

// requireAuth middleware exists elsewhere and is used in other customer routes
const requireAuth = require('../../middleware/auth').requireAuth

router.get('/ai-chat/sessions', requireAuth, controller.listSessions)
router.post('/ai-chat/sessions', requireAuth, controller.createSession)
router.put('/ai-chat/sessions/:sessionId', requireAuth, controller.renameSession)
router.delete('/ai-chat/sessions/:sessionId', requireAuth, controller.deleteSession)

router.get('/ai-chat/sessions/:sessionId/messages', requireAuth, controller.getMessages)
router.post('/ai-chat/sessions/:sessionId/messages', requireAuth, controller.postMessage)
router.post('/ai-chat/sessions/:sessionId/messages/image', requireAuth, controller.postImageMessage)

module.exports = router
