const express = require('express')
const controller = require('../../controllers/customer/chat.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/chat/messages', requireAuth, controller.getMessages)
router.post('/chat/messages', requireAuth, controller.postMessage)

module.exports = router
