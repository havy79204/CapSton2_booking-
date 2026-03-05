const { query, newId } = require('../config/query')

async function findUsers(filters = {}) {
  const where = []
  const bind = {}
  if (filters.role) {
    where.push('RoleKey=@roleKey')
    bind.roleKey = filters.role
  }
  if (filters.salonId) {
    where.push('SalonId=@salonId')
    bind.salonId = filters.salonId
  }
  const sql = `SELECT * FROM dbo.Users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CreatedAt DESC`
  return query(sql, bind)
}

async function findUserById(id) {
  return query('SELECT TOP 1 * FROM dbo.Users WHERE UserId=@id', { id })
}

async function findUserByEmail(email) {
  return query('SELECT TOP 1 * FROM dbo.Users WHERE Email=@email', { email })
}

async function insertUser({ userId, name, email, passwordHash, roleKey, salonId, status }) {
  await query(
    `INSERT INTO dbo.Users(UserId, Name, Email, Password, RoleKey, SalonId, Status, CreatedAt, UpdatedAt)
     VALUES (@userId, @name, @email, @password, @roleKey, @salonId, @status, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    { userId, name, email, password: passwordHash, roleKey, salonId: salonId ? salonId : null, status },
  )
  return findUserById(userId)
}

async function updateUser({ id, name, email, passwordHash, roleKey, salonId, status }) {
  await query(
    `UPDATE dbo.Users
     SET Name=@name,
         Email=@email,
         Password=COALESCE(@password, Password),
         RoleKey=@roleKey,
         SalonId=@salonId,
         Status=@status,
         UpdatedAt=SYSUTCDATETIME()
     WHERE UserId=@id`,
    { id, name, email, password: passwordHash, roleKey, salonId, status },
  )
  return findUserById(id)
}

async function deleteUser(id) {
  return query('DELETE FROM dbo.Users WHERE UserId=@id', { id })
}

module.exports = {
  findUsers,
  findUserById,
  findUserByEmail,
  insertUser,
  updateUser,
  deleteUser,
}
