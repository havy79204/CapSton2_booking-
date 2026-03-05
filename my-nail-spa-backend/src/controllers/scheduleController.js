const { z } = require('zod')
const svc = require('../services/scheduleService')

function assertCanAccessStaff(req, staffId) {
  const role = req.user?.role
  if (role === 'admin') return
  if (role === 'staff') {
    if (String(req.user?.id || '') !== String(staffId || '')) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }
    return
  }
}

async function getAvailability(req, res, next) {
  try {
    const staffId = String(req.query.staffId || '').trim()
    const weekStartISO = svc.parseWeekStartISO(req.query.weekStartISO)
    const startHour = Number(req.query.startHour || 9)
    const endHour = Number(req.query.endHour || 23)

    if (!staffId) return res.status(400).json({ error: 'staffId is required' })
    if (!weekStartISO) return res.status(400).json({ error: 'weekStartISO is required' })

    if (req.user.role === 'owner') await svc.getUserSettings?.(req, staffId) // no-op placeholder
    if (req.user.role === 'staff') assertCanAccessStaff(req, staffId)

    const row = await svc.getAvailability(weekStartISO, staffId)
    if (!row) {
      const hours = Math.max(1, endHour - startHour)
      return res.json({ item: { weekStartISO, staffId, startHour, endHour, slots: Array.from({ length: 7 * hours }, () => false), updatedAt: null } })
    }

    let slots
    try { slots = JSON.parse(row.SlotsJson || '[]') } catch { slots = [] }

    res.json({ item: { weekStartISO, staffId, startHour: row.StartHour, endHour: row.EndHour, slots: Array.isArray(slots) ? slots : [], updatedAt: row.UpdatedAt } })
  } catch (err) { next(err) }
}

async function autoGenerate(req, res, next) {
  try {
    const body = z.object({ weekStartISO: z.string().optional(), requiredPerSlot: z.number().int().min(1).optional() }).parse(req.body || {})
    const todayISO = new Date().toISOString().slice(0, 10)
    const weekStartISO = body.weekStartISO ? svc.weekStartFromISO(body.weekStartISO) : svc.weekStartFromISO(todayISO)
    if (!weekStartISO) return res.status(400).json({ error: 'Invalid weekStartISO' })

    const { json, stdout, stderr } = await svc.autoGenerateSchedule({ weekStartISO, requiredPerSlot: body.requiredPerSlot })

    // persist shifts based on assignments
    const assignments = json.assignments || {}
    const staffRows = await svc.getActiveStaffBySalon?.apply?.(null, []) // no-op fallback
    // instead let repo be used in service for staffMap
    // Service already returns json; controllers handle response
    res.json({ ok: true, stdout, stderr })
  } catch (err) { next(err) }
}

async function putAvailability(req, res, next) {
  try {
    const body = z.object({ weekStartISO: z.string().min(10), staffId: z.string().min(1), startHour: z.number().int().min(0).max(23).default(9), endHour: z.number().int().min(1).max(24).default(23), slots: z.array(z.boolean()) }).parse(req.body)
    const weekStartISO = svc.parseWeekStartISO(body.weekStartISO)
    if (!weekStartISO) return res.status(400).json({ error: 'Invalid weekStartISO' })
    if (req.user.role !== 'admin') {
      const mySalonId = String(req.user?.salonId || '').trim()
      if (!mySalonId || mySalonId !== body.salonId) return res.status(403).json({ error: 'Forbidden' })
    }
    if (req.user.role === 'owner') await svc.getUserSettings?.(req, body.staffId) // placeholder

    await svc.upsertAvailability(weekStartISO, body.staffId, body.startHour, body.endHour, body.slots)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

async function publicAvailability(req, res, next) {
  try {
    const salonId = String(req.query.salonId || '').trim()
    const dateISO = String(req.query.dateISO || '').slice(0, 10)
    if (!salonId) return res.status(400).json({ error: 'salonId is required' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return res.status(400).json({ error: 'dateISO is required (YYYY-MM-DD)' })

    const items = await svc.getPublicAvailabilityForDate(salonId, dateISO)
    res.json({ items })
  } catch (err) { next(err) }
}

async function listShifts(req, res, next) {
  try {
    const salonId = String(req.query.salonId || '').trim()
    const weekStartISO = svc.parseWeekStartISO(req.query.weekStartISO)
    if (!salonId) return res.status(400).json({ error: 'salonId is required' })
    if (!weekStartISO) return res.status(400).json({ error: 'weekStartISO is required' })
    const items = await svc.listShifts(salonId, weekStartISO)
    res.json({ items })
  } catch (err) { next(err) }
}

async function postShift(req, res, next) {
  try {
    const body = z.object({ weekStartISO: z.string().min(10), salonId: z.string().min(1), staffId: z.string().min(1), staffName: z.string().optional(), dayIndex: z.number().int().min(0).max(6), startHour: z.number().int().min(0).max(23), durationHours: z.number().int().min(1).max(24), note: z.string().optional() }).parse(req.body)
    if (req.user.role !== 'admin') {
      const mySalonId = String(req.user?.salonId || '').trim()
      if (!mySalonId || mySalonId !== body.salonId) return res.status(403).json({ error: 'Forbidden' })
    }
    if (req.user.role === 'owner') await svc.getUserSettings?.(req, body.staffId)
    const r = await svc.insertStaffShift({ weekStartDate: svc.parseWeekStartISO(body.weekStartISO), salonId: body.salonId, staffId: body.staffId, staffName: body.staffName, dayIndex: body.dayIndex, startHour: body.startHour, durationHours: body.durationHours, note: body.note })
    res.status(201).json({ item: r })
  } catch (err) { next(err) }
}

async function patchShift(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const body = z.object({ staffName: z.string().optional(), note: z.string().optional() }).parse(req.body)
    const existing = await svc.getShift(id)
    if (!existing) return res.status(404).json({ error: 'Shift not found' })
    if (req.user.role !== 'admin') {
      const mySalonId = String(req.user?.salonId || '').trim()
      if (!mySalonId || mySalonId !== String(existing.SalonId || '').trim()) return res.status(403).json({ error: 'Forbidden' })
    }
    const updated = await svc.patchShift(id, body)
    res.json({ item: updated })
  } catch (err) { next(err) }
}

async function deleteShift(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const existing = await svc.getShift(id)
    if (!existing) return res.json({ ok: true })
    if (req.user.role !== 'admin') {
      const mySalonId = String(req.user?.salonId || '').trim()
      if (!mySalonId || mySalonId !== String(existing.SalonId || '').trim()) return res.status(403).json({ error: 'Forbidden' })
    }
    await svc.deleteShift(id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { getAvailability, autoGenerate, putAvailability, publicAvailability, listShifts, postShift, patchShift, deleteShift }
