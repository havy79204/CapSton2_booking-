const { query } = require('../config/query')

function normalizeSort(sortBy) {
  const s = String(sortBy || '').trim().toLowerCase()
  const allowed = new Set(['date_desc', 'date_asc', 'total_desc', 'total_asc', 'qty_desc', 'qty_asc'])
  return allowed.has(s) ? s : 'date_desc'
}

function applyRetailSort(orders, sortBy) {
  const next = [...orders]
  switch (sortBy) {
    case 'date_asc':
      next.sort((a, b) => new Date(a.completedAt || a.orderedAt || 0) - new Date(b.completedAt || b.orderedAt || 0))
      break
    case 'total_desc':
      next.sort((a, b) => Number(b.totalAmount || 0) - Number(a.totalAmount || 0))
      break
    case 'total_asc':
      next.sort((a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0))
      break
    case 'qty_desc':
      next.sort((a, b) => Number(b.totalQty || 0) - Number(a.totalQty || 0))
      break
    case 'qty_asc':
      next.sort((a, b) => Number(a.totalQty || 0) - Number(b.totalQty || 0))
      break
    case 'date_desc':
    default:
      next.sort((a, b) => new Date(b.completedAt || b.orderedAt || 0) - new Date(a.completedAt || a.orderedAt || 0))
      break
  }
  return next
}

async function getReports(from, to, options = {}) {
  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null
  const fromIso = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.toISOString().slice(0, 10) : null
  const toIso = toDate && !Number.isNaN(toDate.getTime()) ? toDate.toISOString().slice(0, 10) : null

  const paymentMethod = String(options?.paymentMethod || '').trim()
  const search = String(options?.search || '').trim()
  const sortBy = normalizeSort(options?.sortBy)
  const searchLike = search ? `%${search}%` : null
  const paymentFilter = paymentMethod && paymentMethod !== 'StockOut' ? '__NO_MATCH__' : null

  const rangeWhere = fromIso && toIso ? 'WHERE PaidAt IS NOT NULL AND CAST(PaidAt AS date) BETWEEN @from AND @to' : ''
  const binds = fromIso && toIso ? { from: fromIso, to: toIso } : {}

  const revenueRes = await query(
    `SELECT SUM(Amount) AS Revenue, COUNT(1) AS Cnt
     FROM Payments
     ${rangeWhere}`,
    binds
  ).catch(() => ({ recordset: [{ Revenue: 0, Cnt: 0 }] }))

  const totalRevenue = Number(revenueRes.recordset?.[0]?.Revenue || 0)
  const txCount = Number(revenueRes.recordset?.[0]?.Cnt || 0)
  const avg = txCount > 0 ? totalRevenue / txCount : 0

  const activeCustRes = await query(
    `SELECT COUNT(DISTINCT CustomerUserId) AS Cnt
     FROM Bookings
     WHERE BookingTime >= DATEADD(day, -30, GETDATE())`
  ).catch(() => ({ recordset: [{ Cnt: 0 }] }))
  const activeCustomers = Number(activeCustRes.recordset?.[0]?.Cnt || 0)

  const trendRes = await query(
    `SELECT CAST(PaidAt AS date) AS D, SUM(Amount) AS Revenue
     FROM Payments
     WHERE PaidAt IS NOT NULL AND CAST(PaidAt AS date) >= DATEADD(day, -6, CAST(GETDATE() AS date))
     GROUP BY CAST(PaidAt AS date)
     ORDER BY D`
  ).catch(() => ({ recordset: [] }))

  const byDate = new Map((trendRes.recordset || []).map((r) => [String(r.D).slice(0, 10), Number(r.Revenue || 0)]))
  const values = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0, 10)
    values.push(byDate.get(k) || 0)
  }

  const topServicesRes = await query(
    `SELECT TOP 5 sv.Name, COUNT(1) AS Cnt
     FROM BookingServices bs
     LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
     GROUP BY sv.Name
     ORDER BY Cnt DESC`
  ).catch(() => ({ recordset: [] }))

  const services = (topServicesRes.recordset || []).map((r) => ({ name: r.Name || '—', value: Number(r.Cnt || 0) }))

  const staffRes = await query(
    `SELECT TOP 4
        su.Name AS Name,
        COUNT(bs.BookingServiceId) AS Appt,
        SUM(COALESCE(bs.Price, sv.Price)) AS Revenue
      FROM BookingServices bs
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Staff st ON st.StaffId = bs.StaffId
      LEFT JOIN Users su ON su.UserId = st.UserId
      GROUP BY su.Name
      ORDER BY Revenue DESC`
  ).catch(() => ({ recordset: [] }))

  const staff = (staffRes.recordset || []).map((r) => ({
    name: (r.Name || '?').slice(0, 1).toUpperCase(),
    appt: Number(r.Appt || 0),
    revenueM: Math.round((Number(r.Revenue || 0) / 1_000_000) * 10) / 10,
  }))

  const payRes = await query(
    `SELECT PaymentMethod, COUNT(1) AS Cnt
     FROM Payments
     GROUP BY PaymentMethod
     ORDER BY Cnt DESC`
  ).catch(() => ({ recordset: [] }))

  const paymentItems = (payRes.recordset || []).map((r) => ({
    name: r.PaymentMethod || 'Unknown',
    count: Number(r.Cnt || 0),
  }))

  const retailRangeRes = await query(
    `SELECT
        t.TransactionId,
        t.ReferenceId,
        t.CreatedAt,
        COALESCE(i.ProductId, REPLACE(i.InventoryItemId, 'retail_', '')) AS ProductId,
        COALESCE(p.Name, i.Name, 'Product') AS ProductName,
        CAST(ABS(COALESCE(t.Quantity, 0)) AS INT) AS Quantity,
        CAST(COALESCE(p.Price, 0) AS DECIMAL(18,2)) AS UnitPrice,
        CAST(ABS(COALESCE(t.Quantity, 0)) * COALESCE(p.Price, 0) AS DECIMAL(18,2)) AS LineTotal
     FROM InventoryTransactions t
     INNER JOIN InventoryItems i ON i.InventoryItemId = t.InventoryItemId
     LEFT JOIN Products p ON p.ProductId = i.ProductId
     WHERE
       t.Type = 'OUT'
       AND COALESCE(i.ItemGroup, 'service') = 'retail'
       AND (@from IS NULL OR CAST(t.CreatedAt AS date) >= @from)
       AND (@to IS NULL OR CAST(t.CreatedAt AS date) <= @to)
     ORDER BY t.CreatedAt DESC, t.TransactionId DESC`,
    {
      from: fromIso,
      to: toIso,
    }
  ).catch(() => ({ recordset: [] }))

  const retailFilteredRes = await query(
    `SELECT
        t.TransactionId,
        t.ReferenceId,
        t.CreatedAt,
        COALESCE(i.ProductId, REPLACE(i.InventoryItemId, 'retail_', '')) AS ProductId,
        COALESCE(p.Name, i.Name, 'Product') AS ProductName,
        CAST(ABS(COALESCE(t.Quantity, 0)) AS INT) AS Quantity,
        CAST(COALESCE(p.Price, 0) AS DECIMAL(18,2)) AS UnitPrice,
        CAST(ABS(COALESCE(t.Quantity, 0)) * COALESCE(p.Price, 0) AS DECIMAL(18,2)) AS LineTotal
     FROM InventoryTransactions t
     INNER JOIN InventoryItems i ON i.InventoryItemId = t.InventoryItemId
     LEFT JOIN Products p ON p.ProductId = i.ProductId
     WHERE
       t.Type = 'OUT'
       AND COALESCE(i.ItemGroup, 'service') = 'retail'
       AND (@from IS NULL OR CAST(t.CreatedAt AS date) >= @from)
       AND (@to IS NULL OR CAST(t.CreatedAt AS date) <= @to)
       AND (@searchLike IS NULL
         OR COALESCE(t.ReferenceId, '') LIKE @searchLike
         OR COALESCE(p.Name, i.Name, '') LIKE @searchLike)
       AND (@paymentFilter IS NULL)
     ORDER BY t.CreatedAt DESC, t.TransactionId DESC`,
    {
      from: fromIso,
      to: toIso,
      searchLike,
      paymentFilter,
    }
  ).catch(() => ({ recordset: [] }))

  function buildOrders(rows) {
    const ordersMap = new Map()
    for (const row of rows || []) {
      const orderId = String(row.ReferenceId || '').trim() || `TX:${row.TransactionId}`
      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          orderId,
          orderedAt: row.CreatedAt || null,
          completedAt: row.CreatedAt || null,
          status: 'Completed',
          paymentMethod: 'StockOut',
          customerName: '',
          customerPhone: '',
          note: String(row.ReferenceId || ''),
          totalQty: 0,
          totalAmount: 0,
          items: [],
        })
      }

      const order = ordersMap.get(orderId)
      const qty = Number(row.Quantity || 0)
      const unitPrice = Number(row.UnitPrice || 0)
      const lineTotal = Number(row.LineTotal || 0)

      order.totalQty += qty
      order.totalAmount += lineTotal
      order.items.push({
        id: row.TransactionId,
        productId: row.ProductId,
        productName: row.ProductName || 'Product',
        quantity: qty,
        unitPrice,
        lineTotal,
      })
    }
    return Array.from(ordersMap.values())
  }

  const retailOrders = applyRetailSort(buildOrders(retailFilteredRes.recordset || []), sortBy)
  const retailOrdersInRange = buildOrders(retailRangeRes.recordset || [])

  const paymentMethods = Array.from(new Set(retailOrders.map((x) => x.paymentMethod).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b), 'vi')
  )

  const filteredTotalQty = retailOrders.reduce((s, o) => s + Number(o.totalQty || 0), 0)
  const filteredTotalAmount = retailOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0)

  const rangeTotalQty = retailOrdersInRange.reduce((s, o) => s + Number(o.totalQty || 0), 0)
  const rangeTotalAmount = retailOrdersInRange.reduce((s, o) => s + Number(o.totalAmount || 0), 0)

  return {
    kpis: {
      totalRevenue,
      avgPerTx: avg,
      txCount,
      activeCustomers,
    },
    trend: values,
    services,
    staff,
    payments: paymentItems,
    retailOrders: {
      summary: {
        totalOrdersInRange: retailOrdersInRange.length,
        totalQtyInRange: rangeTotalQty,
        totalAmountInRange: rangeTotalAmount,
        totalOrdersAfterFilters: retailOrders.length,
        totalQtyAfterFilters: filteredTotalQty,
        totalAmountAfterFilters: filteredTotalAmount,
      },
      filters: {
        from: fromIso,
        to: toIso,
        paymentMethod: paymentMethod || '',
        search: search || '',
        sortBy,
        paymentMethods,
      },
      orders: retailOrders,
    },
  }
}

module.exports = { getReports }
