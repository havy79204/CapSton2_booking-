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

    // Read working schedule from StaffAvailability and leave requests from StaffShifts
    const data = await scheduleService.getStaffScheduleFromShifts({ staffId, weekStartQuery: weekStart })

    res.json({ ok: true, data })
})

const postShift = asyncHandler(async(req, res) => {
    const userId = req.user?.userId || req.user?.sub
    const { date, note, shiftType } = req.body || {}

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
    const data = await scheduleService.requestStaffLeave({ staffId, date, note, shiftType })
    emitStaffDataUpdated({ source: 'schedule', action: 'create', staffId: String(staffId || ''), date: String(date || '') })

    res.status(201).json({ ok: true, data })
})

const deleteShift = asyncHandler(async(req, res) => {
    const userId = req.user?.userId || req.user?.sub
    const { date, label } = req.body || {}

    if (!userId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    if (!date || !label) {
        res.status(400).json({ ok: false, error: 'Missing date or label' })
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

    // Staff chỉ được xóa shift của chính họ - kiểm tra qua staffId
    const data = await scheduleService.deleteShift({ staffId, date, label })
    emitStaffDataUpdated({ source: 'schedule', action: 'delete', staffId: String(staffId || ''), date: String(date || '') })
    res.json({ ok: true, data })
})

module.exports = {
    getSchedule,
    postShift,
    deleteShift,
}