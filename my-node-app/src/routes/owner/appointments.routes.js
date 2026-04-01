const express = require('express')
const controller = require('../../controllers/owner/appointments.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/appointments', requireAuth, controller.getAppointments)
router.get('/appointments/:id', requireAuth, controller.getAppointmentById)
router.post('/appointments', requireAuth, controller.postAppointment)
router.put('/appointments/:id', requireAuth, controller.putAppointment)
router.delete('/appointments/:id', requireAuth, controller.deleteAppointment)

module.exports = router
