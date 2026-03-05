const { env } = require('./config/config')
const { createApp } = require('./app')
const { getPool } = require('./config/db')

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
  const app = createApp()
  const server = app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`)
  })

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use. Make sure no other process is listening on this port (kill existing server or change PORT).`)
      process.exit(1)
    }
    throw err
  })
  try {
    await getPool()
    console.log('Database connection: OK')
  } catch (err) {
    console.error('Database connection: FAILED')
    console.error(err)
    printDbHint(err)
  }
}

main().catch((err) => {
  console.error(err)
  printDbHint(err)
  process.exit(1)
})
