const { query } = require('../config/query')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const fs = require('fs/promises')
const path = require('path')

function getAvatarUploadDir() {
  return path.join(__dirname, '..', '..', 'uploads', 'avatars')
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim()
  const m = raw.match(/^data:image\/(png|jpeg);base64,(.+)$/i)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const base64 = m[2]
  const buf = Buffer.from(base64, 'base64')
  const ext = kind === 'jpeg' ? 'jpg' : 'png'
  return { buf, ext }
}

function hashPasswordSha256(userId, password) {
  const raw = `${userId}:${String(password)}`
  const hex = crypto.createHash('sha256').update(raw).digest('hex')
  return `sha256:${hex}`
}

function splitName(fullName) {
  const raw = String(fullName || '').trim()
  if (!raw) return { firstName: '', lastName: '' }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  const firstName = parts[parts.length - 1]
  const lastName = parts.slice(0, -1).join(' ')
  return { firstName, lastName }
}

function normalizeAvatarUrlForDb(input) {
  if (input === undefined) return undefined
  if (input === null) return null
  const raw = String(input).trim()
  if (!raw) return ''

  if (raw.startsWith('/uploads/avatars/')) return raw.replace('/uploads/avatars/', '')
  if (raw.startsWith('/uploads/')) return raw

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw)
      if (u.pathname && u.pathname.startsWith('/uploads/avatars/')) {
        return u.pathname.replace('/uploads/avatars/', '')
      }
      if (u.pathname && u.pathname.startsWith('/uploads/')) return u.pathname
    } catch {
      // ignore
    }
  }

  return raw
}

async function getMe(userId) {
  const result = await query(
    `SELECT TOP 1 UserId, Name, Email, Phone, AvatarUrl, RoleKey, Status, CreatedAt
     FROM Users
     WHERE UserId = @userId`,
    { userId },
  )

  const row = result?.recordset?.[0]
  if (!row) {
    const err = new Error('User not found')
    err.statusCode = 404
    throw err
  }

  const { firstName, lastName } = splitName(row.Name)

  return {
    userId: row.UserId,
    name: row.Name,
    firstName,
    lastName,
    email: row.Email,
    phone: row.Phone,
    avatarUrl: row.AvatarUrl || '',
    roleKey: row.RoleKey,
    status: row.Status,
    createdAt: row.CreatedAt,
  }
}

async function updateMe(userId, { name, email, phone, avatarUrl } = {}) {
  const n = name !== undefined && name !== null ? String(name).trim() : ''
  const e = email !== undefined && email !== null ? String(email).trim() : ''
  const p = phone !== undefined && phone !== null ? String(phone).trim() : ''
  const a = avatarUrl !== undefined ? normalizeAvatarUrlForDb(avatarUrl) : null

  if (!n) {
    const err = new Error('Missing name')
    err.statusCode = 400
    throw err
  }

  if (avatarUrl !== undefined && a && a.length > 500) {
    const err = new Error('Avatar URL too long')
    err.statusCode = 413
    throw err
  }

  const bind = { userId, name: n, email: e || null, phone: p || null }
  let sql = `UPDATE Users
     SET Name = @name,
         Email = @email,
         Phone = @phone`
  if (avatarUrl !== undefined) {
    bind.avatarUrl = a || null
    sql += `,
         AvatarUrl = @avatarUrl`
  }
  sql += `
     WHERE UserId = @userId`

  await query(sql, bind)

  return getMe(userId)
}

async function uploadAvatarFromDataUrl(userId, { dataUrl, baseUrl } = {}) {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    const err = new Error('Invalid image data URL. Use PNG or JPG.')
    err.statusCode = 400
    throw err
  }

  if (!parsed.buf || parsed.buf.length === 0) {
    const err = new Error('Empty image')
    err.statusCode = 400
    throw err
  }

  if (parsed.buf.length > 2 * 1024 * 1024) {
    const err = new Error('Avatar too large (max 2MB)')
    err.statusCode = 413
    throw err
  }

  const dir = getAvatarUploadDir()
  await fs.mkdir(dir, { recursive: true })

  // Use a stable filename so DB only stores a short, predictable path.
  const fileName = `u${userId}.${parsed.ext}`
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, parsed.buf)

  const relativeUrl = `/uploads/avatars/${fileName}`

  if (relativeUrl.length > 500) {
    const err = new Error('Avatar URL too long')
    err.statusCode = 413
    throw err
  }

  await query('UPDATE Users SET AvatarUrl = @u WHERE UserId = @userId', { userId, u: fileName })
  return getMe(userId)
}

async function changePassword(userId, { currentPassword, newPassword } = {}) {
  const cur = currentPassword !== undefined && currentPassword !== null ? String(currentPassword) : ''
  const next = newPassword !== undefined && newPassword !== null ? String(newPassword) : ''

  if (!cur) {
    const err = new Error('Missing currentPassword')
    err.statusCode = 400
    throw err
  }
  if (!next || next.length < 6) {
    const err = new Error('New password must be at least 6 characters')
    err.statusCode = 400
    throw err
  }

  const result = await query('SELECT TOP 1 PasswordHash FROM Users WHERE UserId = @userId', { userId })
  const row = result?.recordset?.[0]
  if (!row) {
    const err = new Error('User not found')
    err.statusCode = 404
    throw err
  }

  const stored = row.PasswordHash
  if (stored) {
    const s = String(stored)

    if (s.startsWith('sha256:')) {
      const expected = hashPasswordSha256(userId, cur)
      if (expected !== s) {
        const err = new Error('Current password incorrect')
        err.statusCode = 400
        throw err
      }
    } else if (s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$')) {
      const ok = await bcrypt.compare(cur, s)
      if (!ok) {
        const err = new Error('Current password incorrect')
        err.statusCode = 400
        throw err
      }
    } else {
      if (cur !== s) {
        const err = new Error('Current password incorrect')
        err.statusCode = 400
        throw err
      }
    }
  }

  const hashed = await bcrypt.hash(next, 10)
  await query('UPDATE Users SET PasswordHash = @h WHERE UserId = @userId', { userId, h: hashed })
  return { updated: 1 }
}

module.exports = {
  getMe,
  updateMe,
  changePassword,
  uploadAvatarFromDataUrl,
}
