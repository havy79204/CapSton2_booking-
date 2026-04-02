const express = require('express')
const controller = require('../../controllers/staff/chat.controller')

const router = express.Router()

router.get('/chat/threads', controller.getThreads)
router.get('/chat/threads/:threadId/messages', controller.getMessages)
router.post('/chat/messages', controller.postMessage)

module.exports = router
