const { query } = require('../config/query')
const { pad2, formatHm } = require('../utils/format')

function toIsoDate(d) {
  return d.toISOString().slice(0, 10)
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
    lowRes,
    staffCountRes,
    noShowRes,
    noShowPrevRes,
    returningRes,
    ratingRes,
    ratingPrevRes,
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
      `SELECT COUNT(1) AS Cnt
       FROM InventoryItems
       WHERE COALESCE(Quantity, 0) <= COALESCE(ReorderLevel, 0) AND COALESCE(ReorderLevel, 0) > 0`
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
         SUM(CASE WHEN PrevCnt > 0 THEN 1 ELSE 0 END) AS ReturningCnt,
         SUM(CASE WHEN PrevCnt = 0 THEN 1 ELSE 0 END) AS NewCnt
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
  const lowStock = Number(lowRes.recordset?.[0]?.Cnt || 0)
  const staffTotal = Number(staffCountRes.recordset?.[0]?.Cnt || 1)

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

  const revenueDeltaPct = pctDelta(revenueCurrent, revenuePrev)
  const ordersDeltaPct = pctDelta(ordersCurrent, ordersPrev)
  const orderCompletionRate = ordersCurrent > 0 ? Math.round((completedOrdersCurrent / ordersCurrent) * 100) : 0
  const orderCompletionRatePrev = ordersPrev > 0 ? Math.round((completedOrdersPrev / ordersPrev) * 100) : 0
  const orderCompletionDeltaPct = pctDelta(orderCompletionRate, orderCompletionRatePrev)
  const apptsDeltaPct = pctDelta(apptsCurrent, apptsPrev)
  const utilizationPct = Math.min(100, Math.round((apptsCurrent / Math.max(1, staffTotal * meta.days * 8)) * 100))
  const utilizationPrev = Math.min(100, Math.round((apptsPrev / Math.max(1, staffTotal * meta.days * 8)) * 100))
  const utilizationDeltaPct = pctDelta(utilizationPct, utilizationPrev)
  const ratingDeltaPct = pctDelta(ratingCurrent, ratingPrev)

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
    `SELECT COUNT(1) AS Cnt
     FROM InventoryItems
     WHERE COALESCE(ReorderLevel, 0) > 0 AND COALESCE(Quantity, 0) <= COALESCE(ReorderLevel, 0) * 0.5`
  ).catch(() => ({ recordset: [{ Cnt: 0 }] }))

  const lowStockCritical = Number(lowCriticalRes.recordset?.[0]?.Cnt || 0)

  let trendRows = []
  let revenuePrevRows = []
  let ordersTrendRows = []
  if (meta.period === 'day') {
    const [revByHourRes, orderRevByHourRes, revByHourPrevRes, orderRevByHourPrevRes, apptByHourRes, orderByHourRes] = await Promise.all([
      query(
        `SELECT DATEPART(HOUR, b.BookingTime) AS H, SUM(ISNULL(sv.Price, 0)) AS Revenue
         FROM BookingServices bs
         LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
         LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
         WHERE CAST(b.BookingTime AS date) = @d
           AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY DATEPART(HOUR, b.BookingTime)
         ORDER BY H`,
        { d: currentEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT DATEPART(HOUR, CreatedAt) AS H, SUM(Total) AS Revenue
         FROM Orders
         WHERE CreatedAt IS NOT NULL 
           AND CAST(CreatedAt AS date) = @d
           AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY DATEPART(HOUR, CreatedAt)
         ORDER BY H`,
        { d: currentEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT DATEPART(HOUR, b.BookingTime) AS H, SUM(ISNULL(sv.Price, 0)) AS Revenue
         FROM BookingServices bs
         LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
         LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
         WHERE CAST(b.BookingTime AS date) = @d
           AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY DATEPART(HOUR, b.BookingTime)
         ORDER BY H`,
        { d: prevEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT DATEPART(HOUR, CreatedAt) AS H, SUM(Total) AS Revenue
         FROM Orders
         WHERE CreatedAt IS NOT NULL 
           AND CAST(CreatedAt AS date) = @d
           AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY DATEPART(HOUR, CreatedAt)
         ORDER BY H`,
        { d: prevEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT DATEPART(HOUR, BookingTime) AS H, COUNT(1) AS Appts
         FROM Bookings
         WHERE CAST(BookingTime AS date) = @d
         GROUP BY DATEPART(HOUR, BookingTime)
         ORDER BY H`,
        { d: currentEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT DATEPART(HOUR, CreatedAt) AS H, COUNT(1) AS OrdersCnt
         FROM Orders
         WHERE CreatedAt IS NOT NULL AND CAST(CreatedAt AS date) = @d
         GROUP BY DATEPART(HOUR, CreatedAt)
         ORDER BY H`,
        { d: currentEndIso }
      ).catch(() => ({ recordset: [] })),
    ])

    const rMap = new Map((revByHourRes.recordset || []).map((r) => [Number(r.H), Number(r.Revenue || 0)]))
    const roMap = new Map((orderRevByHourRes.recordset || []).map((r) => [Number(r.H), Number(r.Revenue || 0)]))
  const rPrevMap = new Map((revByHourPrevRes.recordset || []).map((r) => [Number(r.H), Number(r.Revenue || 0)]))
  const roPrevMap = new Map((orderRevByHourPrevRes.recordset || []).map((r) => [Number(r.H), Number(r.Revenue || 0)]))
    const aMap = new Map((apptByHourRes.recordset || []).map((r) => [Number(r.H), Number(r.Appts || 0)]))
    const oMap = new Map((orderByHourRes.recordset || []).map((r) => [Number(r.H), Number(r.OrdersCnt || 0)]))

    for (let h = 8; h <= 20; h++) {
      const bookingRevenue = rMap.get(h) || 0
      const orderRevenue = roMap.get(h) || 0
      const totalRevenue = bookingRevenue + orderRevenue
      trendRows.push({
        label: `${pad2(h)}:00`,
        revenue: totalRevenue,
        revenueTotal: totalRevenue,
        revenueBooking: bookingRevenue,
        revenueOrder: orderRevenue,
        appts: aMap.get(h) || 0,
      })
      const bookingRevenuePrev = rPrevMap.get(h) || 0
      const orderRevenuePrev = roPrevMap.get(h) || 0
      const totalRevenuePrev = bookingRevenuePrev + orderRevenuePrev
      revenuePrevRows.push({
        label: `${pad2(h)}:00`,
        revenue: totalRevenuePrev,
        revenueTotal: totalRevenuePrev,
        revenueBooking: bookingRevenuePrev,
        revenueOrder: orderRevenuePrev,
      })
      ordersTrendRows.push({ label: `${pad2(h)}:00`, orders: oMap.get(h) || 0, orderRevenue })
    }
  } else {
    const [trendRevRes, trendOrderRevRes, trendRevPrevRes, trendOrderRevPrevRes, trendApptRes, trendOrderRes] = await Promise.all([
      query(
        `SELECT CAST(p.PaidAt AS date) AS D, SUM(p.Amount) AS Revenue
         FROM Payments p
         LEFT JOIN Bookings b ON b.BookingId = p.BookingId
         WHERE p.PaidAt IS NOT NULL 
           AND CAST(p.PaidAt AS date) BETWEEN @s AND @e
           AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY CAST(p.PaidAt AS date)
         ORDER BY D`,
        { s: currentStartIso, e: currentEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT CAST(CreatedAt AS date) AS D, SUM(Total) AS Revenue
         FROM Orders
         WHERE CreatedAt IS NOT NULL 
           AND CAST(CreatedAt AS date) BETWEEN @s AND @e
           AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY CAST(CreatedAt AS date)
         ORDER BY D`,
        { s: currentStartIso, e: currentEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT CAST(p.PaidAt AS date) AS D, SUM(p.Amount) AS Revenue
         FROM Payments p
         LEFT JOIN Bookings b ON b.BookingId = p.BookingId
         WHERE p.PaidAt IS NOT NULL 
           AND CAST(p.PaidAt AS date) BETWEEN @s AND @e
           AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY CAST(p.PaidAt AS date)
         ORDER BY D`,
        { s: prevStartIso, e: prevEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT CAST(CreatedAt AS date) AS D, SUM(Total) AS Revenue
         FROM Orders
         WHERE CreatedAt IS NOT NULL 
           AND CAST(CreatedAt AS date) BETWEEN @s AND @e
           AND LOWER(LTRIM(RTRIM(COALESCE(Status, '')))) IN ('completed', 'complete', 'done')
         GROUP BY CAST(CreatedAt AS date)
         ORDER BY D`,
        { s: prevStartIso, e: prevEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT CAST(BookingTime AS date) AS D, COUNT(1) AS Appts
         FROM Bookings
         WHERE CAST(BookingTime AS date) BETWEEN @s AND @e
         GROUP BY CAST(BookingTime AS date)
         ORDER BY D`,
        { s: currentStartIso, e: currentEndIso }
      ).catch(() => ({ recordset: [] })),
      query(
        `SELECT CAST(CreatedAt AS date) AS D, COUNT(1) AS OrdersCnt
         FROM Orders
         WHERE CreatedAt IS NOT NULL AND CAST(CreatedAt AS date) BETWEEN @s AND @e
         GROUP BY CAST(CreatedAt AS date)
         ORDER BY D`,
        { s: currentStartIso, e: currentEndIso }
      ).catch(() => ({ recordset: [] })),
    ])

    const rMap = new Map((trendRevRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Revenue || 0)]))
    const roMap = new Map((trendOrderRevRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Revenue || 0)]))
  const rPrevMap = new Map((trendRevPrevRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Revenue || 0)]))
  const roPrevMap = new Map((trendOrderRevPrevRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Revenue || 0)]))
    const aMap = new Map((trendApptRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.Appts || 0)]))
    const oMap = new Map((trendOrderRes.recordset || []).map((r) => [toSqlDateKey(r.D), Number(r.OrdersCnt || 0)]))

    for (let i = 0; i < meta.days; i++) {
      const d = addDays(meta.currentStart, i)
      const k = toIsoDate(d)
      const bookingRevenue = rMap.get(k) || 0
      const orderRevenue = roMap.get(k) || 0
      const totalRevenue = bookingRevenue + orderRevenue
      trendRows.push({
        label: k.slice(5),
        revenue: totalRevenue,
        revenueTotal: totalRevenue,
        revenueBooking: bookingRevenue,
        revenueOrder: orderRevenue,
        appts: aMap.get(k) || 0,
      })
      const prevDate = addDays(meta.prevStart, i)
      const pk = toIsoDate(prevDate)
      const bookingRevenuePrev = rPrevMap.get(pk) || 0
      const orderRevenuePrev = roPrevMap.get(pk) || 0
      const totalRevenuePrev = bookingRevenuePrev + orderRevenuePrev
      revenuePrevRows.push({
        label: pk.slice(5),
        revenue: totalRevenuePrev,
        revenueTotal: totalRevenuePrev,
        revenueBooking: bookingRevenuePrev,
        revenueOrder: orderRevenuePrev,
      })
      ordersTrendRows.push({ label: k.slice(5), orders: oMap.get(k) || 0, orderRevenue })
    }
  }

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
    `SELECT TOP 5
        su.Name AS StaffName,
        su.AvatarUrl AS StaffAvatarUrl,
        COUNT(bs.BookingServiceId) AS Appts,
        COUNT(DISTINCT b.CustomerUserId) AS Customers,
        COUNT(DISTINCT CAST(b.BookingTime AS date)) AS ActiveDays,
        SUM(COALESCE(bs.Price, sv.Price)) AS Revenue
      FROM BookingServices bs
      LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Staff st ON st.StaffId = bs.StaffId
      LEFT JOIN Users su ON su.UserId = st.UserId
      WHERE CAST(b.BookingTime AS date) BETWEEN @s AND @e
      GROUP BY su.Name, su.AvatarUrl
      ORDER BY Revenue DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const staffPerformance = (staffPerfRes.recordset || []).map((r, idx) => ({
    rank: idx + 1,
    name: r.StaffName || '',
    avatarUrl: r.StaffAvatarUrl || '',
    appts: Number(r.Appts || 0),
    customers: Number(r.Customers || 0),
    revenue: toMoney(r.Revenue),
    utilizationPct: Math.min(100, Math.round((Number(r.Appts || 0) / Math.max(1, meta.days * 8)) * 100)),
    efficiencyPct: Math.min(100, Math.round((Number(r.Appts || 0) / Math.max(1, Number(r.ActiveDays || 0) * 8)) * 100)),
  }))

  const invAlertRes = await query(
    `SELECT TOP 6 Name, Quantity, ReorderLevel
     FROM InventoryItems
     WHERE COALESCE(ReorderLevel, 0) > 0 AND COALESCE(Quantity, 0) <= COALESCE(ReorderLevel, 0)
     ORDER BY Quantity ASC`
  ).catch(() => ({ recordset: [] }))

  const inventoryAlerts = (invAlertRes.recordset || []).map((r) => {
    const qty = Number(r.Quantity || 0)
    const reorderLevel = Number(r.ReorderLevel || 0)
    const dailyUsage = Math.max(1, Math.round(reorderLevel / 7))
    const daysRemaining = Math.max(0, Math.round(qty / dailyUsage))
    const severity = qty <= reorderLevel * 0.5 ? 'critical' : 'low'
    return { name: r.Name, qty, reorderLevel, dailyUsage, daysRemaining, severity }
  })

  const topCustomersRes = await query(
    `SELECT TOP 5
        cu.Name AS CustomerName,
        COUNT(DISTINCT b.BookingId) AS Visits,
        SUM(COALESCE(bs.Price, sv.Price)) AS Spending,
        MAX(CAST(b.BookingTime AS date)) AS LastVisit
      FROM Bookings b
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      WHERE b.CustomerUserId IS NOT NULL AND CAST(b.BookingTime AS date) BETWEEN @s AND @e
      GROUP BY cu.Name
      ORDER BY Spending DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const now = new Date()
  const topCustomers = (topCustomersRes.recordset || []).map((r) => {
    const spending = toMoney(r.Spending)
    const visits = Number(r.Visits || 0)
    const lastVisitDate = String(r.LastVisit || '').slice(0, 10)
    const diffDays = lastVisitDate ? Math.floor((now - new Date(lastVisitDate)) / (24 * 60 * 60 * 1000)) : null
    return {
      name: r.CustomerName || 'Unknown',
      spending,
      visits,
      avgSpendPerVisit: visits ? Math.round(spending / visits) : 0,
      lastVisit: lastVisitDate,
      lastVisitDaysAgo: diffDays,
      vip: spending >= 5_000_000,
      atRisk: diffDays !== null && diffDays > 14,
    }
  })

  const revenueByServiceRes = await query(
    `SELECT TOP 6
        sv.Name AS ServiceName,
        SUM(COALESCE(bs.Price, sv.Price)) AS Revenue
      FROM BookingServices bs
      LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      WHERE CAST(b.BookingTime AS date) BETWEEN @s AND @e
      GROUP BY sv.Name
      ORDER BY Revenue DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const revenueByService = (revenueByServiceRes.recordset || []).map((r) => ({
    name: r.ServiceName || 'Unknown',
    revenue: toMoney(r.Revenue),
  }))

  const productPerfRes = await query(
    `SELECT TOP 8
        COALESCE(oi.ProductName, p.Name, 'Unknown') AS ProductName,
        SUM(COALESCE(oi.Quantity, 0)) AS QtySold,
        SUM(COALESCE(oi.Quantity, 0) * COALESCE(oi.Price, 0)) AS Revenue
      FROM OrderItems oi
      INNER JOIN Orders o ON o.OrderId = oi.OrderId
      LEFT JOIN Products p ON p.ProductId = oi.ProductId
      WHERE o.CreatedAt IS NOT NULL AND CAST(o.CreatedAt AS date) BETWEEN @s AND @e
      GROUP BY COALESCE(oi.ProductName, p.Name, 'Unknown')
      ORDER BY Revenue DESC, QtySold DESC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const productPerformance = (productPerfRes.recordset || []).map((r) => ({
    name: String(r.ProductName || 'Unknown'),
    sold: Number(r.QtySold || 0),
    revenue: toMoney(r.Revenue),
  }))

  const peakHoursRes = await query(
    `SELECT DATEPART(HOUR, BookingTime) AS H, COUNT(1) AS Cnt
     FROM Bookings
     WHERE BookingTime IS NOT NULL AND CAST(BookingTime AS date) BETWEEN @s AND @e
     GROUP BY DATEPART(HOUR, BookingTime)
     ORDER BY H ASC`,
    { s: currentStartIso, e: currentEndIso }
  ).catch(() => ({ recordset: [] }))

  const peakHourMap = new Map((peakHoursRes.recordset || []).map((r) => [Number(r.H), Number(r.Cnt || 0)]))
  const bookingHeatmapRaw = []
  for (let h = 8; h <= 20; h++) {
    bookingHeatmapRaw.push({ hour: `${pad2(h)}:00`, count: peakHourMap.get(h) || 0 })
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

  let summary = ''

  const kpis = {
    revenue: {
      value: revenueCurrent,
      target: targetSet.revenue,
      progressPct: revenueProgress,
      deltaPct: revenueDeltaPct,
      trend: trendFromDelta(revenueDeltaPct),
      context: 'vs previous period',
      status: statusFromTrend(trendFromDelta(revenueDeltaPct)),
      prominent: true,
    },
    orders: {
      value: ordersCurrent,
      target: targetSet.orders,
      progressPct: ordersProgress,
      deltaPct: ordersDeltaPct,
      trend: trendFromDelta(ordersDeltaPct),
      context: 'vs previous period',
      status: statusFromTrend(trendFromDelta(ordersDeltaPct)),
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
      deltaPct: 0,
      trend: 'flat',
      context: 'customers in selected period',
      status: 'neutral',
    },
    lowStock: {
      value: lowStock,
      critical: lowStockCritical,
      deltaPct: 0,
      trend: lowStock > 0 ? 'down' : 'flat',
      context: 'needs restock',
      status: lowStockCritical > 0 ? 'critical' : lowStock > 0 ? 'warning' : 'good',
      prominent: true,
    },
    utilization: {
      value: utilizationPct,
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
      trend: trendFromDelta(ratingDeltaPct),
      context: 'average salon rating vs previous period',
      status: ratingCurrent >= 4.5 ? 'good' : ratingCurrent >= 3.5 ? 'neutral' : ratingCurrent > 0 ? 'warning' : 'neutral',
    },
  }

  return {
    period: meta.period,
    summary,
    kpis,
    revenueData: { day: trendRows, week: trendRows, month: trendRows, year: trendRows },
    revenuePreviousData: { day: revenuePrevRows, week: revenuePrevRows, month: revenuePrevRows, year: revenuePrevRows },
    appointmentsTrend: { day: trendRows, week: trendRows, month: trendRows, year: trendRows },
    ordersTrend: { day: ordersTrendRows, week: ordersTrendRows, month: ordersTrendRows, year: ordersTrendRows },
    ordersByStatus,
    recentAppointments,
    staffPerformance,
    inventoryAlerts,
    topCustomers,
    revenueByService,
    productPerformance,
    bookingHeatmap,
    insights,
    actions: [
      { label: 'Add Appointment', href: '/portals/owner/appointments' },
      { label: 'Add Customer', href: '/portals/owner/customers' },
      { label: 'Manage Inventory', href: '/portals/owner/inventory' },
    ],
  }
}

module.exports = { getDashboard }

