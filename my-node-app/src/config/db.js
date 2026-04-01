const sql = require('mssql')
const { env } = require('./config')

let poolPromise = null

function getPool() {
  if (!poolPromise) {
    const config = {
      user: env.db.user,
      password: env.db.password,
      server: env.db.server,
      database: env.db.database,
      options: {
        encrypt: env.db.encrypt,
        trustServerCertificate: env.db.trustServerCertificate,
        enableArithAbort: true,
        instanceName: env.db.instanceName || undefined,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    }

    if (!env.db.instanceName && env.db.port) {
      config.port = env.db.port
    }

    poolPromise = sql.connect(config).catch((err) => {
      poolPromise = null
      throw err
    })
  }
  return poolPromise
}

async function closePool() {
  if (!poolPromise) return
  try {
    const pool = await poolPromise
    await pool.close()
  } finally {
    poolPromise = null
  }
}

module.exports = { sql, getPool, closePool }
