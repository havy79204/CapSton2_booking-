const sql = require('mssql')
const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const cfg = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: String(process.env.DB_ENCRYPT) === 'true',
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERT) === 'true',
    enableArithAbort: true,
    cryptoCredentialsDetails: {
      minVersion: process.env.DB_TLS_MIN_VERSION || undefined,
      ciphers: process.env.DB_TLS_CIPHERS || undefined,
    },
  },
}

;(async () => {
  try {
    await sql.connect(cfg)
    console.log('CONNECT OK')
  } catch (err) {
    console.log('CONNECT FAIL')
    console.log(err?.code || '')
    console.log(err?.message || err)
    process.exitCode = 1
  } finally {
    try {
      await sql.close()
    } catch {
      // ignore
    }
  }
})()
