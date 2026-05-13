const aiChatService = require('../../services/aiChat.service')
const { sanitizeCustomerResponse } = require('./responseSanitizer')

function extractUserId(rawUser) {
  if (!rawUser) return null
  if (typeof rawUser === 'number') return rawUser
  if (typeof rawUser === 'string') {
    const n = Number(rawUser)
    return Number.isFinite(n) && n > 0 ? n : rawUser || null
  }
  // common claim/property names
  const keys = ['userId', 'UserId', 'id', 'ID', 'sub', 'uid']
  for (const k of keys) {
    const v = rawUser[k]
    if (v !== undefined && v !== null) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return n
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return null
}

async function listSessions(req, res, next) {
  try {
    const rawUser = req.user
    const userId = extractUserId(rawUser)
    const data = await aiChatService.listSessions(userId)
    res.json({ data: sanitizeCustomerResponse(data) })
  } catch (err) {
    next(err)
  }
}

async function createSession(req, res, next) {
  try {
    const rawUser = req.user
    const userId = extractUserId(rawUser)
    const { title } = req.body || {}
    // require authenticated user for new sessions
    if (!userId) {
      const err = new Error('Authentication required')
      err.statusCode = 401
      throw err
    }
    const finalTitle = title && String(title).trim() ? String(title).trim() : null
    const data = await aiChatService.createSession(userId, finalTitle)
    res.json({ data: sanitizeCustomerResponse(data) })
  } catch (err) {
    next(err)
  }
}

async function getMessages(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId || req.query.sessionId)
    if (!sessionId) return res.status(400).json({ message: 'Missing sessionId' })
    const data = await aiChatService.getMessages(sessionId)
    res.json({ data: sanitizeCustomerResponse(data) })
  } catch (err) {
    next(err)
  }
}

async function postMessage(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId || req.body.sessionId)
    const rawUser = req.user
    const userId = extractUserId(rawUser)
    const { content, messageType } = req.body || {}
    if (!sessionId || !content) return res.status(400).json({ message: 'Missing required fields' })
    const result = await aiChatService.postUserMessage(sessionId, userId, content, messageType)
    res.json({ data: sanitizeCustomerResponse(result) })
  } catch (err) {
    next(err)
  }
}

async function postImageMessage(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId || req.body.sessionId)
    const rawUser = req.user
    const userId = extractUserId(rawUser)

    const { imageDataUrl, imageDataUrls, caption } = req.body || {}
    const images = Array.isArray(imageDataUrls)
      ? imageDataUrls.filter(Boolean)
      : (imageDataUrl ? [imageDataUrl] : [])

    if (!sessionId || !images.length) return res.status(400).json({ message: 'Missing required fields' })
    if (images.length > 3) return res.status(400).json({ message: 'Maximum 3 images per request' })

    const result = await aiChatService.postUserImageMessage(sessionId, userId, { imageDataUrls: images, caption })
    res.json({ data: sanitizeCustomerResponse(result) })
  } catch (err) {
    next(err)
  }
}

module.exports = { listSessions, createSession, getMessages, postMessage, postImageMessage }

async function renameSession(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId || req.body.sessionId)
    const { title } = req.body || {}
    const rawUser = req.user
    const userId = (typeof rawUser === 'string' || typeof rawUser === 'number')
      ? String(rawUser)
      : (rawUser?.userId || rawUser?.UserId) ? String(rawUser?.userId || rawUser?.UserId) : null
    if (!sessionId || !title) return res.status(400).json({ message: 'Missing required fields' })
    const data = await aiChatService.renameSession(sessionId, userId, String(title).trim())
    res.json({ data: sanitizeCustomerResponse(data) })
  } catch (err) {
    next(err)
  }
}

async function deleteSession(req, res, next) {
  try {
    const sessionId = Number(req.params.sessionId || req.body.sessionId)
    const rawUser = req.user
    const userId = (typeof rawUser === 'string' || typeof rawUser === 'number')
      ? String(rawUser)
      : (rawUser?.userId || rawUser?.UserId) ? String(rawUser?.userId || rawUser?.UserId) : null
    if (!sessionId) return res.status(400).json({ message: 'Missing sessionId' })
    const data = await aiChatService.deleteSession(sessionId, userId)
    res.json({ data: sanitizeCustomerResponse(data) })
  } catch (err) {
    next(err)
  }
}

module.exports = { listSessions, createSession, getMessages, postMessage, postImageMessage, renameSession, deleteSession }

