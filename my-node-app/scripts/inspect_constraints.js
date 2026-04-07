#!/usr/bin/env node
;(async () => {
  try {
    const { query } = require('../src/config/query')
    const res = await query(`
      SELECT cc.name, cc.definition
      FROM sys.check_constraints cc
      INNER JOIN sys.tables t ON cc.parent_object_id = t.object_id
      WHERE t.name = 'SalonReviews'
    `)
    console.log(JSON.stringify(res.recordset || [], null, 2))
    process.exit(0)
  } catch (err) {
    console.error('Inspect constraints failed:', err && err.message ? err.message : err)
    process.exit(1)
  }
})()
