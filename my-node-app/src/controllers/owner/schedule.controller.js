const { asyncHandler } = require('../../utils/asyncHandler');
const scheduleService = require('../../services/schedule.service');
const { emitStaffDataUpdated } = require('../../realtime/socket');

const getSchedule = asyncHandler(async (req, res) => {
  // If caller requests all off-schedules, return them (for Pending Requests page)
  if (String(req.query.all || '').toLowerCase() === '1' || String(req.query.all || '').toLowerCase() === 'true') {
    const list = await scheduleService.getAllOffSchedules()
    // return in same shape as getSchedule -> data.pendingRequests
    res.json({ ok: true, data: { pendingRequests: list } })
    return
  }

  const data = await scheduleService.getSchedule(req.query.weekStart);
    // If schedule service returned no staffRows (unexpected), fallback to
    // loading active staff directly so the UI can render the Staff column.
    if ((!data || !Array.isArray(data.staffRows) || data.staffRows.length === 0)) {
      try {
        const { query } = require('../../config/query')
        const roleSqlParts = await scheduleService.getStaffRoleSqlParts?.() || { selectSql: "CAST('' AS NVARCHAR(255)) AS Role", joinSql: '' }
        const staffRes = await query(
          `SELECT s.StaffId, ${roleSqlParts.selectSql}, u.Name, u.AvatarUrl
           FROM Staff s
           LEFT JOIN Users u ON u.UserId = s.UserId
           ${roleSqlParts.joinSql}
           WHERE UPPER(LTRIM(RTRIM(ISNULL(s.Status, '')))) <> 'INACTIVE'
             AND UPPER(LTRIM(RTRIM(ISNULL(u.Status, '')))) <> 'INACTIVE'
           ORDER BY u.Name`,
          {}
        )

        const fallbackStaffRows = (staffRes.recordset || []).map((r) => ({
          staffId: r.StaffId,
          initial: (r.Name || '').trim().split(/\s+/).slice(-1)[0]?.[0]?.toUpperCase() || '',
          name: r.Name || '',
          role: r.Role || '',
          avatarUrl: r.AvatarUrl || '',
          shifts: {},
        }))

        data.staffRows = fallbackStaffRows
      } catch (err) {
        console.warn('Fallback load active staff failed:', err?.message || err)
      }
    }

    res.json({ ok: true, data });
});

const postShift = asyncHandler(async (req, res) => {
  const data = await scheduleService.addShift(req.body);
  emitStaffDataUpdated({ source: 'schedule', action: 'create', staffId: String(req.body?.staffId || ''), date: String(req.body?.date || '') });
  res.status(201).json({ ok: true, data });
});

const deleteShift = asyncHandler(async (req, res) => {
  const data = await scheduleService.deleteShift(req.body);
  emitStaffDataUpdated({ source: 'schedule', action: 'delete', staffId: String(req.body?.staffId || ''), date: String(req.body?.date || '') });
  res.json({ ok: true, data });
});

const approveShift = asyncHandler(async (req, res) => {
  const { offScheduleId, staffId, weekStartDate, dayIndex, date } = req.body || {}
  const data = await scheduleService.approveLeave({ offScheduleId, staffId, weekStartDate, dayIndex })
  emitStaffDataUpdated({ source: 'schedule', action: 'update', staffId: String(staffId || ''), date: String(date || '') })
  res.json({ ok: true, data })
})

const rejectShift = asyncHandler(async (req, res) => {
  const { offScheduleId, staffId, weekStartDate, dayIndex, date } = req.body || {}
  const data = await scheduleService.rejectLeave({ offScheduleId, staffId, weekStartDate, dayIndex })
  emitStaffDataUpdated({ source: 'schedule', action: 'delete', staffId: String(staffId || ''), date: String(date || '') })
  res.json({ ok: true, data })
})

module.exports = {
  getSchedule,
  postShift,
  deleteShift, 
  approveShift,
  rejectShift,
};