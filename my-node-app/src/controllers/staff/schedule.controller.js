const { asyncHandler } = require('../../utils/asyncHandler')
const scheduleService = require('../../services/schedule.service')
const { emitStaffDataUpdated } = require('../../realtime/socket')

// Staff schedule controller - chỉ xem và quản lý lịch của chính họ

const getSchedule = asyncHandler(async(req, res) => {
    const userId = req.user?.userId || req.user?.sub
    if (!userId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const { weekStart } = req.query || {}

    // Map userId sang staffId
    const { query } = require('../../config/query')
    const staffResult = await query(
        'SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId }
    )
    const staffId = staffResult.recordset?.[0]?.StaffId

    if (!staffId) {
        res.status(404).json({ ok: false, error: 'Staff not found' })
        return
    }

    // Staff mobile screen expects an array of 7 day rows:
    // [{ date, shifts, available }].
    const data = await scheduleService.getStaffScheduleFromShifts({ staffId, weekStartQuery: weekStart })

    res.json({ ok: true, data })
})

const postShift = asyncHandler(async(req, res) => {
    const userId = req.user?.userId || req.user?.sub
    const { date, note, shiftType, isRecurring, endDate } = req.body || {}

    if (!userId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    if (!date) {
        res.status(400).json({ ok: false, error: 'Missing date' })
        return
    }

    // Map userId sang staffId
    const { query } = require('../../config/query')
    const staffResult = await query(
        'SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId }
    )
    const staffId = staffResult.recordset?.[0]?.StaffId

    if (!staffId) {
        res.status(404).json({ ok: false, error: 'Staff not found' })
        return
    }

    // Register leave request in StaffShifts
    const data = await scheduleService.requestStaffLeave({ staffId, date, note, shiftType, isRecurring, endDate })
    emitStaffDataUpdated({ source: 'schedule', action: 'create', staffId: String(staffId || ''), date: String(date || '') })

    res.status(201).json({ ok: true, data })
})

const deleteShift = asyncHandler(async(req, res) => {
    const userId = req.user?.userId || req.user?.sub
    const { date, label, offScheduleId, shiftType } = req.body || {}

    if (!userId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    if (!offScheduleId && !date) {
        res.status(400).json({ ok: false, error: 'Missing offScheduleId or date' })
        return
    }

    // Map userId sang staffId
    const { query } = require('../../config/query')
    const staffResult = await query(
        'SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId }
    )
    const staffId = staffResult.recordset?.[0]?.StaffId

    if (!staffId) {
        res.status(404).json({ ok: false, error: 'Staff not found' })
        return
    }

    // If offScheduleId (or leave payload) is provided, delete only pending leave request.
    let data
    if (offScheduleId || shiftType) {
        data = await scheduleService.deleteStaffLeaveRequest({ staffId, offScheduleId, date, shiftType })
    } else {
        // Backward-compatible path: delete assigned availability shift by date+label
        if (!label) {
            res.status(400).json({ ok: false, error: 'Missing label' })
            return
        }
        data = await scheduleService.deleteShift({ staffId, date, label })
    }
    emitStaffDataUpdated({ source: 'schedule', action: 'delete', staffId: String(staffId || ''), date: String(date || '') })
    res.json({ ok: true, data })
})

module.exports = {
    getSchedule,
    postShift,
    deleteShift,
}