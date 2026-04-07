const { query, newId } = require('../config/query')
const { toAppointmentListItem } = require('../models/appointment.model')
const { getSettingsMap } = require('./settings.service')
const { notifyCustomerEvent, notifyOwnerEvent } = require('./notifications.service')

function calculateCommission(revenue, tiers = {}) {
  const tierLow = tiers.CommissionTierLow !== undefined && tiers.CommissionTierLow !== null ? Number(tiers.CommissionTierLow) : (tiers.commissionTierLow !== undefined && tiers.commissionTierLow !== null ? Number(tiers.commissionTierLow) : 500000)
  const rateLow = tiers.CommissionRateLow !== undefined && tiers.CommissionRateLow !== null ? Number(tiers.CommissionRateLow) : (tiers.commissionRateLow !== undefined && tiers.commissionRateLow !== null ? Number(tiers.commissionRateLow) : 0.10)
  const tierHigh = tiers.CommissionTierHigh !== undefined && tiers.CommissionTierHigh !== null ? Number(tiers.CommissionTierHigh) : (tiers.commissionTierHigh !== undefined && tiers.commissionTierHigh !== null ? Number(tiers.commissionTierHigh) : 2000000)
  const rateHigh = tiers.CommissionRateHigh !== undefined && tiers.CommissionRateHigh !== null ? Number(tiers.CommissionRateHigh) : (tiers.commissionRateHigh !== undefined && tiers.commissionRateHigh !== null ? Number(tiers.commissionRateHigh) : 0.15)

  if (revenue >= tierHigh) {
    return revenue * rateHigh
  }
  if (revenue >= tierLow && revenue < tierHigh) {
    return revenue * rateLow
  }
  return 0
}

function normalizeAppointmentStatus(status) {
  const normalizedStatusInput = String(status || '').trim().toLowerCase()
  if (normalizedStatusInput === 'c' || normalizedStatusInput === 'pending') return 'Pending'
  if (normalizedStatusInput === 'completed' || normalizedStatusInput === 'complete' || normalizedStatusInput === 'done') return 'Completed'
  if (normalizedStatusInput === 'cancelled' || normalizedStatusInput === 'cancelled' || normalizedStatusInput === 'delete' || normalizedStatusInput === 'deleted') return 'Cancelled'
  if (normalizedStatusInput === 'booked' || normalizedStatusInput === 'confirmed' || normalizedStatusInput === 'confirm') return 'Booked'
  return status || 'Pending'
}

async function applyCommissionForCompletedBooking(bookingId, staffId) {
  try {
    let targetStaffId = staffId
    if (!targetStaffId) {
      const bookingRes = await query(
        `SELECT TOP 1 bs.StaffId
         FROM BookingServices bs
         WHERE bs.BookingId = @bookingId`,
        { bookingId }
      )
      targetStaffId = bookingRes.recordset?.[0]?.StaffId
    }

    if (!targetStaffId) {
      console.log(`[COMMISSION CALC] No staffId found for booking ${bookingId}, skip`)
      return
    }

    const settingsMap = await getSettingsMap()
    let commissionTiers = {}
    
    if (Array.isArray(settingsMap.CommissionTiers) && settingsMap.CommissionTiers.length > 0) {
      // Use new dynamic tiers if available
      const sortedTiers = settingsMap.CommissionTiers.sort((a, b) => (a.threshold || 0) - (b.threshold || 0))
      const tier1Threshold = sortedTiers[0].threshold !== undefined && sortedTiers[0].threshold !== null ? Number(sortedTiers[0].threshold) : 500000
      const tier1Rate = sortedTiers[0].rate !== undefined && sortedTiers[0].rate !== null ? Number(sortedTiers[0].rate) : 0.10
      const tier2Threshold = sortedTiers.length > 1 && sortedTiers[1].threshold !== undefined && sortedTiers[1].threshold !== null ? Number(sortedTiers[1].threshold) : tier1Threshold
      const tier2Rate = sortedTiers.length > 1 && sortedTiers[1].rate !== undefined && sortedTiers[1].rate !== null ? Number(sortedTiers[1].rate) : tier1Rate
      commissionTiers = {
        CommissionTierLow: tier1Threshold,
        CommissionRateLow: tier1Rate,
        CommissionTierHigh: tier2Threshold,
        CommissionRateHigh: tier2Rate,
      }
    } else {
      // Fallback to old format
      const tierLow = settingsMap.CommissionTierLow !== undefined && settingsMap.CommissionTierLow !== null ? Number(settingsMap.CommissionTierLow) : 500000
      const rateLow = settingsMap.CommissionRateLow !== undefined && settingsMap.CommissionRateLow !== null ? Number(settingsMap.CommissionRateLow) : 0.10
      const tierHigh = settingsMap.CommissionTierHigh !== undefined && settingsMap.CommissionTierHigh !== null ? Number(settingsMap.CommissionTierHigh) : 2000000
      const rateHigh = settingsMap.CommissionRateHigh !== undefined && settingsMap.CommissionRateHigh !== null ? Number(settingsMap.CommissionRateHigh) : 0.15
      commissionTiers = {
        CommissionTierLow: tierLow,
        CommissionRateLow: rateLow,
        CommissionTierHigh: tierHigh,
        CommissionRateHigh: rateHigh,
      }
    }

    const bookingServicesRes = await query(
      `SELECT bs.BookingServiceId, COALESCE(bs.Price, sv.Price, 0) AS Price
       FROM BookingServices bs
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE bs.BookingId = @bookingId`,
      { bookingId }
    )

    if (!bookingServicesRes.recordset || bookingServicesRes.recordset.length === 0) {
      console.log(`[COMMISSION CALC] No BookingServices for booking ${bookingId}, skip`)
      return
    }

    const staffRevenueRes = await query(
      `SELECT
        SUM(ISNULL(COALESCE(bs.Price, sv.Price), 0)) as TotalRevenue
       FROM BookingServices bs
      JOIN Bookings b ON b.BookingId = bs.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE bs.StaffId = @staffId
         AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')`,
      { staffId: targetStaffId }
    )

    const totalRevenue = Number(staffRevenueRes.recordset?.[0]?.TotalRevenue || 0)
    const totalCommissionAmount = calculateCommission(totalRevenue, commissionTiers)
    const commissionPercentage = totalRevenue > 0 ? (totalCommissionAmount / totalRevenue) : 0

    for (const bs of bookingServicesRes.recordset || []) {
      const commissionAmount = bs.Price * commissionPercentage
      await query(
        'UPDATE BookingServices SET CommissionAmount = @commissionAmount WHERE BookingServiceId = @bookingServiceId',
        {
          commissionAmount: commissionAmount > 0 ? Math.round(commissionAmount) : 0,
          bookingServiceId: bs.BookingServiceId,
        }
      )
    }
  } catch (err) {
    console.error('[appointments.service] Error calculating commission:', err.message)
    console.error('[appointments.service] Stack:', err.stack)
  }
}

async function listAppointments() {
  const result = await query(
    `SELECT 
    b.BookingId,
    b.CustomerUserId,
    b.BookingTime,
    b.Status AS BookingStatus,
    b.Notes,
    cu.Name AS CustomerName,

    -- SERVICE NAMES
    ISNULL((
        SELECT TOP 1 STUFF((
            SELECT ', ' + sv.Name
            FROM BookingServices bs2
            JOIN Services sv ON sv.ServiceId = bs2.ServiceId
            WHERE bs2.BookingId = b.BookingId
            ORDER BY sv.Name
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
    ), 'No Service') AS AllServices,

    -- SERVICE IDS
    ISNULL((
        SELECT STUFF((
            SELECT ',' + CAST(bs2.ServiceId AS NVARCHAR(50))
            FROM BookingServices bs2
            WHERE bs2.BookingId = b.BookingId
            ORDER BY bs2.ServiceId
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
    ), '') AS ServiceIds,

    -- TOTAL DURATION
    ISNULL((
        SELECT SUM(ISNULL(sv2.DurationMinutes, 0))
        FROM BookingServices bs3
        JOIN Services sv2 ON sv2.ServiceId = bs3.ServiceId
        WHERE bs3.BookingId = b.BookingId
    ), 30) AS TotalDuration,

    st.StaffId AS StaffIdResolved,
    su.Name AS StaffName

FROM Bookings b
LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
OUTER APPLY (
    SELECT TOP 1 StaffId FROM BookingServices WHERE BookingId = b.BookingId
) bs_ref
LEFT JOIN Staff st ON st.StaffId = bs_ref.StaffId
LEFT JOIN Users su ON su.UserId = st.UserId
ORDER BY b.BookingTime DESC`
  );

  // Phải map qua toAppointmentListItem để Frontend nhận đúng format
  return (result.recordset || []).map(row => {
    const mapped = toAppointmentListItem(row);

    return {
      ...mapped,
      serviceIds: row.ServiceIds
        ? row.ServiceIds.split(',').map(id => String(id).trim()).filter(Boolean)
        : []
    };
  });
}

async function createAppointment(payload) {
  const { customerUserId, serviceIds, staffId, date, time, notes, status } = payload || {}
  const statusToSave = normalizeAppointmentStatus(status)

if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
  throw new Error('At least one service is required')
}
  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }
  // ===== TÍNH TOTAL DURATION (NHIỀU SERVICE) =====
const services = await query(
  `SELECT DurationMinutes 
   FROM Services 
   WHERE ServiceId IN (${serviceIds.map((_, i) => `@id${i}`).join(',')})`,
  Object.fromEntries(serviceIds.map((id, i) => [`id${i}`, id]))
)

const totalDuration = services.recordset.reduce(
  (sum, s) => sum + (s.DurationMinutes || 0),
  0
)

const newStart = when
const newEnd = new Date(when.getTime() + totalDuration * 60000)

// ===== CHECK TRÙNG (ĐÚNG) =====
const conflict = await query(
  `SELECT 
      b.BookingTime,
      SUM(ISNULL(sv.DurationMinutes, 30)) AS TotalDuration
   FROM Bookings b
   JOIN BookingServices bs ON bs.BookingId = b.BookingId
   LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
   WHERE bs.StaffId = @staffId
   GROUP BY b.BookingTime`,
  { staffId }
)

for (let row of conflict.recordset) {
  const existingStart = new Date(row.BookingTime)
  const existingEnd = new Date(existingStart.getTime() + (row.TotalDuration || 30) * 60000)

  if (newStart < existingEnd && newEnd > existingStart) {
    const err = new Error('Staff already has an appointment at this time')
    err.status = 400
    throw err
  }
}

  const bookingId = newId()
  const bookingServiceId = newId()

await query(
  `INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
   VALUES (@bookingId, @customerUserId, @bookingTime, @status, @notes);`,
  {
    bookingId,
    customerUserId,
    bookingTime: when,
    status: statusToSave,
    notes: notes || null,
  }
)

// Loop insert services
for (let serviceId of serviceIds) {
  const svc = await query(
    'SELECT Price FROM Services WHERE ServiceId = @serviceId',
    { serviceId }
  )

  await query(
    `INSERT INTO BookingServices 
     (BookingServiceId, BookingId, ServiceId, StaffId, Price)
     VALUES (@id, @bookingId, @serviceId, @staffId, @price)`,
    {
      id: newId(),
      bookingId,
      serviceId,
      staffId,
      price: svc.recordset?.[0]?.Price ?? 0
    }
  )
}

if (String(statusToSave).toLowerCase() === 'completed') {
  await applyCommissionForCompletedBooking(bookingId, staffId)
}

// Return created booking id
return { id: bookingId }
}

async function getAppointmentById(bookingId) {
  const result = await query(
    `SELECT TOP 1
        b.BookingId,
        b.CustomerUserId,
        b.BookingTime,
        b.Status AS BookingStatus,
        b.Notes,
        bs.BookingServiceId,
        bs.ServiceId,
        bs.StaffId,
        COALESCE(bs.Price, sv.Price) AS Price
      FROM Bookings b
      OUTER APPLY (
        SELECT TOP 1 *
        FROM BookingServices x
        WHERE x.BookingId = b.BookingId
        ORDER BY x.BookingServiceId
      ) bs
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      WHERE b.BookingId = @bookingId`,
    { bookingId }
  )

  const row = result.recordset?.[0]
  if (!row) return null

  const d = row.BookingTime ? new Date(row.BookingTime) : null
  const iso = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
  const date = iso ? iso.slice(0, 10) : ''
  const time = iso ? iso.slice(11, 16) : ''

  return {
    id: row.BookingId,
    customerUserId: row.CustomerUserId,
    serviceId: row.ServiceId,
    staffId: row.StaffId,
    bookingTime: iso,
    date,
    time,
    status: row.BookingStatus || 'Booked',
    note: row.Notes || '',
    priceVnd: Number(row.Price || 0),
  }
}

async function updateAppointment(bookingId, payload) {
  console.log(`\n[APPT UPDATE] ========== START ==========`)
  console.log(`[APPT UPDATE] BookingId: ${bookingId}`)
  console.log(`[APPT UPDATE] Payload:`, JSON.stringify(payload, null, 2))
  
  const { customerUserId, serviceIds, staffId, date, time, notes, status } = payload || {}
  const normalizedStatusInput = String(status || '').trim().toLowerCase()
  const statusToSave = normalizeAppointmentStatus(status)
  
  console.log(`[APPT UPDATE] Extracted: status="${status}", normalized="${normalizedStatusInput}", saveAs="${statusToSave}", staffId="${staffId}")`)

  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }

  // ===== CHECK EXIST =====
  const exists = await query(
    'SELECT TOP 1 * FROM Bookings WHERE BookingId = @bookingId',
    { bookingId }
  )

  if (!exists.recordset?.length) {
    const err = new Error('Appointment not found')
    err.status = 404
    throw err
  }

  const currentBooking = exists.recordset?.[0] || null
  const previousBookingTime = currentBooking?.BookingTime ? new Date(currentBooking.BookingTime) : null
  const previousTimeMs = previousBookingTime && !Number.isNaN(previousBookingTime.getTime())
    ? previousBookingTime.getTime()
    : null

  // ===== UPDATE BOOKING =====
  await query(
    `UPDATE Bookings
     SET CustomerUserId = @customerUserId,
         BookingTime = @bookingTime,
         Notes = @notes,
         Status = @status
     WHERE BookingId = @bookingId`,
    {
      bookingId,
      customerUserId,
      bookingTime: when,
      notes: notes || null,
      status: statusToSave,
    }
  )

  // ================= FIX MULTIPLE SERVICES =================

  if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    // Delete all old services
    await query(
      'DELETE FROM BookingServices WHERE BookingId = @bookingId',
      { bookingId }
    )

    // Insert all new services
    for (let serviceId of serviceIds) {
      const svc = await query(
        'SELECT Price FROM Services WHERE ServiceId = @serviceId',
        { serviceId }
      )

      await query(
        `INSERT INTO BookingServices 
         (BookingServiceId, BookingId, ServiceId, StaffId, Price)
         VALUES (@id, @bookingId, @serviceId, @staffId, @price)`,
        {
          id: newId(),
          bookingId,
          serviceId,
          staffId,
          price: svc.recordset?.[0]?.Price ?? 0
        }
      )
    }
  }

  // ===== CALCULATE COMMISSION IF STATUS = 'COMPLETED' =====
  // This runs regardless of whether serviceIds was provided
  const normalizedStatus = String(statusToSave || '').trim().toLowerCase()
  console.log(`[UPDATE APPT] BookingId=${bookingId}, staffId=${staffId}, status=${status}, savedStatus=${statusToSave}, normalized=${normalizedStatus}`)
  
  if (normalizedStatus === 'completed') {
    await applyCommissionForCompletedBooking(bookingId, staffId)
  }

  if (normalizedStatus === 'cancelled' || normalizedStatus === 'cancelled') {
    await notifyOwnerEvent({ event: 'booking_cancelled', bookingId })
  } else if (normalizedStatus === 'pending') {
    await notifyOwnerEvent({ event: 'booking_rescheduled', bookingId })
  }

  const targetCustomerUserId = String(currentBooking?.CustomerUserId || '').trim()
  if (targetCustomerUserId) {
    try {
      if (normalizedStatus === 'cancelled' || normalizedStatus === 'cancelled') {
        await notifyCustomerEvent({
          userId: targetCustomerUserId,
          event: 'booking_cancelled',
          bookingId,
          payload: { bookingId },
        })
      } else {
        const nextTimeMs = when.getTime()
        if (previousTimeMs !== null && nextTimeMs !== previousTimeMs) {
          await notifyCustomerEvent({
            userId: targetCustomerUserId,
            event: 'booking_rescheduled',
            bookingId,
            payload: { bookingTime: when.toISOString() },
          })
        }

        if (normalizedStatus === 'completed') {
          await notifyCustomerEvent({
            userId: targetCustomerUserId,
            event: 'post_feedback_request',
            bookingId,
            payload: { bookingId },
          })
        }
      }
    } catch (err) {
      console.warn('[appointments] Notify customer failed:', err?.message || err)
    }
  }

  console.log(`[APPT UPDATE] ========== END ==========\n`)
  return { id: bookingId }
}


async function cancelAppointment(bookingId) {
  const exists = await query('SELECT TOP 1 BookingId, CustomerUserId FROM Bookings WHERE BookingId = @bookingId', { bookingId })
  if (!exists.recordset?.length) {
    const err = new Error('Appointment not found')
    err.status = 404
    throw err
  }

  await query('UPDATE Bookings SET Status = @status WHERE BookingId = @bookingId', {
    bookingId,
    status: 'Cancelled',
  })

  await notifyOwnerEvent({ event: 'booking_cancelled', bookingId })

  const customerUserId = String(exists.recordset?.[0]?.CustomerUserId || '').trim()
  if (customerUserId) {
    try {
      await notifyCustomerEvent({
        userId: customerUserId,
        event: 'booking_cancelled',
        bookingId,
        payload: { bookingId },
      })
    } catch (err) {
      console.warn('[appointments] Cancel notify customer failed:', err?.message || err)
    }
  }

  return { id: bookingId }
}

module.exports = {
  listAppointments,
  createAppointment,
  getAppointmentById,
  updateAppointment,
  cancelAppointment,
}