const { asyncHandler } = require('../../utils/asyncHandler')
const { query } = require('../../config/query')
const appointmentsService = require('../../services/appointments.service')
const { emitStaffDataUpdated } = require('../../realtime/socket')

async function resolveStaffId(req) {
    const userId = String(req.userId || req.user ?.userId || req.user ?.sub || '').trim()
    if (!userId) return ''

    const staffResult = await query('SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId })
    return String(staffResult.recordset ?.[0] ?.StaffId || '').trim()
}

const getAppointments = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const data = await appointmentsService.listAppointments({ staffId })
    res.json({ ok: true, data })
})

const getAppointmentMeta = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const data = await appointmentsService.listAppointmentMeta({ staffId })
    res.json({ ok: true, data })
})

const postAppointment = asyncHandler(async(req, res) => {
    const ownStaffId = await resolveStaffId(req)
    if (!ownStaffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const body = req.body || {}
    const normalizedServiceIds = Array.isArray(body.serviceIds) ?
        body.serviceIds :
        (body.serviceId ? [body.serviceId] : [])

    const normalizedPayload = {
        ...body,
        serviceIds: normalizedServiceIds,
        staffId: body.staffId || ownStaffId,
    }

    if (!normalizedPayload.customerUserId || normalizedServiceIds.length === 0 || !normalizedPayload.date || !normalizedPayload.time) {
        res.status(400).json({ ok: false, error: 'Missing customerUserId/serviceIds/date/time' })
        return
    }

    // Staff can only create appointments for themselves.
    if (String(normalizedPayload.staffId) !== String(ownStaffId)) {
        res.status(403).json({ ok: false, error: 'Forbidden' })
        return
    }

    const data = await appointmentsService.createAppointment(normalizedPayload)
    emitStaffDataUpdated({ source: 'appointments', action: 'create', staffId: String(normalizedPayload.staffId || '') })
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

    const payload = {...req.body, staffId }
    const data = await appointmentsService.updateAppointment(id, payload)
    emitStaffDataUpdated({ source: 'appointments', action: 'update', staffId: String(staffId || ''), appointmentId: String(id) })
    res.json({ ok: true, data })
})

const deleteAppointment = asyncHandler(async(req, res) => {
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

    const existing = await appointmentsService.getAppointmentById(id)
    if (!existing) {
        res.status(404).json({ ok: false, error: 'Appointment not found' })
        return
    }

    if (String(existing.staffId || '') !== String(staffId)) {
        res.status(403).json({ ok: false, error: 'Forbidden' })
        return
    }

    const data = await appointmentsService.cancelAppointment(id)
    emitStaffDataUpdated({ source: 'appointments', action: 'delete', staffId: String(staffId || ''), appointmentId: String(id) })
    res.json({ ok: true, data })
})

module.exports = {
    getAppointments,
    getAppointmentMeta,
    getAppointmentById,
    postAppointment,
    putAppointment,
    deleteAppointment,
}