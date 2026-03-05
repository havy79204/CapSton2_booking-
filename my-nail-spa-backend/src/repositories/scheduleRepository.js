const { query, newId } = require('../config/query')

async function getStaffAvailability(weekStartDate, staffId) {
  const r = await query('SELECT TOP 1 * FROM dbo.StaffAvailability WHERE WeekStartDate=@weekStartDate AND StaffId=@staffId', { weekStartDate, staffId })
  return r.recordset[0] || null
}

async function upsertStaffAvailability(weekStartDate, staffId, startHour, endHour, slotsJson) {
  await query(
    `MERGE dbo.StaffAvailability AS t
     USING (SELECT @weekStartDate AS WeekStartDate, @staffId AS StaffId) AS s
     ON t.WeekStartDate = s.WeekStartDate AND t.StaffId = s.StaffId
     WHEN MATCHED THEN
       UPDATE SET StartHour=@startHour, EndHour=@endHour, SlotsJson=@slotsJson, UpdatedAt=SYSUTCDATETIME()
     WHEN NOT MATCHED THEN
       INSERT(WeekStartDate, StaffId, StartHour, EndHour, SlotsJson, UpdatedAt)
       VALUES(@weekStartDate, @staffId, @startHour, @endHour, @slotsJson, SYSUTCDATETIME());`,
    { weekStartDate, staffId, startHour, endHour, slotsJson },
  )
}

async function deleteStaffShiftsForWeek(weekStartDate) {
  await query('DELETE FROM dbo.StaffShifts WHERE WeekStartDate=@weekStartDate', { weekStartDate })
}

async function insertStaffShift({ id = null, weekStartDate, salonId, staffId, staffName, dayIndex, startHour, durationHours, note }) {
  const shiftId = id || newId()
  await query(
    `INSERT INTO dbo.StaffShifts(ShiftId, WeekStartDate, SalonId, StaffId, StaffName, DayIndex, StartHour, DurationHours, Note, CreatedAt)
     VALUES(@id, @weekStartDate, @salonId, @staffId, @staffName, @dayIndex, @startHour, @durationHours, @note, SYSUTCDATETIME())`,
    {
      id: shiftId,
      weekStartDate,
      salonId,
      staffId,
      staffName: staffName || null,
      dayIndex,
      startHour,
      durationHours,
      note: note || null,
    },
  )
  const r = await query('SELECT TOP 1 * FROM dbo.StaffShifts WHERE ShiftId=@id', { id: shiftId })
  return r.recordset[0] || null
}

async function getActiveStaffBySalon(salonId) {
  const r = await query("SELECT UserId, Name FROM dbo.Users WHERE SalonId=@salonId AND RoleKey=N'staff' AND (Status IS NULL OR Status <> N'disabled')", { salonId })
  return r.recordset
}

async function getShiftsBySalonWeek(weekStartDate, salonId) {
  const r = await query(
    `SELECT StaffId, DayIndex, StartHour, DurationHours
     FROM dbo.StaffShifts
     WHERE SalonId=@salonId
       AND (WeekStartDate=@weekStartDate OR WeekStartDate=DATEADD(DAY, -1, @weekStartDate))`,
    { weekStartDate, salonId },
  )
  return r.recordset
}

async function getShiftById(id) {
  const r = await query('SELECT TOP 1 * FROM dbo.StaffShifts WHERE ShiftId=@id', { id })
  return r.recordset[0] || null
}

async function updateStaffShift(id, { staffName = null, note = null }) {
  await query('UPDATE dbo.StaffShifts SET StaffName=COALESCE(@staffName, StaffName), Note=COALESCE(@note, Note) WHERE ShiftId=@id', { id, staffName, note })
  return getShiftById(id)
}

async function deleteShift(id) {
  await query('DELETE FROM dbo.StaffShifts WHERE ShiftId=@id', { id })
}

module.exports = {
  getStaffAvailability,
  upsertStaffAvailability,
  deleteStaffShiftsForWeek,
  insertStaffShift,
  getActiveStaffBySalon,
  getShiftsBySalonWeek,
  getShiftById,
  updateStaffShift,
  deleteShift,
}
