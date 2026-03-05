const { z } = require('zod')
const bookingService = require('../services/bookingService')

async function listBookings(req, res, next) {
  try {
    const filters = {
      salonId: req.query.salonId ? String(req.query.salonId) : null,
      dateISO: req.query.dateISO ? String(req.query.dateISO) : null,
      customerName: req.query.customerName ? String(req.query.customerName).trim() : null,
      customerPhone: req.query.customerPhone ? String(req.query.customerPhone).trim() : null,
    }
    const items = await bookingService.listBookings(filters)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function createBooking(req, res, next) {
  try {
    const booking = await bookingService.createBookingRecord(req.body, { user: req.user, leadMinutes: 60 })
    res.status(201).json({ item: booking })
  } catch (err) {
    next(err)
  }
}

async function updateStatus(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const body = z.object({ status: z.string().min(1) }).parse(req.body)
    const nextStatus = String(body.status || '').trim()
    const result = await bookingService.updateBookingStatus(id, nextStatus)
    if (result && result.error && result.status) return res.status(result.status).json({ error: result.error })
    res.json({ item: result })
  } catch (err) {
    next(err)
  }
}

async function deleteBooking(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'Booking ID is required' })
    const item = await bookingService.cancelBooking(id)
    res.json({ message: 'Booking cancelled successfully', item })
  } catch (err) {
    next(err)
  }
}

module.exports = { listBookings, createBooking, updateStatus, deleteBooking }
