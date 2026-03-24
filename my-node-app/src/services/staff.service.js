const { query, newId } = require('../config/query')
const { detectRoleKey } = require('./roles.service')
const { toStaffListItem } = require('../models/staff.model')

const STAFF_SKILL_CATEGORY_TABLES = ['ServiceCategories', 'ProductCategories', 'Categories']

async function tableExists(tableName) {
  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = @tableName`,
      { tableName }
    )
    return Boolean(res.recordset?.length)
  } catch (err) {
    console.error(`[tableExists] Error checking table ${tableName}:`, err.message)
    return false
  }
}

async function columnExists(tableName, columnName) {
  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @tableName
         AND COLUMN_NAME = @columnName`,
      { tableName, columnName }
    )
    return Boolean(res.recordset?.length)
  } catch (err) {
    console.error(`[columnExists] Error checking column ${tableName}.${columnName}:`, err.message)
    return false
  }
}

async function identityColumnExists(tableName, columnName) {
  try {
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
  } catch (err) {
    console.error(`[identityColumnExists] Error checking identity column ${tableName}.${columnName}:`, err.message)
    return false
  }
}

async function getStaffSkillSchema() {
  try {
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
  } catch (err) {
    console.error('[getStaffSkillSchema] Error:', err.message)
    return {
      enabled: false,
      hasIdStaffSkill: false,
      canWriteIdStaffSkill: false,
      categoryTable: null,
      categoryNameColumn: null,
    }
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
  try {
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
  } catch (err) {
    console.error('[listStaffSkillCategories] Error:', err.message)
    return []
  }
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

async function listStaff() {
  const skillSchema = await getStaffSkillSchema()
  const result = await query(
    `SELECT
        s.StaffId,
        s.Status AS StaffStatus,
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl
      FROM Staff s
      LEFT JOIN Users u ON u.UserId = s.UserId
      ORDER BY u.Name`
  )

  const baseItems = (result.recordset || []).map(toStaffListItem)
  const staffIds = baseItems.map((x) => String(x.id || '').trim()).filter(Boolean)
  const skillMap = await getStaffSkillMap(staffIds, skillSchema)

  return baseItems.map((item) => enrichStaffItem(item, skillMap.get(String(item.id || '').trim()) || []))
}

async function createStaff(payload) {
  const { name, phone, email, status } = payload || {}
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
     VALUES (@staffId, @userId, GETDATE(), @staffStatus);`,
    {
      userId,
      staffId,
      name,
      email: email || null,
      phone: phone || null,
      roleKey,
      userStatus: 'Active',
      staffStatus: status || 'Working',
    }
  )

  await replaceStaffSkills(staffId, categoryIds, skillSchema)

  return { id: staffId }
}

async function getStaffById(staffId) {
  const skillSchema = await getStaffSkillSchema()
  const result = await query(
    `SELECT TOP 1
        s.StaffId,
        s.Status AS StaffStatus,
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl
      FROM Staff s
      LEFT JOIN Users u ON u.UserId = s.UserId
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
  const { name, phone, email, status } = payload || {}
  const hasSpecialtyCategoryIds = Object.prototype.hasOwnProperty.call(payload || {}, 'specialtyCategoryIds') || Object.prototype.hasOwnProperty.call(payload || {}, 'categoryIds')
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
         Phone = @phone
     WHERE UserId = @userId;
     UPDATE Staff
     SET Status = @staffStatus
     WHERE StaffId = @staffId;`,
    {
      staffId,
      userId,
      name,
      email: email || null,
      phone: phone || null,
      staffStatus: status || 'Working',
    }
  )

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
      staffStatus: 'Off',
      userStatus: 'Inactive',
    }
  )

  return { id: staffId }
}

module.exports = {
  listStaff,
  listStaffSkillCategories,
  createStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
}
