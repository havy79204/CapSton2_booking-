const jwt = require('jsonwebtoken')

const { env } = require('../config/config')
const { query } = require('../config/query')

function toInt(value) {
  if (value === undefined || value === null) return NaN
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

function normalizeRoleKey(input) {
  if (input === undefined || input === null) return NaN

  const asInt = toInt(input)
  if ([1, 2, 3].includes(asInt)) return asInt

  const text = String(input).trim().toLowerCase()
  if (text === 'admin' || text === 'owner') return 1
  if (text === 'staff') return 2
  if (text === 'customer') return 3

  return NaN
}

function buildRoleVariants(roleKey) {
  if (roleKey === 1) return ['1', 'admin', 'owner']
  if (roleKey === 2) return ['2', 'staff']
  return ['3', 'customer']
}

function roleNameFromKey(roleKey) {
  if (roleKey === 1) return 'owner'
  if (roleKey === 2) return 'staff'
  return 'customer'
}

function shouldUseDevFallback(error) {
  if (!env.features?.quickLoginEnabled || !env.features?.quickLoginDbFallback) return false
  
  // Connection errors
  const code = error?.code || error?.originalError?.code
  if (['ESOCKET', 'EINSTLOOKUP', 'ETIMEOUT', 'ECONNRESET', 'ECONNREFUSED'].includes(code)) return true
  
  // Also fallback on 404 (user not found) in dev mode - likely because tables don't exist
  if (error?.statusCode === 404 || error?.status === 404) return true
  
  return false
}

function createDevFallbackUser({ roleKey, email }) {
  const now = new Date()
  return {
    userId: `dev-${roleKey}`,
    name: `Dev ${roleNameFromKey(roleKey)}`,
    email: (email && String(email).trim()) || `dev.${roleNameFromKey(roleKey)}@local.test`,
    phone: null,
    roleKey,
    status: 'ACTIVE',
    createdAt: now,
  }
}

async function ensureDevUserExists(devUser) {
  try {
    // Check if user already exists
    const existing = await query(
      `SELECT TOP 1 UserId FROM Users WHERE UserId = @userId`,
      { userId: devUser.userId }
    )
    
    if (existing?.recordset?.[0]) {
      return // User already exists
    }

    // Insert dev user if not found
    await query(
      `INSERT INTO Users (UserId, Name, Email, Phone, RoleKey, Status, CreatedAt)
       VALUES (@userId, @name, @email, @phone, @roleKey, @status, SYSUTCDATETIME())`,
      {
        userId: devUser.userId,
        name: devUser.name,
        email: devUser.email,
        phone: devUser.phone || null,
        roleKey: String(devUser.roleKey),
        status: devUser.status,
      }
    )
  } catch (err) {
    // If insert fails (e.g., duplicate key), just continue
    // The user might have been created by another request
    console.warn(`Dev user ensure failed (continuing): ${err?.message}`)
  }
}

async function quickLogin({ roleId, email } = {}) {
  const roleKey = normalizeRoleKey(roleId)
  if (![1, 2, 3].includes(roleKey)) {
    const err = new Error('Invalid roleId. Allowed: 1 (admin), 2 (staff), 3 (customer)')
    err.statusCode = 400
    throw err
  }

  const roleVariants = buildRoleVariants(roleKey)
  const bind = {}
  roleVariants.forEach((value, idx) => {
    bind[`roleValue${idx}`] = value
  })

  const whereRole = roleVariants
    .map((_, idx) => `LOWER(CONVERT(nvarchar(50), RoleKey)) = @roleValue${idx}`)
    .join(' OR ')

  let whereEmail = ''
  if (email !== undefined && email !== null && String(email).trim() !== '') {
    bind.email = String(email).trim()
    whereEmail = ' AND Email = @email'
  }

  let user
  try {
    const result = await query(
      `SELECT TOP 1
          UserId,
          Name,
          Email,
          Phone,
          RoleKey,
          Status,
          CreatedAt
        FROM Users
        WHERE (${whereRole})
          AND Status = 'ACTIVE'
          ${whereEmail}
        ORDER BY CreatedAt DESC`,
      bind,
    )

    const row = result?.recordset?.[0]
    if (!row) {
      const err = new Error('User not found for this role')
      err.statusCode = 404
      throw err
    }

    user = {
      userId: row.UserId,
      name: row.Name,
      email: row.Email,
      phone: row.Phone,
      roleKey: row.RoleKey,
      status: row.Status,
      createdAt: row.CreatedAt,
    }
  } catch (error) {
    if (!shouldUseDevFallback(error)) throw error

    console.warn(
      `Quick login fallback enabled: DB unavailable (${error?.code || error?.originalError?.code || 'UNKNOWN'}).`,
    )
    user = createDevFallbackUser({ roleKey, email })
    // Ensure the dev user exists in the database
    await ensureDevUserExists(user)
  }

  const token = jwt.sign(
    {
      sub: String(user.userId),
      roleKey: user.roleKey,
      email: user.email,
      name: user.name,
    },
    env.auth.jwtSecret,
    { expiresIn: env.auth.jwtExpiresIn },
  )

  return { user, token }
}

module.exports = {
  quickLogin,
}
