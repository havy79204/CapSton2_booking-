const express = require('express')
const { z } = require('zod')

const { authRequired } = require('../middleware/auth')
const controller = require('../controllers/notificationsController')
const svc = require('../services/notificationsService')
const { validate } = require('../middleware/validate')

const notificationsRoutes = express.Router()

notificationsRoutes.use(authRequired)

notificationsRoutes.get('/settings', controller.getSettings)
notificationsRoutes.put('/settings', validate(z.object({ enableNotifications: z.boolean(), enableEmail: z.boolean() })), controller.putSettings)
notificationsRoutes.get('/', controller.listNotifications)
notificationsRoutes.patch('/read', validate(z.object({ ids: z.array(z.string()).min(1) })), controller.patchMarkRead)

// Export thin router and provide compatibility shims for older callers
module.exports = {
	notificationsRoutes,
	sendNotificationNow: svc.createNotification,
	scheduleNotification: svc.createNotification,
	getUserSettings: svc.getSettings,
}
