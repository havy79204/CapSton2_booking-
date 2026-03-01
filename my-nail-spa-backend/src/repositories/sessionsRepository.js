const { query, newId } = require('../config/query')

async function findSessionsByUserId(userId) {
  return query('SELECT * FROM dbo.UserSessions WHERE UserId=@userId ORDER BY CreatedAt DESC', { userId })
}

async function insertSession({ sessionId, userId, expiresAt, clientInfo }) {
  await query('INSERT INTO dbo.UserSessions(SessionId, UserId, ExpiresAt, RevokedAt, ClientInfo) VALUES(@id, @userId, @expiresAt, NULL, @clientInfo)', {
    id: sessionId,
    userId,
    expiresAt: expiresAt || null,
    clientInfo: clientInfo || null,
  })
  return query('SELECT TOP 1 * FROM dbo.UserSessions WHERE SessionId=@id', { id: sessionId })
}

async function deleteSession(sessionId) {
  return query('DELETE FROM dbo.UserSessions WHERE SessionId=@id', { id: sessionId })
}

module.exports = {
  findSessionsByUserId,
  insertSession,
  deleteSession,
}
