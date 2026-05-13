const { env } = require('./config/config')
const http = require('http')
const { createApp } = require('./app')
const { getPool } = require('./config/db')
const { initSocketServer } = require('./realtime/socket')
const { dispatchDueNotificationEmails, dispatchOwnerInsights } = require('./services/notifications.service')
const { initializeInventoryService } = require('./services/inventory.service')

const os = require('os')

function getLocalIp() {
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address
        }
    }
    return 'localhost'
}

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

  // Initialize inventory service (cleanup legacy data, etc.)
  try {
    await initializeInventoryService()
  } catch (err) {
    console.warn('[index] initializeInventoryService failed:', err?.message || err)
  }

  // Bind to all interfaces so devices on the same LAN can reach this server.
  server.listen(env.port, '0.0.0.0', () => {
    const localIp = getLocalIp()
    console.log(`API listening on http://0.0.0.0:${env.port} (LAN: http://${localIp}:${env.port})`)
  })

  // const reminderIntervalMs = 60 * 1000
  // setInterval(async () => {
  //   try {
  //     const result = await dispatchDueNotificationEmails(50)
  //     if (result.sent > 0) {
  //       console.log(`[notifications] sent ${result.sent}/${result.processed} scheduled email(s)`)
  //     }
  //   } catch (err) {
  //     console.warn('[notifications] scheduled email dispatch failed:', err?.message || err)
  //   }
  // }, reminderIntervalMs)

  // const ownerInsightIntervalMs = 5 * 60 * 1000
  // setInterval(async () => {
  //   try {
  //     const result = await dispatchOwnerInsights({ morningOnly: true })
  //     if (result.dispatched > 0) {
  //       console.log(`[notifications] dispatched ${result.dispatched} owner insight notification(s)`)
  //     }
  //   } catch (err) {
  //     console.warn('[notifications] owner insight dispatch failed:', err?.message || err)
  //   }
  // }, ownerInsightIntervalMs)

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


