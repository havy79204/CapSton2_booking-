const express = require('express')
const controller = require('../../controllers/staff/notifications.controller')

const router = express.Router()

router.get('/notifications', controller.getNotifications)
router.post('/notifications/read', controller.postMarkRead)

module.exports = router
