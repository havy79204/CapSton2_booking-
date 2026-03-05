const jwt = require('jsonwebtoken')
const { env } = require('../config/config')
const { query } = require('../config/query')

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

function normalizeSalonId(salonId) {
  const s = String(salonId || '').trim()
  return s || null
}

function mapDbUserToReqUser(row) {
  return {
    id: row.UserId,
    email: row.Email,
    role: normalizeRole(row.RoleKey),
    salonId: normalizeSalonId(row.SalonId),
    name: row.Name,
  }
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret)
    const id = String(payload?.id || '').trim()
    if (!id) return res.status(401).json({ error: 'Invalid token' })

    const result = await query('SELECT TOP 1 * FROM dbo.Users WHERE UserId=@id', { id })
    const row = result.recordset[0]
    if (!row) return res.status(401).json({ error: 'Invalid token' })
    if (String(row.Status || '').toLowerCase() !== 'active') {
      return res.status(403).json({ error: 'Account disabled' })
    }

    req.user = mapDbUserToReqUser(row)
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const role = normalizeRole(req.user?.role)
    const allowed = roles.map(normalizeRole)
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    return next()
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || ''
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) return next()

  ;(async () => {
    try {
      const payload = jwt.verify(token, env.auth.jwtSecret)
      const id = String(payload?.id || '').trim()
      if (!id) return next()
      const result = await query('SELECT TOP 1 * FROM dbo.Users WHERE UserId=@id', { id })
      const row = result.recordset[0]
      if (!row) return next()
      if (String(row.Status || '').toLowerCase() !== 'active') return next()
      req.user = mapDbUserToReqUser(row)
      return next()
    } catch {
      return next()
    }
  })()
}

module.exports = { authRequired, requireRole, optionalAuth }
