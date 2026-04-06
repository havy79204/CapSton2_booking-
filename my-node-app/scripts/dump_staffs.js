#!/usr/bin/env node
const { query } = require('../src/config/query')

async function main() {
  try {
    const r = await query(
      `SELECT s.StaffId, u.Name, u.Email, u.Phone FROM Staff s LEFT JOIN Users u ON u.UserId = s.UserId ORDER BY u.Name`
    )
    for (const row of r.recordset || []) {
      console.log(JSON.stringify(row))
    }
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

if (require.main === module) main()
