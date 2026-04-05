const { query } = require('../config/query')
const { getSettingsMap } = require('./settings.service')

function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

function nextMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
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

async function tableExists(tableName) {
    const res = await query(
        `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = @t`, { t: tableName },
    ).catch(() => ({ recordset: [] }))
    return Boolean(res.recordset?.length)
}

async function firstExistingColumn(tableName, names = []) {
    for (const name of names) {
        const res = await query(
            `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @t AND COLUMN_NAME = @c`, { t: tableName, c: name },
        ).catch(() => ({ recordset: [] }))
        if (res.recordset?.length) return name
    }
    return null
}

async function getMonthMetrics(staffId, startAt, endAt, tiers) {
  const [appointmentsRes, revenueRes, hoursRes, daysRes] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT b.BookingId) AS TotalAppointments
     FROM Bookings b
     INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
     WHERE bs.StaffId = @staffId
     AND b.BookingTime >= @startAt AND b.BookingTime < @endAt
     AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('pending','booked','confirmed','c','completed','complete','done')`, { staffId, startAt, endAt },
    ),
        query(
            `SELECT SUM(ISNULL(COALESCE(bs.Price, sv.Price), 0)) AS Revenue
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE bs.StaffId = @staffId
         AND b.BookingTime >= @startAt AND b.BookingTime < @endAt
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'complete', 'done')`, { staffId, startAt, endAt },
        ),
        query(
            `SELECT SUM(CASE
          WHEN ISNULL(sa.EndHour, 0) > ISNULL(sa.StartHour, 0) THEN ISNULL(sa.EndHour, 0) - ISNULL(sa.StartHour, 0)
          ELSE 0
        END) AS Hours
       FROM StaffAvailability sa
       WHERE sa.StaffId = @staffId
         AND sa.WeekStartDate >= @startAt
         AND sa.WeekStartDate < @endAt`, { staffId, startAt, endAt },
        ).catch(() => ({ recordset: [{ Hours: 0 }] })),
        query(
            `SELECT COUNT(DISTINCT CAST(sa.WeekStartDate AS DATE)) AS Days
       FROM StaffAvailability sa
       WHERE sa.StaffId = @staffId
         AND sa.WeekStartDate >= @startAt
         AND sa.WeekStartDate < @endAt`, { staffId, startAt, endAt },
        ).catch(() => ({ recordset: [{ Days: 0 }] })),
    ])

    const totalAppointments = Number(appointmentsRes.recordset?.[0]?.TotalAppointments || 0)
    const revenue = Number(revenueRes.recordset?.[0]?.Revenue || 0)
    const totalHours = Number(hoursRes.recordset?.[0]?.Hours || 0)
    const workDays = Number(daysRes.recordset?.[0]?.Days || 0)

    let tips = 0
    const hasTipLogs = await tableExists('TipLogs')
    if (hasTipLogs) {
        const tipDateColumn = await firstExistingColumn('TipLogs', ['At', 'CreatedAt', 'UpdatedAt'])
        if (tipDateColumn) {
            const tipsRes = await query(
                `SELECT SUM(ISNULL(tl.Amount, 0)) AS Tips
         FROM TipLogs tl
         WHERE tl.StaffId = @staffId
           AND tl.[${tipDateColumn}] >= @startAt
           AND tl.[${tipDateColumn}] < @endAt`, { staffId, startAt, endAt },
            ).catch(() => ({ recordset: [{ Tips: 0 }] }))
            tips = Number(tipsRes.recordset?.[0]?.Tips || 0)
        }
    }

    const baseSalary = Math.round(totalHours * 25000)
    const commission = Math.round(calcCommission(revenue, tiers))
    const bonus = 0
    const total = baseSalary + commission + Math.round(tips) + bonus

    return {
      totalAppointments,
        workDays,
      totalHours: Math.round(totalHours * 10) / 10,
        baseSalary,
        commission,
        tips: Math.round(tips),
        bonus,
      totalIncome: total,
      serviceRevenue: Math.round(revenue),
      // Theo yêu cầu UI: tổng doanh thu hiển thị bằng tổng thu nhập.
      totalRevenue: total,
    }
}

async function getTipLogs(staffId, limit = 20) {
    const hasTipLogs = await tableExists('TipLogs')
    if (!hasTipLogs) return []

    const dateColumn = await firstExistingColumn('TipLogs', ['At', 'CreatedAt', 'UpdatedAt'])
    if (!dateColumn) return []

    const noteColumn = await firstExistingColumn('TipLogs', ['Note', 'Description'])

    const rows = await query(
            `SELECT TOP (${Math.max(1, Math.min(Number(limit || 20), 50))})
       tl.Amount,
       tl.[${dateColumn}] AS TipAt
       ${noteColumn ? `, tl.[${noteColumn}] AS TipNote` : ', CAST(NULL AS NVARCHAR(255)) AS TipNote'}
     FROM TipLogs tl
     WHERE tl.StaffId = @staffId
     ORDER BY tl.[${dateColumn}] DESC`,
    { staffId },
  ).catch(() => ({ recordset: [] }))

  return (rows.recordset || []).map((r, idx) => ({
    id: String(idx + 1),
    date: r.TipAt ? new Date(r.TipAt).toISOString().slice(0, 10) : '',
    amount: Number(r.Amount || 0),
    note: String(r.TipNote || '').trim(),
  }))
}

async function getPayrollOverview(staffId) {
  const now = new Date()
  const currentStart = monthStart(now)
  const currentEnd = nextMonthStart(now)
  const settingsMap = await getSettingsMap().catch(() => ({}))

  const currentMonth = await getMonthMetrics(staffId, currentStart, currentEnd, settingsMap)

  const history = []
  for (let i = 1; i <= 5; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = monthStart(d)
    const end = nextMonthStart(d)
    const m = await getMonthMetrics(staffId, start, end, settingsMap)
    history.push({
      monthKey: monthKeyOf(d),
      ...m,
    })
  }

  const chartSeries = [...history].reverse().concat([{ monthKey: monthKeyOf(now), ...currentMonth }]).map((m) => ({
    monthKey: m.monthKey,
    totalIncome: Number(m.totalIncome || 0),
  }))

  const tipLogs = await getTipLogs(staffId, 10)

  return {
    currentMonth: {
      monthKey: monthKeyOf(now),
      ...currentMonth,
    },
    history,
    chartSeries,
    tipLogs,
  }
}

module.exports = {
  getPayrollOverview,
}