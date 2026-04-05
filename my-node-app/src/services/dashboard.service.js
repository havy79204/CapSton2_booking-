const { query } = require('../config/query')
const { pad2, formatHm } = require('../utils/format')

function toIsoDate(d) {
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return ''
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toSqlDateKey(v) {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return toIsoDate(d)
}

function addDays(date, delta) {
  const x = new Date(date)
  x.setDate(x.getDate() + delta)
  return x
}

function pctDelta(current, prev) {
  const c = Number(current || 0)
  const p = Number(prev || 0)
  if (!p) return 0
  return Math.round(((c - p) / p) * 100)
}

function trendFromDelta(delta, inverseGood = false) {
  if (delta > 0) return inverseGood ? 'down' : 'up'
  if (delta < 0) return inverseGood ? 'up' : 'down'
  return 'flat'
}

function statusFromTrend(trend) {
  if (trend === 'up') return 'good'
  if (trend === 'down') return 'warning'
  return 'neutral'
}

function toMoney(value) {
  return Number(value || 0)
}

const BOOKING_PENDING = new Set(['pending', 'p', 'c'])
const BOOKING_BOOKED = new Set(['booked', 'confirmed', 'confirm'])
const BOOKING_COMPLETED = new Set(['completed', 'complete', 'done'])
const BOOKING_CANCELLED = new Set(['cancelled', 'cancel', 'no_show', 'noshow', 'no-show', 'no show'])

function normalizeBookingStatus(raw) {
  const text = String(raw || '').trim().toLowerCase()
  if (BOOKING_PENDING.has(text)) return 'pending'
  if (BOOKING_BOOKED.has(text)) return 'booked'
  if (BOOKING_COMPLETED.has(text)) return 'completed'
  if (BOOKING_CANCELLED.has(text)) return 'cancelled'
  return 'pending'
}

function bookingStatusLabel(status) {
  if (status === 'booked') return 'Booked'
  if (status === 'completed') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  return 'Pending'
}

function parseDateOnly(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseMonthOnly(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

function parseYearOnly(raw) {
  if (!raw) return null
  const year = Number(String(raw).trim())
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  return year
}

function monthShortLabel(monthIndexZeroBased) {
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return labels[monthIndexZeroBased] || ''
}

function formatDateLabelDdMm(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`
}

function timeValueToMinutes(value) {
  if (value === null || value === undefined) return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 24) return Math.round(value * 60)
    const dt = new Date(value)
    if (!Number.isNaN(dt.getTime())) return dt.getHours() * 60 + dt.getMinutes()
    return null
  }

  const raw = String(value).trim()
  if (!raw) return null

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) {
    const hh = Number(hhmm[1])
    const mm = Number(hhmm[2])
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 24) return Math.round(n * 60)
  }

  const dt = new Date(raw)
  if (!Number.isNaN(dt.getTime())) return dt.getHours() * 60 + dt.getMinutes()

  return null
}

function minutesToHm(minutes) {
  const v = Number(minutes)
  if (!Number.isFinite(v)) return ''
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(v)))
  const hh = Math.floor(normalized / 60)
  const mm = normalized % 60
  return `${pad2(hh)}:${pad2(mm)}`
}

function startOfWeekMonday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : (1 - day)
  d.setDate(d.getDate() + diff)
  return d
}

async function tableExists(tableName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = @tableName`,
    { tableName }
  ).catch(() => ({ recordset: [] }))
  return Boolean(res.recordset?.length)
}

async function columnExists(tableName, columnName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName`,
    { tableName, columnName }
  ).catch(() => ({ recordset: [] }))
  return Boolean(res.recordset?.length)
}

function getPeriodMeta(periodRaw, refs = {}) {
  const period = ['day', 'week', 'month', 'year'].includes(periodRaw) ? periodRaw : 'day'
  const now = new Date()
  let currentStart
  let currentEnd

  if (period === 'day') {
    const refDate = parseDateOnly(refs.refDate) || new Date(now)
    currentStart = new Date(refDate)
    currentEnd = new Date(refDate)
  } else if (period === 'week') {
    const refDate = parseDateOnly(refs.refDate) || new Date(now)
    currentEnd = new Date(refDate)
    currentStart = addDays(currentEnd, -6)
  } else if (period === 'month') {
    const refMonth = parseMonthOnly(refs.refMonth)
    const year = refMonth?.year || now.getFullYear()
    const month = refMonth?.month || (now.getMonth() + 1)
    currentStart = new Date(year, month - 1, 1)
    currentEnd = new Date(year, month, 0)
  } else {
    const year = parseYearOnly(refs.refYear) || now.getFullYear()
    currentStart = new Date(year, 0, 1)
    currentEnd = new Date(year, 11, 31)
  }

  const days = Math.max(1, Math.round((currentEnd - currentStart) / (24 * 60 * 60 * 1000)) + 1)
  const prevEnd = addDays(currentStart, -1)
  const prevStart = addDays(prevEnd, -(days - 1))

  return {
    period,
    days,
    currentStart,
    currentEnd,
    prevStart,
    prevEnd,
    label: period === 'day' ? 'selected day' : period === 'week' ? 'selected week' : period === 'month' ? 'selected month' : 'selected year',
  }
}

async function getDashboard(periodRaw = 'day', refs = {}) {
  const meta = getPeriodMeta(periodRaw, refs)
  const currentStartIso = toIsoDate(meta.currentStart)
  const currentEndIso = toIsoDate(meta.currentEnd)
  const prevStartIso = toIsoDate(meta.prevStart)
  const prevEndIso = toIsoDate(meta.prevEnd)
  const hasBookingReviews = await tableExists('SalonReviews')
  const [inventoryHasStatus, productsHasStatus, inventoryHasPriceVnd, inventoryHasSellPriceVnd, productsHasPrice] = await Promise.all([
    columnExists('InventoryItems', 'Status'),
    columnExists('Products', 'Status'),
    columnExists('InventoryItems', 'PriceVnd'),
    columnExists('InventoryItems', 'SellPriceVnd'),
    columnExists('Products', 'Price'),
  ])

  const inventoryVisibleWhere = inventoryHasStatus
    ? "AND (i.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), i.Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
    : ''
  const productVisibleWhere = productsHasStatus
    ? "WHERE (p.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
    : ''

  const inventoryPriceSelect = inventoryHasPriceVnd
    ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), i.PriceVnd), 0)'
    : 'CAST(0 AS DECIMAL(19,2))'
  const inventorySellPriceSelect = inventoryHasSellPriceVnd
    ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), i.SellPriceVnd), 0)'
    : (inventoryHasPriceVnd ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), i.PriceVnd), 0)' : 'CAST(0 AS DECIMAL(19,2))')
  const productSellPriceSelect = productsHasPrice
    ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Price), 0)'
    : 'CAST(0 AS DECIMAL(19,2))'
  const productImportPriceSelect = inventoryHasPriceVnd
    ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), r.PriceVnd), 0)'
    : 'CAST(0 AS DECIMAL(19,2))'

  const inventoryAlertSourceSql = `
    WITH InventoryAlertSource AS (
      SELECT
        i.Name,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), i.Quantity), 0) AS Quantity,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), i.ReorderLevel), 0) AS ReorderLevel,
        CAST('supplies' AS NVARCHAR(20)) AS StockType,
        ${inventoryPriceSelect} AS ImportPrice,
        ${inventorySellPriceSelect} AS SellPrice
      FROM InventoryItems i
      WHERE COALESCE(i.ItemGroup, 'service') = 'service'
        AND i.InventoryItemId NOT LIKE 'retail_%'
        AND i.InventoryItemId NOT LIKE 'retail_variant_%'
        ${inventoryVisibleWhere}

      UNION ALL

      SELECT
        p.Name,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0) AS Quantity,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), r.ReorderLevel), 0) AS ReorderLevel,
        CAST('retail' AS NVARCHAR(20)) AS StockType,
        ${productImportPriceSelect} AS ImportPrice,
        ${productSellPriceSelect} AS SellPrice
      FROM Products p
      LEFT JOIN InventoryItems r ON r.InventoryItemId = CONCAT('retail_', p.ProductId)
      ${productVisibleWhere}
    )`

  const todayScheduleSql = hasBookingReviews
    ? `SELECT
          b.BookingId,
          b.BookingTime,
          b.Status AS BookingStatus,
          cu.Name AS CustomerName,
          sv.Name AS ServiceName,
          su.Name AS StaffName,
          st.StaffId,
          br.ReviewRating,
          br.ReviewComment,
          br.ReviewCreatedAt
       FROM Bookings b
       LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
       OUTER APPLY (
         SELECT TOP 1 *
         FROM BookingServices x
         WHERE x.BookingId = b.BookingId
         ORDER BY x.BookingServiceId
       ) bs
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       LEFT JOIN Staff st ON st.StaffId = bs.StaffId
       LEFT JOIN Users su ON su.UserId = st.UserId
       OUTER APPLY (
         SELECT TOP 1
           CAST(br.Rating AS FLOAT) AS ReviewRating,
           br.Comment AS ReviewComment,
           br.CreatedAt AS ReviewCreatedAt
         FROM SalonReviews br
         WHERE br.BookingId = b.BookingId
           AND br.Rating IS NOT NULL
         ORDER BY br.CreatedAt DESC
       ) br
       WHERE CAST(b.BookingTime AS date) = @d
       ORDER BY b.BookingTime ASC`
    : `SELECT
          b.BookingId,
          b.BookingTime,
          b.Status AS BookingStatus,
          cu.Name AS CustomerName,
          sv.Name AS ServiceName,
          su.Name AS StaffName,
          st.StaffId,
          CAST(NULL AS FLOAT) AS ReviewRating,
          CAST(NULL AS NVARCHAR(1000)) AS ReviewComment,
          CAST(NULL AS DATETIME2) AS ReviewCreatedAt
       FROM Bookings b
       LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
       OUTER APPLY (
         SELECT TOP 1 *
         FROM BookingServices x
         WHERE x.BookingId = b.BookingId
         ORDER BY x.BookingServiceId
       ) bs
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       LEFT JOIN Staff st ON st.StaffId = bs.StaffId
       LEFT JOIN Users su ON su.UserId = st.UserId
       WHERE CAST(b.BookingTime AS date) = @d
       ORDER BY b.BookingTime ASC`

  const [
    revRes,
    revPrevRes,
    orderRevRes,
    orderRevPrevRes,
    orderCntRes,
    orderCntPrevRes,
    completedOrderCntRes,
    completedOrderCntPrevRes,
    apptRes,
    apptPrevRes,
    customersPeriodRes,
    outStockRes,
    lowRes,
    totalInventoryItemsRes,
    staffCountRes,
    noShowRes,
    noShowPrevRes,
    returningRes,
    ratingRes,
    ratingPrevRes,
    ratingMixRes,
  ] = await Promise.all([
    query(
      `SELECT SUM(ISNULL(sv.Price, 0)) AS Revenue
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE CAST(b.BookingTime AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ Revenue: 0 }] })),
    query(
      `SELECT SUM(ISNULL(sv.Price, 0)) AS Revenue
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE CAST(b.BookingTime AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')`,
      { s: prevStartIso, e: prevEndIso }
    ).catch(() => ({ recordset: [{ Revenue: 0 }] })),
    query(
      `SELECT SUM(Total) AS Revenue
       FROM Orders
       WHERE CreatedAt IS NOT NULL 
         AND CAST(CreatedAt AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ Revenue: 0 }] })),
    query(
      `SELECT SUM(Total) AS Revenue
       FROM Orders
       WHERE CreatedAt IS NOT NULL 
         AND CAST(CreatedAt AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')`,
      { s: prevStartIso, e: prevEndIso }
    ).catch(() => ({ recordset: [{ Revenue: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Orders
       WHERE CreatedAt IS NOT NULL
         AND CAST(CreatedAt AS date) BETWEEN @s AND @e`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Orders
       WHERE CreatedAt IS NOT NULL
         AND CAST(CreatedAt AS date) BETWEEN @s AND @e`,
      { s: prevStartIso, e: prevEndIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Orders
       WHERE CreatedAt IS NOT NULL
         AND CAST(CreatedAt AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Orders
       WHERE CreatedAt IS NOT NULL
         AND CAST(CreatedAt AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')`,
      { s: prevStartIso, e: prevEndIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Bookings
       WHERE CAST(BookingTime AS date) BETWEEN @s AND @e`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Bookings
       WHERE CAST(BookingTime AS date) BETWEEN @s AND @e`,
      { s: prevStartIso, e: prevEndIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(DISTINCT CustomerUserId) AS Cnt
       FROM Bookings
       WHERE CustomerUserId IS NOT NULL AND CAST(BookingTime AS date) BETWEEN @s AND @e`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `${inventoryAlertSourceSql}
       SELECT COUNT(1) AS Cnt
       FROM InventoryAlertSource
       WHERE Quantity <= 0`
     ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
     query(
      `${inventoryAlertSourceSql}
       SELECT COUNT(1) AS Cnt
       FROM InventoryAlertSource
       WHERE Quantity > 0 AND ReorderLevel > 0 AND Quantity <= ReorderLevel`
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `${inventoryAlertSourceSql}
       SELECT COUNT(1) AS Cnt
       FROM InventoryAlertSource`
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(`SELECT COUNT(1) AS Cnt FROM Staff`).catch(() => ({ recordset: [{ Cnt: 1 }] })),
    query(
      `SELECT
        SUM(CASE WHEN LOWER(COALESCE(Status, '')) IN ('no_show','noshow','no-show','no show') THEN 1 ELSE 0 END) AS NoShowCnt,
        COUNT(1) AS TotalCnt
       FROM Bookings
       WHERE CAST(BookingTime AS date) BETWEEN @s AND @e`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ NoShowCnt: 0, TotalCnt: 0 }] })),
    query(
      `SELECT
        SUM(CASE WHEN LOWER(COALESCE(Status, '')) IN ('no_show','noshow','no-show','no show') THEN 1 ELSE 0 END) AS NoShowCnt,
        COUNT(1) AS TotalCnt
       FROM Bookings
       WHERE CAST(BookingTime AS date) BETWEEN @s AND @e`,
      { s: prevStartIso, e: prevEndIso }
    ).catch(() => ({ recordset: [{ NoShowCnt: 0, TotalCnt: 0 }] })),
    query(
      `WITH C AS (
         SELECT
           CustomerUserId,
           SUM(CASE WHEN CAST(BookingTime AS date) BETWEEN @currS AND @currE THEN 1 ELSE 0 END) AS CurrCnt,
           SUM(CASE WHEN CAST(BookingTime AS date) < @currS THEN 1 ELSE 0 END) AS PrevCnt
         FROM Bookings
         WHERE CustomerUserId IS NOT NULL
         GROUP BY CustomerUserId
       )
       SELECT
         SUM(CASE WHEN PrevCnt > 0 OR CurrCnt > 1 THEN 1 ELSE 0 END) AS ReturningCnt,
         SUM(CASE WHEN PrevCnt = 0 AND CurrCnt <= 1 THEN 1 ELSE 0 END) AS NewCnt
       FROM C
       WHERE CurrCnt > 0`,
      { currS: currentStartIso, currE: currentEndIso }
    ).catch(() => ({ recordset: [{ ReturningCnt: 0, NewCnt: 0 }] })),
    query(
      `SELECT AVG(CAST(Rating AS FLOAT)) AS AvgRating
       FROM SalonReviews
       WHERE Rating IS NOT NULL AND CAST(CreatedAt AS date) BETWEEN @s AND @e`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ AvgRating: 0 }] })),
    query(
      `SELECT AVG(CAST(Rating AS FLOAT)) AS AvgRating
       FROM SalonReviews
       WHERE Rating IS NOT NULL AND CAST(CreatedAt AS date) BETWEEN @s AND @e`,
      { s: prevStartIso, e: prevEndIso }
    ).catch(() => ({ recordset: [{ AvgRating: 0 }] })),
    query(
      `WITH Classified AS (
         SELECT
           CAST(Rating AS FLOAT) AS Rating,
           CASE
             WHEN ProductId IS NOT NULL OR OrderId IS NOT NULL THEN 'order'
             WHEN ServiceId IS NOT NULL OR BookingId IS NOT NULL THEN 'booking'
             ELSE 'booking'
           END AS SourceType
         FROM SalonReviews
         WHERE Rating IS NOT NULL AND CAST(CreatedAt AS date) BETWEEN @s AND @e
       )
       SELECT
         COUNT(1) AS TotalReviews,
         AVG(CASE WHEN SourceType = 'booking' THEN Rating END) AS BookingAvg,
         SUM(CASE WHEN SourceType = 'booking' THEN 1 ELSE 0 END) AS BookingCnt,
         AVG(CASE WHEN SourceType = 'order' THEN Rating END) AS OrderAvg,
         SUM(CASE WHEN SourceType = 'order' THEN 1 ELSE 0 END) AS OrderCnt
       FROM Classified`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [{ TotalReviews: 0, BookingAvg: 0, BookingCnt: 0, OrderAvg: 0, OrderCnt: 0 }] })),
  ])

  const bookingRevenueCurrent = Number(revRes.recordset?.[0]?.Revenue || 0)
  const bookingRevenuePrev = Number(revPrevRes.recordset?.[0]?.Revenue || 0)
  const orderRevenueCurrent = Number(orderRevRes.recordset?.[0]?.Revenue || 0)
  const orderRevenuePrev = Number(orderRevPrevRes.recordset?.[0]?.Revenue || 0)
  const ordersCurrent = Number(orderCntRes.recordset?.[0]?.Cnt || 0)
  const ordersPrev = Number(orderCntPrevRes.recordset?.[0]?.Cnt || 0)
  const completedOrdersCurrent = Number(completedOrderCntRes.recordset?.[0]?.Cnt || 0)
  const completedOrdersPrev = Number(completedOrderCntPrevRes.recordset?.[0]?.Cnt || 0)
  const revenueCurrent = bookingRevenueCurrent + orderRevenueCurrent
  const revenuePrev = bookingRevenuePrev + orderRevenuePrev
  const apptsCurrent = Number(apptRes.recordset?.[0]?.Cnt || 0)
  const apptsPrev = Number(apptPrevRes.recordset?.[0]?.Cnt || 0)
  const customersCurrent = Number(customersPeriodRes.recordset?.[0]?.Cnt || 0)
  const outOfStock = Number(outStockRes.recordset?.[0]?.Cnt || 0)
  const lowStock = Number(lowRes.recordset?.[0]?.Cnt || 0)
  const totalInventoryItems = Number(totalInventoryItemsRes.recordset?.[0]?.Cnt || 0)
  const staffTotal = Number(staffCountRes.recordset?.[0]?.Cnt || 1)

  const staffLoadPeriodRes = await query(
    `SELECT
       st.StaffId,
       COUNT(DISTINCT CASE
         WHEN b.BookingId IS NOT NULL
          AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) NOT IN ('cancelled', 'cancelled', 'cancel', 'no_show', 'noshow', 'no-show', 'no show')
         THEN b.BookingId END) AS AssignedCnt
     FROM Staff st
     LEFT JOIN BookingServices bs ON bs.StaffId = st.StaffId
     LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
     GROUP BY st.StaffId`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const assignedBookingCoverageRes = await query(
    `SELECT COUNT(DISTINCT b.BookingId) AS AssignedBookingCnt
     FROM Bookings b
     WHERE CAST(b.BookingTime AS date) BETWEEN @s AND @e
       AND EXISTS (
         SELECT 1
         FROM BookingServices bs
         WHERE bs.BookingId = b.BookingId
           AND bs.StaffId IS NOT NULL
       )`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [{ AssignedBookingCnt: 0 }] }))

  const staffAssignedLoads = (staffLoadPeriodRes.recordset || []).map((r) => Number(r.AssignedCnt || 0))
  const totalStaffForWorkload = Math.max(1, staffAssignedLoads.length || staffTotal || 1)
  const totalAssignedForWorkload = staffAssignedLoads.reduce((sum, x) => sum + x, 0)
  const assignedBookingCount = Number(assignedBookingCoverageRes.recordset?.[0]?.AssignedBookingCnt || 0)
  const unassignedBookingCount = Math.max(0, apptsCurrent - assignedBookingCount)
  const assignedCoveragePct = apptsCurrent > 0 ? Math.round((assignedBookingCount / apptsCurrent) * 100) : 0
  const avgAssignedPerStaff = totalStaffForWorkload > 0 ? (totalAssignedForWorkload / totalStaffForWorkload) : 0
  const overloadedThreshold = Math.max(2, Math.ceil(avgAssignedPerStaff * 1.2))

  let overloadedCount = 0
  let idleCount = 0
  for (const cnt of staffAssignedLoads) {
    if (cnt <= 0) idleCount += 1
    else if (cnt >= overloadedThreshold) overloadedCount += 1
  }
  const normalCount = Math.max(0, totalStaffForWorkload - overloadedCount - idleCount)

  const overloadedPct = Math.round((overloadedCount / totalStaffForWorkload) * 100)
  const idlePct = Math.round((idleCount / totalStaffForWorkload) * 100)
  const normalPct = Math.max(0, 100 - overloadedPct - idlePct)

  const noShowCnt = Number(noShowRes.recordset?.[0]?.NoShowCnt || 0)
  const noShowTotal = Number(noShowRes.recordset?.[0]?.TotalCnt || 0)
  const noShowRatePct = noShowTotal ? Math.round((noShowCnt / noShowTotal) * 100) : 0
  const noShowPrevCnt = Number(noShowPrevRes.recordset?.[0]?.NoShowCnt || 0)
  const noShowPrevTotal = Number(noShowPrevRes.recordset?.[0]?.TotalCnt || 0)
  const noShowPrevRate = noShowPrevTotal ? Math.round((noShowPrevCnt / noShowPrevTotal) * 100) : 0
  const noShowDeltaPct = pctDelta(noShowRatePct, noShowPrevRate)

  const returningCnt = Number(returningRes.recordset?.[0]?.ReturningCnt || 0)
  const newCnt = Number(returningRes.recordset?.[0]?.NewCnt || 0)
  const customerMixTotal = returningCnt + newCnt
  const returningPct = customerMixTotal ? Math.round((returningCnt / customerMixTotal) * 100) : 0

  const ratingCurrent = Number(ratingRes.recordset?.[0]?.AvgRating || 0)
  const ratingPrev = Number(ratingPrevRes.recordset?.[0]?.AvgRating || 0)
  const ratingTotalReviews = Number(ratingMixRes.recordset?.[0]?.TotalReviews || 0)
  const ratingBookingValue = Number(Number(ratingMixRes.recordset?.[0]?.BookingAvg || 0).toFixed(1))
  const ratingBookingCount = Number(ratingMixRes.recordset?.[0]?.BookingCnt || 0)
  const ratingOrderValue = Number(Number(ratingMixRes.recordset?.[0]?.OrderAvg || 0).toFixed(1))
  const ratingOrderCount = Number(ratingMixRes.recordset?.[0]?.OrderCnt || 0)

  const revenueDeltaPct = pctDelta(revenueCurrent, revenuePrev)
  const ordersDeltaPct = pctDelta(ordersCurrent, ordersPrev)
  const orderCompletionRate = ordersCurrent > 0 ? Math.round((completedOrdersCurrent / ordersCurrent) * 100) : 0
  const orderCompletionRatePrev = ordersPrev > 0 ? Math.round((completedOrdersPrev / ordersPrev) * 100) : 0
  const orderCompletionDeltaPct = pctDelta(orderCompletionRate, orderCompletionRatePrev)
  const apptsDeltaPct = pctDelta(apptsCurrent, apptsPrev)
  const utilizationPct = Math.min(100, Math.round((apptsCurrent / Math.max(1, staffTotal * meta.days * 8)) * 100))
  const utilizationPrev = Math.min(100, Math.round((apptsPrev / Math.max(1, staffTotal * meta.days * 8)) * 100))
  const utilizationDeltaPct = pctDelta(utilizationPct, utilizationPrev)
  const capacitySlotsTotal = Math.max(1, staffTotal * meta.days * 8)
  const ratingDeltaPct = pctDelta(ratingCurrent, ratingPrev)
  const ratingDeltaValue = Number((ratingCurrent - ratingPrev).toFixed(1))

  const prevCustomersRes = await query(
    `SELECT COUNT(DISTINCT CustomerUserId) AS Cnt
     FROM Bookings
     WHERE CustomerUserId IS NOT NULL AND CAST(BookingTime AS date) BETWEEN @s AND @e`,
    { s: prevStartIso, e: prevEndIso }
  ).catch(() => ({ recordset: [{ Cnt: 0 }] }))

  const prevCustomers = Number(prevCustomersRes.recordset?.[0]?.Cnt || 0)
  const avgRevenuePerCustomer = customersCurrent ? Math.round(revenueCurrent / customersCurrent) : 0
  const avgRevenuePrev = prevCustomers ? Math.round(revenuePrev / prevCustomers) : 0
  const avgRevenueDeltaPct = pctDelta(avgRevenuePerCustomer, avgRevenuePrev)

  const lowCriticalRes = await query(
    `${inventoryAlertSourceSql}
     SELECT COUNT(1) AS Cnt
     FROM InventoryAlertSource
     WHERE ReorderLevel > 0 AND Quantity <= ReorderLevel * 0.5`
  ).catch(() => ({ recordset: [{ Cnt: 0 }] }))

  const lowStockCritical = Number(lowCriticalRes.recordset?.[0]?.Cnt || 0)
  const healthyStockCount = Math.max(0, totalInventoryItems - outOfStock - lowStock)

  const today = new Date()
  const todayIso = toIsoDate(today)
  const last30StartIso = toIsoDate(addDays(today, -29))

  const [
    bookingStatusPeriodRes,
    todayOrdersSnapshotRes,
    activeCustomers30Res,
    allCustomersRes,
    visits30Res,
    inventoryValueRes,
    todayScheduleRawRes,
    todayStaffShiftRes,
    staffSkillRowsRes,
  ] = await Promise.all([
    query(
      `SELECT COALESCE(Status, 'Unknown') AS StatusName, COUNT(1) AS Cnt
       FROM Bookings
       WHERE BookingTime IS NOT NULL
         AND CAST(BookingTime AS date) BETWEEN @s AND @e
       GROUP BY COALESCE(Status, 'Unknown')`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [] })),
    query(
      `SELECT
         COUNT(1) AS TotalOrders,
         SUM(CASE WHEN LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done') THEN COALESCE(Total, 0) ELSE 0 END) AS ProductRevenue
       FROM Orders
       WHERE CreatedAt IS NOT NULL AND CAST(CreatedAt AS date) = @d`,
      { d: todayIso }
    ).catch(() => ({ recordset: [{ TotalOrders: 0, ProductRevenue: 0 }] })),
    query(
      `SELECT COUNT(DISTINCT CustomerUserId) AS Cnt
       FROM Bookings
       WHERE CustomerUserId IS NOT NULL
         AND CAST(BookingTime AS date) BETWEEN @s AND @e`,
      { s: last30StartIso, e: todayIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(DISTINCT CustomerUserId) AS Cnt
       FROM Bookings
       WHERE CustomerUserId IS NOT NULL`
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Bookings
       WHERE CustomerUserId IS NOT NULL
         AND CAST(BookingTime AS date) BETWEEN @s AND @e`,
      { s: last30StartIso, e: todayIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT SUM(COALESCE(TRY_CONVERT(DECIMAL(19,2), Quantity), 0) * COALESCE(TRY_CONVERT(DECIMAL(19,2), PriceVnd), 0)) AS TotalValue
       FROM InventoryItems`
    ).catch(() => ({ recordset: [{ TotalValue: 0 }] })),
    query(todayScheduleSql, { d: todayIso }).catch(() => ({ recordset: [] })),
    query(
      `SELECT
         sa.StaffId,
         COALESCE(u.Name, CONCAT('Staff #', sa.StaffId)) AS StaffName,
         sa.StartHour,
         sa.EndHour
       FROM StaffAvailability sa
       LEFT JOIN Staff st ON st.StaffId = sa.StaffId
       LEFT JOIN Users u ON u.UserId = st.UserId
       WHERE CAST(sa.WeekStartDate AS date) = @d`,
      { d: todayIso }
    ).catch(() => ({ recordset: [] })),
    query(
      `SELECT
         st.StaffId,
         sv.Name AS ServiceName,
         COUNT(1) AS Cnt
       FROM Staff st
       LEFT JOIN BookingServices bs ON bs.StaffId = st.StaffId
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
         AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE sv.Name IS NOT NULL
       GROUP BY st.StaffId, sv.Name`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [] })),
  ])

  const todayStatusBreakdown = { pending: 0, booked: 0, completed: 0, cancelled: 0, total: 0 }
  for (const row of bookingStatusPeriodRes.recordset || []) {
    const key = normalizeBookingStatus(row.StatusName)
    const count = Number(row.Cnt || 0)
    if (key === 'completed') todayStatusBreakdown.completed += count
    else if (key === 'booked') todayStatusBreakdown.booked += count
    else if (key === 'cancelled') todayStatusBreakdown.cancelled += count
    else todayStatusBreakdown.pending += count
    todayStatusBreakdown.total += count
  }

  const activeCustomers30 = Number(activeCustomers30Res.recordset?.[0]?.Cnt || 0)
  const allCustomersEver = Number(allCustomersRes.recordset?.[0]?.Cnt || 0)
  const inactiveCustomers = Math.max(0, allCustomersEver - activeCustomers30)
  const visits30 = Number(visits30Res.recordset?.[0]?.Cnt || 0)
  const avgVisitsPerCustomerPerMonth = activeCustomers30 > 0 ? Number((visits30 / activeCustomers30).toFixed(2)) : 0
  const inventoryTotalValue = Number(inventoryValueRes.recordset?.[0]?.TotalValue || 0)

  const todayOrders = Number(todayOrdersSnapshotRes.recordset?.[0]?.TotalOrders || 0)
  const todayProductRevenue = Number(todayOrdersSnapshotRes.recordset?.[0]?.ProductRevenue || 0)

  const nowMinutes = today.getHours() * 60 + today.getMinutes()
  const staffAvailabilityMap = new Map()
  const staffNextMap = new Map()

  const staffSkillTempMap = new Map()
  for (const row of staffSkillRowsRes.recordset || []) {
    const staffId = String(row.StaffId || '').trim()
    if (!staffId) continue
    const list = staffSkillTempMap.get(staffId) || []
    list.push({ name: String(row.ServiceName || '').trim(), count: Number(row.Cnt || 0) })
    staffSkillTempMap.set(staffId, list)
  }

  const staffSkillMap = new Map()
  for (const [staffId, rows] of staffSkillTempMap.entries()) {
    const skills = rows
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((x) => x.name)
    staffSkillMap.set(staffId, skills)
  }

  const todaySchedule = (todayScheduleRawRes.recordset || []).map((r) => {
    const d = new Date(r.BookingTime)
    const startMinutes = Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes()
    const normalizedStatus = normalizeBookingStatus(r.BookingStatus)
    const isActiveNow = startMinutes !== null
      && startMinutes <= nowMinutes
      && nowMinutes < startMinutes + 60
      && normalizedStatus !== 'completed'
      && normalizedStatus !== 'cancelled'

    const staffId = r.StaffId ? String(r.StaffId) : ''
    if (staffId) {
      const current = staffAvailabilityMap.get(staffId) || { staffId, name: r.StaffName || `Staff ${staffId}`, busy: false }
      current.busy = current.busy || isActiveNow
      staffAvailabilityMap.set(staffId, current)

      if (!isActiveNow && startMinutes !== null && startMinutes > nowMinutes && normalizedStatus !== 'completed' && normalizedStatus !== 'cancelled') {
        const existing = staffNextMap.get(staffId)
        if (!existing || startMinutes < existing.minutes) {
          staffNextMap.set(staffId, { minutes: startMinutes, label: formatHm(r.BookingTime) })
        }
      }
    }

    return {
      bookingId: r.BookingId,
      staffId,
      time: formatHm(r.BookingTime),
      customer: r.CustomerName || 'Walk-in',
      staff: r.StaffName || 'Unassigned',
      service: r.ServiceName || 'Service pending',
      status: normalizedStatus,
      statusLabel: bookingStatusLabel(normalizedStatus),
      isActiveNow,
      reviewRating: Number(r.ReviewRating || 0),
      reviewComment: String(r.ReviewComment || ''),
      reviewAt: toSqlDateKey(r.ReviewCreatedAt),
    }
  })

  const scheduledShiftMeta = new Map()
  for (const row of todayStaffShiftRes.recordset || []) {
    const staffId = String(row.StaffId || '').trim()
    if (!staffId) continue

    const startMinutes = timeValueToMinutes(row.StartHour)
    const endMinutes = timeValueToMinutes(row.EndHour)
    const isActiveShift = startMinutes !== null && endMinutes !== null && startMinutes <= nowMinutes && nowMinutes < endMinutes

    const meta = scheduledShiftMeta.get(staffId) || {
      name: String(row.StaffName || '').trim(),
      activeShift: false,
      nextShiftMinutes: null,
    }

    if (!meta.name) meta.name = String(row.StaffName || '').trim()
    if (isActiveShift) meta.activeShift = true
    if (startMinutes !== null && startMinutes > nowMinutes) {
      if (meta.nextShiftMinutes === null || startMinutes < meta.nextShiftMinutes) {
        meta.nextShiftMinutes = startMinutes
      }
    }

    scheduledShiftMeta.set(staffId, meta)
  }

  for (const [staffId, meta] of scheduledShiftMeta.entries()) {
    if (!meta.activeShift && meta.nextShiftMinutes === null) continue

    const current = staffAvailabilityMap.get(staffId) || {
      staffId,
      name: meta.name || `Staff ${staffId}`,
      busy: false,
    }
    if (!current.name) current.name = meta.name || `Staff ${staffId}`
    staffAvailabilityMap.set(staffId, current)

    if (!staffNextMap.has(staffId) && meta.nextShiftMinutes !== null) {
      staffNextMap.set(staffId, {
        minutes: meta.nextShiftMinutes,
        label: `Shift ${minutesToHm(meta.nextShiftMinutes)}`,
      })
    }
  }

  const staffAvailability = Array.from(staffAvailabilityMap.values()).map((s) => {
    const sid = String(s.staffId || '')
    const nextMeta = sid ? staffNextMap.get(sid) : null
    return {
      staffId: s.staffId || '',
      name: s.name,
      status: s.busy ? 'busy' : 'available',
      skills: sid ? (staffSkillMap.get(sid) || []) : [],
      nextBookingTime: s.busy ? '' : (nextMeta?.label || ''),
    }
  })

  const completedBookingStatusSql = "('completed', 'complete', 'done')"
  const completedOrderStatusSql = "('completed', 'complete', 'done')"

  async function getRevenueByDateMap(startIso, endIso) {
    const [serviceRevRes, productRevRes, completedBookingsRes] = await Promise.all([
      query(
        `SELECT CAST(b.BookingTime AS date) AS D, SUM(ISNULL(sv.Price, 0)) AS Revenue
         FROM BookingServices bs
         LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
         LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
         WHERE b.BookingTime IS NOT NULL
           AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
           AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ${completedBookingStatusSql}
         GROUP BY CAST(b.BookingTime AS date)
         ORDER BY D`,
        { s: startIso, e: endIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT CAST(CreatedAt AS date) AS D, SUM(Total) AS Revenue
         FROM Orders
         WHERE CreatedAt IS NOT NULL
           AND CAST(CreatedAt AS date) BETWEEN @s AND @e
           AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ${completedOrderStatusSql}
         GROUP BY CAST(CreatedAt AS date)
         ORDER BY D`,
        { s: startIso, e: endIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT CAST(BookingTime AS date) AS D, COUNT(1) AS Cnt
         FROM Bookings
         WHERE BookingTime IS NOT NULL
           AND CAST(BookingTime AS date) BETWEEN @s AND @e
           AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ${completedBookingStatusSql}
         GROUP BY CAST(BookingTime AS date)
         ORDER BY D`,
        { s: startIso, e: endIso }
      ).catch(() => ({ recordset: [] })),
    ])

    return {
      service: new Map((serviceRevRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Revenue || 0)])),
      product: new Map((productRevRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Revenue || 0)])),
      bookings: new Map((completedBookingsRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Cnt || 0)])),
    }
  }

  function pushTrendRow(rows, label, serviceRevenue, productRevenue, completedBookings) {
    const revenueTotal = Number(serviceRevenue || 0) + Number(productRevenue || 0)
    rows.push({
      label,
      revenue: revenueTotal,
      revenueTotal,
      revenueBooking: Number(serviceRevenue || 0),
      revenueOrder: Number(productRevenue || 0),
      bookingCount: Number(completedBookings || 0),
      appts: Number(completedBookings || 0),
    })
  }

  let trendRows = []
  let revenuePrevRows = []
  let ordersTrendRows = []

  if (meta.period === 'day') {
    const endDate = parseDateOnly(refs.refDate) || new Date()
    const startDate = addDays(endDate, -6)
    const prevEndDate = addDays(startDate, -1)
    const prevStartDate = addDays(prevEndDate, -6)

    const [currentMaps, prevMaps] = await Promise.all([
      getRevenueByDateMap(toIsoDate(startDate), toIsoDate(endDate)),
      getRevenueByDateMap(toIsoDate(prevStartDate), toIsoDate(prevEndDate)),
    ])

    for (let i = 0; i < 7; i++) {
      const currentDate = addDays(startDate, i)
      const prevDate = addDays(prevStartDate, i)
      const ck = toIsoDate(currentDate)
      const pk = toIsoDate(prevDate)

      pushTrendRow(
        trendRows,
        formatDateLabelDdMm(currentDate),
        currentMaps.service.get(ck) || 0,
        currentMaps.product.get(ck) || 0,
        currentMaps.bookings.get(ck) || 0
      )
      pushTrendRow(
        revenuePrevRows,
        formatDateLabelDdMm(prevDate),
        prevMaps.service.get(pk) || 0,
        prevMaps.product.get(pk) || 0,
        prevMaps.bookings.get(pk) || 0
      )
    }
  } else if (meta.period === 'week') {
    const endRefDate = parseDateOnly(refs.refDate) || new Date()
    const currentWeekEnd = addDays(startOfWeekMonday(endRefDate), 6)
    const currentWeekStart = addDays(currentWeekEnd, -55) // 8 weeks window
    const prevWeekEnd = addDays(currentWeekStart, -1)
    const prevWeekStart = addDays(prevWeekEnd, -55)

    const [currentMaps, prevMaps] = await Promise.all([
      getRevenueByDateMap(toIsoDate(currentWeekStart), toIsoDate(currentWeekEnd)),
      getRevenueByDateMap(toIsoDate(prevWeekStart), toIsoDate(prevWeekEnd)),
    ])

    for (let w = 0; w < 8; w++) {
      const weekStart = addDays(currentWeekStart, w * 7)
      const weekEnd = addDays(weekStart, 6)
      const prevWeekStartCursor = addDays(prevWeekStart, w * 7)
      const prevWeekEndCursor = addDays(prevWeekStartCursor, 6)

      let serviceRevenue = 0
      let productRevenue = 0
      let bookingCount = 0
      let prevServiceRevenue = 0
      let prevProductRevenue = 0
      let prevBookingCount = 0

      for (let d = 0; d < 7; d++) {
        const currentKey = toIsoDate(addDays(weekStart, d))
        const prevKey = toIsoDate(addDays(prevWeekStartCursor, d))
        serviceRevenue += currentMaps.service.get(currentKey) || 0
        productRevenue += currentMaps.product.get(currentKey) || 0
        bookingCount += currentMaps.bookings.get(currentKey) || 0
        prevServiceRevenue += prevMaps.service.get(prevKey) || 0
        prevProductRevenue += prevMaps.product.get(prevKey) || 0
        prevBookingCount += prevMaps.bookings.get(prevKey) || 0
      }

      const label = `${formatDateLabelDdMm(weekStart)}-${formatDateLabelDdMm(weekEnd)}`
      const prevLabel = `${formatDateLabelDdMm(prevWeekStartCursor)}-${formatDateLabelDdMm(prevWeekEndCursor)}`
      pushTrendRow(trendRows, label, serviceRevenue, productRevenue, bookingCount)
      pushTrendRow(revenuePrevRows, prevLabel, prevServiceRevenue, prevProductRevenue, prevBookingCount)
    }
  } else if (meta.period === 'month') {
    const selectedMonth = parseMonthOnly(refs.refMonth)
    const monthYear = selectedMonth?.year || new Date().getFullYear()
    const monthNumber = selectedMonth?.month || (new Date().getMonth() + 1)
    const monthStart = new Date(monthYear, monthNumber - 1, 1)
    const monthEnd = new Date(monthYear, monthNumber, 0)

    const prevMonthStart = new Date(monthYear, monthNumber - 2, 1)
    const prevMonthEnd = new Date(monthYear, monthNumber - 1, 0)
    const prevMonthDays = prevMonthEnd.getDate()

    const [currentMaps, prevMaps] = await Promise.all([
      getRevenueByDateMap(toIsoDate(monthStart), toIsoDate(monthEnd)),
      getRevenueByDateMap(toIsoDate(prevMonthStart), toIsoDate(prevMonthEnd)),
    ])

    const dayCount = monthEnd.getDate()
    for (let day = 1; day <= dayCount; day++) {
      const currentDate = new Date(monthYear, monthNumber - 1, day)
      const currentKey = toIsoDate(currentDate)
      const prevDay = Math.min(day, prevMonthDays)
      const prevDate = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), prevDay)
      const prevKey = toIsoDate(prevDate)

      pushTrendRow(
        trendRows,
        String(day),
        currentMaps.service.get(currentKey) || 0,
        currentMaps.product.get(currentKey) || 0,
        currentMaps.bookings.get(currentKey) || 0
      )
      pushTrendRow(
        revenuePrevRows,
        String(prevDay),
        prevMaps.service.get(prevKey) || 0,
        prevMaps.product.get(prevKey) || 0,
        prevMaps.bookings.get(prevKey) || 0
      )
    }
  } else {
    const selectedYear = parseYearOnly(refs.refYear) || new Date().getFullYear()
    const yearStart = new Date(selectedYear, 0, 1)
    const yearEnd = new Date(selectedYear, 11, 31)
    const prevYearStart = new Date(selectedYear - 1, 0, 1)
    const prevYearEnd = new Date(selectedYear - 1, 11, 31)

    const [currentMaps, prevMaps] = await Promise.all([
      getRevenueByDateMap(toIsoDate(yearStart), toIsoDate(yearEnd)),
      getRevenueByDateMap(toIsoDate(prevYearStart), toIsoDate(prevYearEnd)),
    ])

    for (let month = 0; month < 12; month++) {
      let serviceRevenue = 0
      let productRevenue = 0
      let bookingCount = 0
      let prevServiceRevenue = 0
      let prevProductRevenue = 0
      let prevBookingCount = 0

      const currentMonthStart = new Date(selectedYear, month, 1)
      const currentMonthEnd = new Date(selectedYear, month + 1, 0)
      const prevMonthStart = new Date(selectedYear - 1, month, 1)
      const prevMonthEnd = new Date(selectedYear - 1, month + 1, 0)

      for (let d = new Date(currentMonthStart); d <= currentMonthEnd; d = addDays(d, 1)) {
        const key = toIsoDate(d)
        serviceRevenue += currentMaps.service.get(key) || 0
        productRevenue += currentMaps.product.get(key) || 0
        bookingCount += currentMaps.bookings.get(key) || 0
      }
      for (let d = new Date(prevMonthStart); d <= prevMonthEnd; d = addDays(d, 1)) {
        const key = toIsoDate(d)
        prevServiceRevenue += prevMaps.service.get(key) || 0
        prevProductRevenue += prevMaps.product.get(key) || 0
        prevBookingCount += prevMaps.bookings.get(key) || 0
      }

      const label = monthShortLabel(month)
      pushTrendRow(trendRows, label, serviceRevenue, productRevenue, bookingCount)
      pushTrendRow(revenuePrevRows, label, prevServiceRevenue, prevProductRevenue, prevBookingCount)
    }
  }

  ordersTrendRows = trendRows.map((x) => ({
    label: x.label,
    orders: Number(x.bookingCount || 0),
    orderRevenue: Number(x.revenueOrder || 0),
  }))

  const ordersByStatusRes = await query(
    `SELECT COALESCE(Status, 'Unknown') AS StatusName, COUNT(1) AS Cnt
     FROM Orders
     WHERE CreatedAt IS NOT NULL AND CAST(CreatedAt AS date) BETWEEN @s AND @e
     GROUP BY COALESCE(Status, 'Unknown')
     ORDER BY Cnt DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const ordersByStatus = (ordersByStatusRes.recordset || []).map((r) => ({
    status: String(r.StatusName || 'Unknown'),
    count: Number(r.Cnt || 0),
  }))

  const recentOrdersRes = await query(
    `SELECT TOP 6
        o.OrderId,
        o.Status,
        o.CreatedAt,
        o.CustomerName,
        o.Total,
        o.PaymentMethod,
        COALESCE(oiAgg.TotalQty, 0) AS TotalQty,
        COALESCE(oiAgg.ItemLines, 0) AS ItemLines,
        COALESCE(oiAgg.ProductSummary, '') AS ProductSummary
      FROM Orders o
      OUTER APPLY (
        SELECT
          SUM(ISNULL(oi.Quantity, 0)) AS TotalQty,
          COUNT(1) AS ItemLines,
          STRING_AGG(
            CONCAT(
              COALESCE(NULLIF(LTRIM(RTRIM(oi.ProductName)), ''), CONCAT('Product #', oi.ProductId)),
              ' x',
              CAST(ISNULL(oi.Quantity, 0) AS varchar(16))
            ),
            ', '
          ) AS ProductSummary
        FROM OrderItems oi
        WHERE oi.OrderId = o.OrderId
      ) oiAgg
      WHERE o.CreatedAt IS NOT NULL
        AND CAST(o.CreatedAt AS date) BETWEEN @s AND @e
      ORDER BY o.CreatedAt DESC, o.OrderId DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const recentOrders = (recentOrdersRes.recordset || []).map((r) => ({
    orderId: Number(r.OrderId || 0),
    status: String(r.Status || 'pending'),
    createdAt: r.CreatedAt,
    customerName: String(r.CustomerName || ''),
    total: Number(r.Total || 0),
    paymentMethod: String(r.PaymentMethod || ''),
    totalQty: Number(r.TotalQty || 0),
    itemLines: Number(r.ItemLines || 0),
    productSummary: String(r.ProductSummary || ''),
  }))

  // Keep KPI math consistent: pending = total orders - completed orders in the same period.
  const pendingOrdersCurrent = Math.max(0, ordersCurrent - completedOrdersCurrent)
  const pendingOrdersPrev = Math.max(0, ordersPrev - completedOrdersPrev)
  const pendingOrdersDeltaPct = pctDelta(pendingOrdersCurrent, pendingOrdersPrev)

  const recentApptRes = await query(
    `SELECT TOP 8
        b.BookingTime,
        b.Status AS BookingStatus,
        cu.Name AS CustomerName,
        cu.AvatarUrl AS CustomerAvatarUrl,
        sv.Name AS ServiceName,
        su.Name AS StaffName,
        su.AvatarUrl AS StaffAvatarUrl
      FROM Bookings b
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      OUTER APPLY (
        SELECT TOP 1 *
        FROM BookingServices x
        WHERE x.BookingId = b.BookingId
        ORDER BY x.BookingServiceId
      ) bs
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Staff st ON st.StaffId = bs.StaffId
      LEFT JOIN Users su ON su.UserId = st.UserId
      WHERE CAST(b.BookingTime AS date) BETWEEN @s AND @e
      ORDER BY b.BookingTime DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const recentAppointments = (recentApptRes.recordset || []).map((r) => ({
    customer: r.CustomerName || '',
    customerAvatarUrl: r.CustomerAvatarUrl || '',
    service: r.ServiceName || '',
    staff: r.StaffName || '',
    staffAvatarUrl: r.StaffAvatarUrl || '',
    time: formatHm(r.BookingTime),
    status: String(r.BookingStatus || 'C').toLowerCase(),
    statusLabel: r.BookingStatus || 'Pending',
  }))

  const staffPerfRes = await query(
    `SELECT TOP 7
        st.StaffId,
        COALESCE(su.Name, CONCAT('Staff #', st.StaffId)) AS StaffName,
        su.AvatarUrl AS StaffAvatarUrl,
        COUNT(CASE WHEN b.BookingId IS NOT NULL THEN bs.BookingServiceId END) AS Appts,
        COUNT(DISTINCT CASE WHEN b.BookingId IS NOT NULL THEN b.CustomerUserId END) AS Customers,
        COUNT(DISTINCT CASE WHEN b.BookingId IS NOT NULL THEN CAST(b.BookingTime AS date) END) AS ActiveDays,
        SUM(CASE
              WHEN b.BookingId IS NOT NULL
               AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
              THEN COALESCE(bs.Price, sv.Price)
              ELSE 0
            END) AS Revenue
      FROM Staff st
      LEFT JOIN Users su ON su.UserId = st.UserId
      LEFT JOIN BookingServices bs ON bs.StaffId = st.StaffId
      LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
        AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      GROUP BY st.StaffId, su.Name, su.AvatarUrl
      ORDER BY Revenue DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const staffReviewFeatureRes = hasBookingReviews
    ? await query(
      `WITH StaffReview AS (
         SELECT
           sbs.StaffId,
           CAST(br.Rating AS FLOAT) AS Rating,
           COALESCE(br.Comment, '') AS Comment,
           br.CreatedAt,
           ROW_NUMBER() OVER (
             PARTITION BY sbs.StaffId
             ORDER BY CASE WHEN CAST(br.Rating AS FLOAT) <= 2 THEN 0 ELSE 1 END, br.CreatedAt DESC
           ) AS Rn,
           AVG(CAST(br.Rating AS FLOAT)) OVER (PARTITION BY sbs.StaffId) AS AvgRating,
           COUNT(1) OVER (PARTITION BY sbs.StaffId) AS RatingCount
         FROM SalonReviews br
         INNER JOIN Bookings b ON b.BookingId = br.BookingId
         INNER JOIN (
           SELECT DISTINCT BookingId, StaffId
           FROM BookingServices
           WHERE StaffId IS NOT NULL
         ) sbs ON sbs.BookingId = b.BookingId
         WHERE br.Rating IS NOT NULL
       )
       SELECT StaffId, AvgRating, RatingCount, Rating AS FeaturedRating, Comment AS FeaturedComment
       FROM StaffReview
       WHERE Rn = 1`
    ).catch(() => ({ recordset: [] }))
    : { recordset: [] }

  const staffReviewMap = new Map((staffReviewFeatureRes.recordset || []).map((r) => [String(r.StaffId || ''), {
    avgRating: Number(Number(r.AvgRating || 0).toFixed(1)),
    ratingCount: Number(r.RatingCount || 0),
    featuredReviewRating: Number(r.FeaturedRating || 0),
    featuredReview: String(r.FeaturedComment || ''),
  }]))

  const staffPerformance = (staffPerfRes.recordset || []).map((r, idx) => ({
    staffId: r.StaffId,
    rank: idx + 1,
    name: r.StaffName || '',
    avatarUrl: r.StaffAvatarUrl || '',
    appts: Number(r.Appts || 0),
    customers: Number(r.Customers || 0),
    revenue: toMoney(r.Revenue),
    utilizationPct: Math.min(100, Math.round((Number(r.Appts || 0) / Math.max(1, meta.days * 8)) * 100)),
    efficiencyPct: Math.min(100, Math.round((Number(r.Appts || 0) / Math.max(1, Number(r.ActiveDays || 0) * 8)) * 100)),
    avgRating: Number(staffReviewMap.get(String(r.StaffId || ''))?.avgRating || 0),
    ratingCount: Number(staffReviewMap.get(String(r.StaffId || ''))?.ratingCount || 0),
    featuredReviewRating: Number(staffReviewMap.get(String(r.StaffId || ''))?.featuredReviewRating || 0),
    featuredReview: String(staffReviewMap.get(String(r.StaffId || ''))?.featuredReview || ''),
  }))

  const invAlertRes = await query(
    `${inventoryAlertSourceSql}
      SELECT TOP 6 Name, Quantity, ReorderLevel, StockType, ImportPrice, SellPrice
     FROM InventoryAlertSource
      WHERE Quantity <= 0 OR (Quantity > 0 AND ReorderLevel > 0 AND Quantity <= ReorderLevel)
     ORDER BY Quantity ASC`
  ).catch(() => ({ recordset: [] }))

  const inventoryAlerts = (invAlertRes.recordset || []).map((r) => {
    const qty = Number(r.Quantity || 0)
    const reorderLevel = Number(r.ReorderLevel || 0)
    const dailyUsage = Math.max(1, Math.round(reorderLevel / 7))
    const daysRemaining = Math.max(0, Math.round(qty / dailyUsage))
    const severity = qty <= 0 ? 'out_of_stock' : qty <= reorderLevel ? 'warning' : 'healthy'
    const type = String(r.StockType || '')
    return {
      name: r.Name,
      qty,
      reorderLevel,
      dailyUsage,
      daysRemaining,
      severity,
      severityLabel: severity === 'out_of_stock' ? 'Out of stock' : severity === 'warning' ? 'Warning' : 'Healthy',
      type,
      typeLabel: type === 'retail' ? 'Retail Product' : 'Supply Item',
      importPrice: Number(r.ImportPrice || 0),
      sellPrice: Number(r.SellPrice || 0),
    }
  }).filter((x) => x.severity !== 'healthy')

  const topCustomersRes = await query(
    `SELECT TOP 6
        b.CustomerUserId,
        cu.Name AS CustomerName,
        COUNT(DISTINCT CASE
              WHEN LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
              THEN b.BookingId
              ELSE NULL
            END) AS Visits,
        SUM(CASE
              WHEN LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
              THEN COALESCE(bs.Price, sv.Price)
              ELSE 0
            END) AS Spending,
        MAX(CASE
              WHEN LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
              THEN CAST(b.BookingTime AS date)
              ELSE NULL
            END) AS LastVisit
      FROM Bookings b
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      WHERE b.CustomerUserId IS NOT NULL AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
      GROUP BY b.CustomerUserId, cu.Name
      ORDER BY Spending DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const customerReviewFeatureRes = hasBookingReviews
    ? await query(
      `WITH CustomerReview AS (
         SELECT
           b.CustomerUserId,
           CAST(br.Rating AS FLOAT) AS Rating,
           COALESCE(br.Comment, '') AS Comment,
           br.CreatedAt,
           ROW_NUMBER() OVER (
             PARTITION BY b.CustomerUserId
             ORDER BY CASE WHEN CAST(br.Rating AS FLOAT) <= 2 THEN 0 ELSE 1 END, br.CreatedAt DESC
           ) AS Rn,
           AVG(CAST(br.Rating AS FLOAT)) OVER (PARTITION BY b.CustomerUserId) AS AvgRating,
           COUNT(1) OVER (PARTITION BY b.CustomerUserId) AS RatingCount
         FROM SalonReviews br
         INNER JOIN Bookings b ON b.BookingId = br.BookingId
         WHERE b.CustomerUserId IS NOT NULL
           AND br.Rating IS NOT NULL
       )
       SELECT CustomerUserId, AvgRating, RatingCount, Rating AS FeaturedRating, Comment AS FeaturedComment
       FROM CustomerReview
       WHERE Rn = 1`
    ).catch(() => ({ recordset: [] }))
    : { recordset: [] }

  const customerReviewMap = new Map((customerReviewFeatureRes.recordset || []).map((r) => [String(r.CustomerUserId || ''), {
    avgRating: Number(Number(r.AvgRating || 0).toFixed(1)),
    ratingCount: Number(r.RatingCount || 0),
    featuredReviewRating: Number(r.FeaturedRating || 0),
    featuredReview: String(r.FeaturedComment || ''),
  }]))

  const now = new Date()
  const topCustomers = (topCustomersRes.recordset || []).map((r) => {
    const spending = toMoney(r.Spending)
    const visits = Number(r.Visits || 0)
    const lastVisitDate = String(r.LastVisit || '').slice(0, 10)
    const diffDays = lastVisitDate ? Math.floor((now - new Date(lastVisitDate)) / (24 * 60 * 60 * 1000)) : null
    const reviewMeta = customerReviewMap.get(String(r.CustomerUserId || '')) || {}
    return {
      customerUserId: String(r.CustomerUserId || ''),
      name: r.CustomerName || 'Unknown',
      spending,
      visits,
      avgSpendPerVisit: visits ? Math.round(spending / visits) : 0,
      lastVisit: lastVisitDate,
      lastVisitDaysAgo: diffDays,
      vip: spending >= 5_000_000,
      atRisk: diffDays !== null && diffDays > 14,
      avgRating: Number(reviewMeta.avgRating || 0),
      ratingCount: Number(reviewMeta.ratingCount || 0),
      featuredReviewRating: Number(reviewMeta.featuredReviewRating || 0),
      featuredReview: String(reviewMeta.featuredReview || ''),
    }
  })

  const revenueByServiceRes = await query(
    `SELECT TOP 6
        sv.ServiceId,
        sv.Name AS ServiceName,
        COUNT(1) AS BookingCount,
        SUM(COALESCE(bs.Price, sv.Price)) AS Revenue
      FROM BookingServices bs
      LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      WHERE CAST(b.BookingTime AS date) BETWEEN @s AND @e
        AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
      GROUP BY sv.ServiceId, sv.Name
      ORDER BY Revenue DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const serviceRatingRes = await query(
    `SELECT
        ServiceId,
        AVG(CAST(Rating AS FLOAT)) AS AvgRating,
        COUNT(1) AS RatingCount
      FROM SalonReviews
      WHERE ServiceId IS NOT NULL
        AND Rating IS NOT NULL
        AND CAST(CreatedAt AS date) BETWEEN @s AND @e
      GROUP BY ServiceId`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const serviceRatingMap = new Map((serviceRatingRes.recordset || []).map((r) => [String(r.ServiceId || ''), {
    avgRating: Number(Number(r.AvgRating || 0).toFixed(1)),
    ratingCount: Number(r.RatingCount || 0),
  }]))

  const revenueByService = (revenueByServiceRes.recordset || []).map((r) => ({
    name: r.ServiceName || 'Unknown',
    bookings: Number(r.BookingCount || 0),
    revenue: toMoney(r.Revenue),
    avgRating: Number(serviceRatingMap.get(String(r.ServiceId || ''))?.avgRating || 0),
    ratingCount: Number(serviceRatingMap.get(String(r.ServiceId || ''))?.ratingCount || 0),
  }))

  const productPerfRes = await query(
    `SELECT TOP 8
        oi.ProductId,
        COALESCE(oi.ProductName, p.Name, 'Unknown') AS ProductName,
        SUM(COALESCE(oi.Quantity, 0)) AS QtySold,
        SUM(COALESCE(oi.Quantity, 0) * COALESCE(oi.Price, 0)) AS Revenue
      FROM OrderItems oi
      INNER JOIN Orders o ON o.OrderId = oi.OrderId
      LEFT JOIN Products p ON p.ProductId = oi.ProductId
      WHERE o.CreatedAt IS NOT NULL
        AND CAST(o.CreatedAt AS date) BETWEEN @s AND @e
        AND LOWER(LTRIM(RTRIM(COALESCE(o.Status, '')))) IN ('completed', 'complete', 'done')
      GROUP BY oi.ProductId, COALESCE(oi.ProductName, p.Name, 'Unknown')
      ORDER BY Revenue DESC, QtySold DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const productRatingRes = await query(
    `SELECT
        ProductId,
        AVG(CAST(Rating AS FLOAT)) AS AvgRating,
        COUNT(1) AS RatingCount
      FROM SalonReviews
      WHERE ProductId IS NOT NULL
        AND Rating IS NOT NULL
        AND CAST(CreatedAt AS date) BETWEEN @s AND @e
      GROUP BY ProductId`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const productRatingMap = new Map((productRatingRes.recordset || []).map((r) => [String(r.ProductId || ''), {
    avgRating: Number(Number(r.AvgRating || 0).toFixed(1)),
    ratingCount: Number(r.RatingCount || 0),
  }]))

  const productPerformance = (productPerfRes.recordset || []).map((r) => ({
    name: String(r.ProductName || 'Unknown'),
    sold: Number(r.QtySold || 0),
    revenue: toMoney(r.Revenue),
    avgRating: Number(productRatingMap.get(String(r.ProductId || ''))?.avgRating || 0),
    ratingCount: Number(productRatingMap.get(String(r.ProductId || ''))?.ratingCount || 0),
  }))

  const productReviewSummaryRes = await query(
    `;WITH ItemEffective AS (
       SELECT
         oi.ProductId,
         COALESCE(pr.Rating, orr.Rating) AS Rating,
         COALESCE(pr.CreatedAt, orr.CreatedAt) AS CreatedAt
       FROM OrderItems oi
       OUTER APPLY (
         SELECT TOP 1 sr.Rating, sr.CreatedAt
         FROM SalonReviews sr
         WHERE sr.ProductId = oi.ProductId
           AND sr.OrderItemId = oi.OrderItemId
           AND sr.Rating IS NOT NULL
         ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
       ) pr
       OUTER APPLY (
         SELECT TOP 1 sr.Rating, sr.CreatedAt
         FROM SalonReviews sr
         WHERE sr.OrderId = oi.OrderId
           AND sr.OrderItemId IS NULL
           AND sr.ServiceId IS NULL
           AND sr.Rating IS NOT NULL
         ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
       ) orr
       WHERE COALESCE(pr.Rating, orr.Rating) IS NOT NULL
     ),
     StandaloneProductReview AS (
       SELECT sr.ProductId, sr.Rating, sr.CreatedAt
       FROM SalonReviews sr
       WHERE sr.ProductId IS NOT NULL
         AND sr.OrderItemId IS NULL
         AND sr.OrderId IS NULL
         AND sr.Rating IS NOT NULL
     ),
     Effective AS (
       SELECT ProductId, Rating, CreatedAt FROM ItemEffective
       UNION ALL
       SELECT ProductId, Rating, CreatedAt FROM StandaloneProductReview
     )
     SELECT
       SUM(CASE WHEN CAST(Rating AS INT) >= 4 THEN 1 ELSE 0 END) AS PositiveCnt,
       SUM(CASE WHEN CAST(Rating AS INT) = 3 THEN 1 ELSE 0 END) AS NeutralCnt,
       SUM(CASE WHEN CAST(Rating AS INT) <= 2 THEN 1 ELSE 0 END) AS NegativeCnt,
       COUNT(1) AS TotalCnt,
       AVG(CAST(Rating AS FLOAT)) AS AvgRating
     FROM Effective
     WHERE CAST(CreatedAt AS date) BETWEEN @s AND @e`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [{ PositiveCnt: 0, NeutralCnt: 0, NegativeCnt: 0, TotalCnt: 0, AvgRating: 0 }] }))

  const productReviewListRes = await query(
    `;WITH ItemEffective AS (
       SELECT
         COALESCE(pr.ReviewId, orr.ReviewId) AS ReviewId,
         COALESCE(pr.UserId, orr.UserId) AS UserId,
         oi.ProductId,
         COALESCE(pr.Rating, orr.Rating) AS Rating,
         COALESCE(pr.Comment, orr.Comment) AS Comment,
         COALESCE(pr.CreatedAt, orr.CreatedAt) AS CreatedAt
       FROM OrderItems oi
       OUTER APPLY (
         SELECT TOP 1 sr.ReviewId, sr.UserId, sr.Rating, sr.Comment, sr.CreatedAt
         FROM SalonReviews sr
         WHERE sr.ProductId = oi.ProductId
           AND sr.OrderItemId = oi.OrderItemId
           AND sr.Rating IS NOT NULL
         ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
       ) pr
       OUTER APPLY (
         SELECT TOP 1 sr.ReviewId, sr.UserId, sr.Rating, sr.Comment, sr.CreatedAt
         FROM SalonReviews sr
         WHERE sr.OrderId = oi.OrderId
           AND sr.OrderItemId IS NULL
           AND sr.ServiceId IS NULL
           AND sr.Rating IS NOT NULL
         ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
       ) orr
       WHERE COALESCE(pr.Rating, orr.Rating) IS NOT NULL
     ),
     StandaloneProductReview AS (
       SELECT sr.ReviewId, sr.UserId, sr.ProductId, sr.Rating, sr.Comment, sr.CreatedAt
       FROM SalonReviews sr
       WHERE sr.ProductId IS NOT NULL
         AND sr.OrderItemId IS NULL
         AND sr.OrderId IS NULL
         AND sr.Rating IS NOT NULL
     ),
     Effective AS (
       SELECT ReviewId, UserId, ProductId, Rating, Comment, CreatedAt FROM ItemEffective
       UNION ALL
       SELECT ReviewId, UserId, ProductId, Rating, Comment, CreatedAt FROM StandaloneProductReview
     )
     SELECT TOP 16
       ef.ReviewId,
       ef.Rating,
       ef.Comment,
       ef.CreatedAt,
       COALESCE(u.Name, 'Unknown User') AS CustomerName,
       COALESCE(p.Name, 'Unknown Product') AS ProductName
     FROM Effective ef
     LEFT JOIN Users u ON u.UserId = ef.UserId
     LEFT JOIN Products p ON p.ProductId = ef.ProductId
     WHERE ef.Comment IS NOT NULL
       AND LTRIM(RTRIM(ef.Comment)) <> ''
       AND CAST(ef.CreatedAt AS date) BETWEEN @s AND @e
     ORDER BY ef.CreatedAt DESC, ef.ReviewId DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const productReviewSummary = {
    positive: Number(productReviewSummaryRes.recordset?.[0]?.PositiveCnt || 0),
    neutral: Number(productReviewSummaryRes.recordset?.[0]?.NeutralCnt || 0),
    negative: Number(productReviewSummaryRes.recordset?.[0]?.NegativeCnt || 0),
    total: Number(productReviewSummaryRes.recordset?.[0]?.TotalCnt || 0),
    avgRating: Number(Number(productReviewSummaryRes.recordset?.[0]?.AvgRating || 0).toFixed(1)),
  }

  const productReviewItems = (productReviewListRes.recordset || []).map((r) => {
    const rating = Number(r.Rating || 0)
    const sentiment = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral'
    return {
      reviewId: String(r.ReviewId || ''),
      rating,
      sentiment,
      comment: String(r.Comment || ''),
      customerName: String(r.CustomerName || 'Unknown User'),
      productName: String(r.ProductName || 'Unknown Product'),
      createdAt: toSqlDateKey(r.CreatedAt),
    }
  })

  const [peakHourRes, completedServiceHourRes] = await Promise.all([
    query(
      `SELECT DATEPART(HOUR, b.BookingTime) AS Hr, COUNT(1) AS Cnt
       FROM Bookings b
       WHERE b.BookingTime IS NOT NULL
         AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) NOT IN ('cancelled', 'cancel', 'canceled')
       GROUP BY DATEPART(HOUR, b.BookingTime)`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [] })),
    query(
      `SELECT
          DATEPART(HOUR, b.BookingTime) AS Hr,
          sv.Name AS ServiceName,
          COUNT(1) AS Cnt
       FROM BookingServices bs
       INNER JOIN Bookings b ON b.BookingId = bs.BookingId
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE b.BookingTime IS NOT NULL
         AND sv.Name IS NOT NULL
         AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
         AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
       GROUP BY DATEPART(HOUR, b.BookingTime), sv.Name`,
      { s: currentStartIso, e: currentEndIso }
    ).catch(() => ({ recordset: [] })),
  ])

  const peakHourMap = new Map()
  for (const r of peakHourRes.recordset || []) {
    const hour = Number(r.Hr)
    if (!Number.isFinite(hour)) continue
    peakHourMap.set(hour, Number(r.Cnt || 0))
  }

  const completedServiceByHour = new Map()
  for (const r of completedServiceHourRes.recordset || []) {
    const hour = Number(r.Hr)
    const serviceName = String(r.ServiceName || '').trim()
    if (!Number.isFinite(hour) || !serviceName) continue
    const serviceMap = completedServiceByHour.get(hour) || new Map()
    serviceMap.set(serviceName, Number(r.Cnt || 0))
    completedServiceByHour.set(hour, serviceMap)
  }

  const bookingHeatmapRaw = []
  for (let h = 8; h <= 20; h++) {
    const count = Number(peakHourMap.get(h) || 0)
    const serviceMap = completedServiceByHour.get(h)
    let topService = ''
    let completedServiceCount = 0
    if (serviceMap && serviceMap.size > 0) {
      const sorted = Array.from(serviceMap.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      topService = String(sorted[0]?.[0] || '')
      completedServiceCount = Number(sorted[0]?.[1] || 0)
    }
    bookingHeatmapRaw.push({
      hour: `${pad2(h)}:00`,
      count,
      topService,
      completedServiceCount,
    })
  }
  const peakMax = Math.max(0, ...bookingHeatmapRaw.map((x) => Number(x.count || 0)))
  const bookingHeatmap = bookingHeatmapRaw.map((x) => ({ ...x, isPeak: peakMax > 0 && x.count === peakMax }))

  const targets = {
    day: { revenue: 1_000_000, orders: 20, orderCompletionRate: 90, appointments: 25, utilization: 75, avgRevenuePerCustomer: 180_000 },
    week: { revenue: 7_000_000, orders: 120, orderCompletionRate: 90, appointments: 170, utilization: 75, avgRevenuePerCustomer: 180_000 },
    month: { revenue: 30_000_000, orders: 500, orderCompletionRate: 90, appointments: 700, utilization: 75, avgRevenuePerCustomer: 180_000 },
    year: { revenue: 360_000_000, orders: 6000, orderCompletionRate: 90, appointments: 8400, utilization: 75, avgRevenuePerCustomer: 180_000 },
  }
  const targetSet = targets[meta.period]

  const revenueProgress = Math.min(100, Math.round((revenueCurrent / Math.max(1, targetSet.revenue)) * 100))
  const ordersProgress = Math.min(100, Math.round((ordersCurrent / Math.max(1, targetSet.orders)) * 100))
  const orderCompletionProgress = Math.min(100, Math.round((orderCompletionRate / Math.max(1, targetSet.orderCompletionRate)) * 100))
  const appointmentsProgress = Math.min(100, Math.round((apptsCurrent / Math.max(1, targetSet.appointments)) * 100))
  const utilizationProgress = Math.min(100, Math.round((utilizationPct / Math.max(1, targetSet.utilization)) * 100))
  const avgRevProgress = Math.min(100, Math.round((avgRevenuePerCustomer / Math.max(1, targetSet.avgRevenuePerCustomer)) * 100))
  const avgRevenuePerBooking = apptsCurrent > 0 ? Math.round(bookingRevenueCurrent / apptsCurrent) : 0

  const insights = []
  if (revenueDeltaPct > 0) {
    insights.push({ level: 'good', text: `Revenue increased by ${revenueDeltaPct}% in ${meta.label}.`, actionLabel: 'Promote best-selling services', actionHref: '/portals/owner/services' })
  }
  if (revenueDeltaPct === 0) {
    insights.push({ level: 'neutral', text: `Revenue is flat in ${meta.label}.`, actionLabel: 'Launch a light promotion', actionHref: '/portals/owner/services' })
  }
  if (revenueDeltaPct < 0) {
    insights.push({ level: 'warning', text: `Revenue dropped by ${Math.abs(revenueDeltaPct)}% in ${meta.label}.`, actionLabel: 'Start a recovery campaign', actionHref: '/portals/owner/appointments' })
  }
  if (revenueDeltaPct !== 0) {
    const driver = Math.abs(apptsDeltaPct) >= Math.abs(ordersDeltaPct)
      ? `${apptsDeltaPct >= 0 ? 'more' : 'fewer'} bookings (${apptsDeltaPct}%)`
      : `${ordersDeltaPct >= 0 ? 'more' : 'fewer'} product orders (${ordersDeltaPct}%)`
    insights.push({ level: 'neutral', text: `Primary revenue driver: ${driver}.`, actionLabel: 'Open revenue breakdown', actionHref: '/portals/owner/reports' })
  }
  if (utilizationPct < 60) {
    insights.push({ level: 'warning', text: `Schedule utilization is low (${utilizationPct}%).`, actionLabel: 'Fill off-peak slots', actionHref: '/portals/owner/schedule' })
  }
  const busiest = bookingHeatmap.find((x) => x.isPeak)
  if (busiest) {
    insights.push({ level: 'good', text: `${busiest.hour} is your peak booking hour.`, actionLabel: 'Add staff for peak hours', actionHref: '/portals/owner/staff' })
  }

  if (lowStockCritical > 0) {
    insights.push({ level: 'warning', text: `${lowStockCritical} inventory item(s) are at critical stock level.`, actionLabel: 'Restock immediately', actionHref: '/portals/owner/inventory' })
  }

  if (noShowRatePct >= 8) {
    insights.push({ level: 'warning', text: `No-show rate is high (${noShowRatePct}%).`, actionLabel: 'Enable automatic reminders', actionHref: '/portals/owner/appointments' })
  }

  const totalOrdersPeriod = ordersTrendRows.reduce((sum, x) => sum + Number(x.orders || 0), 0)
  if (totalOrdersPeriod > 0) {
    insights.push({ level: 'neutral', text: `${totalOrdersPeriod} order(s) were created in ${meta.label}.`, actionLabel: 'Review order statuses', actionHref: '/portals/owner/orders' })
  }

  const pendingOrders = pendingOrdersCurrent
  if (pendingOrders > 0) {
    insights.push({ level: 'warning', text: `${pendingOrders} order(s) are pending processing.`, actionLabel: 'Process pending orders', actionHref: '/portals/owner/orders' })
  }

  if (returningPct < 45) {
    insights.push({ level: 'neutral', text: `Returning customer rate is low (${returningPct}%).`, actionLabel: 'Launch a retention campaign', actionHref: '/portals/owner/customers' })
  }

  if (productReviewSummary.negative > 0) {
    insights.push({
      level: 'warning',
      text: `${productReviewSummary.negative} negative product review(s) need attention.`,
      actionLabel: 'Review customer feedback',
      actionHref: '/portals/owner/products',
    })
  }

  let summary = ''

  const kpis = {
    revenue: {
      value: revenueCurrent,
      bookingRevenue: bookingRevenueCurrent,
      productRevenue: orderRevenueCurrent,
      avgRevenuePerBooking,
      target: targetSet.revenue,
      progressPct: revenueProgress,
      deltaPct: revenueDeltaPct,
      trend: trendFromDelta(revenueDeltaPct),
      context: 'vs previous period',
      status: statusFromTrend(trendFromDelta(revenueDeltaPct)),
      prominent: true,
    },
    appointments: {
      value: apptsCurrent,
      target: targetSet.appointments,
      progressPct: appointmentsProgress,
      deltaPct: apptsDeltaPct,
      trend: trendFromDelta(apptsDeltaPct),
      context: 'vs previous period',
      status: statusFromTrend(trendFromDelta(apptsDeltaPct)),
    },
    customers: {
      value: customersCurrent,
      active30Days: activeCustomers30,
      inactive: inactiveCustomers,
      newCustomers: newCnt,
      deltaPct: 0,
      trend: 'flat',
      context: 'customers in selected period',
      status: 'neutral',
    },
    bookings: {
      value: todayStatusBreakdown.total,
      pending: todayStatusBreakdown.pending,
      booked: todayStatusBreakdown.booked,
      completed: todayStatusBreakdown.completed,
      cancelled: todayStatusBreakdown.cancelled,
      context: 'today booking status mix',
      status: todayStatusBreakdown.cancelled > 0 ? 'warning' : 'good',
    },
    retention: {
      returningRatePct: returningPct,
      avgVisitsPerCustomerPerMonth,
      context: 'last 30 days',
      status: returningPct >= 60 ? 'good' : returningPct >= 40 ? 'neutral' : 'warning',
    },
    lowStock: {
      value: lowStock,
      critical: lowStockCritical,
      totalValue: inventoryTotalValue,
      deltaPct: 0,
      trend: lowStock > 0 ? 'down' : 'flat',
      context: 'needs restock',
      status: lowStockCritical > 0 ? 'critical' : lowStock > 0 ? 'warning' : 'good',
      prominent: true,
    },
    utilization: {
      value: utilizationPct,
      slotsUsed: apptsCurrent,
      slotsTotal: capacitySlotsTotal,
      target: targetSet.utilization,
      progressPct: utilizationProgress,
      deltaPct: utilizationDeltaPct,
      trend: utilizationPct >= 70 ? 'up' : utilizationPct < 60 ? 'down' : 'flat',
      context: 'booked slots in selected period',
      status: utilizationPct >= 70 ? 'good' : utilizationPct < 60 ? 'warning' : 'neutral',
    },
    avgRevenuePerCustomer: {
      value: avgRevenuePerCustomer,
      target: targetSet.avgRevenuePerCustomer,
      progressPct: avgRevProgress,
      deltaPct: avgRevenueDeltaPct,
      trend: trendFromDelta(avgRevenueDeltaPct),
      context: 'vs previous period',
      status: statusFromTrend(trendFromDelta(avgRevenueDeltaPct)),
    },
    pendingOrders: {
      value: pendingOrders,
      todayTotalOrders: todayOrders,
      todayProductRevenue,
      deltaPct: pendingOrdersDeltaPct,
      trend: trendFromDelta(pendingOrdersDeltaPct, true),
      context: `vs previous period (${pendingOrdersPrev})`,
      status: pendingOrders > 10 ? 'critical' : pendingOrders > 0 ? 'warning' : 'good',
    },
    orderCompletion: {
      value: orderCompletionRate,
      target: targetSet.orderCompletionRate,
      progressPct: orderCompletionProgress,
      deltaPct: orderCompletionDeltaPct,
      trend: trendFromDelta(orderCompletionDeltaPct),
      context: `${completedOrdersCurrent}/${ordersCurrent} completed`,
      status: orderCompletionRate >= 90 ? 'good' : orderCompletionRate >= 75 ? 'warning' : 'critical',
    },
    rating: {
      value: Math.round(ratingCurrent * 10) / 10,
      deltaPct: ratingDeltaPct,
      deltaValue: ratingDeltaValue,
      totalReviews: ratingTotalReviews,
      bookingValue: ratingBookingValue,
      bookingReviews: ratingBookingCount,
      orderValue: ratingOrderValue,
      orderReviews: ratingOrderCount,
      trend: trendFromDelta(ratingDeltaPct),
      context: 'average salon rating vs previous period',
      status: ratingCurrent >= 4.5 ? 'good' : ratingCurrent >= 3.5 ? 'neutral' : ratingCurrent > 0 ? 'warning' : 'neutral',
    },
    inventory: {
      lowStockCount: lowStock,
      outOfStockCount: outOfStock,
      healthyCount: healthyStockCount,
      criticalCount: lowStockCritical,
      sufficientCount: healthyStockCount,
      totalItems: totalInventoryItems,
      totalValue: inventoryTotalValue,
      status: lowStockCritical > 0 ? 'critical' : lowStock > 0 ? 'warning' : 'good',
      context: 'current stock health',
    },
    orders: {
      value: ordersCurrent,
      todayTotalOrders: ordersCurrent,
      productRevenue: orderRevenueCurrent,
      deltaPct: ordersDeltaPct,
      trend: trendFromDelta(ordersDeltaPct),
      context: 'orders in selected period',
      status: statusFromTrend(trendFromDelta(ordersDeltaPct)),
    },
  }

  return {
    period: meta.period,
    revenueMeta: {
      chartType: 'stacked-bar',
      groupBy: meta.period === 'week' ? 'week' : meta.period === 'year' ? 'month' : 'day',
      bucketCount: trendRows.length,
    },
    summary,
    kpis,
    revenueData: { day: trendRows, week: trendRows, month: trendRows, year: trendRows },
    revenuePreviousData: { day: revenuePrevRows, week: revenuePrevRows, month: revenuePrevRows, year: revenuePrevRows },
    appointmentsTrend: { day: trendRows, week: trendRows, month: trendRows, year: trendRows },
    ordersTrend: { day: ordersTrendRows, week: ordersTrendRows, month: ordersTrendRows, year: ordersTrendRows },
    revenueBreakdown: {
      services: bookingRevenueCurrent,
      products: orderRevenueCurrent,
    },
    bookingStatus: {
      pending: todayStatusBreakdown.pending,
      booked: todayStatusBreakdown.booked,
      completed: todayStatusBreakdown.completed,
      cancelled: todayStatusBreakdown.cancelled,
    },
    ordersByStatus,
    recentAppointments,
    todaySchedule,
    staffAvailability,
    staffWorkload: {
      totalStaff: totalStaffForWorkload,
      totalAssigned: totalAssignedForWorkload,
      bookingTotal: apptsCurrent,
      assignedBookingCount,
      unassignedBookingCount,
      assignedCoveragePct,
      avgAssignedPerStaff: Number(avgAssignedPerStaff.toFixed(1)),
      overloadedCount,
      overloadedPct,
      idleCount,
      idlePct,
      normalCount,
      normalPct,
    },
    staffPerformance,
    inventoryAlerts,
    topServices: revenueByService,
    topProducts: productPerformance,
    customerOverview: {
      newCustomers: newCnt,
      returningCustomers: returningCnt,
    },
    topCustomers,
    revenueByService,
    productPerformance,
    productReviewInsights: {
      summary: productReviewSummary,
      reviews: productReviewItems,
    },
    bookingHeatmap,
    recentOrders,
    insights,
    actions: [
      { label: 'Add Appointment', href: '/portals/owner/appointments' },
      { label: 'Add Customer', href: '/portals/owner/customers' },
      { label: 'Manage Inventory', href: '/portals/owner/inventory' },
    ],
  }
}

module.exports = { getDashboard }

