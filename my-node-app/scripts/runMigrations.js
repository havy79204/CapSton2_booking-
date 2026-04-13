const fs = require('fs')
const path = require('path')
const { getPool } = require('../src/config/db')

async function run() {
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  if (!files.length) {
    console.log('No migration files found')
    return
  }

  const pool = await getPool()
  try {
    for (const file of files) {
      const full = path.join(migrationsDir, file)
      const sql = fs.readFileSync(full, 'utf8')
      console.log('Running migration:', file)
      try {
        // run raw SQL batch
        await pool.request().batch(sql)
        console.log('OK', file)
      } catch (err) {
        console.error('Migration failed for', file, err.message || err)
      }
    }
  } finally {
    try { await pool.close() } catch (e) {}
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
