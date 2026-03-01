const bcrypt = require('bcryptjs')
const { z } = require('zod')
const usersRepo = require('../repositories/usersRepository')
const { passwordSchema } = require('../utils/validation')
const { sendMail, canSendMail } = require('./../services/mail')
const { newId } = require('../config/query')

function generateRandomPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%^&*'
  let password = upper[Math.floor(Math.random() * upper.length)]
  const all = upper + lower + digits + special
  for (let i = 0; i < 6; i++) password += all[Math.floor(Math.random() * all.length)]
  password += special[Math.floor(Math.random() * special.length)]
  return password
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

function assertSalonScope(req, salonId) {
  const role = req.user?.role
  if (role === 'admin') return
  const mySalonId = String(req.user?.salonId || '').trim()
  if (!mySalonId) throw Object.assign(new Error('Missing salon scope'), { status: 403 })
  if (String(salonId || '').trim() !== mySalonId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
}

async function listUsers({ role, salonId, requester }) {
  if (requester?.role === 'owner') {
    const mySalonId = String(requester?.salonId || '').trim()
    if (!mySalonId) return { recordset: [] }
    if (salonId && salonId !== mySalonId) return { recordset: [] }
  }
  return usersRepo.findUsers({ role, salonId })
}

async function getUserById(id, requester) {
  const res = await usersRepo.findUserById(id)
  return res
}

async function createUser(reqBody, requester) {
  const isOwner = requester?.role === 'owner'
  const schema = isOwner
    ? z.object({ name: z.string().min(1), email: z.string().email() })
    : z.object({ name: z.string().min(1), email: z.string().email(), password: passwordSchema().optional(), role: z.enum(['admin', 'owner', 'staff', 'customer']).default('customer'), salonId: z.string().trim().optional(), status: z.string().optional() })

  const body = schema.parse(reqBody)
  const email = body.email.trim().toLowerCase()
  const exists = await usersRepo.findUserByEmail(email)
  if (exists.recordset.length) {
    const err = new Error('Email already exists')
    err.status = 409
    throw err
  }

  const userId = newId()
  let plainPassword = null
  let pwHash = null
  if (isOwner) {
    plainPassword = generateRandomPassword()
    pwHash = await bcrypt.hash(plainPassword, 10)
  } else {
    pwHash = body.password ? await bcrypt.hash(String(body.password), 10) : null
  }

  const roleKey = isOwner ? 'staff' : body.role
  const salonId = isOwner ? String(requester?.salonId || '').trim() : (body.salonId ? String(body.salonId).trim() : '')
  if (isOwner && !salonId) {
    const err = new Error('Missing salon scope')
    err.status = 403
    throw err
  }

  const status = isOwner ? 'active' : (body.status || 'active')
  const created = await usersRepo.insertUser({ userId, name: body.name.trim(), email, passwordHash: pwHash, roleKey, salonId, status })

  if (isOwner && plainPassword && canSendMail()) {
    try {
      await sendMail({ to: email, subject: 'Welcome to Nail Spa - Your Staff Account', text: `Hello ${body.name.trim()},\n\nYour staff account has been created.\n\nEmail: ${email}\nPassword: ${plainPassword}\n\nPlease login and change your password.\n\nBest regards,\nNail Spa Team`, html: `<h2>Welcome to Nail Spa!</h2><p>Hello <strong>${body.name.trim()}</strong>,</p><p>Your staff account has been created.</p><p><strong>Email:</strong> ${email}<br><strong>Password:</strong> ${plainPassword}</p><p>Please login and change your password as soon as possible.</p><p>Best regards,<br>Nail Spa Team</p>` })
    } catch (mailErr) {
      console.error('Failed to send staff welcome email:', mailErr && mailErr.message)
    }
  }

  return { created, emailSent: isOwner && canSendMail() }
}

async function patchUser(id, reqBody, requester) {
  const isOwner = requester?.role === 'owner'
  const schema = isOwner
    ? z.object({ name: z.string().min(1).optional(), password: passwordSchema().optional(), status: z.enum(['active', 'disabled']).optional() })
    : z.object({ name: z.string().min(1).optional(), email: z.string().email().optional(), password: passwordSchema().optional(), role: z.enum(['admin', 'owner', 'staff', 'customer']).optional(), salonId: z.string().trim().optional(), status: z.string().optional() })

  const body = schema.parse(reqBody)
  const existingRes = await usersRepo.findUserById(id)
  const row = existingRes.recordset[0]
  if (!row) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }

  if (isOwner) {
    assertSalonScope(requester, row.SalonId)
    if (String(row.RoleKey || '').toLowerCase() !== 'staff') {
      const err = new Error('Forbidden')
      err.status = 403
      throw err
    }
  }

  const nextEmail = isOwner ? row.Email : (body.email ? body.email.trim().toLowerCase() : row.Email)
  if (!isOwner && body.email) {
    const check = await usersRepo.findUserByEmail(nextEmail)
    if (check.recordset.length && String(check.recordset[0].UserId || '') !== String(id)) {
      const err = new Error('Email already exists')
      err.status = 409
      throw err
    }
  }

  const pwHash = body.password ? await bcrypt.hash(String(body.password), 10) : null

  const updated = await usersRepo.updateUser({ id, name: body.name ? body.name.trim() : row.Name, email: nextEmail, passwordHash: pwHash, roleKey: isOwner ? row.RoleKey : (body.role || row.RoleKey), salonId: isOwner ? row.SalonId : (body.salonId !== undefined ? (String(body.salonId || '').trim() || null) : row.SalonId), status: body.status || row.Status })

  return updated
}

module.exports = {
  generateRandomPassword,
  mapUserRow,
  assertSalonScope,
  listUsers,
  getUserById,
  createUser,
  patchUser,
}
