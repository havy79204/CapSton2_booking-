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
    next()
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' })
  }
}

module.exports = {
  requireAuth,
}
