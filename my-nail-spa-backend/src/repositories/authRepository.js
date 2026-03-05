const { query, newId } = require('../config/query')

async function getUserByEmail(email) {
  const r = await query('SELECT TOP 1 * FROM dbo.Users WHERE Email=@email', { email })
  return r.recordset[0] || null
}

async function getUserById(id) {
  const r = await query('SELECT TOP 1 * FROM dbo.Users WHERE UserId=@id', { id })
  return r.recordset[0] || null
}

async function createUser({ userId, name, email, passwordHash, roleKey = 'customer' } = {}) {
  const id = userId || newId()
  await query(
    `INSERT INTO dbo.Users(UserId, Name, Email, Password, RoleKey, SalonId, Status, CreatedAt, UpdatedAt)
     VALUES (@userId, @name, @email, @password, @roleKey, NULL, N'pending', SYSUTCDATETIME(), SYSUTCDATETIME())`,
    {
      userId: id,
      name: name || null,
      email,
      password: passwordHash,
      roleKey,
    },
  )
  return id
}

async function updateUserNameEmail(id, { name, email } = {}) {
  await query(
    `UPDATE dbo.Users SET Name=@name, Email=@email, UpdatedAt=SYSUTCDATETIME() WHERE UserId=@id`,
    { id, name, email },
  )
}

async function setPassword(id, pwHash) {
  await query('UPDATE dbo.Users SET Password=@pw, UpdatedAt=SYSUTCDATETIME() WHERE UserId=@id', { pw: pwHash, id })
}

async function activateUser(id) {
  await query(`UPDATE dbo.Users SET Status=N'active', UpdatedAt=SYSUTCDATETIME() WHERE UserId=@id`, { id })
}

async function upsertAppKeyValue(key, val) {
  await query(
    `MERGE dbo.AppKeyValue AS t
     USING (SELECT @key AS [Key], @val AS [Value]) AS s
     ON t.[Key] = s.[Key]
     WHEN MATCHED THEN UPDATE SET [Value]=s.[Value], UpdatedAt=SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT([Key],[Value],UpdatedAt) VALUES(s.[Key], s.[Value], SYSUTCDATETIME());`,
    { key, val },
  )
}

async function getAppKeyValue(key) {
  const r = await query('SELECT TOP 1 * FROM dbo.AppKeyValue WHERE [Key]=@key', { key })
  return r.recordset[0] || null
}

async function deleteAppKeyValue(key) {
  await query('DELETE FROM dbo.AppKeyValue WHERE [Key]=@key', { key })
}

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  updateUserNameEmail,
  setPassword,
  activateUser,
  upsertAppKeyValue,
  getAppKeyValue,
  deleteAppKeyValue,
}
