const express = require('express')
const controller = require('../../controllers/customer/notifications.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/notifications', requireAuth, controller.getNotifications)
router.post('/notifications/read', requireAuth, controller.postMarkRead)
router.post('/notifications/:id/read', requireAuth, controller.postMarkOneRead)

module.exports = router
