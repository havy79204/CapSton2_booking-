const express = require('express')
const controller = require('../controllers/availabilityController')

const availabilityRoutes = express.Router()

// Public endpoint - no auth required for checking availability
availabilityRoutes.get('/timeslots', controller.getTimeSlotAvailability)

module.exports = { availabilityRoutes }
