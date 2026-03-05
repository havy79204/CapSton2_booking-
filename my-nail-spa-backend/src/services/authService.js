const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { z } = require('zod')

const { env } = require('../config/config')
const repo = require('../repositories/authRepository')
const { canSendMail, sendMail } = require('../services/mail')
const { passwordSchema } = require('../utils/validation')
const { newId } = require('../config/query')

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      salonId: user.salonId || null,
      name: user.name,
    },
    env.auth.jwtSecret,
    { expiresIn: env.auth.jwtExpiresIn },
  )
}

function mapUserRow(r) {
  return {
    id: r.UserId,
    name: r.Name,
    email: r.Email,
    role: r.RoleKey,
    salonId: r.SalonId,
    status: r.Status,
    createdAt: r.CreatedAt,
    updatedAt: r.UpdatedAt,
  }
}

function getFrontendBaseUrl(req) {
  const configured = String(env.web?.frontendUrl || '').trim()
  const origin = req.get('origin') || req.get('referer') || ''
  const derived = String(origin || '').trim()
  const isProd = String(env.nodeEnv || '').trim().toLowerCase() === 'production'
  if (!isProd && derived) return derived.replace(/\/+$/, '')
  if (configured && configured.toLowerCase() !== 'auto') return configured.replace(/\/+$/, '')
  if (derived) return derived.replace(/\/+$/, '')
  return ''
}

async function signup(req, body) {
  const payload = z
    .object({ name: z.string().min(1), email: z.string().email(), password: passwordSchema() })
    .parse(body)

  const email = payload.email.trim().toLowerCase()
  const existing = await repo.getUserByEmail(email)
  let userId = null
  if (existing) {
    const status = String(existing.Status || '').trim().toLowerCase()
    if (status === 'active') {
      const err = new Error('Email already exists')
      err.status = 409
      throw err
    }
    if (status === 'disabled') {
      const err = new Error('Account is disabled')
      err.status = 403
      throw err
    }
    userId = existing.UserId
  }

  if (!userId) {
    userId = newId()
    const pwHash = await bcrypt.hash(payload.password, 10)
    await repo.createUser({ userId, name: payload.name.trim(), email, passwordHash: pwHash, roleKey: 'customer' })
  }

  const verifyToken = newId() + newId()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
  await repo.upsertAppKeyValue(`emailverify:${verifyToken}`, JSON.stringify({ userId, expiresAt }))

  const frontendBase = getFrontendBaseUrl(req)
  const verifyUrl = frontendBase ? `${frontendBase}/verify-email?token=${encodeURIComponent(verifyToken)}` : ''

  if (!canSendMail()) {
    if (String(env.nodeEnv || '').toLowerCase() === 'production') {
      const err = new Error('Email service is not configured')
      err.status = 500
      throw err
    }
    return { ok: true, requiresVerification: true, devToken: verifyToken, verifyUrl }
  }

  await sendMail({
    to: email,
    subject: 'Activate your NIOM&CE account',
    text: verifyUrl ? verifyUrl : 'Please verify your account',
    html: verifyUrl ? `<a href="${verifyUrl}">Activate account</a>` : 'Activate account',
  })

  return { ok: true, requiresVerification: true }
}

async function login(body) {
  const payload = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(body)
  const email = payload.email.trim().toLowerCase()
  const row = await repo.getUserByEmail(email)
  if (!row) {
    const err = new Error('Incorrect email or password')
    err.status = 401
    throw err
  }
  const status = String(row.Status || '').trim().toLowerCase()
  if (status !== 'active') {
    const err = new Error(status === 'pending' ? 'Please verify your email to activate your account' : 'Account is not active')
    err.status = 403
    throw err
  }
  const ok = await bcrypt.compare(payload.password, String(row.Password || ''))
  if (!ok) {
    const err = new Error('Incorrect email or password')
    err.status = 401
    throw err
  }
  const user = mapUserRow(row)
  const token = signToken(user)
  return { user, token }
}

async function verifyEmail(token) {
  const key = `emailverify:${token}`
  const stored = await repo.getAppKeyValue(key)
  if (!stored) {
    const err = new Error('Invalid or expired token')
    err.status = 400
    throw err
  }
  let parsed = null
  try { parsed = JSON.parse(stored.Value || '{}') } catch { parsed = null }
  if (parsed?.usedAt) return { ok: true, alreadyVerified: true }
  const userId = parsed?.userId
  const expiresAt = parsed?.expiresAt ? new Date(parsed.expiresAt).getTime() : 0
  if (!userId || !expiresAt || Date.now() > expiresAt) {
    const err = new Error('Invalid or expired token')
    err.status = 400
    throw err
  }
  await repo.activateUser(userId)
  await repo.upsertAppKeyValue(key, JSON.stringify({ userId, expiresAt: parsed.expiresAt, usedAt: new Date().toISOString() }))
  return { ok: true }
}

async function getMe(userId) {
  const row = await repo.getUserById(userId)
  if (!row) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }
  const user = mapUserRow(row)
  const token = signToken(user)
  return { user, token }
}

async function updateMe(userId, body) {
  const payload = z.object({ name: z.string().trim().min(1).optional(), email: z.string().email().optional() }).parse(body || {})
  if (!payload.name && !payload.email) {
    const err = new Error('Nothing to update')
    err.status = 400
    throw err
  }
  const existing = await repo.getUserById(userId)
  if (!existing) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }
  const nextName = payload.name ? payload.name.trim() : existing.Name
  const nextEmail = payload.email ? payload.email.trim().toLowerCase() : existing.Email
  if (payload.email) {
    const dup = await repo.getUserByEmail(nextEmail)
    if (dup && String(dup.UserId) !== String(userId)) {
      const err = new Error('Email already exists')
      err.status = 409
      throw err
    }
  }
  await repo.updateUserNameEmail(userId, { name: nextName, email: nextEmail })
  return getMe(userId)
}

async function changePassword(userId, currentPassword, newPassword) {
  const payload = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema() }).parse({ currentPassword, newPassword })
  const existing = await repo.getUserById(userId)
  if (!existing) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }
  const ok = await bcrypt.compare(payload.currentPassword, String(existing.Password || ''))
  if (!ok) {
    const err = new Error('Current password is incorrect')
    err.status = 400
    throw err
  }
  const pwHash = await bcrypt.hash(payload.newPassword, 10)
  await repo.setPassword(userId, pwHash)
  return { ok: true }
}

async function forgotPassword(req, email) {
  const e = z.string().email().parse(email).trim().toLowerCase()
  const row = await repo.getUserByEmail(e)
  if (!row) return { ok: true }
  const token = newId() + newId()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString()
  await repo.upsertAppKeyValue(`pwdreset:${token}`, JSON.stringify({ userId: row.UserId, expiresAt }))
  const frontendBase = getFrontendBaseUrl(req)
  const resetUrl = frontendBase ? `${frontendBase}/reset-password?token=${encodeURIComponent(token)}` : ''
  await sendMail({ to: e, subject: 'Reset your NIOM&CE password', text: resetUrl || 'Reset your password', html: resetUrl ? `<a href="${resetUrl}">Reset password</a>` : 'Reset password' })
  return { ok: true }
}

async function resendVerification(req, email) {
  const e = z.string().email().parse(email).trim().toLowerCase()
  const row = await repo.getUserByEmail(e)
  if (!row) return { ok: true }
  const status = String(row.Status || '').trim().toLowerCase()
  if (status !== 'pending') return { ok: true }
  const userId = row.UserId
  const verifyToken = newId() + newId()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
  await repo.upsertAppKeyValue(`emailverify:${verifyToken}`, JSON.stringify({ userId, expiresAt }))
  const frontendBase = getFrontendBaseUrl(req)
  const verifyUrl = frontendBase ? `${frontendBase}/verify-email?token=${encodeURIComponent(verifyToken)}` : ''
  if (!canSendMail()) {
    if (String(env.nodeEnv || '').toLowerCase() === 'production') {
      const err = new Error('Email service is not configured')
      err.status = 500
      throw err
    }
    return { ok: true, devToken: verifyToken, verifyUrl }
  }
  await sendMail({ to: e, subject: 'Your NIOM&CE activation link', text: verifyUrl || 'Activation link', html: verifyUrl ? `<a href="${verifyUrl}">Activate account</a>` : 'Activate account' })
  return { ok: true }
}

async function resetPassword(token, password) {
  const key = `pwdreset:${token}`
  const stored = await repo.getAppKeyValue(key)
  if (!stored) {
    const err = new Error('Invalid or expired token')
    err.status = 400
    throw err
  }
  let parsed = null
  try { parsed = JSON.parse(stored.Value || '{}') } catch { parsed = null }
  const expiresAt = parsed?.expiresAt ? new Date(parsed.expiresAt).getTime() : 0
  if (!parsed?.userId || !expiresAt || Date.now() > expiresAt) {
    const err = new Error('Invalid or expired token')
    err.status = 400
    throw err
  }
  const pwHash = await bcrypt.hash(password, 10)
  await repo.setPassword(parsed.userId, pwHash)
  await repo.deleteAppKeyValue(key)
  return { ok: true }
}

module.exports = {
  signup,
  login,
  verifyEmail,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resendVerification,
  resetPassword,
  signToken,
}
