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
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!m) return null

  const hour = Number(m[1])
  const minute = Number(m[2] || '0')
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null

  // Store by hour granularity in StartHour/EndHour int columns.
  return minute >= 30 ? hour + 1 : hour
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

async function getStaffRoleSqlParts() {
  try {
    const hasStaffSkills = await tableExists('StaffSkills')
    if (!hasStaffSkills) {
      return {
        selectSql: `CAST('' AS NVARCHAR(255)) AS Role`,
        joinSql: '',
      }
    }

    const hasCategoryId = await columnExists('StaffSkills', 'CategoryId')
    if (!hasCategoryId) {
      return {
        selectSql: `CAST('' AS NVARCHAR(255)) AS Role`,
        joinSql: '',
      }
    }

    const hasServiceCategories = await tableExists('ServiceCategories')
    if (hasServiceCategories) {
      const hasCategoryName = await columnExists('ServiceCategories', 'CategoryName')
      const hasName = await columnExists('ServiceCategories', 'Name')
      const categoryNameColumn = hasCategoryName ? 'CategoryName' : (hasName ? 'Name' : null)

      if (categoryNameColumn) {
        return {
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
      }
    }

    return {
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
  } catch (err) {
    console.error('Error in getStaffRoleSqlParts:', err.message)
    // Return safe default if something goes wrong
    return {
      selectSql: `CAST('' AS NVARCHAR(255)) AS Role`,
      joinSql: '',
    }
  }
}

async function getSchedule(weekStartQuery) {
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
  const staffRes = await query(
    `SELECT s.StaffId, ${roleSql.selectSql}, u.Name, u.AvatarUrl
     FROM Staff s
     LEFT JOIN Users u ON u.UserId = s.UserId
     ${roleSql.joinSql}
     ORDER BY u.Name`
  )

  const staffList = (staffRes.recordset || []).map((r) => ({
    staffId: r.StaffId,
    name: r.Name || '',
    role: r.Role || '',
    avatarUrl: r.AvatarUrl || '',
  }))

  const availRes = await query(
    `SELECT StaffId, WeekStartDate, StartHour, EndHour
     FROM StaffAvailability
     WHERE WeekStartDate >= @weekStart
       AND WeekStartDate <= @weekEnd`,
    { weekStart: weekStartIso, weekEnd: weekEndIso }
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
  const { staffId, date, start, end } = payload || {}
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

  const duplicate = await query(
    `SELECT TOP 1 1 AS ok
     FROM StaffAvailability
     WHERE WeekStartDate = @shiftDate
       AND StaffId = @staffId
       AND StartHour = @startHour
       AND EndHour = @endHour`,
    {
      shiftDate: shiftDateIso,
      staffId,
      startHour: startHourInt,
      endHour: endHourInt,
    }
  )

  if (!duplicate.recordset?.length) {
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
  }

  return { staffId, date: dateLabel }
}

module.exports = {
  getSchedule,
  addShift,
}
