const express = require('express')
const controller = require('../../controllers/staff/appointments.controller')

const router = express.Router()

router.get('/appointments', controller.getAppointments)
router.get('/appointments/meta', controller.getAppointmentMeta)
router.get('/appointments/:id', controller.getAppointmentById)
router.post('/appointments', controller.postAppointment)
router.put('/appointments/:id', controller.putAppointment)
router.delete('/appointments/:id', controller.deleteAppointment)

module.exports = router