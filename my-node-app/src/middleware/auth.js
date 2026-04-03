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

function normalizeRoleKey(value) {
  if (value === undefined || value === null) return NaN

  const num = Number(value)
  if (Number.isFinite(num)) {
    const asInt = Math.trunc(num)
    if ([1, 2, 3].includes(asInt)) return asInt
  }

  const text = String(value).trim().toLowerCase()
  if (text === '1' || text === 'admin' || text === 'owner') return 1
  if (text === '2' || text === 'staff') return 2
  if (text === '3' || text === 'customer') return 3

  return NaN
}

function requireStaff(req, res, next) {
  const token = extractBearerToken(req)
  if (!token) {
    res.status(401).json({ ok: false, error: 'Missing Authorization token' })
    return
  }

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret)
    req.user = payload
    const maybeId = payload?.sub || payload?.userId || payload?.UserId || payload?.id || payload?.uid || null
    req.userId = maybeId !== undefined && maybeId !== null ? String(maybeId) : null

    const roleKey = normalizeRoleKey(payload?.roleKey)
    // Allow both Owner (1) and Staff (2) to access staff routes
    if (roleKey !== 1 && roleKey !== 2) {
      res.status(403).json({ ok: false, error: 'Staff access required' })
      return
    }

    next()
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' })
  }
}

function requireOwner(req, res, next) {
  const token = extractBearerToken(req)
  if (!token) {
    res.status(401).json({ ok: false, error: 'Missing Authorization token' })
    return
  }

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret)
    req.user = payload
    const maybeId = payload?.sub || payload?.userId || payload?.UserId || payload?.id || payload?.uid || null
    req.userId = maybeId !== undefined && maybeId !== null ? String(maybeId) : null

    const roleKey = normalizeRoleKey(payload?.roleKey)
    if (roleKey !== 1) {
      res.status(403).json({ ok: false, error: 'Owner access required' })
      return
    }

    next()
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' })
  }
}

module.exports = {
  requireAuth,
  requireStaff,
  requireOwner,
}
