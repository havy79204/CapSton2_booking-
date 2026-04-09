const express = require('express')
const controller = require('../../controllers/owner/appointments.controller')

const router = express.Router()

// Test endpoints without auth for debugging
router.get('/appointments-test', controller.getAppointments)
router.post('/appointments-test', controller.postAppointment)

module.exports = router
