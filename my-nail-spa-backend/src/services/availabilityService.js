const { query } = require('../config/query')

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

function generateTimeSlots(startHour = 9, endHour = 19, stepMinutes = 30) {
  const slots = []
  let currentMinutes = startHour * 60
  const endMinutes = endHour * 60

  while (currentMinutes < endMinutes) {
    const h = Math.floor(currentMinutes / 60)
    const m = currentMinutes % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    currentMinutes += stepMinutes
  }

  return slots
}

async function getServiceDurations(salonId, serviceIds) {
  if (!Array.isArray(serviceIds) || !serviceIds.length) return { durations: new Map(), total: 60 }

  const ids = serviceIds.map((_, idx) => `@sid${idx}`).join(',')
  const bind = { salonId }
  serviceIds.forEach((id, idx) => { bind[`sid${idx}`] = id })

  const result = await query(
    `SELECT ServiceTypeId, DurationMin FROM dbo.SalonServices 
     WHERE SalonId=@salonId AND ServiceTypeId IN (${ids})`,
    bind,
  )

  const map = new Map()
  let total = 0
  for (const r of result.recordset) {
    const dur = Number(r.DurationMin || 0)
    map.set(r.ServiceTypeId, dur)
    total += dur
  }

  // For missing services, use default
  const missingIds = serviceIds.filter((id) => !map.has(id))
  missingIds.forEach(id => {
    map.set(id, 30)
    total += 30
  })

  return { durations: map, total: total || 60 }
}

async function getTechnicianWorkingHours({ salonId, technicianId, dateISO }) {
  const weekStartISO = getWeekStartISO(dateISO)
  if (!weekStartISO) return { shifts: [], startHour: 9, endHour: 19 }

  const dayIndex = (() => {
    const d = new Date(`${dateISO}T00:00:00Z`)
    const day = d.getUTCDay()
    return (day + 6) % 7 // 0=Mon, 1=Tue, ..., 6=Sun
  })()

  const shifts = await query(
    `SELECT DayIndex, StartHour, DurationHours
     FROM dbo.StaffShifts
     WHERE SalonId=@salonId AND StaffId=@staffId
       AND (WeekStartDate=@weekStartDate OR WeekStartDate=DATEADD(DAY, -1, @weekStartDate))
       AND DayIndex=@dayIndex`,
    { weekStartDate: weekStartISO, salonId, staffId: technicianId, dayIndex },
  )

  const dayShifts = shifts.recordset || []
  
  if (!dayShifts.length) {
    return { shifts: [], startHour: 9, endHour: 19, workingSlots: [] }
  }

  const startHour = Math.min(...dayShifts.map((sh) => Number(sh.StartHour)))
  const endHour = Math.max(...dayShifts.map((sh) => Number(sh.StartHour) + Number(sh.DurationHours || 0)))

  // Generate all working time slots
  const workingSlots = []
  for (const sh of dayShifts) {
    const startH = Number(sh.StartHour)
    const dur = Number(sh.DurationHours || 0)
    if (!Number.isFinite(startH) || !Number.isFinite(dur) || dur <= 0) continue
    
    for (let h = startH; h < startH + dur; h += 1) {
      workingSlots.push(`${String(h).padStart(2, '0')}:00`)
      workingSlots.push(`${String(h).padStart(2, '0')}:30`)
    }
  }

  return { 
    shifts: dayShifts, 
    startHour: Number.isFinite(startHour) ? startHour : 9, 
    endHour: Number.isFinite(endHour) ? endHour : 19,
    workingSlots: Array.from(new Set(workingSlots)).sort()
  }
}

async function getExistingBookings({ salonId, dateISO, technicianId }) {
  const dateISO10 = String(dateISO || '').slice(0, 10)

  let sql = `
    SELECT b.BookingId, b.TimeSlot, b.TechnicianId, b.Status
    FROM dbo.Bookings b
    WHERE b.SalonId=@salonId AND b.DateISO=@dateISO
      AND (b.Status IS NULL OR LTRIM(RTRIM(LOWER(b.Status))) <> N'cancelled')
  `
  
  const bind = { salonId, dateISO: dateISO10 }

  if (technicianId) {
    sql += ' AND b.TechnicianId=@technicianId'
    bind.technicianId = technicianId
  }

  const result = await query(sql, bind)

  const bookings = []
  for (const row of result.recordset) {
    if (!row.TimeSlot) continue

    // Get services for this booking
    const svcRes = await query(
      'SELECT ServiceTypeId FROM dbo.BookingServices WHERE BookingId=@id', 
      { id: row.BookingId }
    )
    const serviceIds = svcRes.recordset.map((x) => x.ServiceTypeId)
    const { total } = await getServiceDurations(salonId, serviceIds)
    
    bookings.push({
      id: row.BookingId,
      timeSlot: row.TimeSlot,
      technicianId: row.TechnicianId,
      duration: total > 0 ? total : 60,
      startMinutes: toMinutes(row.TimeSlot),
      endMinutes: toMinutes(row.TimeSlot) + (total > 0 ? total : 60)
    })
  }

  return bookings
}

function isTimeSlotAvailable({ slot, durationMin, existingBookings, workingSlots }) {
  const slotStart = toMinutes(slot)
  const slotEnd = slotStart + durationMin

  // Check if slot is within working hours
  if (workingSlots && workingSlots.length > 0 && !workingSlots.includes(slot)) {
    return { available: false, reason: 'outside_working_hours' }
  }

  // Check overlap with existing bookings
  for (const booking of existingBookings) {
    if (slotStart < booking.endMinutes && slotEnd > booking.startMinutes) {
      return { available: false, reason: 'already_booked', bookingId: booking.id }
    }
  }

  // Check if service duration fits within working hours
  if (workingSlots && workingSlots.length > 0) {
    const lastWorkingSlot = workingSlots[workingSlots.length - 1]
    const lastWorkingMinutes = toMinutes(lastWorkingSlot) + 30 // Add half hour to get end time
    
    if (slotEnd > lastWorkingMinutes) {
      return { available: false, reason: 'exceeds_working_hours' }
    }
  }

  return { available: true }
}

/**
 * Get time slot availability for booking
 * @param {Object} params
 * @param {string} params.salonId - Salon ID
 * @param {string} params.dateISO - Date in ISO format (YYYY-MM-DD)
 * @param {string} params.technicianId - Technician ID (optional, 'auto' for any)
 * @param {string[]} params.serviceIds - Array of service IDs
 * @returns {Promise<Object>} Availability data
 */
async function getTimeSlotAvailability({ salonId, dateISO, technicianId, serviceIds = [] }) {
  const dateISO10 = String(dateISO || '').slice(0, 10)
  
  // Get service duration
  const { total: totalDuration } = await getServiceDurations(salonId, serviceIds)
  const durationMin = totalDuration > 0 ? totalDuration : 60

  let availableSlots = []
  let unavailableSlots = []

  if (!technicianId || technicianId === 'auto') {
    // Get all technicians for the salon
    const techResult = await query(
      'SELECT UserId, Name FROM dbo.Users WHERE SalonId=@salonId AND LOWER(RoleKey)=N\'staff\'',
      { salonId }
    )
    
    const technicians = techResult.recordset || []
    
    // Generate base time slots (9 AM to 7 PM)
    const allSlots = generateTimeSlots(9, 19, 30)
    
    // For each slot, check if ANY technician is available
    for (const slot of allSlots) {
      let anyTechAvailable = false
      
      for (const tech of technicians) {
        const { workingSlots } = await getTechnicianWorkingHours({
          salonId,
          technicianId: tech.UserId,
          dateISO: dateISO10
        })
        
        const bookings = await getExistingBookings({
          salonId,
          dateISO: dateISO10,
          technicianId: tech.UserId
        })
        
        const result = isTimeSlotAvailable({
          slot,
          durationMin,
          existingBookings: bookings,
          workingSlots
        })
        
        if (result.available) {
          anyTechAvailable = true
          break
        }
      }
      
      if (anyTechAvailable) {
        availableSlots.push(slot)
      } else {
        unavailableSlots.push({ slot, reason: 'all_technicians_busy' })
      }
    }
  } else {
    // Specific technician selected
    const { workingSlots, startHour, endHour } = await getTechnicianWorkingHours({
      salonId,
      technicianId,
      dateISO: dateISO10
    })
    
    const bookings = await getExistingBookings({
      salonId,
      dateISO: dateISO10,
      technicianId
    })
    
    const allSlots = generateTimeSlots(startHour, endHour, 30)
    
    for (const slot of allSlots) {
      const result = isTimeSlotAvailable({
        slot,
        durationMin,
        existingBookings: bookings,
        workingSlots
      })
      
      if (result.available) {
        availableSlots.push(slot)
      } else {
        unavailableSlots.push({ slot, ...result })
      }
    }
  }

  return {
    salonId,
    dateISO: dateISO10,
    technicianId: technicianId || 'auto',
    serviceDuration: durationMin,
    availableSlots,
    unavailableSlots: unavailableSlots.map(u => u.slot),
    unavailableDetails: unavailableSlots
  }
}

module.exports = {
  getTimeSlotAvailability,
  toMinutes,
  getWeekStartISO,
  generateTimeSlots,
  getServiceDurations,
  getTechnicianWorkingHours,
  getExistingBookings,
  isTimeSlotAvailable
}
