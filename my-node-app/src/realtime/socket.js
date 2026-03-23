const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')
const { env } = require('../config/config')

let ioInstance = null

function userRoom(userId) {
  return `user:${String(userId || '').trim()}`
}

function extractToken(socket) {
  const authToken = String(socket?.handshake?.auth?.token || '').trim()
  if (authToken) return authToken

  const header = socket?.handshake?.headers?.authorization || socket?.handshake?.headers?.Authorization
  if (!header) return ''
  const value = String(header)
  const m = value.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  })

  io.use((socket, next) => {
    try {
      const token = extractToken(socket)
      if (!token) return next(new Error('Missing token'))

      const payload = jwt.verify(token, env.auth.jwtSecret)
      const userId = String(payload?.sub || '').trim()
      if (!userId) return next(new Error('Invalid token subject'))

      socket.data.userId = userId
      return next()
    } catch {
      return next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const userId = String(socket.data?.userId || '').trim()
    if (userId) {
      socket.join(userRoom(userId))
    }
  })

  ioInstance = io
  return io
}

function emitCatMessageToUser(userId, payload) {
  if (!ioInstance) return
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return
  ioInstance.to(userRoom(safeUserId)).emit('chat:message', payload)
}

function emitCatMessageToUsers(userIds, payload) {
  const unique = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map((x) => String(x || '').trim()).filter(Boolean)))
  for (const userId of unique) {
    emitCatMessageToUser(userId, payload)
  }
}

module.exports = {
  initSocketServer,
  emitCatMessageToUser,
  emitCatMessageToUsers,
}
