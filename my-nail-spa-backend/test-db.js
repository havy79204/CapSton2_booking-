const sql = require('mssql')

const DB_USER = process.env.DB_USER || 'sa'
const DB_PASSWORD = process.env.DB_PASSWORD || '07092004'
const DB_DATABASE = process.env.DB_DATABASE || 'NIOMNailSpa'
const DB_TLS_MIN_VERSION = process.env.DB_TLS_MIN_VERSION || 'TLSv1'

// IMPORTANT:
// - For named instances, use options.instanceName (not server: "host\\instance").
// - If SQL Browser cannot start, use direct TCP port (server + port) to bypass it.
const configs = [
  {
    name: 'Named instance via SQL Browser (localhost + instanceName)',
    user: DB_USER,
    password: DB_PASSWORD,
    server: 'localhost',
    database: DB_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      instanceName: 'SQLEXPRESS',
    },
  },
  {
    name: 'Direct TCP (localhost:1433) - bypass SQL Browser',
    user: DB_USER,
    password: DB_PASSWORD,
    server: 'localhost',
    port: 1433,
    database: DB_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  },
  {
    name: `Direct TCP (localhost:1433) + encrypt=true (minVersion=${DB_TLS_MIN_VERSION})`,
    user: DB_USER,
    password: DB_PASSWORD,
    server: 'localhost',
    port: 1433,
    database: DB_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      cryptoCredentialsDetails: {
        minVersion: DB_TLS_MIN_VERSION,
      },
    },
  },
  {
    name: 'Direct TCP (localhost:14330) - bypass SQL Browser',
    user: DB_USER,
    password: DB_PASSWORD,
    server: 'localhost',
    port: 14330,
    database: DB_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  },
  {
    name: 'Direct TCP (DESKTOP-T9H4SPL:14330) - bypass SQL Browser',
    user: DB_USER,
    password: DB_PASSWORD,
    server: 'DESKTOP-T9H4SPL',
    port: 14330,
    database: DB_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  },
]

async function testConnection(config) {
  console.log(`\n=== Testing: ${config.name} ===`)
  console.log(`server=${config.server}${config.port ? ` port=${config.port}` : ''}`)
  if (config.options?.instanceName) console.log(`instanceName=${config.options.instanceName}`)
  
  try {
    const pool = new sql.ConnectionPool(config)
    await pool.connect()
    console.log('OK: connected')
    
    // Try a simple query
    const result = await pool.request().query('SELECT DB_NAME() as db, @@VERSION as version')
    const row = result.recordset?.[0]
    console.log(`db=${row?.db}`)
    console.log(`version=${String(row?.version || '').split(/\r?\n/)[0]}`)
    
    await pool.close()
    return { ok: true }
  } catch (error) {
    const code = error?.code || error?.originalError?.code
    console.log(`FAIL: ${error?.message || error}`)
    if (code) console.log(`code=${code}`)
    return { ok: false }
  }
}

async function main() {
  console.log('Testing SQL Server connections...')
  
  let success = false;
  for (const config of configs) {
    const result = await testConnection(config)
    if (result.ok) {
      success = true;
      console.log(`\nWORKING: ${config.name}`)
      process.exitCode = 0
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  
  if (!success) {
    console.log('\nNo configuration worked.')
    console.log('- If you cannot start SQLBrowser: enable TCP/IP for SQLEXPRESS and set a fixed TCP port (e.g. 14330), then connect by server+port.')
    process.exitCode = 2
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})