const { asyncHandler } = require('../../utils/asyncHandler')
const { query } = require('../../config/query')
const appointmentsService = require('../../services/appointments.service')
const { emitStaffDataUpdated } = require('../../realtime/socket')

async function resolveStaffId(req) {
    const userId = String(req.userId || req.user?.userId || req.user?.sub || '').trim()
    if (!userId) return ''

    const staffResult = await query('SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId })
    return String(staffResult.recordset?.[0]?.StaffId || '').trim()
}

function normalizeLifecycleStatus(rawStatus) {
    const value = String(rawStatus || '').trim().toLowerCase()
    if (!value) return ''
    if (value === 'c' || value === 'pending' || value === 'awaiting') return 'pending'
    if (value === 'confirm' || value === 'confirmed') return 'confirmed'
    if (value === 'booked' || value === 'booker') return 'booked'
    if (value === 'completed' || value === 'complete' || value === 'done') return 'completed'
    if (value === 'cancelled' || value === 'canceled' || value === 'cancel' || value === 'canceller') return 'cancelled'
    return value
}

function canStaffTransitionAppointmentStatus(currentStatus, nextStatus) {
    const rules = {
        pending: ['confirmed'],
        confirmed: ['booked', 'cancelled'],
        booked: ['completed'],
        completed: [],
        cancelled: [],
    }
    return (rules[currentStatus] || []).includes(nextStatus)
}

function toDateAndTime(existing) {
    const date = String(existing?.date || '').trim()
    const time = String(existing?.time || '').trim()
    if (date && time) return { date, time }

    const bookingTime = existing?.bookingTime ? new Date(existing.bookingTime) : null
    if (bookingTime && !Number.isNaN(bookingTime.getTime())) {
        const yyyy = bookingTime.getFullYear()
        const mm = String(bookingTime.getMonth() + 1).padStart(2, '0')
        const dd = String(bookingTime.getDate()).padStart(2, '0')
        const hh = String(bookingTime.getHours()).padStart(2, '0')
        const min = String(bookingTime.getMinutes()).padStart(2, '0')
        return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` }
    }

    return { date: '', time: '' }
}

const getAppointments = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const data = await appointmentsService.listAppointments({
        staffId,
        month: req.query?.month,
    })
    res.json({ ok: true, data })
})

const getAppointmentMeta = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const data = await appointmentsService.listAppointmentMeta({
        staffId,
        customerQuery: req.query?.customer,
        serviceQuery: req.query?.service,
    })
    res.json({ ok: true, data })
})

const searchAppointmentCustomers = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const q = String(req.query?.q || '').trim()
    const data = await appointmentsService.searchCustomersFromBookings({ staffId, q })
    res.json({ ok: true, data })
})

const postAppointment = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({ ok: false, error: 'Missing payload' })
        return
    }

    const payload = {
        ...req.body,
        staffId,
    }

    const data = await appointmentsService.createAppointment(payload)
    emitStaffDataUpdated({ source: 'appointments', action: 'create', staffId: String(staffId || ''), appointmentId: String(data?.id || '') })
    res.status(201).json({ ok: true, data })
})

const getAppointmentById = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const { id } = req.params || {}
    if (!id) {
        res.status(400).json({ ok: false, error: 'Missing id' })
        return
    }

    const data = await appointmentsService.getAppointmentById(id)
    if (!data) {
        res.status(404).json({ ok: false, error: 'Appointment not found' })
        return
    }

    if (String(data.staffId || '') !== String(staffId)) {
        res.status(403).json({ ok: false, error: 'Forbidden' })
        return
    }

    res.json({ ok: true, data })
})

const putAppointment = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const { id } = req.params || {}
    if (!id) {
        res.status(400).json({ ok: false, error: 'Missing id' })
        return
    }

    if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({ ok: false, error: 'No data to update' })
        return
    }

    const existing = await appointmentsService.getAppointmentById(id)
    if (!existing) {
        res.status(404).json({ ok: false, error: 'Appointment not found' })
        return
    }

    if (String(existing.staffId || '') !== String(staffId)) {
        res.status(403).json({ ok: false, error: 'Forbidden' })
        return
    }

    // Allow staff to update full appointment fields (date/time/notes/status/services)
    // Construct payload: use provided values from req.body, fallback to existing values
    const dateTime = toDateAndTime(existing)
    const payload = {
        ...req.body,
        staffId,
        customerUserId: existing.customerUserId,
        date: req.body.date || dateTime.date,
        time: req.body.time || dateTime.time,
        notes: (req.body.notes !== undefined) ? req.body.notes : (existing.note || ''),
    }

    // Normalize status transition: block invalid transitions
    const currentStatus = normalizeLifecycleStatus(existing.status)
    const nextStatus = normalizeLifecycleStatus(payload.status)
    if (payload.status && !canStaffTransitionAppointmentStatus(currentStatus, nextStatus)) {
        res.status(403).json({ ok: false, error: `Invalid transition: ${currentStatus} -> ${nextStatus}` })
        return
    }

    const data = await appointmentsService.updateAppointment(id, payload)
    emitStaffDataUpdated({ source: 'appointments', action: 'update', staffId: String(staffId || ''), appointmentId: String(id) })
    res.json({ ok: true, data })
})

const deleteAppointment = asyncHandler(async(req, res) => {
    res.status(403).json({ ok: false, error: 'Staff cannot delete appointments' })
})

module.exports = {
    getAppointments,
    getAppointmentMeta,
    searchAppointmentCustomers,
    getAppointmentById,
    postAppointment,
    putAppointment,
    deleteAppointment,
}