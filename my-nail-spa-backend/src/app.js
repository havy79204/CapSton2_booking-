const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')

const { routes } = require('./routes')
const { notFound, errorHandler } = require('./middleware/error')
const { getPool } = require('./config/db')

function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan('dev'))

  app.get('/health', async (req, res) => {
    let db = { ok: false }
    try {
      await getPool()
      db = { ok: true }
    } catch (err) {
      db = {
        ok: false,
        code: err?.code || err?.originalError?.code,
        message: err?.message,
      }
    }

    res.json({ ok: true, ts: new Date().toISOString(), db })
  })

  app.use('/api', routes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}

module.exports = { createApp }
