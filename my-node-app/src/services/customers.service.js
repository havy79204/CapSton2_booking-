const { query, newId } = require('../config/query')
const { detectRoleKey } = require('./roles.service')
const { toCustomerListItem } = require('../models/customer.model')

function buildCustomerRoleFilter(alias = 'u') {
  return `(
    ${alias}.RoleKey = '3'
    OR LOWER(CONVERT(nvarchar(50), ${alias}.RoleKey)) = 'customer'
  )`
}

function buildActiveUserFilter(alias = 'u') {
  return `(
    ${alias}.Status IS NULL
    OR UPPER(CONVERT(nvarchar(20), ${alias}.Status)) <> 'INACTIVE'
  )`
}

async function listCustomers() {
  const binds = {}
  const roleKey = await detectRoleKey(['customer', 'CUSTOMER'])
  const roleFilter = roleKey
    ? `(${buildCustomerRoleFilter('u')} OR u.RoleKey = @roleKey)`
    : buildCustomerRoleFilter('u')

  if (roleKey) binds.roleKey = roleKey

  const result = await query(
    `SELECT
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl,
        COUNT(b.BookingId) AS Visits,
        MAX(b.BookingTime) AS LastBooking
      FROM Users u
      LEFT JOIN Bookings b ON b.CustomerUserId = u.UserId
      WHERE ${roleFilter}
        AND ${buildActiveUserFilter('u')}
      GROUP BY u.UserId, u.Name, u.Email, u.Phone, u.AvatarUrl
      ORDER BY u.Name`,
    binds
  )

  return (result.recordset || []).map(toCustomerListItem)
}

async function createCustomer(payload) {
  const { name, phone, email } = payload || {}

  if (email) {
    const exists = await query('SELECT TOP 1 UserId FROM Users WHERE Email = @email', { email })
    if (exists.recordset && exists.recordset.length) {
      const err = new Error('Email already exists')
      err.status = 409
      throw err
    }
  }

  const roleKey = (await detectRoleKey(['customer', 'CUSTOMER'])) || '3'
  const userId = newId()

  await query(
    `INSERT INTO Users (UserId, Name, Email, Phone, PasswordHash, RoleKey, Status)
     VALUES (@userId, @name, @email, @phone, NULL, @roleKey, @status)`,
    {
      userId,
      name,
      email: email || null,
      phone: phone || null,
      roleKey,
      status: 'Active',
    }
  )

  return { id: userId }
}

async function getCustomerById(userId) {
  const roleKey = await detectRoleKey(['customer', 'CUSTOMER'])
  const binds = { userId }
  const roleFilter = roleKey
    ? `(${buildCustomerRoleFilter('u')} OR u.RoleKey = @roleKey)`
    : buildCustomerRoleFilter('u')
  if (roleKey) binds.roleKey = roleKey

  const result = await query(
    `SELECT TOP 1
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl,
        (
          SELECT COUNT(1)
          FROM Bookings b
          WHERE b.CustomerUserId = u.UserId
        ) AS Visits,
        (
          SELECT MAX(b2.BookingTime)
          FROM Bookings b2
          WHERE b2.CustomerUserId = u.UserId
        ) AS LastBooking
     FROM Users u
     WHERE u.UserId = @userId
       AND ${roleFilter}
       AND ${buildActiveUserFilter('u')}`,
    binds
  )

  const row = result.recordset?.[0]
  if (!row) return null
  return toCustomerListItem(row)
}

async function updateCustomer(userId, payload) {
  const { name, phone, email } = payload || {}
  const roleKey = await detectRoleKey(['customer', 'CUSTOMER'])
  const binds = { userId }
  const roleFilter = roleKey
    ? `(${buildCustomerRoleFilter('u')} OR u.RoleKey = @roleKey)`
    : buildCustomerRoleFilter('u')
  if (roleKey) binds.roleKey = roleKey

  const exists = await query(
    `SELECT TOP 1 u.UserId
     FROM Users u
     WHERE u.UserId = @userId
       AND ${roleFilter}
       AND ${buildActiveUserFilter('u')}`,
    binds
  )
  if (!exists.recordset?.length) {
    const err = new Error('Customer not found')
    err.status = 404
    throw err
  }

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
     WHERE UserId = @userId`,
    {
      userId,
      name,
      email: email || null,
      phone: phone || null,
    }
  )

  return { id: userId }
}

async function deleteCustomer(userId) {
  const roleKey = await detectRoleKey(['customer', 'CUSTOMER'])
  const binds = { userId }
  const roleFilter = roleKey
    ? `(${buildCustomerRoleFilter('u')} OR u.RoleKey = @roleKey)`
    : buildCustomerRoleFilter('u')
  if (roleKey) binds.roleKey = roleKey

  const exists = await query(
    `SELECT TOP 1 u.UserId
     FROM Users u
     WHERE u.UserId = @userId
       AND ${roleFilter}
       AND ${buildActiveUserFilter('u')}`,
    binds
  )
  if (!exists.recordset?.length) {
    const err = new Error('Customer not found')
    err.status = 404
    throw err
  }

  await query('UPDATE Users SET Status = @status WHERE UserId = @userId', { userId, status: 'Inactive' })
  return { id: userId }
}

module.exports = {
  listCustomers,
  createCustomer,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
}
