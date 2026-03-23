const { query } = require('./src/config/query')

async function main() {
  const sql = `
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
      AND (
        TABLE_NAME LIKE '%Review%'
        OR TABLE_NAME LIKE '%Rating%'
        OR TABLE_NAME LIKE '%Product%Review%'
      )
    ORDER BY TABLE_NAME
  `
  const rs = await query(sql)
  console.log(JSON.stringify(rs.recordset || [], null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
