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
    res.status(403).json({ ok: false, error: 'Staff cannot create appointments' })
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

    const keys = Object.keys(req.body || {})
    const onlyStatus = keys.length === 1 && keys[0] === 'status'
    if (!onlyStatus) {
        res.status(403).json({ ok: false, error: 'Staff can only update appointment status' })
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

    const currentStatus = String(existing.status || '').trim().toLowerCase()
    const nextStatusRaw = String(req.body?.status || '').trim().toLowerCase()
    const isCurrentConfirmed = currentStatus === 'booked' || currentStatus === 'confirmed'
    const isNextCompleted = nextStatusRaw === 'completed' || nextStatusRaw === 'complete' || nextStatusRaw === 'done'
    if (!isCurrentConfirmed || !isNextCompleted) {
        res.status(403).json({ ok: false, error: 'Staff can only mark confirmed appointments as completed' })
        return
    }

    const payload = { status: req.body.status, staffId }
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
    getAppointmentById,
    postAppointment,
    putAppointment,
    deleteAppointment,
}