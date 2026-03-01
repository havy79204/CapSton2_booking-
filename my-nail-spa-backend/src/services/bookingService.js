const { z } = require('zod')
const { query, newId } = require('../config/query')
const bookingRepo = require('../repositories/bookingRepository')
const { sendNotificationNow, scheduleNotification } = require('../routes/notifications')
const { applyGiftCardForAmount, ensureGiftCardTables } = require('../routes/giftcards')

const DEFAULT_START_HOUR = 9
const DEFAULT_END_HOUR = 18

function toMinutes(time) {
  if (time instanceof Date) {
    const h = time.getUTCHours()
    const m = time.getUTCMinutes()
    return h * 60 + m
  }
  const str = String(time || '00:00')
  if (str.includes('T')) {
    const d = new Date(str)
    if (!Number.isNaN(d.getTime())) {
      const h = d.getUTCHours()
      const m = d.getUTCMinutes()
      return h * 60 + m
    }
  }
  const [h, m] = str.split(':').map((v) => Number(v) || 0)
  return h * 60 + m
}

function getWeekStartISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDay()
  const diffToMonday = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  return d.toISOString().slice(0, 10)
}

async function getAllowedSlotsForStaffDay({ staffId, dateISO, salonId }) {
  const weekStartISO = getWeekStartISO(dateISO)
  if (!weekStartISO) return { allowedSlots: [], startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR }

  const shifts = await query(
    `SELECT DayIndex, StartHour, DurationHours
     FROM dbo.StaffShifts
     WHERE SalonId=@salonId AND StaffId=@staffId
       AND (WeekStartDate=@weekStartDate OR WeekStartDate=DATEADD(DAY, -1, @weekStartDate))`,
    { weekStartDate: weekStartISO, salonId, staffId },
  )

  const dayIndex = (() => {
    const d = new Date(`${dateISO}T00:00:00Z`)
    const day = d.getUTCDay()
    return (day + 6) % 7
  })()

  const dayShifts = shifts.recordset.filter((sh) => Number(sh.DayIndex) === dayIndex)
  if (!dayShifts.length) {
    return { allowedSlots: [], startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR }
  }

  const shiftSlots = []
  const startHour = Math.min(...dayShifts.map((sh) => Number(sh.StartHour)))
  const endHour = Math.max(...dayShifts.map((sh) => Number(sh.StartHour) + Number(sh.DurationHours || 0)))

  for (const sh of dayShifts) {
    const startH = Number(sh.StartHour)
    const dur = Number(sh.DurationHours || 0)
    if (!Number.isFinite(startH) || !Number.isFinite(dur) || dur <= 0) continue
    for (let h = startH; h < startH + dur; h += 1) {
      shiftSlots.push(`${String(h).padStart(2, '0')}:00`)
      shiftSlots.push(`${String(h).padStart(2, '0')}:30`)
    }
  }

  const allowedSlots = Array.from(new Set(shiftSlots)).sort()

  return { allowedSlots, startHour: Number.isFinite(startHour) ? startHour : DEFAULT_START_HOUR, endHour: Number.isFinite(endHour) ? endHour : DEFAULT_END_HOUR }
}

async function getServiceDurations(salonId, serviceIds) {
  if (!Array.isArray(serviceIds) || !serviceIds.length) return { durations: new Map(), total: 30 }

  const ids = serviceIds.map((_, idx) => `@sid${idx}`).join(',')
  const bind = { salonId }
  serviceIds.forEach((id, idx) => { bind[`sid${idx}`] = id })

  const result = await query(
    `SELECT ServiceTypeId, DurationMin FROM dbo.SalonServices WHERE SalonId=@salonId AND ServiceTypeId IN (${ids})`,
    bind,
  )

  const map = new Map()
  let total = 0
  for (const r of result.recordset) {
    const dur = Number(r.DurationMin || 0)
    map.set(r.ServiceTypeId, dur)
    total += dur
  }

  const missingIds = serviceIds.filter((id) => !map.has(id))
  if (missingIds.length) {
    const mIds = missingIds.map((_, idx) => `@mid${idx}`).join(',')
    const bindMissing = {}
    missingIds.forEach((id, idx) => { bindMissing[`mid${idx}`] = id })
    const fallback = await query(
      `SELECT ServiceTypeId, DefaultDurationMin FROM dbo.ServiceTypes WHERE ServiceTypeId IN (${mIds})`,
      bindMissing,
    )
    for (const r of fallback.recordset) {
      const dur = Number(r.DefaultDurationMin || 0)
      map.set(r.ServiceTypeId, dur)
      total += dur
    }
    const stillMissing = missingIds.filter((id) => !map.has(id)).length
    total += stillMissing * 30
  }

  return { durations: map, total: total || 30 }
}

async function hasOverlapBooking({ salonId, dateISO, technicianId, startMin, endMin }) {
  if (!technicianId) return false

  const dateISO10 = String(dateISO || '').slice(0, 10)

  const result = await query(
    `SELECT BookingId, TimeSlot, Status FROM dbo.Bookings
     WHERE SalonId=@salonId AND DateISO=@dateISO AND TechnicianId=@technicianId
       AND (Status IS NULL OR LTRIM(RTRIM(LOWER(Status))) <> N'cancelled')`,
    { salonId, dateISO: dateISO10, technicianId },
  )

  for (const row of result.recordset) {
    if (!row.TimeSlot) continue
    const svcRes = await query('SELECT ServiceTypeId FROM dbo.BookingServices WHERE BookingId=@id', { id: row.BookingId })
    const { total } = await getServiceDurations(salonId, svcRes.recordset.map((x) => x.ServiceTypeId))
    const durationMin = total > 0 ? total : 90
    const bStart = toMinutes(row.TimeSlot)
    const bEnd = bStart + durationMin
    if (Number.isFinite(bStart) && Number.isFinite(bEnd) && startMin < bEnd && endMin > bStart) return true
  }

  return false
}

let _hasGiftColumns = null
async function ensureBookingGiftColumns() {
  if (_hasGiftColumns !== null) return _hasGiftColumns
  try {
    const r1 = await query("SELECT COL_LENGTH('dbo.Bookings', 'GiftCardCode') AS Len")
    const r2 = await query("SELECT COL_LENGTH('dbo.Bookings', 'GiftCardApplied') AS Len")
    const hasCode = Boolean(r1?.recordset?.[0]?.Len)
    const hasApplied = Boolean(r2?.recordset?.[0]?.Len)
    if (!hasCode) {
      await query("ALTER TABLE dbo.Bookings ADD GiftCardCode NVARCHAR(64) NULL")
    }
    if (!hasApplied) {
      await query("ALTER TABLE dbo.Bookings ADD GiftCardApplied MONEY NULL DEFAULT 0")
    }
    _hasGiftColumns = true
  } catch {
    _hasGiftColumns = false
  }
  return _hasGiftColumns
}

function normSku(s) {
  return String(s || '').trim().replace(/\s+/g, '-').toUpperCase()
}

async function ensureInventoryItem({ salonKey, salonId, sku, name, type = 'pro', uom = 'each' } = {}) {
  const existing = await query('SELECT TOP 1 * FROM dbo.InventoryItems WHERE SalonKey=@salonKey AND SKU=@sku', { salonKey, sku })
  if (existing.recordset.length) return existing.recordset[0]

  const id = newId()
  await query(
    `INSERT INTO dbo.InventoryItems(InventoryItemId, SalonKey, SalonId, SKU, Name, Type, Uom, QtyOnHand, Cost, SalePrice, MinStock, CreatedAt, UpdatedAt)
     VALUES(@id, @salonKey, @salonId, @sku, @name, @type, @uom, 0, 0, NULL, 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    {
      id,
      salonKey,
      salonId: salonId || null,
      sku,
      name: String(name || sku).trim() || sku,
      type,
      uom,
    },
  )

  const saved = await query('SELECT TOP 1 * FROM dbo.InventoryItems WHERE SalonKey=@salonKey AND SKU=@sku', { salonKey, sku })
  return saved.recordset[0]
}

async function recordInventoryTx({ salonKey, sku, qtyDelta, reason, refId, note } = {}) {
  const txId = newId()
  await query(
    `INSERT INTO dbo.InventoryTransactions(
      InventoryTxId, At, SalonKey, SKU, QtyDelta, Reason, RefId, Vendor, Note,
      PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
    ) VALUES(
      @id, SYSUTCDATETIME(), @salonKey, @sku, @qtyDelta, @reason, @refId, NULL, @note,
      N'system', NULL, N'Service consumption', NULL
    )`,
    {
      id: txId,
      salonKey,
      sku,
      qtyDelta,
      reason,
      refId: refId || null,
      note: note || null,
    },
  )

  await query(
    `UPDATE dbo.InventoryItems
     SET QtyOnHand = QtyOnHand + @qtyDelta,
         UpdatedAt = SYSUTCDATETIME()
     WHERE SalonKey=@salonKey AND SKU=@sku`,
    { salonKey, sku, qtyDelta },
  )
}

async function consumeInventoryForBooking(bookingId) {
  const bookingRes = await query('SELECT TOP 1 * FROM dbo.Bookings WHERE BookingId=@id', { id: bookingId })
  const booking = bookingRes.recordset[0]
  if (!booking) return { ok: false, error: 'Booking not found', status: 404 }
  if (booking.InventoryConsumedAt) return { ok: true, already: true }

  const salonKey = String(booking.SalonId || '').trim() || 'global'
  const salonId = salonKey === 'global' ? null : salonKey

  const svcRes = await query('SELECT ServiceTypeId FROM dbo.BookingServices WHERE BookingId=@id', { id: bookingId })
  const serviceIds = svcRes.recordset.map((x) => String(x.ServiceTypeId || '').trim()).filter(Boolean)
  if (!serviceIds.length) {
    await query('UPDATE dbo.Bookings SET InventoryConsumedAt=SYSUTCDATETIME() WHERE BookingId=@id', { id: bookingId })
    return { ok: true, already: false, consumed: [] }
  }

  const totals = new Map()
  const uoms = new Map()
  for (const sid of serviceIds) {
    const recipe = await query('SELECT SKU, Qty, Uom FROM dbo.ServiceRecipeLines WHERE ServiceTypeId=@id', { id: sid })
    for (const r of recipe.recordset) {
      const sku = normSku(r.SKU)
      const qty = Number(r.Qty || 0)
      const uom = String(r.Uom || '').trim() || 'each'
      if (!sku || !Number.isFinite(qty) || qty <= 0) continue
      totals.set(sku, (totals.get(sku) || 0) + qty)
      if (!uoms.has(sku)) uoms.set(sku, uom)
    }
  }

  const consumed = []
  for (const [sku, qty] of totals.entries()) {
    await ensureInventoryItem({ salonKey, salonId, sku, name: sku, type: 'pro', uom: uoms.get(sku) || 'each' })
    await recordInventoryTx({ salonKey, sku, qtyDelta: -qty, reason: 'SERVICE_CONSUMPTION', refId: bookingId, note: 'Booking completed' })
    consumed.push({ sku, qty })
  }

  await query('UPDATE dbo.Bookings SET InventoryConsumedAt=SYSUTCDATETIME() WHERE BookingId=@id', { id: bookingId })
  return { ok: true, already: false, consumed }
}

function parseBookingDateTime(booking) {
  const dateISO = String(booking?.dateISO || booking?.DateISO || '').slice(0, 10)
  const timeSlot = String(booking?.timeSlot || booking?.TimeSlot || '')
  if (!dateISO || !timeSlot) return null
  const time = timeSlot.length === 5 ? `${timeSlot}:00` : timeSlot
  const iso = `${dateISO}T${time}Z`
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

async function maybeNotifyBookingCreated(booking, { user, leadMinutes = 60 } = {}) {
  try {
    const userId = user?.id || null
    const email = user?.email || null
    const salonName = booking.salonName || booking.salonId || 'Salon'
    const title = 'Booking created successfully'
    const body = `Your booking at ${salonName} on ${booking.dateISO} at ${booking.timeSlot} has been created.`

    await sendNotificationNow({
      userId,
      bookingId: booking.id,
      title,
      body,
      type: 'booking_created',
      channel: 'in-app',
      sendEmail: !!email,
      email,
    })

    const dt = parseBookingDateTime(booking)
    if (!dt || !Number.isFinite(leadMinutes)) return
    const reminderAt = new Date(dt.getTime() - leadMinutes * 60 * 1000)
    scheduleNotification({
      when: reminderAt,
      userId,
      bookingId: booking.id,
      title: 'Booking reminder',
      body: `Reminder: booking at ${salonName} at ${booking.timeSlot} on ${booking.dateISO}.`,
      type: 'booking_reminder',
      channel: 'in-app',
      sendEmail: !!email,
      email,
      skipIfCancelled: true,
    })
  } catch {
    // ignore notification errors to not block booking creation
  }
}

function mapBookingRow(r, serviceIds) {
  return {
    id: r.BookingId,
    createdAt: r.CreatedAt,
    status: r.Status,
    inventoryConsumedAt: r.InventoryConsumedAt,

    salonId: r.SalonId,
    salonName: r.SalonName,

    dateISO: r.DateISO,
    timeSlot: r.TimeSlot,

    technicianId: r.TechnicianId,
    technicianName: r.TechnicianName,

    totalPrice: Number(r.TotalPrice),
    giftCard: r.GiftCardCode
      ? {
          code: r.GiftCardCode,
          applied: Number(r.GiftCardApplied || 0),
        }
      : null,

    customerName: r.CustomerName,
    customerPhone: r.CustomerPhone,

    serviceIds: serviceIds || [],
  }
}

async function listBookings(filters) {
  const rows = await bookingRepo.findBookings(filters)
  const items = []
  for (const r of rows) {
    const s = await bookingRepo.getServicesForBooking(r.BookingId)
    items.push(mapBookingRow(r, s))
  }
  return items
}

async function getBooking(id) {
  const row = await bookingRepo.findById(id)
  if (!row) return null
  const s = await bookingRepo.getServicesForBooking(id)
  return mapBookingRow(row, s)
}

async function createBookingRecord(body, { statusOverride, user, leadMinutes } = {}) {
  const payload = z
    .object({
      salonId: z.string().min(1),
      salonName: z.string().nullish().optional(),
      dateISO: z.string().min(8),
      timeSlot: z.string().min(4),
      technicianId: z.string().nullish().optional(),
      technicianName: z.string().nullish().optional(),
      serviceIds: z.array(z.string()).default([]),
      totalPrice: z.number().nonnegative().optional(),
      customerName: z.string().min(1),
      customerPhone: z.string().nullish().optional(),
      giftCode: z.string().optional(),
    })
    .parse(body)

  const techId = payload.technicianId && payload.technicianId !== 'auto' ? payload.technicianId : null
  const dateISO10 = String(payload.dateISO || '').slice(0, 10)

  if (techId) {
    const { total: durationMin } = await getServiceDurations(payload.salonId, payload.serviceIds)
    const slotStart = toMinutes(payload.timeSlot)
    const slotEnd = slotStart + durationMin

    const { allowedSlots, endHour } = await getAllowedSlotsForStaffDay({ staffId: techId, dateISO: dateISO10, salonId: payload.salonId })
    if (!allowedSlots.includes(payload.timeSlot)) {
      const err = new Error('Technician is not working at this time.')
      err.status = 400
      throw err
    }

    if (slotEnd > endHour * 60) {
      const err = new Error('Service exceeds technician working hours.')
      err.status = 400
      throw err
    }

    const overlap = await hasOverlapBooking({
      salonId: payload.salonId,
      dateISO: payload.dateISO,
      technicianId: techId,
      startMin: slotStart,
      endMin: slotEnd,
    })
    if (overlap) {
      const err = new Error('Technician already has a booking during this time.')
      err.status = 400
      throw err
    }
  }

  const id = newId()

  await ensureGiftCardTables()
  await ensureBookingGiftColumns()

  let giftApplied = 0
  let giftCode = null
  if (payload.giftCode) {
    const result = await applyGiftCardForAmount({
      code: payload.giftCode,
      amount: payload.totalPrice || 0,
      commit: true,
      refType: 'booking',
      refId: id,
      user,
    })
    giftApplied = Number(result.applied || 0)
    giftCode = payload.giftCode
  }

  const safeTotalPrice = Math.max(0, (payload.totalPrice || 0) - giftApplied)

  await bookingRepo.insertBooking({
    id,
    status: statusOverride || 'Pending',
    salonId: payload.salonId,
    salonName: payload.salonName || null,
    dateISO: dateISO10,
    timeSlot: payload.timeSlot || null,
    technicianId: techId || null,
    technicianName: payload.technicianName || (techId ? null : 'Auto-assign'),
    totalPrice: safeTotalPrice,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone || null,
    giftCardCode: giftCode,
    giftCardApplied: giftApplied,
  })

  await bookingRepo.insertBookingServices(id, payload.serviceIds || [])

  const row = await query('SELECT TOP 1 * FROM dbo.Bookings WHERE BookingId=@id', { id })
  const booking = mapBookingRow(row.recordset[0], payload.serviceIds)

  await maybeNotifyBookingCreated(booking, { user, leadMinutes })

  return booking
}

async function updateBookingStatus(id, status) {
  await bookingRepo.updateBookingStatus(id, status)
  if (String(status || '').toLowerCase() === 'completed') {
    const r = await consumeInventoryForBooking(id)
    if (!r.ok) {
      return { error: r.error, status: r.status }
    }
  }
  return getBooking(id)
}

async function cancelBooking(id) {
  const row = await bookingRepo.findById(id)
  if (!row) throw Object.assign(new Error('Booking not found'), { status: 404 })
  const currentStatus = String(row.Status || '').trim().toLowerCase()
  if (currentStatus === 'completed') throw Object.assign(new Error('Cannot cancel a completed booking'), { status: 400 })
  if (currentStatus === 'cancelled') throw Object.assign(new Error('Booking is already cancelled'), { status: 400 })

  await bookingRepo.updateBookingStatus(id, 'Cancelled')
  const updated = await bookingRepo.findById(id)
  const s = await bookingRepo.getServicesForBooking(id)
  return mapBookingRow(updated, s)
}

module.exports = {
  listBookings,
  getBooking,
  createBookingRecord,
  updateBookingStatus,
  cancelBooking,
  consumeInventoryForBooking,
}
