#!/usr/bin/env node
;(async () => {
  try {
    const { query } = require('../src/config/query')
    const res = await query(`
      SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'SalonReviews'
      ORDER BY ORDINAL_POSITION
    `)
    console.log(JSON.stringify(res.recordset || [], null, 2))
    process.exit(0)
  } catch (err) {
    console.error('Inspect failed:', err && err.message ? err.message : err)
    process.exit(1)
  }
})()
