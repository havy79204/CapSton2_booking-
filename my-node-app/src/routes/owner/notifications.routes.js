const express = require('express')
const controller = require('../../controllers/owner/notifications.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/notifications', requireAuth, controller.getNotifications)
router.post('/notifications/read', requireAuth, controller.postMarkRead)

module.exports = router
