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
            `SELECT TOP 1 UserId FROM Users WHERE UserId = @userId`, { userId: devUser.userId }
        )

        if (existing?.recordset?.[0]) {
            return // User already exists
        }

        // Insert dev user if not found
        await query(
            `INSERT INTO Users (UserId, Name, Email, Phone, RoleKey, Status, CreatedAt)
       VALUES (@userId, @name, @email, @phone, @roleKey, @status, SYSUTCDATETIME())`, {
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
        const sql = roleKey === 2 ?
            `SELECT TOP 1
            u.UserId,
            u.Name,
            u.Email,
            u.Phone,
            u.RoleKey,
            u.Status,
            u.CreatedAt,
            CASE WHEN EXISTS (SELECT 1 FROM StaffSkills ss WHERE ss.StaffId = st.StaffId) THEN 1 ELSE 0 END AS HasSkills
          FROM Users u
          INNER JOIN Staff st ON st.UserId = u.UserId
          WHERE (${whereRole})
            AND u.Status = 'ACTIVE'
            AND (st.Status IS NULL OR UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), st.Status)))) <> 'INACTIVE')
            ${whereEmail}
          ORDER BY HasSkills DESC, u.CreatedAt DESC` :
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
          ORDER BY CreatedAt DESC`

        const result = await query(sql, bind)

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

    const token = jwt.sign({
            sub: String(user.userId),
            roleKey: user.roleKey,
            email: user.email,
            name: user.name,
        },
        env.auth.jwtSecret, { expiresIn: env.auth.jwtExpiresIn },
    )

    return { user, token }
}

module.exports = {
    quickLogin,
}


const bcrypt = require('bcryptjs')
const crypto = require('crypto')

async function login({ email, password } = {}) {
    const e = email !== undefined && email !== null ? String(email).trim() : ''
    const p = password !== undefined && password !== null ? String(password) : ''

    if (!e || !p) {
        const err = new Error('Missing email or password')
        err.statusCode = 400
        throw err
    }

    const result = await query(
        `SELECT TOP 1 UserId, Name, Email, Phone, PasswordHash, RoleKey, Status, CreatedAt
     FROM Users
     WHERE LOWER(LTRIM(RTRIM(ISNULL(Email, '')))) = LOWER(@email)`, { email: e }
    )

    const row = result?.recordset?.[0]
    if (!row) {
        const err = new Error('email sai')
        err.statusCode = 401
        throw err
    }

    const stored = row.PasswordHash
    let ok = false
    if (stored) {
        const s = String(stored)
        if (s.startsWith('sha256:')) {
            const raw = `${row.UserId}:${p}`
            const hex = crypto.createHash('sha256').update(raw).digest('hex')
            ok = `sha256:${hex}` === s
        } else if (s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$')) {
            ok = await bcrypt.compare(p, s)
        } else {
            ok = p === s
        }
    }

    if (!ok) {
        const err = new Error('password sai')
        err.statusCode = 401
        throw err
    }

    const user = {
        id: row.UserId,
        name: row.Name,
        email: row.Email,
        phone: row.Phone,
        roleKey: row.RoleKey,
        status: row.Status,
        createdAt: row.CreatedAt,
    }

    const token = jwt.sign({
            sub: String(user.id),
            roleKey: user.roleKey,
            email: user.email,
            name: user.name,
        },
        env.auth.jwtSecret, { expiresIn: env.auth.jwtExpiresIn }
    )

    return { user, token }
}

const passwordResetStore = new Map()

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase()
}

function generateResetCode() {
    return String(Math.floor(100000 + Math.random() * 900000))
}

async function forgotPassword({ email } = {}) {
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) {
        const err = new Error('Missing email')
        err.statusCode = 400
        throw err
    }

    const result = await query(
        `SELECT TOP 1 UserId, Email
     FROM Users
     WHERE LOWER(LTRIM(RTRIM(ISNULL(Email, '')))) = @email`, { email: normalizedEmail },
    )

    const row = result?.recordset?.[0]
        // Return generic response to avoid leaking account existence
    if (!row) return { sent: true }

    const code = generateResetCode()
    const expiresAt = Date.now() + 10 * 60 * 1000
    passwordResetStore.set(normalizedEmail, {
        userId: row.UserId,
        code,
        expiresAt,
    })

    const data = {
        sent: true,
        expiresInSeconds: 600,
    }

    if (String(env.nodeEnv || '').toLowerCase() !== 'production') {
        data.code = code
    }

    return data
}

async function resetPassword({ email, code, newPassword } = {}) {
    const normalizedEmail = normalizeEmail(email)
    const otp = String(code || '').trim()
    const next = String(newPassword || '')

    if (!normalizedEmail || !otp || !next) {
        const err = new Error('Missing email, code or newPassword')
        err.statusCode = 400
        throw err
    }

    if (next.length < 6) {
        const err = new Error('New password must be at least 6 characters')
        err.statusCode = 400
        throw err
    }

    const resetData = passwordResetStore.get(normalizedEmail)
    if (!resetData) {
        const err = new Error('MÃ£ xÃ¡c nháº­n khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n')
        err.statusCode = 400
        throw err
    }

    if (Date.now() > Number(resetData.expiresAt || 0)) {
        passwordResetStore.delete(normalizedEmail)
        const err = new Error('MÃ£ xÃ¡c nháº­n khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n')
        err.statusCode = 400
        throw err
    }

    if (String(resetData.code) !== otp) {
        const err = new Error('MÃ£ xÃ¡c nháº­n khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n')
        err.statusCode = 400
        throw err
    }

    const hashed = await bcrypt.hash(next, 10)
    await query('UPDATE Users SET PasswordHash = @h WHERE UserId = @userId', {
        h: hashed,
        userId: resetData.userId,
    })
    passwordResetStore.delete(normalizedEmail)

    return { updated: 1 }
}

module.exports = {
    quickLogin,
    login,
    forgotPassword,
    resetPassword,
}

