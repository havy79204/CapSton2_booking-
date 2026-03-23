const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const path = require('path')
const { routes } = require('./routes')
const { notFound, errorHandler } = require('./middleware/error')
const { getPool } = require('./config/db')

function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(
    helmet({
      // Vite dev server runs on a different origin (e.g. :5173/:5174).
      // Allow loading static assets like avatar images from /uploads.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '8mb' }))
  app.use(morgan('dev'))

  app.use(
    '/uploads',
    (req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      next()
    },
    express.static(path.join(__dirname, '..', 'uploads')),
  )

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
