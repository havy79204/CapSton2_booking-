const repo = require('../repositories/scheduleRepository')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const { env } = require('../config/config')
const { newId, query } = require('../config/query')

const DEFAULT_START_HOUR = 9
const DEFAULT_END_HOUR = 18

function weekStartFromISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDay()
  const diffToMonday = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  return d.toISOString().slice(0, 10)
}

function groupConsecutiveHours(hoursList) {
  const sorted = Array.from(new Set(hoursList)).sort((a, b) => a - b)
  const groups = []
  let start = null
  let prev = null
  for (const h of sorted) {
    if (start === null) {
      start = h
      prev = h
      continue
    }
    if (h === prev + 1) {
      prev = h
      continue
    }
    groups.push({ startHour: start, duration: prev - start + 1 })
    start = h
    prev = h
  }
  if (start !== null) groups.push({ startHour: start, duration: prev - start + 1 })
  return groups
}

function parseWeekStartISO(iso) {
  const clean = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null
  return clean
}

function getWeekStartISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDay()
  const diffToMonday = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  return d.toISOString().slice(0, 10)
}

function halfHourSlots(startHour = 9, endHour = 18) {
  const slots = []
  for (let h = 0; h < 24; h += 1) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots.filter((s) => {
    const hour = Number(s.slice(0, 2))
    return hour >= startHour && hour < endHour
  })
}

function toMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map((v) => Number(v) || 0)
  return h * 60 + m
}

function buildOdbcConnectionString() {
  const driver = '{ODBC Driver 18 for SQL Server}'
  const serverPart = env.db.instanceName
    ? `${env.db.server}\\${env.db.instanceName},${env.db.port}`
    : `${env.db.server},${env.db.port}`
  const authPart = `Uid=${env.db.user};Pwd=${env.db.password};`
  const encryptPart = env.db.encrypt ? 'Encrypt=yes' : 'Encrypt=no'
  const trustPart = env.db.trustServerCertificate ? 'TrustServerCertificate=yes' : 'TrustServerCertificate=no'
  return `Driver=${driver};Server=${serverPart};Database=${env.db.database};${authPart}${encryptPart};${trustPart}`
}

async function getAvailability(weekStartISO, staffId) {
  return repo.getStaffAvailability(weekStartISO, staffId)
}

async function upsertAvailability(weekStartISO, staffId, startHour, endHour, slots) {
  const slotsJson = JSON.stringify(slots || [])
  await repo.upsertStaffAvailability(weekStartISO, staffId, startHour, endHour, slotsJson)
}

async function autoGenerateSchedule({ weekStartISO, requiredPerSlot = 3 }) {
  const aiRoot = process.env.AI_ROOT ? path.resolve(process.env.AI_ROOT) : path.resolve(__dirname, '../../AI')
  const pythonPath = process.env.AI_PYTHON || path.join(aiRoot, '.venv', 'Scripts', 'python.exe')
  const scriptPath = path.join(aiRoot, 'src', 'db_pipeline.py')
  const outPath = path.join(aiRoot, 'output', `schedule_${weekStartISO}_${Date.now()}.json`)

  const args = [scriptPath, '--conn', buildOdbcConnectionString(), '--week-start', weekStartISO, '--out', outPath, '--required', String(requiredPerSlot)]

  const runPy = () => new Promise((resolve, reject) => {
    execFile(pythonPath, args, { cwd: aiRoot }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout
        err.stderr = stderr
        return reject(err)
      }
      resolve({ stdout, stderr })
    })
  })

  if (!fs.existsSync(pythonPath)) throw Object.assign(new Error('Python interpreter for AI scheduler not found'), { code: 'NO_PY' })
  const { stdout, stderr } = await runPy()
  if (!fs.existsSync(outPath)) throw Object.assign(new Error('Scheduler did not produce output file'), { stdout, stderr })
  const raw = fs.readFileSync(outPath, 'utf-8')
  const json = JSON.parse(raw)
  return { json, stdout, stderr }
}

async function getPublicAvailabilityForDate(salonId, dateISO) {
  const weekStartISO = getWeekStartISO(dateISO)
  if (!weekStartISO) throw Object.assign(new Error('Invalid date'), { status: 400 })

  const staff = await repo.getActiveStaffBySalon(salonId)
  const shifts = await repo.getShiftsBySalonWeek(weekStartISO, salonId)
  const shiftsByStaff = new Map()
  for (const sh of shifts) {
    const key = String(sh.StaffId)
    if (!shiftsByStaff.has(key)) shiftsByStaff.set(key, [])
    shiftsByStaff.get(key).push(sh)
  }

  const dayIndex = (() => {
    const d = new Date(`${dateISO}T00:00:00Z`)
    const day = d.getUTCDay()
    return (day + 6) % 7
  })()

  const items = []
  for (const s of staff) {
    const staffShifts = shiftsByStaff.get(String(s.UserId)) || []
    const dayShifts = staffShifts.filter((sh) => Number(sh.DayIndex) === dayIndex)

    let startHour = DEFAULT_START_HOUR
    let endHour = DEFAULT_END_HOUR
    const shiftSlots = []

    if (dayShifts.length) {
      const minStart = Math.min(...dayShifts.map((sh) => Number(sh.StartHour)))
      const maxEnd = Math.max(...dayShifts.map((sh) => Number(sh.StartHour) + Number(sh.DurationHours || 0)))
      if (Number.isFinite(minStart)) startHour = minStart
      if (Number.isFinite(maxEnd)) endHour = maxEnd

      for (const sh of dayShifts) {
        const startH = Number(sh.StartHour)
        const dur = Number(sh.DurationHours || 0)
        if (!Number.isFinite(startH) || !Number.isFinite(dur) || dur <= 0) continue
        for (let h = startH; h < startH + dur; h += 1) {
          shiftSlots.push(`${String(h).padStart(2, '0')}:00`)
          shiftSlots.push(`${String(h).padStart(2, '0')}:30`)
        }
      }
    }

    const allowedSlots = Array.from(new Set(shiftSlots)).sort()
    if (allowedSlots.length === 0) continue

    items.push({ staffId: s.UserId, staffName: s.Name, startHour, endHour, allowedSlots })
  }

  return items
}

async function listShifts(salonId, weekStartISO) {
  const shifts = await repo.getShiftsBySalonWeek(weekStartISO, salonId)
  return shifts.map((r) => ({ id: r.ShiftId, weekStartISO: String(r.WeekStartDate).slice(0, 10), salonId: r.SalonId, staffId: r.StaffId, staffName: r.StaffName, dayIndex: r.DayIndex, startHour: r.StartHour, durationHours: r.DurationHours, note: r.Note, createdAt: r.CreatedAt }))
}

async function getShift(id) {
  return repo.getShiftById(id)
}

async function patchShift(id, body) {
  return repo.updateStaffShift(id, body)
}

async function deleteShift(id) {
  return repo.deleteShift(id)
}

module.exports = {
  weekStartFromISO,
  groupConsecutiveHours,
  parseWeekStartISO,
  getWeekStartISO,
  halfHourSlots,
  toMinutes,
  buildOdbcConnectionString,
  getAvailability,
  upsertAvailability,
  autoGenerateSchedule,
  getPublicAvailabilityForDate,
  listShifts,
  getShift,
  patchShift,
  deleteShift,
  insertStaffShift: repo.insertStaffShift,
  deleteStaffShiftsForWeek: repo.deleteStaffShiftsForWeek,
}
