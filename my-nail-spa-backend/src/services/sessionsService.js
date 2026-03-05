const { z } = require('zod')
const sessionsRepo = require('../repositories/sessionsRepository')
const { newId } = require('../config/query')

async function listUserSessions(userId) {
  return sessionsRepo.findSessionsByUserId(userId)
}

async function createSession(body) {
  const parsed = z.object({ userId: z.string(), expiresAt: z.string().optional(), clientInfo: z.string().optional() }).parse(body)
  const id = newId()
  return sessionsRepo.insertSession({ sessionId: id, userId: parsed.userId, expiresAt: parsed.expiresAt, clientInfo: parsed.clientInfo })
}

async function removeSession(id) {
  return sessionsRepo.deleteSession(id)
}

module.exports = {
  listUserSessions,
  createSession,
  removeSession,
}
