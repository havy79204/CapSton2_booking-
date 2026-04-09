const { query } = require('../config/query')

function toIsoDateOnly(d) {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeDateRange(days = 30, startDate, endDate) {
  const startText = String(startDate || '').trim()
  const endText = String(endDate || '').trim()
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startText)
  const validEnd = /^\d{4}-\d{2}-\d{2}$/.test(endText)

  if (validStart && validEnd) {
    return {
      startDate: startText,
      endDate: endText,
      params: { startDate: startText, endDate: endText },
      whereClause: 'CAST([At] AS date) >= @startDate AND CAST([At] AS date) <= @endDate',
    }
  }

  const daysNum = Number(days) || 30
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - daysNum + 1)

  const computedStart = toIsoDateOnly(start)
  const computedEnd = toIsoDateOnly(end)

  return {
    startDate: computedStart,
    endDate: computedEnd,
    params: { startDate: computedStart, endDate: computedEnd },
    whereClause: 'CAST([At] AS date) >= @startDate AND CAST([At] AS date) <= @endDate',
  }
}

async function tableExists(tableName) {
  try {
    const res = await query(
      `SELECT TOP 1 1 AS ok
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = @tableName`,
      { tableName }
    )
    return Boolean(res.recordset?.length)
  } catch {
    return false
  }
}

async function columnExists(tableName, columnName) {
  try {
    const res = await query(
      `SELECT TOP 1 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @tableName
         AND COLUMN_NAME = @columnName`,
      { tableName, columnName }
    )
    return Boolean(res.recordset?.length)
  } catch {
    return false
  }
}

function timeExpr(tableAlias, col) {
  return `CASE
    WHEN TRY_CONVERT(time, ${tableAlias}.${col}) IS NOT NULL THEN TRY_CONVERT(time, ${tableAlias}.${col})
    WHEN TRY_CONVERT(FLOAT, ${tableAlias}.${col}) IS NOT NULL
      THEN CAST(DATEADD(minute, CAST(ROUND(TRY_CONVERT(FLOAT, ${tableAlias}.${col}) * 60.0, 0) AS INT), CAST('00:00:00' AS datetime)) AS time)
    ELSE NULL
  END`
}

function durationMinutesExpr(tableAlias, col) {
  return `CASE
    WHEN TRY_CONVERT(FLOAT, ${tableAlias}.${col}) IS NOT NULL THEN CAST(ROUND(TRY_CONVERT(FLOAT, ${tableAlias}.${col}) * 60.0, 0) AS INT)
    WHEN TRY_CONVERT(time, ${tableAlias}.${col}) IS NOT NULL THEN DATEDIFF(minute, CAST('00:00:00' AS time), TRY_CONVERT(time, ${tableAlias}.${col}))
    ELSE NULL
  END`
}

async function getAttendanceReport(days = 30, startDate, endDate) {
  const range = normalizeDateRange(days, startDate, endDate)
  const sql = `
    WITH BaseLogs AS (
      SELECT
        CAST(TimeLogId AS NVARCHAR(100)) AS TimeLogId,
        CAST(StaffId AS NVARCHAR(50)) AS StaffIdText,
        LOWER(LTRIM(RTRIM(ISNULL([Type], '')))) AS TypeNorm,
        [At],
        ISNULL([Note], N'') AS [Note],
        CAST([At] AS date) AS WorkDate
      FROM TimeLogs
      WHERE ${range.whereClause}
        AND StaffId IS NOT NULL
    ), InOutRaw AS (
      SELECT
        b.*,
        CASE
          WHEN b.TypeNorm IN ('in', 'present', 'start') THEN 'in'
          WHEN b.TypeNorm IN ('out', 'exit', 'checkout', 'check-out') THEN 'out'
          ELSE NULL
        END AS IoType
      FROM BaseLogs b
    ), InOutOnly AS (
      SELECT * FROM InOutRaw WHERE IoType IS NOT NULL
    ), Marked AS (
      SELECT
        io.*,
        LAG(io.IoType) OVER (PARTITION BY io.StaffIdText, io.WorkDate ORDER BY io.[At], io.TimeLogId) AS PrevIoType
      FROM InOutOnly io
    ), BlockTagged AS (
      SELECT
        m.*,
        SUM(CASE WHEN ISNULL(m.PrevIoType, '') = m.IoType THEN 0 ELSE 1 END)
          OVER (PARTITION BY m.StaffIdText, m.WorkDate ORDER BY m.[At], m.TimeLogId ROWS UNBOUNDED PRECEDING) AS BlockId
      FROM Marked m
    ), Blocks AS (
      SELECT
        bt.StaffIdText,
        bt.WorkDate,
        bt.BlockId,
        bt.IoType,
        MIN(bt.[At]) AS BlockStart,
        MAX(bt.[At]) AS BlockEnd,
        MAX(CASE WHEN LOWER(bt.[Note]) LIKE '%late%' OR LOWER(bt.[Note]) LIKE N'%muộn%' THEN 1 ELSE 0 END) AS HasLate
      FROM BlockTagged bt
      GROUP BY bt.StaffIdText, bt.WorkDate, bt.BlockId, bt.IoType
    ), OrderedBlocks AS (
      SELECT
        b.*,
        LEAD(b.IoType) OVER (PARTITION BY b.StaffIdText, b.WorkDate ORDER BY b.BlockId) AS NextType,
        LEAD(b.BlockEnd) OVER (PARTITION BY b.StaffIdText, b.WorkDate ORDER BY b.BlockId) AS NextOutAt
      FROM Blocks b
    ), PairShifts AS (
      SELECT
        ob.StaffIdText,
        ob.WorkDate,
        ob.BlockStart AS LoginAt,
        ob.NextOutAt AS LogoutAt,
        CASE WHEN ob.HasLate = 1 THEN 1 ELSE 0 END AS IsLate,
        DATEDIFF(second, ob.BlockStart, ob.NextOutAt) / 3600.0 AS HoursWorked
      FROM OrderedBlocks ob
      WHERE ob.IoType = 'in'
        AND ob.NextType = 'out'
        AND ob.NextOutAt IS NOT NULL
        AND ob.NextOutAt > ob.BlockStart
    ), PairAgg AS (
      SELECT
        p.StaffIdText,
        COUNT(1) AS CompletedShifts,
        SUM(CASE WHEN p.IsLate = 1 THEN 1 ELSE 0 END) AS LateShifts,
        SUM(ISNULL(p.HoursWorked, 0)) AS TotalHours
      FROM PairShifts p
      GROUP BY p.StaffIdText
    ), AbsentAgg AS (
      SELECT
        b.StaffIdText,
        COUNT(1) AS AbsentShifts
      FROM BaseLogs b
      WHERE b.TypeNorm IN ('absent', 'leave', 'off')
         OR LOWER(b.[Note]) LIKE '%absent%'
         OR LOWER(b.[Note]) LIKE N'%vắng%'
      GROUP BY b.StaffIdText
    ), StaffUniverse AS (
      SELECT StaffIdText FROM PairAgg
      UNION
      SELECT StaffIdText FROM AbsentAgg
    )
    SELECT
      su.StaffIdText AS StaffId,
      COALESCE(u.[Name], '') AS StaffName,
      ISNULL(pa.CompletedShifts, 0) + ISNULL(aa.AbsentShifts, 0) AS TotalShifts,
      CASE
        WHEN ISNULL(pa.CompletedShifts, 0) - ISNULL(pa.LateShifts, 0) < 0 THEN 0
        ELSE ISNULL(pa.CompletedShifts, 0) - ISNULL(pa.LateShifts, 0)
      END AS Present,
      ISNULL(pa.LateShifts, 0) AS Late,
      ISNULL(aa.AbsentShifts, 0) AS Absent,
      CAST(ISNULL(pa.TotalHours, 0) AS FLOAT) AS TotalHours
    FROM StaffUniverse su
    LEFT JOIN PairAgg pa ON pa.StaffIdText = su.StaffIdText
    LEFT JOIN AbsentAgg aa ON aa.StaffIdText = su.StaffIdText
    LEFT JOIN Staff st ON CAST(st.StaffId AS NVARCHAR(50)) = su.StaffIdText
    LEFT JOIN Users u ON u.UserId = st.UserId
    ORDER BY COALESCE(u.[Name], '')
  `

  try {
    const res = await query(sql, range.params)
    return res.recordset || []
  } catch {
    return []
  }
}

async function getAttendanceStaffDetail(staffId, days = 30, startDate, endDate) {
  const sid = String(staffId || '').trim()
  if (!sid) return []

  const range = normalizeDateRange(days, startDate, endDate)

  const [hasStaffShifts, hasStaffAvailability] = await Promise.all([
    tableExists('StaffShifts'),
    tableExists('StaffAvailability'),
  ])

  const shiftSources = []

  if (hasStaffShifts) {
    const [hasShiftStaffId, hasShiftWeekStartDate, hasShiftDayIndex, hasShiftStartHour, hasShiftEndHour, hasShiftDurationHours] = await Promise.all([
      columnExists('StaffShifts', 'StaffId'),
      columnExists('StaffShifts', 'WeekStartDate'),
      columnExists('StaffShifts', 'DayIndex'),
      columnExists('StaffShifts', 'StartHour'),
      columnExists('StaffShifts', 'EndHour'),
      columnExists('StaffShifts', 'DurationHours'),
    ])

    if (hasShiftStaffId && hasShiftWeekStartDate && hasShiftStartHour && (hasShiftEndHour || hasShiftDurationHours)) {
      const shiftDateExpr = hasShiftDayIndex
        ? `CAST(CASE
             WHEN TRY_CONVERT(INT, ss.DayIndex) BETWEEN 1 AND 7 THEN DATEADD(day, TRY_CONVERT(INT, ss.DayIndex) - 1, CAST(ss.WeekStartDate AS date))
             WHEN TRY_CONVERT(INT, ss.DayIndex) BETWEEN 0 AND 6 THEN DATEADD(day, TRY_CONVERT(INT, ss.DayIndex), CAST(ss.WeekStartDate AS date))
             ELSE CAST(ss.WeekStartDate AS date)
           END AS date)`
        : 'CAST(ss.WeekStartDate AS date)'

      const shiftStartExpr = timeExpr('ss', 'StartHour')
      const shiftEndExpr = hasShiftEndHour
        ? timeExpr('ss', 'EndHour')
        : `CAST(DATEADD(minute, ISNULL(${durationMinutesExpr('ss', 'DurationHours')}, 240), CAST('00:00:00' AS datetime)) AS time)`

      shiftSources.push(`
        SELECT
          CAST(ss.StaffId AS NVARCHAR(50)) AS StaffIdText,
          ${shiftDateExpr} AS WorkDate,
          ${shiftStartExpr} AS SchedStart,
          ${shiftEndExpr} AS SchedEnd
        FROM StaffShifts ss
        WHERE CAST(ss.StaffId AS NVARCHAR(50)) = @staffId
          AND ${shiftDateExpr} >= @startDate
          AND ${shiftDateExpr} <= @endDate
      `)
    }
  }

  if (hasStaffAvailability) {
    const [hasAvailStaffId, hasAvailWeekStartDate, hasAvailStartHour, hasAvailEndHour] = await Promise.all([
      columnExists('StaffAvailability', 'StaffId'),
      columnExists('StaffAvailability', 'WeekStartDate'),
      columnExists('StaffAvailability', 'StartHour'),
      columnExists('StaffAvailability', 'EndHour'),
    ])

    if (hasAvailStaffId && hasAvailWeekStartDate && hasAvailStartHour && hasAvailEndHour) {
      shiftSources.push(`
        SELECT
          CAST(sa.StaffId AS NVARCHAR(50)) AS StaffIdText,
          CAST(sa.WeekStartDate AS date) AS WorkDate,
          ${timeExpr('sa', 'StartHour')} AS SchedStart,
          ${timeExpr('sa', 'EndHour')} AS SchedEnd
        FROM StaffAvailability sa
        WHERE CAST(sa.StaffId AS NVARCHAR(50)) = @staffId
          AND CAST(sa.WeekStartDate AS date) >= @startDate
          AND CAST(sa.WeekStartDate AS date) <= @endDate
      `)
    }
  }

  const fallbackSql = `
    WITH BaseLogs AS (
      SELECT
        CAST(TimeLogId AS NVARCHAR(100)) AS TimeLogId,
        CAST(StaffId AS NVARCHAR(50)) AS StaffIdText,
        LOWER(LTRIM(RTRIM(ISNULL([Type], '')))) AS TypeNorm,
        [At],
        ISNULL([Note], N'') AS [Note],
        CAST([At] AS date) AS WorkDate
      FROM TimeLogs
      WHERE CAST(StaffId AS NVARCHAR(50)) = @staffId
        AND CAST([At] AS date) >= @startDate
        AND CAST([At] AS date) <= @endDate
    ), InOutRaw AS (
      SELECT
        b.*,
        CASE
          WHEN b.TypeNorm IN ('in', 'present', 'start') THEN 'in'
          WHEN b.TypeNorm IN ('out', 'exit', 'checkout', 'check-out') THEN 'out'
          ELSE NULL
        END AS IoType
      FROM BaseLogs b
    ), InOutOnly AS (
      SELECT * FROM InOutRaw WHERE IoType IS NOT NULL
    ), Marked AS (
      SELECT
        io.*,
        LAG(io.IoType) OVER (PARTITION BY io.StaffIdText, io.WorkDate ORDER BY io.[At], io.TimeLogId) AS PrevIoType
      FROM InOutOnly io
    ), BlockTagged AS (
      SELECT
        m.*,
        SUM(CASE WHEN ISNULL(m.PrevIoType, '') = m.IoType THEN 0 ELSE 1 END)
          OVER (PARTITION BY m.StaffIdText, m.WorkDate ORDER BY m.[At], m.TimeLogId ROWS UNBOUNDED PRECEDING) AS BlockId
      FROM Marked m
    ), Blocks AS (
      SELECT
        bt.StaffIdText,
        bt.WorkDate,
        bt.BlockId,
        bt.IoType,
        MIN(bt.[At]) AS BlockStart,
        MAX(bt.[At]) AS BlockEnd,
        MAX(CASE WHEN LOWER(bt.[Note]) LIKE '%late%' OR LOWER(bt.[Note]) LIKE N'%muộn%' THEN 1 ELSE 0 END) AS HasLate,
        MAX(NULLIF(LTRIM(RTRIM(bt.[Note])), N'')) AS AnyNote
      FROM BlockTagged bt
      GROUP BY bt.StaffIdText, bt.WorkDate, bt.BlockId, bt.IoType
    ), OrderedBlocks AS (
      SELECT
        b.*,
        LEAD(b.IoType) OVER (PARTITION BY b.StaffIdText, b.WorkDate ORDER BY b.BlockId) AS NextType,
        LEAD(b.BlockEnd) OVER (PARTITION BY b.StaffIdText, b.WorkDate ORDER BY b.BlockId) AS NextOutAt
      FROM Blocks b
    ), PairRows AS (
      SELECT
        ob.WorkDate,
        CASE
          WHEN DATEPART(hour, ob.BlockStart) < 12 THEN N'Morning'
          WHEN DATEPART(hour, ob.BlockStart) < 16 THEN N'Afternoon'
          ELSE N'Evening'
        END AS ShiftName,
        CAST(NULL AS datetime) AS ScheduleStartAt,
        CAST(NULL AS datetime) AS ScheduleEndAt,
        ob.BlockStart AS CheckInAt,
        ob.NextOutAt AS CheckOutAt,
        DATEDIFF(minute, ob.BlockStart, ob.NextOutAt) AS DurationMinutes,
        CASE
          WHEN ob.HasLate = 1 THEN N'Late'
          WHEN DATEDIFF(minute, ob.BlockStart, ob.NextOutAt) < 235 THEN N'Left early'
          ELSE N'On time'
        END AS [Status],
        COALESCE(NULLIF(ob.AnyNote, N''), N'') AS [Note]
      FROM OrderedBlocks ob
      WHERE ob.IoType = 'in'
        AND ob.NextType = 'out'
        AND ob.NextOutAt IS NOT NULL
        AND ob.NextOutAt > ob.BlockStart
    ), AbsentRows AS (
      SELECT
        b.WorkDate,
        N'Morning' AS ShiftName,
        CAST(NULL AS datetime) AS ScheduleStartAt,
        CAST(NULL AS datetime) AS ScheduleEndAt,
        CAST(NULL AS datetime) AS CheckInAt,
        CAST(NULL AS datetime) AS CheckOutAt,
        CAST(0 AS INT) AS DurationMinutes,
        N'Absent' AS [Status],
        COALESCE(NULLIF(LTRIM(RTRIM(b.[Note])), N''), N'') AS [Note]
      FROM BaseLogs b
      WHERE b.TypeNorm IN ('absent', 'leave', 'off')
         OR LOWER(b.[Note]) LIKE '%absent%'
         OR LOWER(b.[Note]) LIKE N'%vắng%'
    )
    SELECT
      x.WorkDate,
      x.ShiftName,
      x.ScheduleStartAt,
      x.ScheduleEndAt,
      x.CheckInAt,
      x.CheckOutAt,
      x.DurationMinutes,
      x.[Status],
      x.[Note]
    FROM (
      SELECT * FROM PairRows
      UNION ALL
      SELECT * FROM AbsentRows
    ) x
    ORDER BY x.WorkDate DESC, x.CheckInAt ASC
  `

  if (!shiftSources.length) {
    try {
      const fallbackRes = await query(fallbackSql, { staffId: sid, ...range.params })
      return fallbackRes.recordset || []
    } catch {
      return []
    }
  }

  const sql = `
    WITH ShiftRaw AS (
      ${shiftSources.join('\nUNION ALL\n')}
    ), ShiftNorm AS (
      SELECT
        sr.StaffIdText,
        sr.WorkDate,
        sr.SchedStart,
        CASE
          WHEN sr.SchedEnd IS NOT NULL AND sr.SchedStart IS NOT NULL AND sr.SchedEnd > sr.SchedStart THEN sr.SchedEnd
          WHEN sr.SchedStart IS NOT NULL THEN CAST(DATEADD(hour, 4, CAST(sr.SchedStart AS datetime)) AS time)
          ELSE NULL
        END AS SchedEnd
      FROM ShiftRaw sr
      WHERE sr.SchedStart IS NOT NULL
    ), ShiftUniq AS (
      SELECT DISTINCT
        sn.StaffIdText,
        sn.WorkDate,
        sn.SchedStart,
        sn.SchedEnd
      FROM ShiftNorm sn
    ), ShiftRows AS (
      SELECT
        su.StaffIdText,
        su.WorkDate,
        su.SchedStart,
        su.SchedEnd,
        DATEADD(second, DATEDIFF(second, CAST('00:00:00' AS time), su.SchedStart), CAST(su.WorkDate AS datetime)) AS StartAt,
        DATEADD(second, DATEDIFF(second, CAST('00:00:00' AS time), su.SchedEnd), CAST(CASE WHEN su.SchedEnd < su.SchedStart THEN DATEADD(day, 1, su.WorkDate) ELSE su.WorkDate END AS datetime)) AS EndAt,
        CASE
          WHEN DATEPART(hour, su.SchedStart) < 12 THEN N'Morning'
          WHEN DATEPART(hour, su.SchedStart) < 16 THEN N'Afternoon'
          ELSE N'Evening'
        END AS ShiftName
      FROM ShiftUniq su
    ), OrderedShifts AS (
      SELECT
        s.*,
        LEAD(s.StartAt) OVER (PARTITION BY s.StaffIdText, s.WorkDate ORDER BY s.StartAt) AS NextShiftStartAt
      FROM ShiftRows s
    ), LogsByStaff AS (
      SELECT
        CAST(tl.StaffId AS NVARCHAR(50)) AS StaffIdText,
        LOWER(LTRIM(RTRIM(ISNULL(tl.[Type], '')))) AS TypeNorm,
        tl.[At],
        ISNULL(tl.[Note], N'') AS [Note]
      FROM TimeLogs tl
      WHERE CAST(tl.StaffId AS NVARCHAR(50)) = @staffId
        AND CAST(tl.[At] AS date) >= @startDate
        AND CAST(tl.[At] AS date) <= @endDate
    )
    SELECT
      os.WorkDate,
      os.ShiftName,
      os.StartAt AS ScheduleStartAt,
      os.EndAt AS ScheduleEndAt,
      ci.CheckInAt,
      COALESCE(
        co.CheckOutAt,
        CASE WHEN os.NextShiftStartAt IS NOT NULL AND ABS(DATEDIFF(minute, os.EndAt, os.NextShiftStartAt)) <= 1 THEN os.EndAt ELSE NULL END
      ) AS CheckOutAt,
      CASE
        WHEN ci.CheckInAt IS NULL THEN 0
        ELSE DATEDIFF(minute, ci.CheckInAt, COALESCE(co.CheckOutAt, CASE WHEN os.NextShiftStartAt IS NOT NULL AND ABS(DATEDIFF(minute, os.EndAt, os.NextShiftStartAt)) <= 1 THEN os.EndAt ELSE NULL END))
      END AS DurationMinutes,
      CASE
        WHEN ci.CheckInAt IS NULL THEN N'Absent'
        WHEN ci.CheckInAt > os.StartAt THEN N'Late'
        WHEN COALESCE(co.CheckOutAt, CASE WHEN os.NextShiftStartAt IS NOT NULL AND ABS(DATEDIFF(minute, os.EndAt, os.NextShiftStartAt)) <= 1 THEN os.EndAt ELSE NULL END) IS NULL THEN N'Missing checkout'
        WHEN COALESCE(co.CheckOutAt, os.EndAt) < DATEADD(minute, -5, os.EndAt) THEN N'Left early'
        ELSE N'On time'
      END AS [Status],
      COALESCE(NULLIF(LTRIM(RTRIM(ln.[Note])), N''), N'') AS [Note]
    FROM OrderedShifts os
    OUTER APPLY (
      SELECT MIN(l.[At]) AS CheckInAt
      FROM LogsByStaff l
      WHERE l.TypeNorm IN ('in', 'present', 'start')
        AND l.[At] >= DATEADD(hour, -2, os.StartAt)
        AND l.[At] < ISNULL(os.NextShiftStartAt, DATEADD(hour, 4, os.EndAt))
    ) ci
    OUTER APPLY (
      SELECT MAX(l.[At]) AS CheckOutAt
      FROM LogsByStaff l
      WHERE l.TypeNorm IN ('out', 'exit', 'checkout', 'check-out')
        AND l.[At] >= ISNULL(ci.CheckInAt, DATEADD(hour, -1, os.StartAt))
        AND l.[At] < ISNULL(os.NextShiftStartAt, DATEADD(hour, 4, os.EndAt))
    ) co
    OUTER APPLY (
      SELECT TOP 1 l.[Note]
      FROM LogsByStaff l
      WHERE l.[At] >= DATEADD(hour, -2, os.StartAt)
        AND l.[At] < ISNULL(os.NextShiftStartAt, DATEADD(hour, 4, os.EndAt))
        AND NULLIF(LTRIM(RTRIM(l.[Note])), N'') IS NOT NULL
      ORDER BY l.[At] DESC
    ) ln
    ORDER BY os.WorkDate DESC, os.StartAt ASC
  `

  try {
    const res = await query(sql, { staffId: sid, ...range.params })
    const rows = res.recordset || []
    if (rows.length) return rows

    const fallbackRes = await query(fallbackSql, { staffId: sid, ...range.params })
    return fallbackRes.recordset || []
  } catch {
    try {
      const fallbackRes = await query(fallbackSql, { staffId: sid, ...range.params })
      return fallbackRes.recordset || []
    } catch {
      return []
    }
  }
}

module.exports = { getAttendanceReport, getAttendanceStaffDetail }
