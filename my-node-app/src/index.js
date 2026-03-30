const { env } = require('./config/config')
const http = require('http')
const { createApp } = require('./app')
const { getPool } = require('./config/db')
const { initSocketServer } = require('./realtime/socket')

function printDbHint(err) {
  if (!err) return
  const code = err.code || err?.originalError?.code
  if (code !== 'ELOGIN') return

  console.error(
    [
      '',
      'Database login failed (SQL Server):',
      `- server: ${env.db.server}${env.db.instanceName ? `\\${env.db.instanceName}` : ''}`,
      `- database: ${env.db.database}`,
      `- user: ${env.db.user}`,
      '',
    ].join('\n'),
  )
}

async function main() {
  // Ensure required inventory columns exist (best-effort).
  // If the DB user can't ALTER tables, the API can still run, but inventory category/kind will remain empty.
  const app = createApp()
  const server = http.createServer(app)
  initSocketServer(server)

  server.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`)
  })

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use. Make sure no other process is listening on this port (kill existing server or change PORT).`)
      process.exit(1)
    }
    throw err
  })
}

main().catch((err) => {
  console.error(err)
  printDbHint(err)
  process.exit(1)
})
