const { query, newId } = require('../config/query')
const { notifyCustomerEvent } = require('./notifications.service')
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
        // Use UTC getters to avoid local timezone shifts when SQL TIME values
        // are returned as Date objects with UTC time (driver behavior).
        return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`
    }

    return raw
}

function formatShiftEndDisplay(value) {
    const normalized = formatHourValue(value)
    const m = String(normalized || '').match(/^(\d{2}):(\d{2})$/)
    if (!m) return normalized

    const hh = Number(m[1])
    const mm = Number(m[2])
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return normalized

    if (mm === 30) {
        const nextHour = (hh + 1) % 24
        return `${String(nextHour).padStart(2, '0')}:00`
    }

    return normalized
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

function shiftTypeFromStartHour(hourValue) {
    const h = Number(hourValue)
    if (!Number.isFinite(h)) return 'full'
    if (h <= 11) return 'morning'
    if (h <= 16) return 'afternoon'
    return 'evening'
}

function stripOverlappedWorkingShifts(dayList, leaveType) {
    const lt = String(leaveType || 'full').toLowerCase()
    if (!Array.isArray(dayList) || !dayList.length) return []
    if (lt === 'full') return dayList.filter((item) => typeof item !== 'string' ? String(item?.type || '').toLowerCase() !== 'assigned' : false)

    return dayList.filter((item) => {
        const isAssignedObject = typeof item === 'object' && String(item?.type || '').toLowerCase() === 'assigned'
        const isAssignedString = typeof item === 'string'
        if (!isAssignedObject && !isAssignedString) return true

        const raw = isAssignedObject ? String(item?.time || '') : String(item)
        const startToken = raw.split('-')[0]?.trim()
        const startHour = parseHourToInt(startToken)
        const st = shiftTypeFromStartHour(startHour)
        return st !== lt
    })
}

async function tableExists(tableName) {
    try {
        const res = await query(
            `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = @tableName`, { tableName }
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
         AND COLUMN_NAME = @columnName`, { tableName, columnName }
        )
        return Boolean(res.recordset?.length)
    } catch (err) {
        console.warn(`columnExists check failed for ${tableName}.${columnName}:`, err.message)
        return false
    }
}

async function columnType(tableName, columnName) {
    try {
        const res = await query(
            `SELECT DATA_TYPE AS dtype
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @tableName
         AND COLUMN_NAME = @columnName`, { tableName, columnName }
        )
        const dtype = res.recordset?.[0]?.dtype
        return dtype ? String(dtype).toLowerCase() : null
    } catch (err) {
        console.warn(`columnType check failed for ${tableName}.${columnName}:`, err.message)
        return null
    }
}

const _identityColumnCache = new Map()

async function isIdentityColumn(tableName, columnName) {
    const key = `${String(tableName || '').toLowerCase()}.${String(columnName || '').toLowerCase()}`
    if (_identityColumnCache.has(key)) return _identityColumnCache.get(key)
    try {
        const res = await query(
            `SELECT COLUMNPROPERTY(OBJECT_ID(@tableName), @columnName, 'IsIdentity') AS IsIdentity`,
            { tableName, columnName }
        )
        const value = Number(res.recordset?.[0]?.IsIdentity || 0) === 1
        _identityColumnCache.set(key, value)
        return value
    } catch (err) {
        console.warn(`isIdentityColumn check failed for ${tableName}.${columnName}:`, err.message)
        _identityColumnCache.set(key, false)
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
        const staffFilter = staffId ? 'WHERE CAST(s.StaffId AS NVARCHAR(100)) = @staffId' : ''
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
    const [availRes, offRes] = await Promise.all([
        query(
        `SELECT AvailabilityId, StaffId, WeekStartDate, StartHour, EndHour
     FROM StaffAvailability
     WHERE WeekStartDate >= @weekStart
       AND WeekStartDate <= @weekEnd
       ${availFilter}`, {
            weekStart: weekStartIso,
            weekEnd: weekEndIso,
            ...(staffId ? { staffId } : {})
        }
    ),
        query(
            `SELECT StaffId, DayIndex, StartHour, IsRecurring, StartDate, EndDate, Note, Status
             FROM StaffOffSchedules
             WHERE CAST(StartDate AS date) <= @weekEnd
               AND CAST(ISNULL(EndDate, StartDate) AS date) >= @weekStart
                             ${staffId ? 'AND CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))' : ''}`,
            {
                weekStart: weekStartIso,
                weekEnd: weekEndIso,
                ...(staffId ? { staffId } : {}),
            },
        ).catch(() => ({ recordset: [] })),
    ])

    const availMap = new Map()
    for (const row of availRes.recordset || []) {
        const staffIdKey = String(row.StaffId || '').trim()
        if (!staffIdKey) continue

        const dateValue = row.WeekStartDate ? new Date(row.WeekStartDate) : null
        if (!dateValue || Number.isNaN(dateValue.getTime())) continue
        const dateLabel = toDateLabel(dateValue)

        const startHour = formatHourValue(row.StartHour)
        const endHour = formatShiftEndDisplay(row.EndHour)
        if (!startHour || !endHour) continue

        const label = `${startHour} - ${endHour}`
        if (!availMap.has(staffIdKey)) availMap.set(staffIdKey, {})
        const staffShifts = availMap.get(staffIdKey)
        if (!Array.isArray(staffShifts[dateLabel])) staffShifts[dateLabel] = []
        staffShifts[dateLabel].push({ Label: label, AvailabilityId: row.AvailabilityId, StartHour: row.StartHour, EndHour: row.EndHour })
    }

    for (const row of offRes.recordset || []) {
        const sid = String(row.StaffId || '').trim()
        if (!sid) continue

        const status = String(row.Status || 'Pending').trim().toLowerCase()
        if (status !== 'approved') continue

        const startDate = new Date(row.StartDate)
        if (Number.isNaN(startDate.getTime())) continue
        const endDateRaw = row.EndDate ? new Date(row.EndDate) : null
        const endDate = endDateRaw && !Number.isNaN(endDateRaw.getTime()) ? endDateRaw : startDate
        const startDateIso = toIsoDate(startDate)
        const endDateIso = toIsoDate(endDate)
        if (!startDateIso || !endDateIso) continue

        const rowDayIndexRaw = Number(row.DayIndex)
        const rowDayIndex = Number.isFinite(rowDayIndexRaw)
            ? (rowDayIndexRaw >= 1 && rowDayIndexRaw <= 7 ? rowDayIndexRaw - 1 : rowDayIndexRaw)
            : null
        const isRecurring = Number(row.IsRecurring || 0) === 1

        const rawStartHour = String(row.StartHour || '').trim()
        const startHourNum = parseHourToInt(rawStartHour)
        const note = String(row.Note || '').trim()
        const leaveTypeMatch = note.match(/LEAVE_REQUEST\[(morning|afternoon|evening|full)\]/i)
        const leaveType = leaveTypeMatch
            ? String(leaveTypeMatch[1]).toLowerCase()
            : (startHourNum === 8 ? 'morning' : startHourNum === 13 ? 'afternoon' : startHourNum === 16 ? 'evening' : 'full')
        const shiftLabel = leaveType === 'morning'
            ? 'Morning'
            : leaveType === 'afternoon'
                ? 'Afternoon'
                : leaveType === 'evening'
                    ? 'Evening'
                    : 'Full Day'

        const includeDate = (dateObj) => {
            const iso = toIsoDate(dateObj)
            if (!iso) return
            if (iso < weekStartIso || iso > weekEndIso) return
            if (iso < startDateIso || iso > endDateIso) return

            const dateLabel = toDateLabel(dateObj)
            if (!availMap.has(sid)) availMap.set(sid, {})
            const staffShifts = availMap.get(sid)
            if (status !== 'pending') {
                staffShifts[dateLabel] = stripOverlappedWorkingShifts(staffShifts[dateLabel] || [], leaveType)
            }
            if (!Array.isArray(staffShifts[dateLabel])) staffShifts[dateLabel] = []
            staffShifts[dateLabel].push({
                Label: shiftLabel,
                Status: status === 'pending' ? 'Pending' : 'Approved',
                Note: note.replace(/^LEAVE_REQUEST(\[(morning|afternoon|evening|full)\])?\s*:?\s*/i, '') || note,
            })
        }

        if (isRecurring && rowDayIndex !== null) {
            // Always include recurrence day in current week
            const occ = new Date(weekStart)
            occ.setDate(occ.getDate() + rowDayIndex)
            includeDate(occ)

            // Also include explicit range boundaries when they fall inside this week.
            // This fixes missing first/last week boundary dates.
            includeDate(startDate)
            includeDate(endDate)
        } else {
            includeDate(startDate)
        }
    }

    const staffRows = staffList.map((s) => {
        const shifts = availMap.get(String(s.staffId || '').trim()) || {}

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

    // determine whether DB columns store time as TIME type; bind time strings if so
    const startHourColType = await columnType('StaffAvailability', 'StartHour')
    const endHourColType = await columnType('StaffAvailability', 'EndHour')
    const startParam = (startHourColType && startHourColType.startsWith('time')) ? `${String(startHourInt).padStart(2, '0')}:00:00` : startHourInt
    const endParam = (endHourColType && endHourColType.startsWith('time')) ? `${String(endHourInt).padStart(2, '0')}:00:00` : endHourInt

    if (startHourInt >= endHourInt) {
        const err = new Error('Start time must be earlier than end time')
        err.status = 400
        throw err
    }

    const approvedLeaves = await query(
        `SELECT OffScheduleId, StartHour, Note, DayIndex, IsRecurring, StartDate, EndDate
         FROM StaffOffSchedules
         WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
           AND CAST(StartDate AS date) <= @shiftDate
           AND CAST(ISNULL(EndDate, StartDate) AS date) >= @shiftDate
           AND UPPER(LTRIM(RTRIM(ISNULL(Status, '')))) = 'APPROVED'`,
        { staffId, shiftDate: shiftDateIso }
    )

    const shiftDayIndexOneBased = normalizeDayIndexOneBased((shiftDate.getDay() + 6) % 7)

    for (const leave of approvedLeaves.recordset || []) {
        const leaveStartIso = toIsoDate(new Date(leave?.StartDate))
        const leaveEndIso = toIsoDate(new Date(leave?.EndDate || leave?.StartDate))
        if (!leaveStartIso || !leaveEndIso) continue
        if (shiftDateIso < leaveStartIso || shiftDateIso > leaveEndIso) continue

        const isRecurringLeave = Number(leave?.IsRecurring || 0) === 1
        if (isRecurringLeave) {
            const leaveDayIndex = normalizeDayIndexOneBased(leave?.DayIndex)
            if (!leaveDayIndex || !shiftDayIndexOneBased || leaveDayIndex !== shiftDayIndexOneBased) {
                continue
            }
        }

        const note = String(leave?.Note || '')
        const leaveTypeMatch = note.match(/LEAVE_REQUEST\[(morning|afternoon|evening|full)\]/i)
        const leaveTypeFromNote = leaveTypeMatch ? String(leaveTypeMatch[1]).toLowerCase() : ''
        const leaveStartFromRow = parseHourToInt(leave?.StartHour)
        const leaveType = leaveTypeFromNote || shiftTypeFromStartHour(leaveStartFromRow)
        const leaveShift = resolveLeaveShift(leaveType)

        if (leaveShift.shiftType === 'full') {
            const err = new Error('Cannot add shift because this day has an approved leave')
            err.status = 409
            throw err
        }

        const leaveStart = Number(leaveShift.startHour || 0)
        const leaveEnd = leaveStart + Number(leaveShift.durationHours || 0)
        const isOverlap = !(endHourInt <= leaveStart || startHourInt >= leaveEnd)
        if (isOverlap) {
            const err = new Error('Cannot add shift because it overlaps an approved leave period')
            err.status = 409
            throw err
        }
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
       )`, {
            shiftDate: shiftDateIso,
            staffId,
            startHour: startParam,
            endHour: endParam,
            isEditing: isEditing ? 1 : 0,
            oldShiftDate: oldShiftDateIso,
            oldStartHour: oldStartHourInt !== null && startHourColType && startHourColType.startsWith('time') ? `${String(oldStartHourInt).padStart(2,'0')}:00:00` : oldStartHourInt,
            oldEndHour: oldEndHourInt !== null && endHourColType && endHourColType.startsWith('time') ? `${String(oldEndHourInt).padStart(2,'0')}:00:00` : oldEndHourInt,
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
       )`, {
            shiftDate: shiftDateIso,
            staffId,
            startHour: startParam,
            endHour: endParam,
            isEditing: isEditing ? 1 : 0,
            oldShiftDate: oldShiftDateIso,
            oldStartHour: oldStartHourInt !== null && startHourColType && startHourColType.startsWith('time') ? `${String(oldStartHourInt).padStart(2,'0')}:00:00` : oldStartHourInt,
            oldEndHour: oldEndHourInt !== null && endHourColType && endHourColType.startsWith('time') ? `${String(oldEndHourInt).padStart(2,'0')}:00:00` : oldEndHourInt,
        }
    )

    if (overlap.recordset?.length) {
        const existed = overlap.recordset[0]
        const isExactDuplicate =
            Number(existed.StartHour) === Number(startHourInt) &&
            Number(existed.EndHour) === Number(endHourInt)

        const err = new Error(
            isExactDuplicate ?
            'This shift already exists' :
            'This shift overlaps with an existing shift'
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
         AND EndHour = @oldEndHour`, {
                staffId,
                oldShiftDate: oldShiftDateIso,
                oldStartHour: oldStartHourInt,
                oldEndHour: oldEndHourInt,
            }
        )
    }

    await query(
        `INSERT INTO StaffAvailability (WeekStartDate, StaffId, StartHour, EndHour, UpdatedAt)
     VALUES (@shiftDate, @staffId, @startHour, @endHour, GETDATE())`, {
            shiftDate: shiftDateIso,
            staffId,
            startHour: startParam,
            endHour: endParam,
        }
    )

    return { staffId, date: dateLabel }
}

async function deleteShift(payload) {
    const { staffId, date, label, availabilityId } = payload || {};

    // If AvailabilityId is provided prefer to delete by the PK (unambiguous)
    if (availabilityId) {
        // Delete by AvailabilityId only — don't require staffId to match (caller may pass different id)
        const res = await query(
            `DELETE FROM StaffAvailability
         WHERE AvailabilityId = @availabilityId`,
            { availabilityId }
        )
        const deleted = (res.rowsAffected && res.rowsAffected[0]) || 0
        if (!deleted) {
            const err = new Error('Shift not found or already deleted')
            err.status = 404
            throw err
        }
        return { deleted }
    }

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

    // Determine column storage types so we send matching parameter types
    const startType = String(await columnType('StaffAvailability', 'StartHour') || '').toLowerCase()
    const endType = String(await columnType('StaffAvailability', 'EndHour') || '').toLowerCase()

    const startParam = (startType && startType.startsWith('time')) ? `${String(startHourInt).padStart(2, '0')}:00:00` : startHourInt
    const endParam = (endType && endType.startsWith('time')) ? `${String(endHourInt).padStart(2, '0')}:00:00` : endHourInt

    // Prefer numeric StaffId when possible to avoid unnecessary casts
    const staffIdNum = Number(staffId)
    const staffParam = Number.isFinite(staffIdNum) ? staffIdNum : String(staffId)

    // Select candidate rows for this staff/date and match in JS to avoid SQL type-cast issues
    const candidates = await query(
        `SELECT * FROM StaffAvailability
     WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
       AND CAST(WeekStartDate AS date) = @shiftDate`,
        { staffId: String(staffId), shiftDate: shiftDateIso }
    )

    const wantedStart = formatHourValue(parts[0])
    const wantedEnd = formatHourValue(parts[1])

    const rows = candidates.recordset || []
    const matches = []
    for (const r of rows) {
        const rs = formatHourValue(r.StartHour)
        const re = formatHourValue(r.EndHour)

        // Match by formatted HH:MM string or by hour-int equivalence
        const startIntMatch = parseHourToInt(parts[0]) === parseHourToInt(rs)
        const endIntMatch = parseHourToInt(parts[1]) === parseHourToInt(re)
        const stringMatch = (rs === wantedStart && re === wantedEnd)

        if (stringMatch || (startIntMatch && endIntMatch)) {
            matches.push(r)
        }
    }

    if (!matches.length) {
        const err = new Error('Shift not found or already deleted')
        err.status = 404
        throw err
    }

    let deletedCount = 0
    for (const m of matches) {
        // Delete by matching the DB column types to avoid incompatible type comparisons
        const startIsTime = (startType && startType.startsWith('time'))
        const endIsTime = (endType && endType.startsWith('time'))

        function extractHourMinute(val) {
            if (val === null || val === undefined) return { h: null, m: null }
            if (val instanceof Date) return { h: val.getUTCHours(), m: val.getUTCMinutes() }
            const s = String(val || '').trim()
            const mm = s.match(/^(\d{1,2}):(\d{2})/) || s.match(/^(\d{1,2})$/)
            if (mm) return { h: Number(mm[1]), m: Number(mm[2] || 0) }
            const n = Number(s)
            if (!Number.isNaN(n)) return { h: Math.trunc(n), m: 0 }
            const dt = new Date(s)
            if (!Number.isNaN(dt.getTime())) return { h: dt.getUTCHours(), m: dt.getUTCMinutes() }
            return { h: null, m: null }
        }

        const startHM = extractHourMinute(m.StartHour)
        const endHM = extractHourMinute(m.EndHour)

        const startCond = startIsTime
            ? 'DATEPART(HOUR, StartHour) = @startHour AND DATEPART(MINUTE, StartHour) = @startMinute'
            : 'TRY_CONVERT(INT, StartHour) = @startHour'
        const endCond = endIsTime
            ? 'DATEPART(HOUR, EndHour) = @endHour AND DATEPART(MINUTE, EndHour) = @endMinute'
            : 'TRY_CONVERT(INT, EndHour) = @endHour'

        const delSql = `DELETE FROM StaffAvailability
         WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
           AND CAST(WeekStartDate AS date) = @shiftDate
           AND ${startCond}
           AND ${endCond}`

        const delParams = {
            staffId: String(staffId),
            shiftDate: shiftDateIso,
            startHour: startIsTime ? startHM.h : (startHM.h !== null ? startHM.h : startHourInt),
            startMinute: startIsTime ? (startHM.m !== null ? startHM.m : 0) : 0,
            endHour: endIsTime ? endHM.h : (endHM.h !== null ? endHM.h : endHourInt),
            endMinute: endIsTime ? (endHM.m !== null ? endHM.m : 0) : 0,
        }

        const delRes = await query(delSql, delParams)
        deletedCount += (delRes.rowsAffected && delRes.rowsAffected[0]) || 0
    }

    if (!deletedCount) {
        const err = new Error('Shift not found or already deleted')
        err.status = 404
        throw err
    }
    return { deleted: deletedCount }
}

module.exports = {
    getSchedule,
    addShift,
    deleteShift,
    getStaffScheduleFromShifts,
    requestStaffLeave,
    getAllOffSchedules,
    deleteStaffLeaveRequest,
};

async function approveLeave({ offScheduleId, staffId, weekStartDate, dayIndex } = {}) {
    if (!offScheduleId && !staffId && !weekStartDate && dayIndex === undefined) {
        const err = new Error('Missing parameters')
        err.status = 400
        throw err
    }

    if (offScheduleId) {
        const res = await query(
            `UPDATE StaffOffSchedules
             SET Status = 'Approved'
             WHERE OffScheduleId = @offScheduleId
               AND UPPER(LTRIM(RTRIM(ISNULL(Status, 'PENDING')))) = 'PENDING'`,
            { offScheduleId }
        )
        const updated = (res.rowsAffected && res.rowsAffected[0]) || 0
        if (updated > 0) {
            const target = await query(
                `SELECT TOP 1 s.UserId
                 FROM StaffOffSchedules o
                    JOIN Staff s ON CAST(s.StaffId AS NVARCHAR(100)) = CAST(o.StaffId AS NVARCHAR(100))
                 WHERE o.OffScheduleId = @offScheduleId`,
                { offScheduleId }
            )
            const userId = String(target.recordset?.[0]?.UserId || '').trim()
                if (userId) {
                await notifyCustomerEvent({
                    userId,
                    event: 'staff_shift_changed',
                    payload: { body: 'Your leave request has been approved.' },
                    sendEmailNow: false,
                })
            }
        }
        return { approved: updated }
    }

    const normalizedDayIndex = Number(dayIndex)
    const oneBasedDayIndex = Number.isFinite(normalizedDayIndex)
        ? (normalizedDayIndex >= 1 && normalizedDayIndex <= 7 ? normalizedDayIndex : normalizedDayIndex + 1)
        : null
    const targetDate = weekStartDate ? toIsoDate(new Date(weekStartDate)) : null

    const existing = await query(
        `SELECT TOP 1 OffScheduleId
         FROM StaffOffSchedules
                 WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
           AND (@targetDate IS NULL OR CAST(StartDate AS date) = @targetDate)
           AND (@dayIndex IS NULL OR TRY_CONVERT(INT, DayIndex) = @dayIndex)
           AND UPPER(LTRIM(RTRIM(ISNULL(Status, 'PENDING')))) = 'PENDING'
         ORDER BY CreatedAt DESC`,
        { staffId, targetDate, dayIndex: oneBasedDayIndex }
    )

    const row = existing.recordset?.[0]
    if (!row || !row.OffScheduleId) {
        const err = new Error('Leave request not found')
        err.status = 404
        throw err
    }

    await query(
        `UPDATE StaffOffSchedules
         SET Status = 'Approved'
         WHERE OffScheduleId = @offScheduleId`,
        { offScheduleId: row.OffScheduleId }
    )

    const target = await query(
        `SELECT TOP 1 s.UserId
         FROM StaffOffSchedules o
         JOIN Staff s ON CAST(s.StaffId AS NVARCHAR(100)) = CAST(o.StaffId AS NVARCHAR(100))
         WHERE o.OffScheduleId = @offScheduleId`,
        { offScheduleId: row.OffScheduleId }
    )
    const userId = String(target.recordset?.[0]?.UserId || '').trim()
    if (userId) {
        await notifyCustomerEvent({
            userId,
            event: 'staff_shift_changed',
            payload: { body: 'Don xin nghi cua ban da duoc duyet.' },
            sendEmailNow: false,
        })
    }

    return { approved: 1 }
}

async function rejectLeave({ offScheduleId, staffId, weekStartDate, dayIndex } = {}) {
    if (!offScheduleId && !staffId && !weekStartDate && dayIndex === undefined) {
        const err = new Error('Missing parameters')
        err.status = 400
        throw err
    }

    if (offScheduleId) {
        const res = await query(
            `UPDATE StaffOffSchedules
             SET Status = 'Rejected'
             WHERE OffScheduleId = @offScheduleId
               AND UPPER(LTRIM(RTRIM(ISNULL(Status, 'PENDING')))) IN ('PENDING', 'APPROVED')`,
            { offScheduleId }
        )
        const updated = (res.rowsAffected && res.rowsAffected[0]) || 0
        if (updated > 0) {
            const target = await query(
                `SELECT TOP 1 s.UserId
                 FROM StaffOffSchedules o
                    JOIN Staff s ON CAST(s.StaffId AS NVARCHAR(100)) = CAST(o.StaffId AS NVARCHAR(100))
                 WHERE o.OffScheduleId = @offScheduleId`,
                { offScheduleId }
            )
            const userId = String(target.recordset?.[0]?.UserId || '').trim()
            if (userId) {
        await notifyCustomerEvent({
            userId,
            event: 'staff_shift_changed',
            payload: { body: 'Your leave request has been rejected.' },
            sendEmailNow: false,
        })
            }
        }
        return { rejected: updated }
    }

    const normalizedDayIndex = Number(dayIndex)
    const oneBasedDayIndex = Number.isFinite(normalizedDayIndex)
        ? (normalizedDayIndex >= 1 && normalizedDayIndex <= 7 ? normalizedDayIndex : normalizedDayIndex + 1)
        : null
    const targetDate = weekStartDate ? toIsoDate(new Date(weekStartDate)) : null

    const res = await query(
        `UPDATE StaffOffSchedules
         SET Status = 'Rejected'
                 WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
           AND (@targetDate IS NULL OR CAST(StartDate AS date) = @targetDate)
           AND (@dayIndex IS NULL OR TRY_CONVERT(INT, DayIndex) = @dayIndex)
           AND UPPER(LTRIM(RTRIM(ISNULL(Status, 'PENDING')))) IN ('PENDING', 'APPROVED')`,
        { staffId, targetDate, dayIndex: oneBasedDayIndex }
    )

    const updated = (res.rowsAffected && res.rowsAffected[0]) || 0
    if (updated > 0 && staffId) {
        const target = await query(
            `SELECT TOP 1 UserId FROM Staff WHERE StaffId = @staffId`,
            { staffId }
        )
        const userId = String(target.recordset?.[0]?.UserId || '').trim()
        if (userId) {
            await notifyCustomerEvent({
                userId,
                event: 'staff_shift_changed',
                payload: { body: 'Don xin nghi cua ban da bi tu choi.' },
                sendEmailNow: false,
            })
        }
    }
    return { rejected: updated }
}

// export the new functions
module.exports.approveLeave = approveLeave
module.exports.rejectLeave = rejectLeave

async function getStaffScheduleFromShifts({ staffId, weekStartQuery } = {}) {
    if (!staffId) {
        const err = new Error('Missing staffId')
        err.status = 400
        throw err
    }

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

    const [availRows, leaveRows] = await Promise.all([
        query(
            `SELECT StaffId, WeekStartDate, StartHour, EndHour
       FROM StaffAvailability
       WHERE StaffId = @staffId
         AND WeekStartDate >= @weekStart
         AND WeekStartDate <= @weekEnd
       ORDER BY WeekStartDate ASC, StartHour ASC`, { staffId, weekStart: weekStartIso, weekEnd: weekEndIso },
        ),
                query(
                        `SELECT OffScheduleId, StaffId, DayIndex, StartHour, IsRecurring, StartDate, EndDate, Note, Status
                         FROM StaffOffSchedules
                         WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
                             AND CAST(StartDate AS date) <= @weekEnd
                             AND CAST(ISNULL(EndDate, StartDate) AS date) >= @weekStart
                         ORDER BY StartDate ASC, CreatedAt DESC`,
                        { staffId, weekStart: weekStartIso, weekEnd: weekEndIso },
                ).catch(() => ({ recordset: [] })),
    ])

    const map = new Map()

    for (const r of availRows.recordset || []) {
        const d = new Date(r.WeekStartDate)
        const ymd = toIsoDate(d)
        if (!map.has(ymd)) map.set(ymd, [])

        const startHour = formatHourValue(r.StartHour)
        const endHour = formatShiftEndDisplay(r.EndHour)
        if (!startHour || !endHour) continue

        map.get(ymd).push({
            time: `${startHour} - ${endHour}`,
            type: 'assigned',
            meta: {
                note: 'Ca lam viec',
                availabilityId: r.AvailabilityId,
                startHour: r.StartHour,
                endHour: r.EndHour,
            },
        })
    }

    for (const r of leaveRows.recordset || []) {
        const status = String(r.Status || 'Pending').trim().toLowerCase()
        if (status === 'rejected') continue

        const startDate = new Date(r.StartDate)
        if (Number.isNaN(startDate.getTime())) continue
        const endDateRaw = r.EndDate ? new Date(r.EndDate) : null
        const endDate = endDateRaw && !Number.isNaN(endDateRaw.getTime()) ? endDateRaw : startDate
        const startDateIso = toIsoDate(startDate)
        const endDateIso = toIsoDate(endDate)
        if (!startDateIso || !endDateIso) continue

        const note = String(r.Note || '').trim()
        const leaveTypeMatch = note.match(/LEAVE_REQUEST\[(morning|afternoon|evening|full)\]/i)
        const leaveTypeFromNote = leaveTypeMatch ? String(leaveTypeMatch[1]).toLowerCase() : ''
        const parsedStartHour = parseHourToInt(String(r.StartHour || '').trim())
        const leaveType = leaveTypeFromNote || (parsedStartHour === 8 ? 'morning' : parsedStartHour === 13 ? 'afternoon' : parsedStartHour === 16 ? 'evening' : 'full')
        const leaveTypeLabel = leaveType === 'morning'
            ? 'Morning'
            : leaveType === 'afternoon'
                ? 'Afternoon'
                : leaveType === 'evening'
                    ? 'Evening'
                    : 'Full Day'

        const rowDayIndexRaw = Number(r.DayIndex)
        const rowDayIndex = Number.isFinite(rowDayIndexRaw)
            ? (rowDayIndexRaw >= 1 && rowDayIndexRaw <= 7 ? rowDayIndexRaw - 1 : rowDayIndexRaw)
            : null
        const isRecurring = Number(r.IsRecurring || 0) === 1

        const includeDate = (isoDate) => {
            if (!isoDate) return
            if (isoDate < weekStartIso || isoDate > weekEndIso) return
            if (isoDate < startDateIso || isoDate > endDateIso) return
            if (!map.has(isoDate)) map.set(isoDate, [])
            if (status !== 'pending') {
                map.set(isoDate, stripOverlappedWorkingShifts(map.get(isoDate) || [], leaveType))
            }
            map.get(isoDate).push({
                time: leaveTypeLabel,
                type: status === 'pending' ? 'leave-request' : 'leave',
                meta: {
                    offScheduleId: r.OffScheduleId,
                    status: r.Status || 'Pending',
                    note: note.replace(/^LEAVE_REQUEST(\[(morning|afternoon|evening|full)\])?\s*:?\s*/i, '') || note,
                    leaveType,
                },
            })
        }

        if (isRecurring && rowDayIndex !== null) {
            const occ = new Date(weekStart)
            occ.setDate(occ.getDate() + rowDayIndex)
            includeDate(toIsoDate(occ))
            includeDate(startDateIso)
            includeDate(endDateIso)
        } else {
            includeDate(startDateIso)
        }
    }

    const out = []
    for (let i = 0; i < 7; i += 1) {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        const ymd = toIsoDate(d)
        out.push({ date: ymd, shifts: map.get(ymd) || [], available: true })
    }
    return out
}

function resolveLeaveShift(shiftType) {
    const normalized = String(shiftType || 'full').trim().toLowerCase()
    if (normalized === 'morning') return { shiftType: 'morning', startHour: 8, durationHours: 4 }
    if (normalized === 'afternoon') return { shiftType: 'afternoon', startHour: 13, durationHours: 4 }
    if (normalized === 'evening') return { shiftType: 'evening', startHour: 16, durationHours: 4 }
    return { shiftType: 'full', startHour: 8, durationHours: 9 }
}

function normalizeDayIndexOneBased(value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    if (n >= 1 && n <= 7) return Math.trunc(n)
    if (n >= 0 && n <= 6) return Math.trunc(n + 1)
    return null
}

async function getAllOffSchedules() {
    const offStartHourColType = await columnType('StaffOffSchedules', 'StartHour')
    const offStartHourExpr = (offStartHourColType && offStartHourColType.startsWith('time'))
        ? 'DATEPART(HOUR, o.StartHour)'
        : 'TRY_CONVERT(INT, o.StartHour)'

    const res = await query(
        `SELECT
            o.OffScheduleId,
            o.StaffId,
            o.StaffName,
            o.DayIndex,
            o.StartHour,
            o.IsRecurring,
            o.StartDate,
            o.EndDate,
            o.Note,
            o.CreatedAt,
            ISNULL(NULLIF(LTRIM(RTRIM(o.Status)), ''), 'Pending') AS Status,
            u.AvatarUrl,
                        CASE
                                                                                                                WHEN UPPER(ISNULL(o.Note, '')) LIKE '%LEAVE_REQUEST[[]MORNING[]]%' OR ${offStartHourExpr} = 8 THEN N'Morning'
                                                                                                                WHEN UPPER(ISNULL(o.Note, '')) LIKE '%LEAVE_REQUEST[[]AFTERNOON[]]%' OR ${offStartHourExpr} = 13 THEN N'Afternoon'
                                                                                                                WHEN UPPER(ISNULL(o.Note, '')) LIKE '%LEAVE_REQUEST[[]EVENING[]]%' OR ${offStartHourExpr} = 16 THEN N'Evening'
                            ELSE N'Full Day'
                        END AS ShiftVN
         FROM StaffOffSchedules o
         LEFT JOIN Staff s ON CAST(s.StaffId AS NVARCHAR(100)) = CAST(o.StaffId AS NVARCHAR(100))
         LEFT JOIN Users u ON u.UserId = s.UserId
         ORDER BY o.CreatedAt DESC`
    )
    return res.recordset || []
}

async function requestStaffLeave({ staffId, date, note, shiftType, isRecurring, endDate } = {}) {
    if (!staffId || !date) {
        const err = new Error('Missing staffId/date')
        err.status = 400
        throw err
    }
    const leaveDate = new Date(date)
    if (Number.isNaN(leaveDate.getTime())) {
        const err = new Error('Invalid date')
        err.status = 400
        throw err
    }

    leaveDate.setHours(0, 0, 0, 0)

    const dayIndexOneBased = normalizeDayIndexOneBased((leaveDate.getDay() + 6) % 7)
    const startDateIso = toIsoDate(leaveDate)
    const endDateValue = endDate ? new Date(endDate) : null
    const endDateIso = endDateValue && !Number.isNaN(endDateValue.getTime()) ? toIsoDate(endDateValue) : startDateIso
    const leaveShift = resolveLeaveShift(shiftType)
    const offStartHourColType = await columnType('StaffOffSchedules', 'StartHour')
    const offStartHourParam = (offStartHourColType && offStartHourColType.startsWith('time'))
        ? `${String(leaveShift.startHour).padStart(2, '0')}:00:00`
        : leaveShift.startHour
    const safeNote = `LEAVE_REQUEST[${leaveShift.shiftType}]${note ? `: ${String(note).trim()}` : ''}`

    // Allow leave requests regardless of assigned shifts or advance-day constraints.

    const existing = await query(
        `SELECT TOP 1 OffScheduleId
         FROM StaffOffSchedules
         WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
             AND CAST(StartDate AS date) = @startDate
             AND TRY_CONVERT(INT, DayIndex) = @dayIndex
             AND UPPER(LTRIM(RTRIM(ISNULL(Status, 'PENDING')))) = 'PENDING'
         ORDER BY CreatedAt DESC`,
        { staffId, startDate: startDateIso, dayIndex: dayIndexOneBased },
    )

    if (existing.recordset?.[0]?.OffScheduleId) {
    await query(
            `UPDATE StaffOffSchedules
             SET Note = @note,
                     StartHour = @startHour,
                     IsRecurring = @isRecurring,
                     EndDate = @endDate,
                     Status = 'Pending'
             WHERE OffScheduleId = @offScheduleId`,
            {
                                offScheduleId: existing.recordset[0].OffScheduleId,
                note: safeNote,
                startHour: offStartHourParam,
                                isRecurring: Number(isRecurring) === 1 ? 1 : 0,
                                endDate: endDateIso,
            },
    )
    return { updated: 1 }
  }

  const profile = await query(
    `SELECT TOP 1 st.StaffId, u.Name AS StaffName
     FROM Staff st
     LEFT JOIN Users u ON u.UserId = st.UserId
         WHERE CAST(st.StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))`,
    { staffId },
  )
  const staffName = String(profile.recordset?.[0]?.StaffName || '').trim() || 'Staff'

    const offScheduleIdIsIdentity = await isIdentityColumn('StaffOffSchedules', 'OffScheduleId')
    if (offScheduleIdIsIdentity) {
        await query(
            `INSERT INTO StaffOffSchedules (StaffId, StaffName, DayIndex, StartHour, IsRecurring, StartDate, EndDate, Note, CreatedAt, Status)
                     VALUES (@staffId, @staffName, @dayIndex, @startHour, @isRecurring, @startDate, @endDate, @note, GETDATE(), 'Pending')`,
            {
                staffId,
                staffName,
                dayIndex: dayIndexOneBased,
                startHour: offStartHourParam,
                isRecurring: Number(isRecurring) === 1 ? 1 : 0,
                startDate: startDateIso,
                endDate: endDateIso,
                note: safeNote,
            },
        )
    } else {
        await query(
            `INSERT INTO StaffOffSchedules (OffScheduleId, StaffId, StaffName, DayIndex, StartHour, IsRecurring, StartDate, EndDate, Note, CreatedAt, Status)
                     VALUES (@offScheduleId, @staffId, @staffName, @dayIndex, @startHour, @isRecurring, @startDate, @endDate, @note, GETDATE(), 'Pending')`,
            {
                offScheduleId: newId(),
                staffId,
                staffName,
                dayIndex: dayIndexOneBased,
                startHour: offStartHourParam,
                isRecurring: Number(isRecurring) === 1 ? 1 : 0,
                startDate: startDateIso,
                endDate: endDateIso,
                note: safeNote,
            },
        )
    }

  return { created: 1 }
}

async function deleteStaffLeaveRequest({ staffId, offScheduleId, date, shiftType } = {}) {
    if (!staffId) {
        const err = new Error('Missing staffId')
        err.status = 400
        throw err
    }

    if (offScheduleId) {
        const res = await query(
            `DELETE FROM StaffOffSchedules
             WHERE OffScheduleId = @offScheduleId
                             AND CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
               AND UPPER(LTRIM(RTRIM(ISNULL(Status, 'PENDING')))) = 'PENDING'`,
            { offScheduleId, staffId }
        )
        const deleted = (res.rowsAffected && res.rowsAffected[0]) || 0
        if (deleted > 0) return { deleted }
        // Fallback: try matching by date + shiftType when offScheduleId is stale.
    }

    const targetDate = date ? toIsoDate(new Date(date)) : null
    const hasShiftType = shiftType !== undefined && shiftType !== null && String(shiftType).trim() !== ''
    const shift = hasShiftType ? resolveLeaveShift(shiftType) : null
    const offStartHourColType = await columnType('StaffOffSchedules', 'StartHour')
    const startHourIsTime = offStartHourColType && offStartHourColType.startsWith('time')
    const startHourClause = startHourIsTime
        ? 'DATEPART(HOUR, StartHour) = @startHour'
        : 'TRY_CONVERT(INT, StartHour) = @startHour'
    const res = await query(
        `DELETE FROM StaffOffSchedules
                 WHERE CAST(StaffId AS NVARCHAR(100)) = CAST(@staffId AS NVARCHAR(100))
           AND (@targetDate IS NULL OR CAST(StartDate AS date) = @targetDate)
           AND (@startHour IS NULL OR ${startHourClause})
           AND UPPER(LTRIM(RTRIM(ISNULL(Status, 'PENDING')))) = 'PENDING'`,
        { staffId, targetDate, startHour: shift?.startHour ?? null }
    )
    const deleted = (res.rowsAffected && res.rowsAffected[0]) || 0
    if (!deleted) {
        const err = new Error('Leave request not found or already processed')
        err.status = 404
        throw err
    }
    return { deleted }
}