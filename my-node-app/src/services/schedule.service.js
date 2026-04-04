const { query } = require('../config/query')
const { mondayOf, buildWeekColumns, buildWeekRangeLabel, toIsoDate } = require('../utils/date')
const { toDateLabel } = require('../utils/format')

function initialsOf(name) {
  const n = String(name || '').trim()
  if (!n) return ''
  const parts = n.split(/\s+/g).filter(Boolean)
  if (!parts.length) return ''
  return String(parts[parts.length - 1][0] || '').toUpperCase()
}

function formatHourValue(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'number' && Number.isFinite(value)) {
    const hour = Math.trunc(value)
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, '0')}:00`
    return ''
  }

  const raw = String(value).trim()
  if (!raw) return ''

  if (/^\d{1,2}$/.test(raw)) {
    const hour = Number(raw)
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      return `${String(Math.trunc(hour)).padStart(2, '0')}:00`
    }
  }

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`

  const dt = new Date(raw)
  if (!Number.isNaN(dt.getTime())) {
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  }

  return raw
}
function parseHourToInt(value) {
  const raw = String(value || '').trim().toUpperCase();
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = Number(m[2] || '0');
  const ampm = m[3];

  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  if (hour < 0 || hour > 23) return null;
  return minute >= 30 ? hour + 1 : hour;
}

async function tableExists(tableName) {
  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = @tableName`,
      { tableName }
    )
    return Boolean(res.recordset?.length)
  } catch (err) {
    console.warn(`tableExists check failed for ${tableName}:`, err.message)
    return false
  }
}

async function columnExists(tableName, columnName) {
  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @tableName
         AND COLUMN_NAME = @columnName`,
      { tableName, columnName }
    )
    return Boolean(res.recordset?.length)
  } catch (err) {
    console.warn(`columnExists check failed for ${tableName}.${columnName}:`, err.message)
    return false
  }
}

let _staffRoleSqlPartsCache = null

async function getStaffRoleSqlParts() {
  // Return cached result if available (schema doesn't change at runtime)
  if (_staffRoleSqlPartsCache) {
    return _staffRoleSqlPartsCache
  }

  try {
    const hasStaffSkills = await tableExists('StaffSkills')
    if (!hasStaffSkills) {
      _staffRoleSqlPartsCache = {
        selectSql: `CAST('' AS NVARCHAR(255)) AS Role`,
        joinSql: '',
      }
      return _staffRoleSqlPartsCache
    }

    const hasCategoryId = await columnExists('StaffSkills', 'CategoryId')
    if (!hasCategoryId) {
      _staffRoleSqlPartsCache = {
        selectSql: `CAST('' AS NVARCHAR(255)) AS Role`,
        joinSql: '',
      }
      return _staffRoleSqlPartsCache
    }

    const hasServiceCategories = await tableExists('ServiceCategories')
    if (hasServiceCategories) {
      const hasCategoryName = await columnExists('ServiceCategories', 'CategoryName')
      const hasName = await columnExists('ServiceCategories', 'Name')
      const categoryNameColumn = hasCategoryName ? 'CategoryName' : (hasName ? 'Name' : null)

      if (categoryNameColumn) {
        _staffRoleSqlPartsCache = {
          selectSql: `ISNULL(sp.Role, '') AS Role`,
          joinSql: `
            OUTER APPLY (
              SELECT STUFF((
                SELECT ', ' + COALESCE(sc.${categoryNameColumn}, CONVERT(NVARCHAR(100), ssx.CategoryId))
                FROM StaffSkills ssx
                LEFT JOIN ServiceCategories sc ON sc.CategoryId = ssx.CategoryId
                WHERE ssx.StaffId = s.StaffId
                FOR XML PATH(''), TYPE
              ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Role
            ) sp`,
        }
        return _staffRoleSqlPartsCache
      }
    }

    _staffRoleSqlPartsCache = {
      selectSql: `ISNULL(sp.Role, '') AS Role`,
      joinSql: `
        OUTER APPLY (
          SELECT STUFF((
            SELECT ', ' + CONVERT(NVARCHAR(100), ssx.CategoryId)
            FROM StaffSkills ssx
            WHERE ssx.StaffId = s.StaffId
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Role
        ) sp`,
    }
    return _staffRoleSqlPartsCache
  } catch (err) {
    console.error('Error in getStaffRoleSqlParts:', err.message)
    // Return safe default if something goes wrong
    _staffRoleSqlPartsCache = {
      selectSql: `CAST('' AS NVARCHAR(255)) AS Role`,
      joinSql: '',
    }
    return _staffRoleSqlPartsCache
  }
}

async function getSchedule(weekStartQuery, options = {}) {
  const { staffId } = options || {}
  const base = weekStartQuery ? new Date(weekStartQuery) : new Date()
  const weekStart = mondayOf(base)
  if (!weekStart) {
    const err = new Error('Invalid weekStart')
    err.status = 400
    throw err
  }

  const weekStartIso = toIsoDate(weekStart)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndIso = toIsoDate(weekEnd)
  const columns = buildWeekColumns(weekStart)

  const roleSql = await getStaffRoleSqlParts()
  const staffFilter = staffId ? 'WHERE s.StaffId = @staffId' : ''
  const staffRes = await query(
    `SELECT s.StaffId, ${roleSql.selectSql}, u.Name, u.AvatarUrl
     FROM Staff s
     LEFT JOIN Users u ON u.UserId = s.UserId
     ${roleSql.joinSql}
     ${staffFilter}
     ORDER BY u.Name`,
    staffId ? { staffId } : {}
  )

  const staffList = (staffRes.recordset || []).map((r) => ({
    staffId: r.StaffId,
    name: r.Name || '',
    role: r.Role || '',
    avatarUrl: r.AvatarUrl || '',
  }))

  const availFilter = staffId ? 'AND StaffId = @staffId' : ''
  const availRes = await query(
    `SELECT StaffId, WeekStartDate, StartHour, EndHour
     FROM StaffAvailability
     WHERE WeekStartDate >= @weekStart
       AND WeekStartDate <= @weekEnd
       ${availFilter}`,
    { 
      weekStart: weekStartIso, 
      weekEnd: weekEndIso,
      ...(staffId ? { staffId } : {})
    }
  )

  const availMap = new Map()
  for (const row of availRes.recordset || []) {
    const staffId = row.StaffId
    if (!staffId) continue

    const dateValue = row.WeekStartDate ? new Date(row.WeekStartDate) : null
    if (!dateValue || Number.isNaN(dateValue.getTime())) continue
    const dateLabel = toDateLabel(dateValue)

    const startHour = formatHourValue(row.StartHour)
    const endHour = formatHourValue(row.EndHour)
    if (!startHour || !endHour) continue

    const label = `${startHour} - ${endHour}`
    if (!availMap.has(staffId)) availMap.set(staffId, {})
    const staffShifts = availMap.get(staffId)
    if (!Array.isArray(staffShifts[dateLabel])) staffShifts[dateLabel] = []
    staffShifts[dateLabel].push(label)
  }

  const staffRows = staffList.map((s) => {
    const shifts = availMap.get(s.staffId) || {}

    // make sure every key is formatted like dd/MM
    const normalized = {}
    for (const [k, v] of Object.entries(shifts || {})) {
      normalized[String(k)] = Array.isArray(v) ? v : []
    }

    return {
      staffId: s.staffId,
      initial: initialsOf(s.name),
      name: s.name,
      role: s.role,
      avatarUrl: s.avatarUrl,
      shifts: normalized,
    }
  })

  return {
    weekRange: buildWeekRangeLabel(weekStart),
    columns,
    staffRows,
  }
}

async function addShift(payload) {
  const { staffId, date, oldDate, start, end, oldLabel } = payload || {}
  if (!staffId || !date || !start || !end) {
    const err = new Error('Missing staffId/date/start/end')
    err.status = 400
    throw err
  }

  const shiftDate = new Date(date)
  if (Number.isNaN(shiftDate.getTime())) {
    const err = new Error('Invalid date')
    err.status = 400
    throw err
  }

  const shiftDateIso = toIsoDate(shiftDate)
  const dateLabel = toDateLabel(shiftDate)

  const startHourInt = parseHourToInt(start)
  const endHourInt = parseHourToInt(end)
  if (startHourInt === null || endHourInt === null) {
    const err = new Error('Invalid time format')
    err.status = 400
    throw err
  }

  if (startHourInt >= endHourInt) {
    const err = new Error('Start time must be earlier than end time')
    err.status = 400
    throw err
  }

  const isEditing = Boolean(String(oldLabel || '').trim())
  let oldShiftDateIso = shiftDateIso
  let oldStartHourInt = null
  let oldEndHourInt = null

  if (isEditing) {
    const oldLabelParts = String(oldLabel).split('-').map((part) => part.trim())
    if (oldLabelParts.length < 2) {
      const err = new Error('Invalid oldLabel format')
      err.status = 400
      throw err
    }

    oldStartHourInt = parseHourToInt(oldLabelParts[0])
    oldEndHourInt = parseHourToInt(oldLabelParts[1])
    if (oldStartHourInt === null || oldEndHourInt === null) {
      const err = new Error('Invalid oldLabel time format')
      err.status = 400
      throw err
    }

    if (oldDate) {
      const parsedOldDate = new Date(oldDate)
      if (Number.isNaN(parsedOldDate.getTime())) {
        const err = new Error('Invalid oldDate')
        err.status = 400
        throw err
      }
      oldShiftDateIso = toIsoDate(parsedOldDate)
    }

    const unchangedShift =
      oldShiftDateIso === shiftDateIso &&
      oldStartHourInt === startHourInt &&
      oldEndHourInt === endHourInt

    if (unchangedShift) {
      return { staffId, date: dateLabel }
    }
  }

  const duplicate = await query(
    `SELECT TOP 1 1 AS ok
     FROM StaffAvailability
     WHERE WeekStartDate = @shiftDate
       AND StaffId = @staffId
       AND StartHour = @startHour
       AND EndHour = @endHour
       AND NOT (
         @isEditing = 1
         AND WeekStartDate = @oldShiftDate
         AND StartHour = @oldStartHour
         AND EndHour = @oldEndHour
       )`,
    {
      shiftDate: shiftDateIso,
      staffId,
      startHour: startHourInt,
      endHour: endHourInt,
      isEditing: isEditing ? 1 : 0,
      oldShiftDate: oldShiftDateIso,
      oldStartHour: oldStartHourInt,
      oldEndHour: oldEndHourInt,
    }
  )

  if (duplicate.recordset?.length) {
    const err = new Error('This shift already exists')
    err.status = 409
    throw err
  }

  const overlap = await query(
    `SELECT TOP 1 StartHour, EndHour
     FROM StaffAvailability
     WHERE WeekStartDate = @shiftDate
       AND StaffId = @staffId
       AND NOT (EndHour <= @startHour OR StartHour >= @endHour)
       AND NOT (
         @isEditing = 1
         AND WeekStartDate = @oldShiftDate
         AND StartHour = @oldStartHour
         AND EndHour = @oldEndHour
       )`,
    {
      shiftDate: shiftDateIso,
      staffId,
      startHour: startHourInt,
      endHour: endHourInt,
      isEditing: isEditing ? 1 : 0,
      oldShiftDate: oldShiftDateIso,
      oldStartHour: oldStartHourInt,
      oldEndHour: oldEndHourInt,
    }
  )

  if (overlap.recordset?.length) {
    const existed = overlap.recordset[0]
    const isExactDuplicate =
      Number(existed.StartHour) === Number(startHourInt) &&
      Number(existed.EndHour) === Number(endHourInt)

    const err = new Error(
      isExactDuplicate
        ? 'This shift already exists'
        : 'This shift overlaps with an existing shift'
    )
    err.status = 409
    throw err
  }

  if (isEditing) {
    await query(
      `DELETE FROM StaffAvailability
       WHERE StaffId = @staffId
         AND WeekStartDate = @oldShiftDate
         AND StartHour = @oldStartHour
         AND EndHour = @oldEndHour`,
      {
        staffId,
        oldShiftDate: oldShiftDateIso,
        oldStartHour: oldStartHourInt,
        oldEndHour: oldEndHourInt,
      }
    )
  }

  await query(
    `INSERT INTO StaffAvailability (WeekStartDate, StaffId, StartHour, EndHour, UpdatedAt)
     VALUES (@shiftDate, @staffId, @startHour, @endHour, GETDATE())`,
    {
      shiftDate: shiftDateIso,
      staffId,
      startHour: startHourInt,
      endHour: endHourInt,
    }
  )

  return { staffId, date: dateLabel }
}

async function deleteShift(payload) {
  const { staffId, date, label } = payload || {};

  if (!staffId || !date || !label) {
    const err = new Error('Missing data (staffId, date, or label)');
    err.status = 400;
    throw err;
  }
  const parts = label.split('-').map(t => t.trim());
  if (parts.length < 2) {
    const err = new Error('Invalid label format');
    err.status = 400;
    throw err;
  }

  const startHourInt = parseHourToInt(parts[0]);
  const endHourInt = parseHourToInt(parts[1]);
  if (startHourInt === null || endHourInt === null) {
    const err = new Error('Invalid time format');
    err.status = 400;
    throw err;
  }

  const shiftDate = new Date(date);
  if (isNaN(shiftDate.getTime())) {
    const err = new Error('Invalid date');
    err.status = 400;
    throw err;
  }
  const shiftDateIso = toIsoDate(shiftDate);

  await query(
    `DELETE FROM StaffAvailability 
     WHERE StaffId = @staffId 
     AND WeekStartDate = @shiftDate 
     AND StartHour = @startHour 
     AND EndHour = @endHour`,
    {
      staffId,
      shiftDate: shiftDateIso,
      startHour: startHourInt,
      endHour: endHourInt
    }
  );

  return { success: true };
}

module.exports = {
  getSchedule,
  addShift,
  deleteShift
};