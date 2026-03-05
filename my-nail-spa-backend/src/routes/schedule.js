const express = require('express')
const { z } = require('zod')
const { authRequired, requireRole } = require('../middleware/auth')
const controller = require('../controllers/scheduleController')
const { validate } = require('../middleware/validate')

const scheduleRoutes = express.Router()

scheduleRoutes.get('/availability', authRequired, requireRole('admin', 'owner', 'staff'), controller.getAvailability)

scheduleRoutes.post('/auto-generate', authRequired, requireRole('admin', 'owner'), validate(z.object({ weekStartISO: z.string().optional(), requiredPerSlot: z.number().int().min(1).max(10).optional() })), controller.autoGenerate)

scheduleRoutes.put('/availability', authRequired, requireRole('admin', 'owner', 'staff'), validate(z.object({ weekStartISO: z.string().min(10), staffId: z.string().min(1), startHour: z.number().int().min(0).max(23).default(9), endHour: z.number().int().min(1).max(24).default(23), slots: z.array(z.boolean()) })), controller.putAvailability)

scheduleRoutes.get('/public/availability', controller.publicAvailability)

scheduleRoutes.get('/shifts', authRequired, requireRole('admin', 'owner', 'staff'), controller.listShifts)
scheduleRoutes.post('/shifts', authRequired, requireRole('admin', 'owner'), controller.postShift)
scheduleRoutes.patch('/shifts/:id', authRequired, requireRole('admin', 'owner'), controller.patchShift)
scheduleRoutes.delete('/shifts/:id', authRequired, requireRole('admin', 'owner'), controller.deleteShift)

module.exports = { scheduleRoutes }
