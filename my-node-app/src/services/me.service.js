const { query } = require('../config/query')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const fs = require('fs/promises')
const path = require('path')

const PROFILE_PHONE_REGEX = /^0(3|5|7|8|9)\d{8}$/

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

function normalizePhone(value) {
    const raw = String(value || '').replace(/[^\d+]/g, '').trim()
    if (!raw) return ''

    if (raw.startsWith('+84')) {
        return `0${raw.slice(3).replace(/\D/g, '')}`
    }

    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('84') && digits.length === 11) {
        return `0${digits.slice(2)}`
    }

    return digits
}

async function tableExists(tableName) {
    const result = await query(
        `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = @t`, { t: tableName },
    )
    return Boolean(result.recordset?.length)
}

async function columnExists(tableName, columnName) {
    const result = await query(
        `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @t AND COLUMN_NAME = @c`, { t: tableName, c: columnName },
    )
    return Boolean(result.recordset?.length)
}

async function getMe(userId) {
    const result = await query(
        `SELECT TOP 1 UserId, Name, Email, Phone, AvatarUrl, RoleKey, Status, CreatedAt
     FROM Users
     WHERE UserId = @userId`, { userId },
    )

    const row = result?.recordset?.[0]
    if (!row) {
        const err = new Error('User not found')
        err.statusCode = 404
        throw err
    }

    const { firstName, lastName } = splitName(row.Name)

    let specialties = []
    try {
        const staffRes = await query(
            `SELECT TOP 1 StaffId
       FROM Staff
       WHERE UserId = @userId`, { userId },
        )
        const staffId = staffRes?.recordset?.[0]?.StaffId
        if (staffId) {
            const joins = []
            const nameParts = ['ss.CategoryId']

            if (await tableExists('ServiceCategories')) {
                const hasCategoryName = await columnExists('ServiceCategories', 'CategoryName')
                const hasName = await columnExists('ServiceCategories', 'Name')
                joins.push('LEFT JOIN ServiceCategories sc ON sc.CategoryId = ss.CategoryId')
                if (hasCategoryName) nameParts.unshift('sc.CategoryName')
                if (hasName) nameParts.unshift('sc.Name')
            }
            if (await tableExists('Categories')) {
                const hasCategoryName = await columnExists('Categories', 'CategoryName')
                const hasName = await columnExists('Categories', 'Name')
                joins.push('LEFT JOIN Categories c ON c.CategoryId = ss.CategoryId')
                if (hasCategoryName) nameParts.unshift('c.CategoryName')
                if (hasName) nameParts.unshift('c.Name')
            }
            if (await tableExists('ProductCategories')) {
                const hasName = await columnExists('ProductCategories', 'Name')
                joins.push('LEFT JOIN ProductCategories pc ON pc.CategoryId = ss.CategoryId')
                if (hasName) nameParts.unshift('pc.Name')
            }

            const skillRows = await query(
                `SELECT
            ss.CategoryId,
            COALESCE(${nameParts.join(', ')}) AS CategoryName
         FROM StaffSkills ss
         ${joins.join('\n')}
         WHERE ss.StaffId = @staffId`, { staffId },
            )
            specialties = (skillRows?.recordset || [])
                .map((r) => String(r.CategoryName || '').trim())
                .filter(Boolean)
        }
    } catch {
        specialties = []
    }

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
        specialties,
    }
}

async function updateMe(userId, { name, email, phone, avatarUrl } = {}) {
    const n = name !== undefined && name !== null ? String(name).trim() : ''
    const e = email !== undefined && email !== null ? String(email).trim() : ''
    const p = phone !== undefined && phone !== null ? String(phone).trim() : ''
    const normalizedPhone = normalizePhone(p)
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

    if (p && !PROFILE_PHONE_REGEX.test(normalizedPhone)) {
        const err = new Error('Phone number must be a valid Vietnamese phone number')
        err.statusCode = 400
        throw err
    }

    const bind = { userId, name: n, email: e || null, phone: normalizedPhone || null }
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

