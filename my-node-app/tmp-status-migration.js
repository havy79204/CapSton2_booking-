const { query } = require('./src/config/query')

async function run() {
  const sql = "UPDATE Orders SET Status='Pending' WHERE UPPER(LTRIM(RTRIM(ISNULL(Status,''))))='C'; SELECT @@ROWCOUNT AS UpdatedOrders; UPDATE Bookings SET Status='Pending' WHERE UPPER(LTRIM(RTRIM(ISNULL(Status,''))))='C'; SELECT @@ROWCOUNT AS UpdatedBookings;"
  const r = await query(sql, {})
  const rows = r.recordsets || []
  const updatedOrders = Number((rows[0] && rows[0][0] && rows[0][0].UpdatedOrders) || 0)
  const updatedBookings = Number((rows[1] && rows[1][0] && rows[1][0].UpdatedBookings) || 0)
  console.log('STATUS_MIGRATION_OK', JSON.stringify({ updatedOrders, updatedBookings }))
}

run().catch((e) => {
  console.error('STATUS_MIGRATION_FAIL', e.message)
  process.exit(1)
})
