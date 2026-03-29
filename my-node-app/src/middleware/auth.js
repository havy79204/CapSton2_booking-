const jwt = require('jsonwebtoken')

const { env } = require('../config/config')

function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization
  if (!header) return ''
  const value = String(header)
  const m = value.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req)
  if (!token) {
    res.status(401).json({ ok: false, error: 'Missing Authorization token' })
    return
  }

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret)
    req.user = payload
    // normalize a simple userId on the request for convenience (may be numeric or string)
    const maybeId = payload?.sub || payload?.userId || payload?.UserId || payload?.id || payload?.uid || null
    req.userId = maybeId !== undefined && maybeId !== null ? String(maybeId) : null
    if (!env || env.nodeEnv !== 'production') {
      try {
        console.debug('[requireAuth] authenticated user payload keys:', Object.keys(payload || {}), 'userId:', req.userId)
      } catch (e) { /* ignore logging errors */ }
    }
    next()
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' })
  }
}

module.exports = {
  requireAuth,
}
