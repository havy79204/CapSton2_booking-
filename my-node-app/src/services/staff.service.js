const { query, newId } = require('../config/query')
const { detectRoleKey } = require('./roles.service')
const { toStaffListItem } = require('../models/staff.model')
const fs = require('fs/promises')
const path = require('path')

const STAFF_SKILL_CATEGORY_TABLES = ['ServiceCategories', 'ProductCategories', 'Categories']
const TIME_PERIODS = new Set(['all', 'day', 'week', 'month', 'year'])

function getAvatarUploadDir() {
  return path.join(__dirname, '..', '..', 'uploads', 'avatars')
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim()
  const m = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const base64 = m[2]
  const buf = Buffer.from(base64, 'base64')
  const ext = kind === 'jpeg' ? 'jpg' : kind
  return { buf, ext }
}

function parseDateOnly(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, monthIndex, day)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

function buildStaffTimeRange(options = {}) {
  const periodRaw = String(options.period || 'all').trim().toLowerCase()
  const period = TIME_PERIODS.has(periodRaw) ? periodRaw : 'all'

  const selectedDate = parseDateOnly(options.date) || new Date()
  selectedDate.setHours(0, 0, 0, 0)

  if (period === 'all') {
    return {
      period,
      selectedDate,
      startAt: null,
      endAt: null,
    }
  }

  const startAt = new Date(selectedDate)
  const endAt = new Date(selectedDate)

  if (period === 'day') {
    endAt.setDate(endAt.getDate() + 1)
  } else if (period === 'week') {
    const dayOfWeek = startAt.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    startAt.setDate(startAt.getDate() + mondayOffset)
    endAt.setTime(startAt.getTime())
    endAt.setDate(endAt.getDate() + 7)
  } else if (period === 'month') {
    startAt.setDate(1)
    endAt.setTime(startAt.getTime())
    endAt.setMonth(endAt.getMonth() + 1)
  } else if (period === 'year') {
    startAt.setMonth(0, 1)
    endAt.setTime(startAt.getTime())
    endAt.setFullYear(endAt.getFullYear() + 1)
  }

  return {
    period,
    selectedDate,
    startAt,
    endAt,
  }
}

async function tableExists(tableName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = @tableName`,
    { tableName }
  )
  return Boolean(res.recordset?.length)
}

async function columnExists(tableName, columnName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @tableName
       AND COLUMN_NAME = @columnName`,
    { tableName, columnName }
  )
  return Boolean(res.recordset?.length)
}

async function identityColumnExists(tableName, columnName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM sys.columns c
     INNER JOIN sys.tables t ON t.object_id = c.object_id
     WHERE t.name = @tableName
       AND c.name = @columnName
       AND c.is_identity = 1`,
    { tableName, columnName }
  )
  return Boolean(res.recordset?.length)
}

async function getStaffSkillSchema() {
  const hasStaffSkills = await tableExists('StaffSkills')
  if (!hasStaffSkills) {
    return {
      enabled: false,
      hasIdStaffSkill: false,
      canWriteIdStaffSkill: false,
      categoryTable: null,
      categoryNameColumn: null,
    }
  }

  const [hasStaffId, hasCategoryId, hasIdStaffSkill] = await Promise.all([
    columnExists('StaffSkills', 'StaffId'),
    columnExists('StaffSkills', 'CategoryId'),
    columnExists('StaffSkills', 'IdStaffSkill'),
  ])

  const canWriteIdStaffSkill = hasIdStaffSkill
    ? !(await identityColumnExists('StaffSkills', 'IdStaffSkill'))
    : false

  if (!hasStaffId || !hasCategoryId) {
    return {
      enabled: false,
      hasIdStaffSkill,
      canWriteIdStaffSkill,
      categoryTable: null,
      categoryNameColumn: null,
    }
  }

  for (const tableName of STAFF_SKILL_CATEGORY_TABLES) {
    const hasTable = await tableExists(tableName)
    if (!hasTable) continue

    const hasCategoryIdInTable = await columnExists(tableName, 'CategoryId')
    if (!hasCategoryIdInTable) continue

    const hasName = await columnExists(tableName, 'Name')
    if (hasName) {
      return {
        enabled: true,
        hasIdStaffSkill,
        canWriteIdStaffSkill,
        categoryTable: tableName,
        categoryNameColumn: 'Name',
      }
    }

    const hasCategoryName = await columnExists(tableName, 'CategoryName')
    if (hasCategoryName) {
      return {
        enabled: true,
        hasIdStaffSkill,
        canWriteIdStaffSkill,
        categoryTable: tableName,
        categoryNameColumn: 'CategoryName',
      }
    }
  }

  return {
    enabled: true,
    hasIdStaffSkill,
    canWriteIdStaffSkill,
    categoryTable: null,
    categoryNameColumn: null,
  }
}

function normalizeCategoryIdsFromPayload(payload = {}) {
  const raw = payload.specialtyCategoryIds ?? payload.categoryIds ?? []
  const src = Array.isArray(raw) ? raw : String(raw || '').split(',')
  const seen = new Set()
  const out = []

  for (const item of src) {
    const id = String(item || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  return out
}

async function listStaffSkillCategories() {
  const schema = await getStaffSkillSchema()
  if (!schema.enabled) return []

  if (schema.categoryTable && schema.categoryNameColumn) {
    const rows = await query(
      `SELECT
          c.CategoryId,
          c.${schema.categoryNameColumn} AS Name
       FROM ${schema.categoryTable} c
       WHERE c.CategoryId IS NOT NULL
       ORDER BY c.${schema.categoryNameColumn} ASC`
    )

    return (rows.recordset || [])
      .map((row) => ({
        id: String(row.CategoryId || '').trim(),
        name: String(row.Name || '').trim(),
      }))
      .filter((row) => row.id)
  }

  const rows = await query(
    `SELECT DISTINCT
        ss.CategoryId
     FROM StaffSkills ss
     WHERE ss.CategoryId IS NOT NULL
     ORDER BY ss.CategoryId ASC`
  )

  return (rows.recordset || [])
    .map((row) => {
      const id = String(row.CategoryId || '').trim()
      return {
        id,
        name: id,
      }
    })
    .filter((row) => row.id)
}

async function getStaffSkillMap(staffIds, schema) {
  if (!schema.enabled || !Array.isArray(staffIds) || staffIds.length === 0) return new Map()

  const params = {}
  const placeholders = staffIds.map((staffId, idx) => {
    const key = `staffId${idx}`
    params[key] = staffId
    return `@${key}`
  })

  const joinSql = schema.categoryTable && schema.categoryNameColumn
    ? `LEFT JOIN ${schema.categoryTable} c ON c.CategoryId = ss.CategoryId`
    : ''
  const nameSelect = schema.categoryTable && schema.categoryNameColumn
    ? `c.${schema.categoryNameColumn} AS CategoryName`
    : `NULL AS CategoryName`

  const rows = await query(
    `SELECT
        ss.StaffId,
        ss.CategoryId,
        ${nameSelect}
     FROM StaffSkills ss
     ${joinSql}
     WHERE ss.StaffId IN (${placeholders.join(', ')})`,
    params
  )

  const byStaffId = new Map()
  for (const row of rows.recordset || []) {
    const staffId = String(row.StaffId || '').trim()
    const categoryId = String(row.CategoryId || '').trim()
    if (!staffId || !categoryId) continue

    if (!byStaffId.has(staffId)) byStaffId.set(staffId, [])
    const arr = byStaffId.get(staffId)

    if (arr.some((x) => x.id === categoryId)) continue

    arr.push({
      id: categoryId,
      name: String(row.CategoryName || categoryId).trim() || categoryId,
    })
  }

  return byStaffId
}

function enrichStaffItem(baseItem, skillRows = []) {
  const specialtyCategoryIds = skillRows.map((x) => x.id)
  const specialties = skillRows.map((x) => x.name).filter(Boolean)

  return {
    ...baseItem,
    specialtyCategoryIds,
    specialties,
    specialty: specialties.length ? specialties.join(', ') : baseItem.specialty,
  }
}

async function replaceStaffSkills(staffId, categoryIds, schema) {
  if (!schema.enabled) return

  await query('DELETE FROM StaffSkills WHERE StaffId = @staffId', { staffId })

  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return

  for (const categoryId of categoryIds) {
    if (schema.hasIdStaffSkill && schema.canWriteIdStaffSkill) {
      await query(
        `INSERT INTO StaffSkills (IdStaffSkill, StaffId, CategoryId)
         VALUES (@idStaffSkill, @staffId, @categoryId)`,
        {
          idStaffSkill: newId(),
          staffId,
          categoryId,
        }
      )
    } else {
      await query(
        `INSERT INTO StaffSkills (StaffId, CategoryId)
         VALUES (@staffId, @categoryId)`,
        {
          staffId,
          categoryId,
        }
      )
    }
  }
}

async function listStaff(options = {}) {
  const { period, startAt, endAt } = buildStaffTimeRange(options)
  const bookingRangeCondition = period === 'all'
    ? ''
    : 'AND b.BookingTime >= @rangeStartAt AND b.BookingTime < @rangeEndAt'

  const bind = period === 'all'
    ? {}
    : {
      rangeStartAt: startAt,
      rangeEndAt: endAt,
    }

  const skillSchema = await getStaffSkillSchema()
  const result = await query(
    `SELECT
        s.StaffId,
        s.Status AS StaffStatus,
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl,
        u.RoleKey,
        r.DisplayName AS RoleName,
        ISNULL(bsAgg.TotalBookings, 0) AS TotalBookings,
        ISNULL(bsAgg.WorkingHours, 0) AS WorkingHours,
        ISNULL(tipAgg.TotalTip, 0) AS TotalTip
      FROM Staff s
      LEFT JOIN Users u ON u.UserId = s.UserId
      LEFT JOIN Roles r ON r.RoleKey = u.RoleKey
      LEFT JOIN (
        SELECT
          bs.StaffId,
          COUNT(DISTINCT bs.BookingId) AS TotalBookings,
          CAST(SUM(ISNULL(sv.DurationMinutes, 0)) AS FLOAT) / 60.0 AS WorkingHours
        FROM BookingServices bs
        INNER JOIN Bookings b ON b.BookingId = bs.BookingId
        LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
        WHERE bs.StaffId IS NOT NULL
          ${bookingRangeCondition}
        GROUP BY bs.StaffId
      ) bsAgg ON bsAgg.StaffId = s.StaffId
      LEFT JOIN (
        SELECT
          tl.StaffId,
          SUM(ISNULL(tl.Amount, 0)) AS TotalTip
        FROM TipLogs tl
        WHERE tl.StaffId IS NOT NULL
          ${period === 'all' ? '' : 'AND tl.[At] >= @rangeStartAt AND tl.[At] < @rangeEndAt'}
        GROUP BY tl.StaffId
      ) tipAgg ON tipAgg.StaffId = s.StaffId
      WHERE UPPER(LTRIM(RTRIM(ISNULL(s.Status, '')))) <> 'INACTIVE'
        AND UPPER(LTRIM(RTRIM(ISNULL(u.Status, '')))) <> 'INACTIVE'
      ORDER BY u.Name`
    ,
    bind
  )

  const baseItems = (result.recordset || []).map(toStaffListItem)
  const staffIds = baseItems.map((x) => String(x.id || '').trim()).filter(Boolean)
  const skillMap = await getStaffSkillMap(staffIds, skillSchema)

  return baseItems.map((item) => enrichStaffItem(item, skillMap.get(String(item.id || '').trim()) || []))
}

async function createStaff(payload) {
  const { name, phone, email } = payload || {}
  const address = String(payload?.address || '').trim()
  const statusText = String(payload?.status || '').trim()
  const normalizedStatus = statusText || 'Active'
  const parsedHireDate = parseDateOnly(payload?.hireDate)
  const hireDate = parsedHireDate || new Date()
  const categoryIds = normalizeCategoryIdsFromPayload(payload)
  const skillSchema = await getStaffSkillSchema()

  if (email) {
    const exists = await query('SELECT TOP 1 UserId FROM Users WHERE Email = @email', { email })
    if (exists.recordset && exists.recordset.length) {
      const err = new Error('Email already exists')
      err.status = 409
      throw err
    }
  }

  const roleKey = await detectRoleKey(['staff', 'STAFF', 'employee', 'EMPLOYEE'])
  const userId = newId()
  const staffId = newId()

  await query(
    `INSERT INTO Users (UserId, Name, Email, Phone, PasswordHash, RoleKey, Status)
     VALUES (@userId, @name, @email, @phone, NULL, @roleKey, @userStatus);
     INSERT INTO Staff (StaffId, UserId, HireDate, Status)
     VALUES (@staffId, @userId, @hireDate, @staffStatus);`,
    {
      userId,
      staffId,
      name,
      email: email || null,
      phone: phone || null,
      hireDate,
      roleKey,
      userStatus: normalizedStatus,
      staffStatus: normalizedStatus,
    }
  )

  if (address) {
    await query(
      `INSERT INTO Addresses (AddressId, UserId, FullName, PhoneNumber, AddressLine, IsDefault)
       VALUES (@addressId, @userId, @fullName, @phoneNumber, @addressLine, 1)`,
      {
        addressId: newId(),
        userId,
        fullName: name || null,
        phoneNumber: phone || null,
        addressLine: address,
      }
    )
  }

  await replaceStaffSkills(staffId, categoryIds, skillSchema)

  return { id: staffId }
}

async function getStaffById(staffId) {
  const skillSchema = await getStaffSkillSchema()
  const result = await query(
    `SELECT TOP 1
        s.StaffId,
        s.HireDate,
        s.Status AS StaffStatus,
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl,
        u.RoleKey,
        r.DisplayName AS RoleName,
        addr.AddressLine AS Address
      FROM Staff s
      LEFT JOIN Users u ON u.UserId = s.UserId
      LEFT JOIN Roles r ON r.RoleKey = u.RoleKey
      OUTER APPLY (
        SELECT TOP 1 a.AddressLine
        FROM Addresses a
        WHERE a.UserId = u.UserId
        ORDER BY ISNULL(a.IsDefault, 0) DESC, a.AddressId ASC
      ) addr
      WHERE s.StaffId = @staffId`,
    { staffId }
  )

  const row = result.recordset?.[0]
  if (!row) return null

  const baseItem = toStaffListItem(row)
  const skillMap = await getStaffSkillMap([String(baseItem.id || '').trim()].filter(Boolean), skillSchema)
  return enrichStaffItem(baseItem, skillMap.get(String(baseItem.id || '').trim()) || [])
}

async function updateStaff(staffId, payload) {
  const { name, phone, email } = payload || {}
  const hasSpecialtyCategoryIds = Object.prototype.hasOwnProperty.call(payload || {}, 'specialtyCategoryIds') || Object.prototype.hasOwnProperty.call(payload || {}, 'categoryIds')
  const hasAvatarUrl = Object.prototype.hasOwnProperty.call(payload || {}, 'avatarUrl')
  const hasAddress = Object.prototype.hasOwnProperty.call(payload || {}, 'address')
  const hasHireDate = Object.prototype.hasOwnProperty.call(payload || {}, 'hireDate')
  const hasStatus = Object.prototype.hasOwnProperty.call(payload || {}, 'status')

  const avatarUrl = hasAvatarUrl ? String(payload.avatarUrl || '').trim() : null
  const address = hasAddress ? String(payload.address || '').trim() : null

  const hireDateRaw = hasHireDate ? parseDateOnly(payload.hireDate) : null
  const hireDate = hasHireDate && hireDateRaw ? hireDateRaw : null

  const status = hasStatus ? String(payload.status || '').trim() : ''
  const normalizedStatus = status || null

  const categoryIds = normalizeCategoryIdsFromPayload(payload)
  const skillSchema = await getStaffSkillSchema()

  const existing = await query(
    `SELECT TOP 1 s.StaffId, s.UserId
     FROM Staff s
     WHERE s.StaffId = @staffId`,
    { staffId }
  )
  const row = existing.recordset?.[0]
  if (!row) {
    const err = new Error('Staff not found')
    err.status = 404
    throw err
  }
  const userId = row.UserId

  if (email) {
    const emailUsed = await query(
      'SELECT TOP 1 UserId FROM Users WHERE Email = @email AND UserId <> @userId',
      { email, userId }
    )
    if (emailUsed.recordset?.length) {
      const err = new Error('Email already exists')
      err.status = 409
      throw err
    }
  }

  await query(
    `UPDATE Users
     SET Name = @name,
         Email = @email,
         Phone = @phone,
         AvatarUrl = CASE WHEN @setAvatarUrl = 1 THEN @avatarUrl ELSE AvatarUrl END,
         Status = CASE WHEN @setStatus = 1 THEN @userStatus ELSE Status END
     WHERE UserId = @userId;
     UPDATE Staff
     SET HireDate = CASE WHEN @setHireDate = 1 THEN @hireDate ELSE HireDate END,
         Status = CASE WHEN @setStatus = 1 THEN @staffStatus ELSE Status END
     WHERE UserId = @userId;`,
    {
      staffId,
      userId,
      name,
      email: email || null,
      phone: phone || null,
      setAvatarUrl: hasAvatarUrl ? 1 : 0,
      avatarUrl,
      setHireDate: hasHireDate ? 1 : 0,
      hireDate,
      setStatus: hasStatus ? 1 : 0,
      userStatus: normalizedStatus,
      staffStatus: normalizedStatus,
    }
  )

  if (hasAddress) {
    const existingAddress = await query(
      `SELECT TOP 1 AddressId
       FROM Addresses
       WHERE UserId = @userId
       ORDER BY ISNULL(IsDefault, 0) DESC, AddressId ASC`,
      { userId }
    )

    const rowAddress = existingAddress.recordset?.[0]
    if (rowAddress?.AddressId) {
      await query(
        `UPDATE Addresses
         SET AddressLine = @addressLine,
             FullName = COALESCE(NULLIF(@name, ''), FullName),
             PhoneNumber = @phone,
             IsDefault = 1
         WHERE AddressId = @addressId`,
        {
          addressId: rowAddress.AddressId,
          addressLine: address || null,
          name,
          phone: phone || null,
        }
      )
    } else {
      await query(
        `INSERT INTO Addresses (AddressId, UserId, FullName, PhoneNumber, AddressLine, IsDefault)
         VALUES (@addressId, @userId, @fullName, @phoneNumber, @addressLine, 1)`,
        {
          addressId: newId(),
          userId,
          fullName: name || null,
          phoneNumber: phone || null,
          addressLine: address || null,
        }
      )
    }
  }

  if (hasSpecialtyCategoryIds) {
    await replaceStaffSkills(staffId, categoryIds, skillSchema)
  }

  return { id: staffId }
}

async function deleteStaff(staffId) {
  const existing = await query(
    `SELECT TOP 1 s.StaffId, s.UserId
     FROM Staff s
     WHERE s.StaffId = @staffId`,
    { staffId }
  )
  const row = existing.recordset?.[0]
  if (!row) {
    const err = new Error('Staff not found')
    err.status = 404
    throw err
  }

  await query(
    `UPDATE Staff SET Status = @staffStatus WHERE StaffId = @staffId;
     UPDATE Users SET Status = @userStatus WHERE UserId = @userId;`,
    {
      staffId,
      userId: row.UserId,
      staffStatus: 'Inactive',
      userStatus: 'Inactive',
    }
  )

  return { id: staffId }
}

async function uploadStaffAvatarFromDataUrl(staffId, { dataUrl } = {}) {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    const err = new Error('Invalid image data URL. Use PNG or JPG.')
    err.status = 400
    throw err
  }

  if (!parsed.buf || parsed.buf.length === 0) {
    const err = new Error('Empty image')
    err.status = 400
    throw err
  }

  if (parsed.buf.length > 2 * 1024 * 1024) {
    const err = new Error('Avatar too large (max 2MB)')
    err.status = 413
    throw err
  }

  const existing = await query(
    `SELECT TOP 1 s.StaffId, s.UserId
     FROM Staff s
     WHERE s.StaffId = @staffId`,
    { staffId }
  )
  const row = existing.recordset?.[0]
  if (!row?.UserId) {
    const err = new Error('Staff not found')
    err.status = 404
    throw err
  }

  const dir = getAvatarUploadDir()
  await fs.mkdir(dir, { recursive: true })

  const fileName = `u${row.UserId}.${parsed.ext}`
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, parsed.buf)

  await query('UPDATE Users SET AvatarUrl = @avatarUrl WHERE UserId = @userId', {
    userId: row.UserId,
    avatarUrl: fileName,
  })

  return {
    staffId,
    avatarUrl: fileName,
  }
}

module.exports = {
  listStaff,
  listStaffSkillCategories,
  createStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  uploadStaffAvatarFromDataUrl,
}
