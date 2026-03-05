const express = require('express')
const { z } = require('zod')
const { authRequired, requireRole } = require('../middleware/auth')
const controller = require('../controllers/timeController')
const { validate } = require('../middleware/validate')

const timeRoutes = express.Router()

timeRoutes.get('/logs', authRequired, requireRole('admin', 'staff'), controller.getLogs)
timeRoutes.post('/logs', authRequired, requireRole('admin', 'staff'), validate(z.object({ staffId: z.string().optional(), type: z.enum(['in', 'out']), at: z.string().optional(), note: z.string().optional() })), controller.postLog)

timeRoutes.get('/tips', authRequired, requireRole('admin', 'staff'), controller.getTips)
timeRoutes.post('/tips', authRequired, requireRole('admin', 'staff'), validate(z.object({ staffId: z.string().optional(), amount: z.number().positive(), at: z.string().optional() })), controller.postTip)

module.exports = { timeRoutes }
