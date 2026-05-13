const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const { env } = require('../config/config')
const { query, newId } = require('../config/query')
const { sendEmail } = require('./email.service')

const passwordResetStore = new Map()
const pendingSignupByToken = new Map()
const pendingSignupByEmail = new Map()

const SIGNUP_VERIFY_TTL_MS = 5 * 60 * 1000
const RESET_PASSWORD_TTL_MS = 10 * 60 * 1000

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase()
}

function normalizeName(name) {
    return String(name || '').trim()
}

function normalizePhone(phone) {
    const raw = String(phone || '').trim()
    if (!raw) return null
    return raw
}

function frontendUrl() {
    return String(env.web?.frontendUrl || '').trim() || 'http://localhost:5173'
}

function signAuthToken(user) {
    return jwt.sign(
        {
            sub: String(user.id || user.userId),
            roleKey: user.roleKey,
            email: user.email,
            name: user.name,
        },
        env.auth.jwtSecret,
        { expiresIn: env.auth.jwtExpiresIn }
    )
}

function generateResetCode() {
    return String(Math.floor(100000 + Math.random() * 900000))
}

function generateVerifyToken() {
    return crypto.randomBytes(24).toString('hex')
}

function cleanupExpiredSignups() {
    const now = Date.now()
    for (const [token, pending] of pendingSignupByToken.entries()) {
        if (now > Number(pending?.expiresAt || 0)) {
            pendingSignupByToken.delete(token)
            if (pending?.email) {
                const mappedToken = pendingSignupByEmail.get(pending.email)
                if (mappedToken === token) pendingSignupByEmail.delete(pending.email)
            }
        }
    }
}

function cleanupExpiredResets() {
    const now = Date.now()
    for (const [email, item] of passwordResetStore.entries()) {
        if (now > Number(item?.expiresAt || 0)) {
            passwordResetStore.delete(email)
        }
    }
}

async function findUserByEmail(email) {
    const normalized = normalizeEmail(email)
    if (!normalized) return null
    const result = await query(
        `SELECT TOP 1 UserId, Name, Email, Phone, PasswordHash, RoleKey, Status, CreatedAt
         FROM Users
         WHERE LOWER(LTRIM(RTRIM(ISNULL(Email, '')))) = @email`,
        { email: normalized }
    )
    return result?.recordset?.[0] || null
}

async function login({ email, password } = {}) {
    const e = normalizeEmail(email)
    const p = String(password || '')

    if (!e || !p) {
        const err = new Error('Missing email or password')
        err.statusCode = 400
        throw err
    }

    const row = await findUserByEmail(e)
    if (!row) {
        const err = new Error('Invalid email or password')
        err.statusCode = 401
        throw err
    }

    if (String(row.Status || '').trim().toUpperCase() === 'INACTIVE') {
        const err = new Error('This account is inactive')
        err.statusCode = 403
        throw err
    }

    const stored = String(row.PasswordHash || '')
    let ok = false
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
        ok = await bcrypt.compare(p, stored)
    } else if (stored.startsWith('sha256:')) {
        const raw = `${row.UserId}:${p}`
        const hex = crypto.createHash('sha256').update(raw).digest('hex')
        ok = `sha256:${hex}` === stored
    } else {
        ok = p === stored
    }

    if (!ok) {
        const err = new Error('Invalid email or password')
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

    return { user, token: signAuthToken(user) }
}

async function signup({ name, email, password, phone } = {}) {
    const normalizedName = normalizeName(name)
    const normalizedEmail = normalizeEmail(email)
    const normalizedPhone = normalizePhone(phone)
    const rawPassword = String(password || '')

    if (!normalizedName || !normalizedEmail || !rawPassword) {
        const err = new Error('Missing name, email, or password')
        err.statusCode = 400
        throw err
    }

    if (rawPassword.length < 6) {
        const err = new Error('Password must be at least 6 characters')
        err.statusCode = 400
        throw err
    }

    cleanupExpiredSignups()

    const existing = await findUserByEmail(normalizedEmail)
    if (existing) {
        const err = new Error('Email is already registered')
        err.statusCode = 409
        throw err
    }

    const oldToken = pendingSignupByEmail.get(normalizedEmail)
    if (oldToken) {
        pendingSignupByToken.delete(oldToken)
        pendingSignupByEmail.delete(normalizedEmail)
    }

    const passwordHash = await bcrypt.hash(rawPassword, 10)
    const verifyToken = generateVerifyToken()
    const expiresAt = Date.now() + SIGNUP_VERIFY_TTL_MS

    pendingSignupByToken.set(verifyToken, {
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        passwordHash,
        expiresAt,
    })
    pendingSignupByEmail.set(normalizedEmail, verifyToken)

    const verifyLink = `${frontendUrl()}/login?verifyToken=${encodeURIComponent(verifyToken)}`
    const mail = await sendEmail({
        to: normalizedEmail,
        subject: 'Verify your NIOM&CE account',
        text: `Hello ${normalizedName},\n\nClick the link below to verify your account within 5 minutes:\n${verifyLink}\n\nIf you did not request this, please ignore this email.`,
        html: `
            <p>Hello <b>${normalizedName}</b>,</p>
            <p>Please verify your account within <b>5 minutes</b>.</p>
            <p><a href="${verifyLink}" target="_blank" rel="noopener noreferrer">Activate account</a></p>
            <p>If you did not request this, you can ignore this email.</p>
        `,
    })

    if (!mail?.sent) {
        pendingSignupByToken.delete(verifyToken)
        pendingSignupByEmail.delete(normalizedEmail)
        const err = new Error('Unable to send verification email')
        err.statusCode = 500
        throw err
    }

    return {
        requiresVerification: true,
        expiresInSeconds: Math.trunc(SIGNUP_VERIFY_TTL_MS / 1000),
    }
}

async function verifyEmail({ token } = {}) {
    const verifyToken = String(token || '').trim()
    if (!verifyToken) {
        const err = new Error('Missing verification token')
        err.statusCode = 400
        throw err
    }

    cleanupExpiredSignups()
    const pending = pendingSignupByToken.get(verifyToken)
    if (!pending) {
        const err = new Error('Verification link is invalid or expired')
        err.statusCode = 400
        throw err
    }

    if (Date.now() > Number(pending.expiresAt || 0)) {
        pendingSignupByToken.delete(verifyToken)
        pendingSignupByEmail.delete(pending.email)
        const err = new Error('Verification link is invalid or expired')
        err.statusCode = 400
        throw err
    }

    const exists = await findUserByEmail(pending.email)
    if (exists) {
        pendingSignupByToken.delete(verifyToken)
        pendingSignupByEmail.delete(pending.email)
        const err = new Error('Email is already registered')
        err.statusCode = 409
        throw err
    }

    const userId = `USR-${newId()}`
    await query(
        `INSERT INTO Users (UserId, Name, Email, Phone, PasswordHash, RoleKey, Status, CreatedAt)
         VALUES (@userId, @name, @email, @phone, @passwordHash, @roleKey, @status, SYSUTCDATETIME())`,
        {
            userId,
            name: pending.name,
            email: pending.email,
            phone: pending.phone,
            passwordHash: pending.passwordHash,
            roleKey: 3,
            status: 'ACTIVE',
        }
    )

    pendingSignupByToken.delete(verifyToken)
    pendingSignupByEmail.delete(pending.email)

    return { verified: true }
}

async function forgotPassword({ email } = {}) {
    cleanupExpiredResets()

    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) {
        const err = new Error('Missing email')
        err.statusCode = 400
        throw err
    }

    const row = await findUserByEmail(normalizedEmail)
    if (!row) {
        return { sent: true, expiresInSeconds: Math.trunc(RESET_PASSWORD_TTL_MS / 1000) }
    }

    const code = generateResetCode()
    const expiresAt = Date.now() + RESET_PASSWORD_TTL_MS
    passwordResetStore.set(normalizedEmail, {
        userId: row.UserId,
        code,
        expiresAt,
    })

    const mail = await sendEmail({
        to: normalizedEmail,
        subject: 'Reset your NIOM&CE password',
        text: `Your password reset code is: ${code}\nThis code expires in 10 minutes.`,
        html: `
            <p>Your password reset code is:</p>
            <p style="font-size:20px;font-weight:700;letter-spacing:2px;">${code}</p>
            <p>This code expires in <b>10 minutes</b>.</p>
        `,
    })

    if (!mail?.sent) {
        passwordResetStore.delete(normalizedEmail)
        const err = new Error('Unable to send reset password email')
        err.statusCode = 500
        throw err
    }

    return {
        sent: true,
        expiresInSeconds: Math.trunc(RESET_PASSWORD_TTL_MS / 1000),
    }
}

async function resetPassword({ email, code, newPassword } = {}) {
    cleanupExpiredResets()

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
    if (!resetData || Date.now() > Number(resetData.expiresAt || 0) || String(resetData.code) !== otp) {
        if (resetData && Date.now() > Number(resetData.expiresAt || 0)) {
            passwordResetStore.delete(normalizedEmail)
        }
        const err = new Error('Verification code is invalid or expired')
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

async function quickLogin() {
    const err = new Error('Quick login is removed. Please use real login.')
    err.statusCode = 410
    throw err
}

module.exports = {
    quickLogin,
    login,
    signup,
    verifyEmail,
    forgotPassword,
    resetPassword,
}

