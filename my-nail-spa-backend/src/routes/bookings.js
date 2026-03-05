const express = require('express')
const bookingsController = require('../controllers/bookingsController')
const bookingService = require('../services/bookingService')

const bookingsRoutes = express.Router()
const { validate } = require('../middleware/validate')
const { z } = require('zod')

bookingsRoutes.get('/', bookingsController.listBookings)
bookingsRoutes.post('/', bookingsController.createBooking)
bookingsRoutes.patch('/:id/status', validate(z.object({ status: z.string().min(1) })), bookingsController.updateStatus)
bookingsRoutes.delete('/:id', bookingsController.deleteBooking)

module.exports = { bookingsRoutes, createBookingRecord: bookingService.createBookingRecord }
