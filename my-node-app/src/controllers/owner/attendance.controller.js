const { asyncHandler } = require('../../utils/asyncHandler')
const attendanceService = require('../../services/attendance.service')

const getAttendanceReport = asyncHandler(async (req, res) => {
  const days = Number(req.query.days || 30)
  const startDate = String(req.query.startDate || '').trim() || null
  const endDate = String(req.query.endDate || '').trim() || null
  const data = await attendanceService.getAttendanceReport(days, startDate, endDate)
  res.json({ ok: true, data })
})

const getAttendanceStaffDetail = asyncHandler(async (req, res) => {
  const staffId = String(req.params.staffId || '').trim()
  const days = Number(req.query.days || 30)
  const startDate = String(req.query.startDate || '').trim() || null
  const endDate = String(req.query.endDate || '').trim() || null
  const data = await attendanceService.getAttendanceStaffDetail(staffId, days, startDate, endDate)
  res.json({ ok: true, data })
})

module.exports = { getAttendanceReport, getAttendanceStaffDetail }
