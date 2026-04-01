const sql = require('mssql')
const { env } = require('./config')

let poolPromise = null

function getPool() {
  if (!poolPromise) {
    const parsedPort = Number(env.db.port)
    const hasExplicitPort = Number.isInteger(parsedPort) && parsedPort > 0

    const config = {
      server: env.db.server,
      database: env.db.database,
      
      requestTimeout: 30000, // Tăng từ default 15s lên 30s
      connectionTimeout: 30000,

      // If using SQL Authentication
      ...(env.db.user && {
        user: env.db.user,
        password: env.db.password,
      }),

      options: {
        encrypt: Boolean(env.db.encrypt),
        trustServerCertificate: Boolean(env.db.trustServerCertificate),

        enableArithAbort: true,

        // Prefer explicit TCP port when provided to avoid SQL Browser dependency.
        ...(!hasExplicitPort && env.db.instanceName && {
          instanceName: env.db.instanceName,
        }),
      },

      ...(hasExplicitPort && { port: parsedPort }),

      pool: {
        min: 2,
        max: 20,
        idleTimeoutMillis: 30000,
      },
    }

    // advanced TLS options (if any)
    if (env.db.tlsMinVersion || env.db.tlsCiphers) {
      config.options.cryptoCredentialsDetails = {
        ...(env.db.tlsMinVersion && {
          minVersion: env.db.tlsMinVersion,
        }),
        ...(env.db.tlsCiphers && {
          ciphers: env.db.tlsCiphers,
        }),
      }
    }

    poolPromise = sql.connect(config).catch((err) => {
      poolPromise = null
      console.error('❌ Database connection error:', err)
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