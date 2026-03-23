const express = require('express')

const controller = require('../../controllers/owner/chat.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/chat/threads', requireAuth, controller.getThreads)
router.get('/chat/threads/:threadId/messages', requireAuth, controller.getMessages)
router.post('/chat/threads/:threadId/messages', requireAuth, controller.postMessage)

module.exports = router
