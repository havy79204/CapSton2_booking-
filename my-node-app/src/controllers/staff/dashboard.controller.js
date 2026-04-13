const { asyncHandler } = require('../../utils/asyncHandler')
const { query } = require('../../config/query')
const { getSettingsMap } = require('../../services/settings.service')

function startOfDay(d = new Date()) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

function addDays(d, days) {
    const x = new Date(d)
    x.setDate(x.getDate() + Number(days || 0))
    return x
}

function toYmd(d) {
    const x = new Date(d)
    const y = x.getFullYear()
    const m = String(x.getMonth() + 1).padStart(2, '0')
    const day = String(x.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function calcCommission(revenue, tiers = {}) {
  const tierLow = Number(tiers.CommissionTierLow ?? tiers.commissionTierLow ?? 500000)
  const rateLow = Number(tiers.CommissionRateLow ?? tiers.commissionRateLow ?? 0.1)
  const tierHigh = Number(tiers.CommissionTierHigh ?? tiers.commissionTierHigh ?? 2000000)
  const rateHigh = Number(tiers.CommissionRateHigh ?? tiers.commissionRateHigh ?? 0.15)

    if (revenue >= tierHigh) return revenue * rateHigh
    if (revenue >= tierLow) return revenue * rateLow
    return 0
}

async function resolveStaffIdFromRequest(req) {
  const userId = String(req.userId || req.user?.userId || req.user?.sub || '').trim()
    if (!userId) return ''

    const staffRes = await query('SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId })
    return String(staffRes.recordset?.[0]?.StaffId || '').trim()
}

const getSummary = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffIdFromRequest(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const now = new Date()
    const dayStart = startOfDay(now)
    const nextDay = addDays(dayStart, 1)
    const dayIso = toYmd(dayStart)
    const weekStart = addDays(dayStart, -6)

    const yearStart = new Date(now.getFullYear(), 0, 1)
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1)

    const settingsMap = await getSettingsMap().catch(() => ({}))

    

    const [
      todayCountRes,
      weeklyCustomersRes,
      weeklyHoursRes,
      weeklyRevenueRes,
      weeklyReviewsCountRes,
      todayApptsRes,
      recentApptsRes,
      todayShiftRes,
      todayAvailabilityRes,
      weeklyBookingSeriesRes,
      serviceDistRes,
      ratingsRes,
      recentReviewsRes,
      yearRevenueByMonthRes,
      yearHoursByMonthRes,
    ] = await Promise.all([
        query(
            `SELECT COUNT(DISTINCT b.BookingId) AS Cnt
       FROM Bookings b
       INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @dayStart AND b.BookingTime < @nextDay`, { staffId, dayStart, nextDay },
        ),
        query(
            `SELECT COUNT(DISTINCT b.BookingId) AS Cnt
       FROM Bookings b
       INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @weekStart AND b.BookingTime < @nextDay
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('pending', 'booked', 'confirmed', 'c', 'completed', 'complete', 'done')`, { staffId, weekStart, nextDay },
        ),
        query(
            `SELECT SUM(CASE
                WHEN ISNULL(TRY_CONVERT(FLOAT, sa.DurationHours), 0) > 0 THEN ISNULL(TRY_CONVERT(FLOAT, sa.DurationHours), 0)
                WHEN TRY_CONVERT(FLOAT, sa.EndHour) > TRY_CONVERT(FLOAT, sa.StartHour)
                  THEN TRY_CONVERT(FLOAT, sa.EndHour) - TRY_CONVERT(FLOAT, sa.StartHour)
                ELSE 0
              END) AS Hours
       FROM StaffShifts sa
       WHERE sa.StaffId = @staffId
         AND DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE)) >= @weekStart
         AND DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE)) < @nextDay`, { staffId, weekStart, nextDay },
        ).catch(() => ({ recordset: [{ Hours: 0 }] })),
        query(
            `SELECT SUM(ISNULL(COALESCE(bs.Price, sv.Price), 0)) AS Revenue
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @weekStart AND b.BookingTime < @nextDay
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'complete', 'done')`, { staffId, weekStart, nextDay },
        ),
        query(
            `SELECT COUNT(1) AS Cnt
       FROM SalonReviews sr
       WHERE sr.CreatedAt >= @weekStart AND sr.CreatedAt < @nextDay
         AND EXISTS (
           SELECT 1
           FROM BookingServices bs
           WHERE bs.StaffId = @staffId
             AND ((sr.BookingServiceId IS NOT NULL AND sr.BookingServiceId = bs.BookingServiceId)
               OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND sr.BookingId = bs.BookingId))
         )`, { staffId, weekStart, nextDay },
        ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
        query(
            `SELECT TOP 6
          b.BookingId,
          b.BookingTime,
          b.Status,
          u.Name AS CustomerName,
          ISNULL((
            SELECT TOP 1 STUFF((
              SELECT ', ' + s2.Name
              FROM BookingServices bs2
              JOIN Services s2 ON s2.ServiceId = bs2.ServiceId
              WHERE bs2.BookingId = b.BookingId
              FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
          ), 'No Service') AS ServiceName
       FROM Bookings b
       INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
       LEFT JOIN Users u ON u.UserId = b.CustomerUserId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @dayStart AND b.BookingTime < @nextDay
       GROUP BY b.BookingId, b.BookingTime, b.Status, u.Name
       ORDER BY b.BookingTime ASC`, { staffId, dayStart, nextDay },
        ),
        query(
            `SELECT TOP 50
          b.BookingId,
          b.BookingTime,
          b.Status,
          u.Name AS CustomerName,
          ISNULL((
            SELECT TOP 1 STUFF((
              SELECT ', ' + s2.Name
              FROM BookingServices bs2
              JOIN Services s2 ON s2.ServiceId = bs2.ServiceId
              WHERE bs2.BookingId = b.BookingId
              FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
          ), 'No Service') AS ServiceName
       FROM Bookings b
       INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
       LEFT JOIN Users u ON u.UserId = b.CustomerUserId
       WHERE bs.StaffId = @staffId
       GROUP BY b.BookingId, b.BookingTime, b.Status, u.Name
       ORDER BY b.BookingTime DESC`, { staffId },
        ),
        query(
            `SELECT
          DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE)) AS ShiftDate,
          sa.StartHour,
          (TRY_CONVERT(INT, sa.StartHour)
           + ISNULL(TRY_CONVERT(INT, sa.DurationHours),
               CASE
                 WHEN TRY_CONVERT(INT, sa.EndHour) > TRY_CONVERT(INT, sa.StartHour)
                   THEN TRY_CONVERT(INT, sa.EndHour) - TRY_CONVERT(INT, sa.StartHour)
                 ELSE 0
               END
             )) AS EndHour
       FROM StaffShifts sa
       WHERE sa.StaffId = @staffId
         AND DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE)) >= @dayStart
         AND DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE)) < @nextDay
       ORDER BY sa.StartHour ASC`, { staffId, dayStart, nextDay },
        ).catch(() => ({ recordset: [] })),
        // Also fetch any StaffAvailability rows for today (some setups store assigned shifts here)
        query(
          `SELECT
             CAST(sa2.WeekStartDate AS date) AS ShiftDate,
             DATEPART(hour, sa2.StartHour) AS StartHour,
             DATEPART(hour, sa2.EndHour) AS EndHour
           FROM StaffAvailability sa2
           WHERE sa2.StaffId = @staffId
             AND CAST(sa2.WeekStartDate AS date) = @dayIso
           ORDER BY ShiftDate ASC`, { staffId, dayIso },
        ).catch(() => ({ recordset: [] })),
        query(
            `SELECT CAST(b.BookingTime AS date) AS D, COUNT(DISTINCT b.BookingId) AS Cnt
       FROM Bookings b
       INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @weekStart AND b.BookingTime < @nextDay
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('pending', 'booked', 'confirmed', 'c', 'completed', 'complete', 'done')
       GROUP BY CAST(b.BookingTime AS date)`, { staffId, weekStart, nextDay },
        ),
        query(
            `SELECT TOP 6
          COALESCE(s.Name, 'Khac') AS Label,
          COUNT(1) AS Cnt
       FROM Bookings b
       INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
       LEFT JOIN Services s ON s.ServiceId = bs.ServiceId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @weekStart
         AND b.BookingTime < @nextDay
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'complete', 'done')
       GROUP BY COALESCE(s.Name, 'Khac')
       ORDER BY COUNT(1) DESC`, { staffId, weekStart, nextDay },
        ).catch(() => ({ recordset: [] })),
        query(
            `SELECT CAST(sr.Rating AS INT) AS Rating, COUNT(1) AS Cnt
       FROM SalonReviews sr
       WHERE sr.CreatedAt >= @weekStart AND sr.CreatedAt < @nextDay
         AND EXISTS (
           SELECT 1
           FROM BookingServices bs
           WHERE bs.StaffId = @staffId
             AND ((sr.BookingServiceId IS NOT NULL AND sr.BookingServiceId = bs.BookingServiceId)
               OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND sr.BookingId = bs.BookingId))
         )
       GROUP BY CAST(sr.Rating AS INT)
       ORDER BY Rating DESC`, { staffId, weekStart, nextDay },
        ).catch(() => ({ recordset: [] })),
        query(
            `SELECT TOP 6
        sr.ReviewId,
        sr.Rating,
        sr.Comment,
        sr.CreatedAt,
        b.BookingId,
        COALESCE(cu2.Name, cu.Name) AS CustomerName,
        sv.Name AS ServiceName
     FROM SalonReviews sr
     LEFT JOIN Bookings b ON b.BookingId = sr.BookingId
     LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
     LEFT JOIN Users cu2 ON cu2.UserId = sr.UserId
     OUTER APPLY (
       SELECT TOP 1 s.Name
       FROM BookingServices bs
       LEFT JOIN Services s ON s.ServiceId = bs.ServiceId
       WHERE ((sr.BookingServiceId IS NOT NULL AND bs.BookingServiceId = sr.BookingServiceId)
           OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND bs.BookingId = sr.BookingId))
       ORDER BY bs.BookingServiceId DESC
     ) sv
     WHERE sr.CreatedAt >= @weekStart AND sr.CreatedAt < @nextDay
       AND EXISTS (
         SELECT 1
         FROM BookingServices bsx
         WHERE bsx.StaffId = @staffId
           AND ((sr.BookingServiceId IS NOT NULL AND bsx.BookingServiceId = sr.BookingServiceId)
             OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND bsx.BookingId = sr.BookingId))
       )
     ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC`, { staffId, weekStart, nextDay },
        ).catch(() => ({ recordset: [] })),
        query(
            `SELECT MONTH(b.BookingTime) AS MonthNo,
              SUM(ISNULL(COALESCE(bs.Price, sv.Price), 0)) AS Revenue
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @yearStart AND b.BookingTime < @nextYearStart
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'complete', 'done')
       GROUP BY MONTH(b.BookingTime)`, { staffId, yearStart, nextYearStart },
        ).catch(() => ({ recordset: [] })),
        query(
            `SELECT MONTH(DATEADD(DAY, ISNULL(TRY_CONVERT(INT, ss.DayIndex), 0), CAST(ss.WeekStartDate AS DATE))) AS MonthNo,
              SUM(ISNULL(ss.DurationHours, 0)) AS Hours
       FROM StaffShifts ss
       WHERE ss.StaffId = @staffId
         AND DATEADD(DAY, ISNULL(TRY_CONVERT(INT, ss.DayIndex), 0), CAST(ss.WeekStartDate AS DATE)) >= @yearStart
         AND DATEADD(DAY, ISNULL(TRY_CONVERT(INT, ss.DayIndex), 0), CAST(ss.WeekStartDate AS DATE)) < @nextYearStart
       GROUP BY MONTH(DATEADD(DAY, ISNULL(TRY_CONVERT(INT, ss.DayIndex), 0), CAST(ss.WeekStartDate AS DATE)))`, { staffId, yearStart, nextYearStart },
        ).catch(() => ({ recordset: [] })),
    ])

    const [allTimeServicesRes, allTimeReviewAggRes] = await Promise.all([
        query(
            `SELECT COUNT(1) AS TotalServices
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       WHERE bs.StaffId = @staffId
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) NOT IN ('canceled', 'cancelled', 'delete', 'deleted')`, { staffId },
        ).catch(() => ({ recordset: [{ TotalServices: 0 }] })),
        query(
            `SELECT
          COUNT(1) AS TotalReviews,
          AVG(CAST(sr.Rating AS FLOAT)) AS AvgRating
       FROM SalonReviews sr
       WHERE EXISTS (
         SELECT 1
         FROM BookingServices bs
         WHERE bs.StaffId = @staffId
           AND ((sr.BookingServiceId IS NOT NULL AND sr.BookingServiceId = bs.BookingServiceId)
             OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND sr.BookingId = bs.BookingId))
       )`, { staffId },
        ).catch(() => ({ recordset: [{ TotalReviews: 0, AvgRating: 0 }] })),
    ])

    const weeklyMap = new Map((weeklyBookingSeriesRes.recordset || []).map((r) => [toYmd(r.D), Number(r.Cnt || 0)]))
    const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    const weekly = []
    for (let i = 6; i >= 0; i -= 1) {
        const d = addDays(dayStart, -i)
        const jsDay = d.getDay()
        const idx = jsDay === 0 ? 6 : jsDay - 1
        weekly.push({ label: labels[idx], value: Number(weeklyMap.get(toYmd(d)) || 0) })
    }

    const totalServiceCount = (serviceDistRes.recordset || []).reduce((sum, r) => sum + Number(r.Cnt || 0), 0)

    const weekRevenue = Number(weeklyRevenueRes.recordset?.[0]?.Revenue || 0)
    const weekHours = Number(weeklyHoursRes.recordset?.[0]?.Hours || 0)
    const weekCommission = calcCommission(weekRevenue, settingsMap)
    const weekIncome = Math.round(weekHours * 25000 + weekCommission)

    const revenueByMonth = new Map((yearRevenueByMonthRes.recordset || []).map((r) => [Number(r.MonthNo), Number(r.Revenue || 0)]))
    const hoursByMonth = new Map((yearHoursByMonthRes.recordset || []).map((r) => [Number(r.MonthNo), Number(r.Hours || 0)]))

    const yearlyIncome = []
    for (let m = 1; m <= 12; m += 1) {
        const revenue = Number(revenueByMonth.get(m) || 0)
        const hours = Number(hoursByMonth.get(m) || 0)
        const commission = calcCommission(revenue, settingsMap)
        const income = Math.round(hours * 25000 + commission)
        yearlyIncome.push({ label: `T${m}`, value: income })
    }

    const toAppointmentItem = (r) => {
        const bookingDate = new Date(r.BookingTime)
        const hh = String(bookingDate.getHours()).padStart(2, '0')
        const mm = String(bookingDate.getMinutes()).padStart(2, '0')
        const yyyy = bookingDate.getFullYear()
        const mmDate = String(bookingDate.getMonth() + 1).padStart(2, '0')
        const ddDate = String(bookingDate.getDate()).padStart(2, '0')
        const customer = String(r.CustomerName || 'Khach hang')
        const parts = customer.split(/\s+/).filter(Boolean)
        const initials = parts.length > 1
            ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
            : customer.slice(0, 2).toUpperCase()

        return {
            id: r.BookingId,
            date: `${yyyy}-${mmDate}-${ddDate}`,
            time: `${hh}:${mm}`,
            customer,
            service: String(r.ServiceName || 'No Service'),
            status: String(r.Status || 'Booked'),
            initials,
        }
    }

    // Merge shifts from StaffShifts and StaffAvailability
    const shiftsFromShifts = (todayShiftRes.recordset || []).map((r) => ({
        start: Number(r.StartHour || 0),
        end: Number(r.EndHour || r.StartHour || 0),
    }))
    const shiftsFromAvail = (todayAvailabilityRes && Array.isArray(todayAvailabilityRes.recordset) ? (todayAvailabilityRes.recordset || []) : []).map((r) => ({
      start: Number(r.StartHour || 0),
      end: Number(r.EndHour || r.StartHour || 0),
    }))

    const mergedShifts = [...shiftsFromShifts, ...shiftsFromAvail]

    

    const todaySchedule = mergedShifts.map((s) => {
      const start = Number(s.start || 0)
      const end = Number(s.end || start)
      return {
        time: `${String(start).padStart(2, '0')}:00 - ${String(Math.max(end, start)).padStart(2, '0')}:00`,
        type: 'assigned',
        note: 'Ca lam viec',
      }
    })

    const data = {
        stats: {
            todayAppointments: Number(todayCountRes.recordset?.[0]?.Cnt || 0),
            weeklyCustomers: Number(weeklyCustomersRes.recordset?.[0]?.Cnt || 0),
            weekHours: Math.round(weekHours * 10) / 10,
            weeklyRevenue: weekRevenue,
            weeklyCommission: weekCommission,
            weekIncome,
            weeklyReviews: Number(weeklyReviewsCountRes.recordset?.[0]?.Cnt || 0),
            weeklyServices: Number(totalServiceCount || 0),
            totalServicesAll: Number(allTimeServicesRes.recordset?.[0]?.TotalServices || 0),
            totalReviewsAll: Number(allTimeReviewAggRes.recordset?.[0]?.TotalReviews || 0),
            avgRatingAll: Number(allTimeReviewAggRes.recordset?.[0]?.AvgRating || 0),
            // Keep old keys so existing clients continue to work.
            monthlyCustomers: Number(weeklyCustomersRes.recordset?.[0]?.Cnt || 0),
            monthlyHours: Math.round(weekHours * 10) / 10,
            monthIncome: weekIncome,
            totalReviews: Number(allTimeReviewAggRes.recordset?.[0]?.TotalReviews || 0),
            avgRating: Number(allTimeReviewAggRes.recordset?.[0]?.AvgRating || 0),
        },
        todaySchedule,
        todayAppointments: (todayApptsRes.recordset || []).map(toAppointmentItem),
        recentAppointments: (recentApptsRes.recordset || []).map(toAppointmentItem),
        weekly,
        yearlyIncome,
        serviceDistribution: (serviceDistRes.recordset || []).map((r) => ({
          label: String(r.Label || 'Khac'),
          count: Number(r.Cnt || 0),
          value: totalServiceCount > 0 ? Math.round((Number(r.Cnt || 0) * 100) / totalServiceCount) : 0,
        })),
        ratings: (ratingsRes.recordset || []).map((r) => ({
          rating: `${Number(r.Rating || 0)}*`,
          count: Number(r.Cnt || 0),
        })),
        recentReviews: (recentReviewsRes.recordset || []).map((r) => ({
          id: r.ReviewId,
          rating: Number(r.Rating || 0),
          comment: String(r.Comment || '').trim(),
          createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null,
          bookingId: r.BookingId || null,
          customerName: String(r.CustomerName || 'Khach hang'),
          serviceName: String(r.ServiceName || 'Dich vu'),
        })),
    }

    res.json({ ok: true, data })
})

const getReviewDetails = asyncHandler(async(req, res) => {
    const staffId = await resolveStaffIdFromRequest(req)
    if (!staffId) {
        res.status(401).json({ ok: false, error: 'Unauthorized' })
        return
    }

    const requestedLimit = Number(req.query?.limit)
    const safeLimit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 10
    const requestedOffset = Number(req.query?.offset)
    const safeOffset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? Math.floor(requestedOffset) : 0
    const requestedDays = Number(req.query?.days)
    const safeDays = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 60) : null

    const rangeStart = safeDays ? addDays(startOfDay(new Date()), -(safeDays - 1)) : null
    const rangeEnd = safeDays ? addDays(startOfDay(new Date()), 1) : null
    const dateFilterSql = safeDays ? 'AND sr.CreatedAt >= @rangeStart AND sr.CreatedAt < @rangeEnd' : ''

    const reviewRes = await query(
      `WITH OrderedReviews AS (
       SELECT
        sr.ReviewId,
        sr.Rating,
        sr.Comment,
        sr.CreatedAt,
        b.BookingId,
        COALESCE(cu2.Name, cu.Name) AS CustomerName,
      sv.Name AS ServiceName,
      ROW_NUMBER() OVER (ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC) AS RowNo
     FROM SalonReviews sr
     LEFT JOIN Bookings b ON b.BookingId = sr.BookingId
    LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
    LEFT JOIN Users cu2 ON cu2.UserId = sr.UserId
     OUTER APPLY (
       SELECT TOP 1 s.Name
       FROM BookingServices bs
       LEFT JOIN Services s ON s.ServiceId = bs.ServiceId
       WHERE ((sr.BookingServiceId IS NOT NULL AND bs.BookingServiceId = sr.BookingServiceId)
           OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND bs.BookingId = sr.BookingId))
       ORDER BY bs.BookingServiceId DESC
     ) sv
     WHERE EXISTS (
       SELECT 1
       FROM BookingServices bsx
       WHERE bsx.StaffId = @staffId
         AND ((sr.BookingServiceId IS NOT NULL AND bsx.BookingServiceId = sr.BookingServiceId)
           OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND bsx.BookingId = sr.BookingId))
     )
     ${dateFilterSql}
     )
     SELECT
       ReviewId,
       Rating,
       Comment,
       CreatedAt,
       BookingId,
       CustomerName,
       ServiceName
     FROM OrderedReviews
     WHERE RowNo > @offset
       AND RowNo <= (@offset + @limit)
     ORDER BY RowNo ASC`, {
        staffId,
        offset: safeOffset,
        limit: safeLimit,
        ...(safeDays ? { rangeStart, rangeEnd } : {}),
      },
    ).catch(() => ({ recordset: [] }))

    const totalRes = await query(
        `SELECT COUNT(1) AS Total
     FROM SalonReviews sr
     WHERE EXISTS (
       SELECT 1
       FROM BookingServices bsx
       WHERE bsx.StaffId = @staffId
         AND ((sr.BookingServiceId IS NOT NULL AND bsx.BookingServiceId = sr.BookingServiceId)
           OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND bsx.BookingId = sr.BookingId))
     )
     ${dateFilterSql}`,
        {
            staffId,
            ...(safeDays ? { rangeStart, rangeEnd } : {}),
        },
    ).catch(() => ({ recordset: [{ Total: 0 }] }))

    const data = (reviewRes.recordset || []).map((r) => ({
        id: r.ReviewId,
        rating: Number(r.Rating || 0),
        comment: String(r.Comment || '').trim(),
        createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null,
        bookingId: r.BookingId || null,
        customerName: String(r.CustomerName || 'Khach hang'),
        serviceName: String(r.ServiceName || 'Dich vu'),
    }))

    const total = Number(totalRes.recordset?.[0]?.Total || 0)
    const nextOffset = safeOffset + data.length

    res.json({
      ok: true,
      data,
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        count: data.length,
        total,
        hasMore: nextOffset < total,
        nextOffset: nextOffset < total ? nextOffset : null,
      },
    })
})

module.exports = {
    getSummary,
    getReviewDetails,
}