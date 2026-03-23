const { query } = require('../config/query')
const { pad2, formatHm, formatVnd } = require('../utils/format')
const { detectRoleKey } = require('./roles.service')

async function getDashboard() {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)

  const [revRes, apptRes, custRes, lowRes] = await Promise.all([
    query(
      `SELECT SUM(Amount) AS Revenue
       FROM Payments
       WHERE PaidAt IS NOT NULL AND CAST(PaidAt AS date) = @d`,
      { d: todayIso }
    ).catch(() => ({ recordset: [{ Revenue: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM Bookings
       WHERE CAST(BookingTime AS date) = @d`,
      { d: todayIso }
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
    (async () => {
      const roleKey = await detectRoleKey(['customer', 'CUSTOMER'])
      const where = roleKey ? 'WHERE RoleKey = @roleKey' : ''
      const binds = roleKey ? { roleKey } : {}
      return query(`SELECT COUNT(1) AS Cnt FROM Users ${where}`, binds)
    })().catch(() => ({ recordset: [{ Cnt: 0 }] })),
    query(
      `SELECT COUNT(1) AS Cnt
       FROM InventoryItems
       WHERE COALESCE(Quantity, 0) <= COALESCE(ReorderLevel, 0) AND COALESCE(ReorderLevel, 0) > 0`
    ).catch(() => ({ recordset: [{ Cnt: 0 }] })),
  ])

  const revenueToday = Number(revRes.recordset?.[0]?.Revenue || 0)
  const apptsToday = Number(apptRes.recordset?.[0]?.Cnt || 0)
  const customersTotal = Number(custRes.recordset?.[0]?.Cnt || 0)
  const lowStock = Number(lowRes.recordset?.[0]?.Cnt || 0)

  const trendRes = await query(
    `SELECT CAST(PaidAt AS date) AS D, SUM(Amount) AS Revenue
     FROM Payments
     WHERE PaidAt IS NOT NULL AND CAST(PaidAt AS date) >= DATEADD(day, -6, CAST(GETDATE() AS date))
     GROUP BY CAST(PaidAt AS date)
     ORDER BY D`
  ).catch(() => ({ recordset: [] }))

  const byDate = new Map((trendRes.recordset || []).map((r) => [String(r.D).slice(0, 10), Number(r.Revenue || 0)]))
  const day = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0, 10)
    day.push(byDate.get(k) || 0)
  }

  const monthRes = await query(
    `SELECT
       YEAR(PaidAt) AS Y,
       MONTH(PaidAt) AS M,
       SUM(Amount) AS Revenue
     FROM Payments
     WHERE PaidAt IS NOT NULL AND PaidAt >= DATEADD(month, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
     GROUP BY YEAR(PaidAt), MONTH(PaidAt)
     ORDER BY Y, M`
  ).catch(() => ({ recordset: [] }))

  const monthMap = new Map((monthRes.recordset || []).map((r) => [`${r.Y}-${pad2(r.M)}`, Number(r.Revenue || 0)]))
  const month = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
    month.push(monthMap.get(k) || 0)
  }

  const week = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date()
    start.setDate(start.getDate() - (i * 7 + 6))
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const wRes = await query(
      `SELECT SUM(Amount) AS Revenue
       FROM Payments
       WHERE PaidAt IS NOT NULL AND CAST(PaidAt AS date) BETWEEN @s AND @e`,
      { s: start.toISOString().slice(0, 10), e: end.toISOString().slice(0, 10) }
    ).catch(() => ({ recordset: [{ Revenue: 0 }] }))
    week.push(Number(wRes.recordset?.[0]?.Revenue || 0))
  }

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
      ORDER BY b.BookingTime DESC`
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
    `SELECT TOP 4
        su.Name AS StaffName,
        su.AvatarUrl AS StaffAvatarUrl,
        COUNT(bs.BookingServiceId) AS Appts,
        SUM(COALESCE(bs.Price, sv.Price)) AS Revenue
      FROM BookingServices bs
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Staff st ON st.StaffId = bs.StaffId
      LEFT JOIN Users su ON su.UserId = st.UserId
      GROUP BY su.Name, su.AvatarUrl
      ORDER BY Revenue DESC`
  ).catch(() => ({ recordset: [] }))

  const staffPerformance = (staffPerfRes.recordset || []).map((r, idx) => ({
    rank: idx + 1,
    name: r.StaffName || '',
    avatarUrl: r.StaffAvatarUrl || '',
    appts: Number(r.Appts || 0),
    revenue: formatVnd(r.Revenue || 0).replace(' ₫', ''),
  }))

  const invAlertRes = await query(
    `SELECT TOP 4 Name, Quantity
     FROM InventoryItems
     WHERE COALESCE(ReorderLevel, 0) > 0 AND COALESCE(Quantity, 0) <= COALESCE(ReorderLevel, 0)
     ORDER BY Quantity ASC`
  ).catch(() => ({ recordset: [] }))

  const inventoryAlerts = (invAlertRes.recordset || []).map((r) => ({ name: r.Name, qty: Number(r.Quantity || 0) }))

  return {
    kpis: { revenueToday, apptsToday, customersTotal, lowStock },
    revenueData: { day, week, month },
    recentAppointments,
    staffPerformance,
    inventoryAlerts,
  }
}

module.exports = { getDashboard }
