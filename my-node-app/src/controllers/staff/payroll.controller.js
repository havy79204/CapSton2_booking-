const { asyncHandler } = require('../../utils/asyncHandler')
const { query } = require('../../config/query')
const payrollService = require('../../services/staffPayroll.service')

async function resolveStaffId(req) {
    const userId = String(req.userId || req.user?.userId || req.user?.sub || '').trim()
    if (!userId) return ''

    const staffRes = await query('SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId })
    return String(staffRes.recordset?.[0]?.StaffId || '').trim()
}

const getPayrollOverview = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const data = await payrollService.getPayrollOverview(staffId)
    res.json({ ok: true, data })
})

const getPayrollDebug = asyncHandler(async (req, res) => {
    const staffId = await resolveStaffId(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const month = String(req.query.month || '').trim() // expected YYYY-MM
    if (!month) {
        res.status(400).json({ ok: false, error: 'Missing month (YYYY-MM)' })
        return
    }

    const data = await payrollService.getPayrollDebug(staffId, month)
    res.json({ ok: true, data })
})

module.exports = {
    getPayrollOverview,
    getPayrollDebug,
}