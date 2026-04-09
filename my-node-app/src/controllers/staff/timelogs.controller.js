const { asyncHandler } = require('../../utils/asyncHandler')
const { query, newId } = require('../../config/query')
const attendanceService = require('../../services/attendance.service')

function computePairsFromLogs(rows) {
  const pairs = []
  let currentIn = null
  for (const r of (rows || [])) {
    const type = String(r.Type || '').toUpperCase()
    const at = r.At ? new Date(r.At) : null
    if (type === 'IN') {
      currentIn = { inId: r.TimeLogId, inAt: at, inNote: r.Note }
    } else if (type === 'OUT') {
      if (currentIn && currentIn.inAt && at && at >= currentIn.inAt) {
        const durMs = (at.getTime() - currentIn.inAt.getTime())
        pairs.push({ inAt: currentIn.inAt, outAt: at, durationHours: Math.round((durMs / 3600000) * 10) / 10, inNote: currentIn.inNote, outNote: r.Note })
        currentIn = null
      } else {
        // orphan OUT - ignore
        currentIn = null
      }
    }
  }
  return { pairs, unpairedIn: currentIn }
}

function sumHours(pairs) {
  return (pairs || []).reduce((s, p) => s + Number(p.durationHours || 0), 0)
}

async function resolveStaffIdFromRequest(req) {
  const userId = String(req.userId || req.user?.userId || req.user?.sub || '').trim()
  if (!userId) return ''
  const staffRes = await query('SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId })
  return String(staffRes.recordset?.[0]?.StaffId || '').trim()
}

const postTimeLog = asyncHandler(async (req, res) => {
  const staffId = await resolveStaffIdFromRequest(req)
  if (!staffId) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }

  const type = String((req.body && req.body.type) || '').trim().toUpperCase()
  if (!type || (type !== 'IN' && type !== 'OUT')) {
    res.status(400).json({ ok: false, error: 'Invalid type (IN or OUT expected)' })
    return
  }

  const note = String((req.body && req.body.note) || '').trim()
  const at = req.body && req.body.at ? new Date(req.body.at) : new Date()

  // Prevent duplicate consecutive same-type entries
  const lastR = await query(
    `SELECT TOP 1 TimeLogId, Type, At FROM TimeLogs WHERE StaffId = @staffId ORDER BY At DESC`,
    { staffId }
  ).catch(() => ({ recordset: [] }))
  const last = (lastR.recordset || [])[0] || null
  if (last && String(last.Type || '').toUpperCase() === type) {
    res.status(409).json({ ok: false, error: 'Duplicate consecutive entry' })
    return
  }

  const timeLogId = newId()
  await query(
    `INSERT INTO TimeLogs (TimeLogId, StaffId, Type, At, Note)
     VALUES (@timeLogId, @staffId, @type, @at, @note)`,
    { timeLogId, staffId, type, at, note }
  )

  res.json({ ok: true, timeLogId, staffId, type, at, note })
})

const getToday = asyncHandler(async (req, res) => {
  const staffId = await resolveStaffIdFromRequest(req)
  if (!staffId) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const nextDay = new Date(todayStart); nextDay.setDate(nextDay.getDate() + 1)

  const r = await query(
    `SELECT TimeLogId, StaffId, Type, At, Note FROM TimeLogs WHERE StaffId = @staffId AND At >= @todayStart AND At < @nextDay ORDER BY At ASC`,
    { staffId, todayStart, nextDay }
  ).catch(() => ({ recordset: [] }))

  const rows = r.recordset || []
  const { pairs, unpairedIn } = computePairsFromLogs(rows)
  const totalHours = sumHours(pairs)

  res.json({ ok: true, today: { pairs, unpairedIn, totalHours, raw: rows } })
})

const getWeek = asyncHandler(async (req, res) => {
  const staffId = await resolveStaffIdFromRequest(req)
  if (!staffId) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  const today = new Date(); today.setHours(0,0,0,0)
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6)
  const nextDay = new Date(today); nextDay.setDate(today.getDate() + 1)

  const r = await query(
    `SELECT TimeLogId, StaffId, Type, At, Note FROM TimeLogs WHERE StaffId = @staffId AND At >= @weekStart AND At < @nextDay ORDER BY At ASC`,
    { staffId, weekStart, nextDay }
  ).catch(() => ({ recordset: [] }))

  const rows = r.recordset || []
  const byDate = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    const key = d.toISOString().slice(0,10)
    byDate[key] = []
  }

  for (const rrow of rows) {
    const key = (new Date(rrow.At)).toISOString().slice(0,10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(rrow)
  }

  const list = Object.keys(byDate).sort().map(dateKey => {
    const { pairs } = computePairsFromLogs(byDate[dateKey])
    return { date: dateKey, pairs, totalHours: sumHours(pairs) }
  })

  res.json({ ok: true, week: list })
})

const getMonthSummary = asyncHandler(async (req, res) => {
  const staffId = await resolveStaffIdFromRequest(req)
  if (!staffId) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Use Attendance Report aggregation for total hours to keep consistency with owner reports
  try {
    const toIsoDateOnly = (d) => {
      const dt = new Date(d)
      const y = dt.getFullYear()
      const m = String(dt.getMonth() + 1).padStart(2, '0')
      const day = String(dt.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const startDateText = toIsoDateOnly(monthStart)
    const endDateText = toIsoDateOnly(new Date(nextMonth.getTime() - 1))
    const attendanceRows = await attendanceService.getAttendanceReport(undefined, startDateText, endDateText)
    const myRow = (attendanceRows || []).find(r => String(r.StaffId || r.StaffIdText || '').trim() === String(staffId).trim()) || null

    // Keep daysWorked and onTimePercent from local calculation for UI richness
    const r = await query(
      `SELECT TimeLogId, StaffId, Type, At, Note FROM TimeLogs WHERE StaffId = @staffId AND At >= @monthStart AND At < @nextMonth ORDER BY At ASC`,
      { staffId, monthStart, nextMonth }
    ).catch(() => ({ recordset: [] }))

    const rows = r.recordset || []
    const byDate = {}
    for (const row of rows) {
      const key = (new Date(row.At)).toISOString().slice(0,10)
      byDate[key] = byDate[key] || []
      byDate[key].push(row)
    }

    let daysWorked = 0
    let daysWithPair = 0
    for (const k of Object.keys(byDate)) {
      const { pairs } = computePairsFromLogs(byDate[k])
      if ((pairs || []).length > 0) {
        daysWorked++
        daysWithPair++
      }
    }

    const daysInMonth = (new Date(now.getFullYear(), now.getMonth()+1, 0)).getDate()
    const onTimePercent = daysInMonth ? Math.round((daysWithPair / daysInMonth) * 100) : 0

    const totalHours = myRow ? Number(myRow.TotalHours || 0) : 0
    res.json({ ok: true, month: { daysWorked, totalHours: Math.round(totalHours * 10)/10, onTimePercent } })
  } catch (err) {
    console.error('[getMonthSummary] attendance error:', err && err.message)
    res.status(500).json({ ok: false, error: 'Unable to compute month summary' })
  }
})

const getLatest = asyncHandler(async (req, res) => {
  const staffId = await resolveStaffIdFromRequest(req)
  if (!staffId) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }

  const r = await query(
    `SELECT TOP 1 TimeLogId, StaffId, Type, At, Note
     FROM TimeLogs
     WHERE StaffId = @staffId
     ORDER BY At DESC`,
    { staffId }
  )

  const row = (r.recordset || [])[0] || null
  res.json({ ok: true, latest: row })
})

module.exports = { postTimeLog, getLatest, getToday, getWeek, getMonthSummary }
