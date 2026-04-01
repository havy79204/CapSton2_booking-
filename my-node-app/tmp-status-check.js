const { query } = require('./src/config/query')

async function run() {
  const sql = "SELECT SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(Status,''))))='C' THEN 1 ELSE 0 END) AS CCount FROM Orders; SELECT SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(Status,''))))='C' THEN 1 ELSE 0 END) AS CCount FROM Bookings;"
  const r = await query(sql, {})
  const rows = r.recordsets || []
  const ordersC = Number((rows[0] && rows[0][0] && rows[0][0].CCount) || 0)
  const bookingsC = Number((rows[1] && rows[1][0] && rows[1][0].CCount) || 0)
  console.log('STATUS_C_REMAIN', JSON.stringify({ ordersC, bookingsC }))
}

run().catch((e) => {
  console.error('STATUS_CHECK_FAIL', e.message)
  process.exit(1)
})
