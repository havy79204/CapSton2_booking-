const { query, newId } = require('../config/query')
const { toAppointmentListItem } = require('../models/appointment.model')
const { getSettingsMap } = require('./settings.service')
const { notifyCustomerEvent, notifyOwnerEvent } = require('./notifications.service')

const _tableExistsCache = new Map()
const _columnExistsCache = new Map()

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
  if (normalizedStatusInput === 'cancelled' || normalizedStatusInput === 'canceled' || normalizedStatusInput === 'cancel' || normalizedStatusInput === 'canceller' || normalizedStatusInput === 'delete' || normalizedStatusInput === 'deleted') return 'Cancelled'
  if (normalizedStatusInput === 'booked' || normalizedStatusInput === 'booker') return 'Booked'
  if (normalizedStatusInput === 'confirmed' || normalizedStatusInput === 'confirm') return 'Confirmed'
  return status || 'Pending'
}

async function columnExists(tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`
  if (_columnExistsCache.has(cacheKey)) return _columnExistsCache.get(cacheKey)

  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @tableName
         AND COLUMN_NAME = @columnName`,
      { tableName, columnName }
    )
    const exists = Boolean(res.recordset?.length)
    _columnExistsCache.set(cacheKey, exists)
    return exists
  } catch {
    _columnExistsCache.set(cacheKey, false)
    return false
  }
}

async function getServiceCategoryId(serviceId) {
  const res = await query(
    'SELECT TOP 1 CategoryId FROM Services WHERE ServiceId = @serviceId',
    { serviceId }
  ).catch(() => ({ recordset: [] }))
  return String(res.recordset?.[0]?.CategoryId || '').trim()
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

async function listAppointments(options = {}) {
  console.log('[DEBUG] listAppointments: Fetching real data...')

  const month = String(options?.month || '').trim()
  const staffId = String(options?.staffId || '').trim()
  const params = {}
  const whereParts = []

  if (/^\d{4}-\d{2}$/.test(month)) {
    params.monthStart = `${month}-01`
    whereParts.push('CAST(b.BookingTime AS DATE) >= @monthStart')
    whereParts.push('CAST(b.BookingTime AS DATE) < DATEADD(MONTH, 1, @monthStart)')
  }

  if (staffId) {
    params.staffId = staffId
    whereParts.push(`EXISTS (
      SELECT 1
      FROM BookingServices bsFilter
      WHERE bsFilter.BookingId = b.BookingId
        AND CONVERT(NVARCHAR(100), bsFilter.StaffId) = CONVERT(NVARCHAR(100), @staffId)
    )`)
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''
  const topSql = /^\d{4}-\d{2}$/.test(month) ? '' : 'TOP 300'
  const hasBookingCodeColumn = await columnExists('Bookings', 'BookingCode')
  const hasCreatedAtColumn = await columnExists('Bookings', 'CreatedAt')
  const hasCustomerNameColumn = await columnExists('Bookings', 'CustomerName')
  const hasCustomerPhoneColumn = await columnExists('Bookings', 'Phone')
  const bookingCodeSelect = hasBookingCodeColumn
    ? 'b.BookingCode AS BookingCode,'
    : 'CAST(NULL AS NVARCHAR(100)) AS BookingCode,'
  const bookingCreatedAtSelect = hasCreatedAtColumn
    ? 'b.CreatedAt AS BookingCreatedAt,'
    : 'b.BookingTime AS BookingCreatedAt,'
  const bookingCustomerNameExpr = hasCustomerNameColumn
    ? "NULLIF(LTRIM(RTRIM(b.CustomerName)), '')"
    : 'NULL'
  const bookingCustomerPhoneExpr = hasCustomerPhoneColumn
    ? "NULLIF(LTRIM(RTRIM(b.Phone)), '')"
    : 'NULL'

  try {
    // Query chính - dùng subquery để lấy thông tin tổng hợp
    const result = await query(
      `SELECT ${topSql}
          b.BookingId,
          ${bookingCodeSelect}
          ${bookingCreatedAtSelect}
          b.CustomerUserId,
          b.BookingTime,
          b.Status AS BookingStatus,
          b.Notes,
          COALESCE(NULLIF(LTRIM(RTRIM(cu.Name)), ''), ${bookingCustomerNameExpr}, N'Khách hàng') AS CustomerName,
          COALESCE(NULLIF(LTRIM(RTRIM(cu.Phone)), ''), ${bookingCustomerPhoneExpr}, '') AS CustomerPhone,
          -- Lấy danh sách dịch vụ qua subquery
          ISNULL((
            SELECT STRING_AGG(COALESCE(sv.Name, 'Unknown'), ', ') 
            FROM BookingServices bs 
            LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId 
            WHERE bs.BookingId = b.BookingId
          ), 'No Service') AS FirstService,
          -- Lấy danh sách ServiceIds cho edit
          (
            SELECT STRING_AGG(bs.ServiceId, ',')
            FROM BookingServices bs
            WHERE bs.BookingId = b.BookingId
          ) AS ServiceIds,
          -- Tổng giá
          ISNULL((
            SELECT SUM(COALESCE(bs.Price, sv.Price, 0))
            FROM BookingServices bs
            LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
            WHERE bs.BookingId = b.BookingId
          ), 0) AS Price,
          -- Tổng thời gian
          ISNULL((
            SELECT SUM(COALESCE(sv.DurationMinutes, 30))
            FROM BookingServices bs
            LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
            WHERE bs.BookingId = b.BookingId
          ), 30) AS TotalDuration,
          -- Staff info
          (SELECT TOP 1 bs.StaffId FROM BookingServices bs WHERE bs.BookingId = b.BookingId) AS StaffIdResolved,
          (SELECT TOP 1 su.Name 
           FROM BookingServices bs 
           JOIN Staff st ON st.StaffId = bs.StaffId
           JOIN Users su ON su.UserId = st.UserId
           WHERE bs.BookingId = b.BookingId) AS StaffName,
          -- Invoice info
          ISNULL((SELECT TOP 1 i.DiscountAmount FROM Invoices i WHERE i.BookingId = b.BookingId ORDER BY i.CreatedAt DESC), 0) AS Discount,
          ISNULL((SELECT TOP 1 i.FinalAmount FROM Invoices i WHERE i.BookingId = b.BookingId ORDER BY i.CreatedAt DESC), 
            ISNULL((SELECT SUM(COALESCE(bs.Price, sv.Price, 0)) FROM BookingServices bs LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId WHERE bs.BookingId = b.BookingId), 0)
          ) AS TotalPrice
       FROM Bookings b
       LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
         ${whereSql}
       ORDER BY b.BookingTime DESC`
       , params)

    // Mapping dữ liệu chuẩn để Frontend nhận diện được biến 'discount'
    return (result.recordset || []).map(row => {
      const mapped = toAppointmentListItem(row);
      
      // Parse ServiceIds string thành array
      const serviceIdsString = row.ServiceIds || '';
      const serviceIdsArray = serviceIdsString ? serviceIdsString.split(',').filter(Boolean) : [];
      
      return {
        ...mapped,
        bookingCode: String(row.BookingCode || '').trim() || null,
        createdAt: row.BookingCreatedAt || null,
        serviceIds: serviceIdsArray, // Giữ lại cho edit form
        service: row.FirstService || 'No Service', // Tên dịch vụ đã join
        duration: Number(row.TotalDuration || 30), // Duration tổng
        customerName: row.CustomerName,
        customerPhone: row.CustomerPhone || '',
        staffName: row.StaffName,
        price: Number(row.Price || 0),
        discount: Number(row.Discount || 0),
        discountType: 'fixed',
        totalPrice: Number(row.TotalPrice || 0)
      };
    });
  } catch (error) {
    console.error('[ERROR] listAppointments failed:', error.message);
    throw error;
  }
}

async function staffSupportsService(staffId, serviceId) {
  if (!staffId || !serviceId) return false

  const hasServiceIdColumn = await columnExists('StaffSkills', 'ServiceId')
  if (hasServiceIdColumn) {
    const res = await query(
      `SELECT 1 FROM StaffSkills 
       WHERE StaffId = @staffId AND ServiceId = @serviceId`,
      { staffId, serviceId }
    ).catch(() => ({ recordset: [] }))
    return Boolean(res.recordset?.length)
  }

  const hasCategoryIdColumn = await columnExists('StaffSkills', 'CategoryId')
  if (!hasCategoryIdColumn) return false

  const categoryId = await getServiceCategoryId(serviceId)
  if (!categoryId) return false

  const res = await query(
    `SELECT 1 FROM StaffSkills 
     WHERE StaffId = @staffId AND CategoryId = @categoryId`,
    { staffId, categoryId }
  ).catch(() => ({ recordset: [] }))
  return Boolean(res.recordset?.length)
}

async function createAppointment(payload) {
  const { customerUserId, serviceIds, staffId, date, time, notes, status, promotionCode, customerName, customerPhone, phone } = payload || {}
  const statusToSave = normalizeAppointmentStatus(status)
  const resolvedCustomerUserId = String(customerUserId || '').trim() || null
  const resolvedCustomerName = String(customerName || '').trim()
  const resolvedCustomerPhone = String(customerPhone || phone || '').trim()

if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
  throw new Error('At least one service is required')
}
  if (!resolvedCustomerUserId && !resolvedCustomerName) {
    const err = new Error('Missing customer info: provide customerUserId or customerName')
    err.status = 400
    throw err
  }
  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }

  // ===== VALIDATE: Cannot book past dates =====
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const bookingDateOnly = new Date(when)
  bookingDateOnly.setHours(0, 0, 0, 0)
  
  if (bookingDateOnly < today) {
    const err = new Error('Cannot book for past dates. Please select today or a future date.')
    err.status = 400
    throw err
  }
  
  // ===== VALIDATE STAFF CAN PERFORM ALL SERVICES =====
  console.log(`[DEBUG] Validating ${serviceIds.length} services for staff ${staffId}`)
  for (const serviceId of serviceIds) {
    const canPerform = await staffSupportsService(staffId, serviceId)
    if (!canPerform) {
      console.log(`[DEBUG] Validation FAILED for service ${serviceId}`)
      const err = new Error('Selected specialist does not match the chosen service')
      err.status = 400
      throw err
    }
  }
  console.log(`[DEBUG] All services validated successfully`)
  
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

  const hasCustomerNameColumn = await columnExists('Bookings', 'CustomerName')
  const hasCustomerPhoneColumn = await columnExists('Bookings', 'Phone')
  const bookingInsertColumns = ['BookingId', 'CustomerUserId', 'BookingTime', 'Status', 'Notes']
  const bookingInsertValues = ['@bookingId', '@customerUserId', '@bookingTime', '@status', '@notes']
  const bookingInsertParams = {
    bookingId,
    customerUserId: resolvedCustomerUserId,
    bookingTime: when,
    status: statusToSave,
    notes: notes || null,
  }

  if (hasCustomerNameColumn) {
    bookingInsertColumns.push('CustomerName')
    bookingInsertValues.push('@customerName')
    bookingInsertParams.customerName = resolvedCustomerName || null
  }

  if (hasCustomerPhoneColumn) {
    bookingInsertColumns.push('Phone')
    bookingInsertValues.push('@customerPhone')
    bookingInsertParams.customerPhone = resolvedCustomerPhone || null
  }

await query(
  `INSERT INTO Bookings (${bookingInsertColumns.join(', ')})
   VALUES (${bookingInsertValues.join(', ')});`,
  bookingInsertParams
)

// Loop insert services
let resolvedPromotionId = null
  
  // Process promotion code if provided
  if (promotionCode) {
    console.log('[DEBUG] Processing promotion code:', promotionCode)
    try {
      const hasPromotionsTable = await columnExists('Promotions', 'Code')
      const hasPromotionIdColumn = await columnExists('Promotions', 'PromotionId')
      if (hasPromotionsTable && hasPromotionIdColumn) {
        const promoResult = await query(
          `SELECT PromotionId, DiscountValue, DiscountType, Status 
           FROM Promotions 
           WHERE Code = @code AND Status = 'ACTIVE' 
           AND GETDATE() BETWEEN StartDate AND EndDate`,
          { code: promotionCode }
        )
      
        if (promoResult.recordset?.length > 0) {
          resolvedPromotionId = promoResult.recordset[0].PromotionId
          console.log('[DEBUG] Found valid promotion:', promoResult.recordset[0])
        } else {
          console.log('[DEBUG] No valid promotion found for code:', promotionCode)
        }
      } else {
        console.log('[DEBUG] Promotions schema has no PromotionId/Code support, skipping promotion code')
      }
    } catch (err) {
      console.error('[DEBUG] Error processing promotion code:', err.message)
    }
  }

  const hasBookingServicePromotionId = await columnExists('BookingServices', 'PromotionId')
  
for (let serviceId of serviceIds) {
  const svc = await query(
    'SELECT Price FROM Services WHERE ServiceId = @serviceId',
    { serviceId }
  )

  const insertColumns = ['BookingServiceId', 'BookingId', 'ServiceId', 'StaffId', 'Price']
  const insertValues = ['@id', '@bookingId', '@serviceId', '@staffId', '@price']
  const insertParams = {
    id: newId(),
    bookingId,
    serviceId,
    staffId,
    price: svc.recordset?.[0]?.Price ?? 0,
  }

  if (hasBookingServicePromotionId && resolvedPromotionId !== null && resolvedPromotionId !== undefined) {
    insertColumns.push('PromotionId')
    insertValues.push('@promotionId')
    insertParams.promotionId = resolvedPromotionId
  }

  await query(
    `INSERT INTO BookingServices 
     (${insertColumns.join(', ')})
     VALUES (${insertValues.join(', ')})`,
    insertParams
  )
}

if (String(statusToSave).toLowerCase() === 'completed') {
  await applyCommissionForCompletedBooking(bookingId, staffId)
}

// Return created booking id
return { id: bookingId }
}

async function getAppointmentById(bookingId) {
  const hasBookingCodeColumn = await columnExists('Bookings', 'BookingCode')
  const hasCustomerNameColumn = await columnExists('Bookings', 'CustomerName')
  const hasCustomerPhoneColumn = await columnExists('Bookings', 'Phone')
  const whereByIdOrCode = hasBookingCodeColumn
    ? 'b.BookingId = @bookingId OR b.BookingCode = @bookingId'
    : 'b.BookingId = @bookingId'
  const bookingCustomerNameExpr = hasCustomerNameColumn
    ? "NULLIF(LTRIM(RTRIM(b.CustomerName)), '')"
    : 'NULL'
  const bookingCustomerPhoneExpr = hasCustomerPhoneColumn
    ? "NULLIF(LTRIM(RTRIM(b.Phone)), '')"
    : 'NULL'

  const result = await query(
    `SELECT TOP 1
        b.BookingId,
        ${hasBookingCodeColumn ? 'b.BookingCode,' : 'CAST(NULL AS NVARCHAR(100)) AS BookingCode,'}
        b.CustomerUserId,
        b.BookingTime,
        b.Status AS BookingStatus,
        b.Notes,
        COALESCE(NULLIF(LTRIM(RTRIM(cu.Name)), ''), ${bookingCustomerNameExpr}, N'Khách hàng') AS CustomerName,
        COALESCE(NULLIF(LTRIM(RTRIM(cu.Phone)), ''), ${bookingCustomerPhoneExpr}, '') AS CustomerPhone,
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
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      WHERE ${whereByIdOrCode}`,
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
    bookingCode: row.BookingCode || null,
    customerUserId: row.CustomerUserId,
    customerName: row.CustomerName || 'Khách hàng',
    customerPhone: row.CustomerPhone || '',
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
  
  const { customerUserId, serviceIds, staffId, date, time, notes, status, customerName, customerPhone, phone } = payload || {}
  const normalizedStatusInput = String(status || '').trim().toLowerCase()
  const statusToSave = normalizeAppointmentStatus(status)
  
  console.log(`[APPT UPDATE] Extracted: status="${status}", normalized="${normalizedStatusInput}", saveAs="${statusToSave}", staffId="${staffId}")`)

  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }

  // ===== VALIDATE STAFF CAN PERFORM ALL SERVICES (for updates too) =====
  if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    for (const serviceId of serviceIds) {
      const canPerform = await staffSupportsService(staffId, serviceId)
      if (!canPerform) {
        const err = new Error('Selected specialist does not match the chosen service')
        err.status = 400
        throw err
      }
    }
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
  const hasCustomerNameColumn = await columnExists('Bookings', 'CustomerName')
  const hasCustomerPhoneColumn = await columnExists('Bookings', 'Phone')
  const resolvedCustomerUserId = String(customerUserId || '').trim() || null
  const hasCustomerNameInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'customerName')
  const hasCustomerPhoneInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'customerPhone') || Object.prototype.hasOwnProperty.call(payload || {}, 'phone')
  const resolvedCustomerName = hasCustomerNameInPayload ? (String(customerName || '').trim() || null) : undefined
  const resolvedCustomerPhone = hasCustomerPhoneInPayload ? (String(customerPhone || phone || '').trim() || null) : undefined
  const previousBookingTime = currentBooking?.BookingTime ? new Date(currentBooking.BookingTime) : null
  const previousTimeMs = previousBookingTime && !Number.isNaN(previousBookingTime.getTime())
    ? previousBookingTime.getTime()
    : null

  // ===== UPDATE BOOKING =====
  const bookingUpdateParts = [
    'CustomerUserId = @customerUserId',
    'BookingTime = @bookingTime',
    'Notes = @notes',
    'Status = @status',
  ]
  const bookingUpdateParams = {
    bookingId,
    customerUserId: resolvedCustomerUserId,
    bookingTime: when,
    notes: notes || null,
    status: statusToSave,
  }

  if (hasCustomerNameColumn && resolvedCustomerName !== undefined) {
    bookingUpdateParts.push('CustomerName = @customerName')
    bookingUpdateParams.customerName = resolvedCustomerName
  }

  if (hasCustomerPhoneColumn && resolvedCustomerPhone !== undefined) {
    bookingUpdateParts.push('Phone = @customerPhone')
    bookingUpdateParams.customerPhone = resolvedCustomerPhone
  }

  await query(
    `UPDATE Bookings
     SET ${bookingUpdateParts.join(', ')}
     WHERE BookingId = @bookingId`,
    bookingUpdateParams
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

// Recalculate commission for all staff based on current tier settings
// Called when owner updates commission tier settings
async function recalculateAllCommissions() {
  try {
    console.log('[RECALC COMMISSION] Starting recalculation for all staff...')
    
    // Get all staff with completed bookings
    const staffRes = await query(
      `SELECT DISTINCT bs.StaffId
       FROM BookingServices bs
       JOIN Bookings b ON b.BookingId = bs.BookingId
       WHERE bs.StaffId IS NOT NULL
         AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')`
    )
    
    const staffIds = staffRes.recordset?.map(r => r.StaffId).filter(Boolean) || []
    console.log(`[RECALC COMMISSION] Found ${staffIds.length} staff with completed bookings`)
    
    const settingsMap = await getSettingsMap()
    let commissionTiers = {}
    
    // Load current tier settings
    if (Array.isArray(settingsMap.CommissionTiers) && settingsMap.CommissionTiers.length > 0) {
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
    
    // Recalculate for each staff
    let successCount = 0
    let errorCount = 0
    
    for (const staffId of staffIds) {
      try {
        // Get total completed revenue for this staff
        const staffRevenueRes = await query(
          `SELECT
            SUM(ISNULL(COALESCE(bs.Price, sv.Price), 0)) as TotalRevenue
           FROM BookingServices bs
          JOIN Bookings b ON b.BookingId = bs.BookingId
          LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
           WHERE bs.StaffId = @staffId
             AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')`,
          { staffId }
        )
        
        const totalRevenue = Number(staffRevenueRes.recordset?.[0]?.TotalRevenue || 0)
        const totalCommissionAmount = calculateCommission(totalRevenue, commissionTiers)
        const commissionPercentage = totalRevenue > 0 ? (totalCommissionAmount / totalRevenue) : 0
        
        // Update all BookingServices for this staff
        const bookingServicesRes = await query(
          `SELECT bs.BookingServiceId, COALESCE(bs.Price, sv.Price, 0) AS Price
           FROM BookingServices bs
           LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
           JOIN Bookings b ON b.BookingId = bs.BookingId
           WHERE bs.StaffId = @staffId
             AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')`,
          { staffId }
        )
        
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
        
        successCount++
        console.log(`[RECALC COMMISSION] Staff ${staffId}: Success (Revenue: ${totalRevenue}, Commission: ${totalCommissionAmount})`)
      } catch (err) {
        errorCount++
        console.error(`[RECALC COMMISSION] Staff ${staffId} failed:`, err.message)
      }
    }
    
    console.log(`[RECALC COMMISSION] Complete! Success: ${successCount}, Errors: ${errorCount}`)
    return { success: true, successCount, errorCount, totalStaff: staffIds.length }
  } catch (err) {
    console.error('[RECALC COMMISSION] Fatal error:', err.message)
    return { success: false, error: err.message }
  }
}
async function listAppointmentMeta({ staffId } = {}) {
  // Return quick lookup lists used by staff UI: recent customers and available services
  const out = { customers: [], services: [], staffCategoryIds: [] }

  try {
    const hasCustomerNameColumn = await columnExists('Bookings', 'CustomerName')
    const hasCustomerPhoneColumn = await columnExists('Bookings', 'Phone')
    const bookingCustomerNameExpr = hasCustomerNameColumn
      ? "NULLIF(LTRIM(RTRIM(b.CustomerName)), '')"
      : 'NULL'
    const bookingCustomerPhoneExpr = hasCustomerPhoneColumn
      ? "NULLIF(LTRIM(RTRIM(b.Phone)), '')"
      : 'NULL'
    const bookingCustomerNameGroup = hasCustomerNameColumn
      ? 'b.CustomerName'
      : 'CAST(NULL AS NVARCHAR(255))'
    const bookingCustomerPhoneGroup = hasCustomerPhoneColumn
      ? 'b.Phone'
      : 'CAST(NULL AS NVARCHAR(50))'

    const customersRes = await query(
      `SELECT TOP 150
          NULLIF(CONVERT(NVARCHAR(100), b.CustomerUserId), '') AS UserId,
          COALESCE(NULLIF(LTRIM(RTRIM(u.Name)), ''), ${bookingCustomerNameExpr}, N'Khách lẻ') AS Name,
          COALESCE(NULLIF(LTRIM(RTRIM(u.Phone)), ''), ${bookingCustomerPhoneExpr}, '') AS Phone,
          MAX(b.BookingTime) AS LatestBookingTime
       FROM Bookings b
       LEFT JOIN Users u ON u.UserId = b.CustomerUserId
       JOIN BookingServices bs ON bs.BookingId = b.BookingId
       WHERE bs.StaffId = @staffId
       GROUP BY b.CustomerUserId, u.Name, u.Phone, ${bookingCustomerNameGroup}, ${bookingCustomerPhoneGroup}
       ORDER BY MAX(b.BookingTime) DESC`,
      { staffId }
    )

    out.customers = (customersRes.recordset || [])
      .map((r) => ({
        id: String(r.UserId || '').trim(),
        name: String(r.Name || '').trim(),
        phone: String(r.Phone || '').trim(),
      }))
      .filter((r) => Boolean(r.id) || Boolean(r.name) || Boolean(r.phone))
  } catch (err) {
    console.error('[appointments.service] listAppointmentMeta customers error:', err.message)
  }

  // If staff has no booking history, fallback to global customer accounts.
  if (!out.customers.length) {
    try {
      const fallbackCustomersRes = await query(
        `SELECT TOP 150
            CONVERT(NVARCHAR(100), u.UserId) AS UserId,
            COALESCE(NULLIF(LTRIM(RTRIM(u.Name)), ''), N'Khách hàng') AS Name,
            COALESCE(NULLIF(LTRIM(RTRIM(u.Phone)), ''), '') AS Phone
         FROM Users u
         WHERE LOWER(LTRIM(RTRIM(COALESCE(u.Role, '')))) = 'customer'
            OR LOWER(LTRIM(RTRIM(COALESCE(u.Role, '')))) = 'client'
         ORDER BY u.Name ASC`,
        {}
      )

      out.customers = (fallbackCustomersRes.recordset || []).map((r) => ({
        id: String(r.UserId || '').trim(),
        name: String(r.Name || '').trim(),
        phone: String(r.Phone || '').trim(),
      }))
    } catch (err) {
      console.error('[appointments.service] listAppointmentMeta fallback customers error:', err.message)
    }
  }

  try {
    try {
      const skillRes = await query(
        `SELECT DISTINCT ss.CategoryId
         FROM StaffSkills ss
         WHERE ss.StaffId = @staffId
           AND ss.CategoryId IS NOT NULL`,
        { staffId }
      )
      out.staffCategoryIds = (skillRes.recordset || [])
        .map((r) => String(r.CategoryId || '').trim())
        .filter(Boolean)
    } catch {
      out.staffCategoryIds = []
    }

    const servicesRes = await query(
      `SELECT s.ServiceId AS Id, s.Name, s.Price, s.DurationMinutes, s.CategoryId
       FROM Services s
       ORDER BY s.Name`,
      {}
    )

    const servicesRows = servicesRes.recordset || []

    out.services = servicesRows.map((r) => ({
      id: String(r.Id || '').trim(),
      name: String(r.Name || '').trim(),
      price: Number(r.Price || 0),
      durationMinutes: Number(r.DurationMinutes || 0),
      categoryId: String(r.CategoryId || '').trim(),
    }))
  } catch (err) {
    console.error('[appointments.service] listAppointmentMeta services error:', err.message)
  }

  return out
}

module.exports = {
  listAppointments,
  createAppointment,
  getAppointmentById,
  updateAppointment,
  cancelAppointment,
  recalculateAllCommissions,
  listAppointmentMeta,
  searchCustomersFromBookings,
}

async function searchCustomersFromBookings({ staffId, q } = {}) {
  const out = []
  try {
    const hasCustomerNameColumn = await columnExists('Bookings', 'CustomerName')
    const hasCustomerPhoneColumn = await columnExists('Bookings', 'Phone')
    const bookingCustomerNameExpr = hasCustomerNameColumn
      ? "NULLIF(LTRIM(RTRIM(b.CustomerName)), '')"
      : 'NULL'
    const bookingCustomerPhoneExpr = hasCustomerPhoneColumn
      ? "NULLIF(LTRIM(RTRIM(b.Phone)), '')"
      : 'NULL'

    const qParam = String(q || '').trim()
    const qFilter = qParam
      ? `AND (
          LOWER(CONVERT(NVARCHAR(400), COALESCE(u.Name, ${bookingCustomerNameExpr}, ''))) LIKE '%' + LOWER(@q) + '%'
          OR LOWER(CONVERT(NVARCHAR(200), COALESCE(u.Phone, ${bookingCustomerPhoneExpr}, ''))) LIKE '%' + LOWER(@q) + '%'
          OR CONVERT(NVARCHAR(100), b.CustomerUserId) LIKE '%' + @q + '%'
        )`
      : ''

    const sql = `SELECT TOP 200
        NULLIF(CONVERT(NVARCHAR(100), b.CustomerUserId), '') AS CustomerUserId,
        COALESCE(NULLIF(LTRIM(RTRIM(u.Name)), ''), ${bookingCustomerNameExpr}, N'') AS CustomerName,
        COALESCE(NULLIF(LTRIM(RTRIM(u.Phone)), ''), ${bookingCustomerPhoneExpr}, '') AS Phone,
        MAX(b.BookingTime) AS LatestBookingTime
      FROM Bookings b
      LEFT JOIN Users u ON u.UserId = b.CustomerUserId
      WHERE 1 = 1
      ${qFilter}
      GROUP BY b.CustomerUserId, u.Name, u.Phone, ${bookingCustomerNameExpr}, ${bookingCustomerPhoneExpr}
      ORDER BY MAX(b.BookingTime) DESC`

    const res = await query(sql, { q: qParam })
    const bookings = (res.recordset || []).map(r => ({
      customerUserId: String(r.CustomerUserId || '').trim(),
      customerName: String(r.CustomerName || '').trim(),
      phone: String(r.Phone || '').trim(),
      latestBookingTime: r.LatestBookingTime || null,
    }))

    // Also search global Users (account customers) when a query is provided — merge results.
    let users = []
    try {
      if (qParam) {
        const usersSql = `SELECT TOP 200
            CONVERT(NVARCHAR(100), u.UserId) AS UserId,
            COALESCE(NULLIF(LTRIM(RTRIM(u.Name)), ''), N'') AS Name,
            COALESCE(NULLIF(LTRIM(RTRIM(u.Phone)), ''), N'') AS Phone
          FROM Users u
          WHERE (LOWER(LTRIM(RTRIM(COALESCE(u.Role, '')))) = 'customer' OR LOWER(LTRIM(RTRIM(COALESCE(u.Role, '')))) = 'client')
            AND (
              LOWER(u.Name) LIKE '%' + LOWER(@q) + '%'
              OR LOWER(u.Phone) LIKE '%' + LOWER(@q) + '%'
              OR CONVERT(NVARCHAR(100), u.UserId) LIKE '%' + @q + '%'
            )
          ORDER BY u.Name ASC`

        const ures = await query(usersSql, { q: qParam })
        users = (ures.recordset || []).map(u => ({
          userId: String(u.UserId || '').trim(),
          name: String(u.Name || '').trim(),
          phone: String(u.Phone || '').trim(),
        }))
      }
    } catch (uerr) {
      // ignore user search errors
    }

    // Merge bookings + users, dedupe by userId (prefer user data), then include walk-ins (no userId)
    const mergedMap = new Map()
    // Add user accounts first
    for (const u of users) {
      if (!u.userId) continue
      mergedMap.set(u.userId, {
        customerUserId: u.userId,
        customerName: u.name || '',
        phone: u.phone || '',
        latestBookingTime: null,
      })
    }

    // Merge booking-derived entries (will not overwrite existing user entries)
    let walkinIdx = 0
    for (const b of bookings) {
      if (b.customerUserId) {
        if (mergedMap.has(b.customerUserId)) {
          const existing = mergedMap.get(b.customerUserId)
          existing.latestBookingTime = existing.latestBookingTime || b.latestBookingTime
          mergedMap.set(b.customerUserId, existing)
        } else {
          mergedMap.set(b.customerUserId, b)
        }
      } else {
        const key = `__walkin_${walkinIdx++}`
        mergedMap.set(key, b)
      }
    }

    return Array.from(mergedMap.values()).slice(0, 200)
  } catch (err) {
    console.error('[appointments.service] searchCustomersFromBookings error:', err.message)
    return out
  }
}