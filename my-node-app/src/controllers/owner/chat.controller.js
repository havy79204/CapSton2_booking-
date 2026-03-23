const { asyncHandler } = require('../../utils/asyncHandler')
const chatService = require('../../services/chat.service')

function getUserIdFromReq(req) {
  const sub = req.user?.sub
  const userId = String(sub || '').trim()
  return userId || null
}

const getThreads = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req)
  if (!ownerUserId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const data = await chatService.listThreads(ownerUserId)
  res.json({ ok: true, data })
})

const getMessages = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req)
  if (!ownerUserId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const { threadId } = req.params || {}
  const data = await chatService.getMessages(ownerUserId, threadId)
  res.json({ ok: true, data })
})

const postMessage = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req)
  if (!ownerUserId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const { threadId } = req.params || {}
  const { text } = req.body || {}
  const data = await chatService.sendMessage(ownerUserId, threadId, { text })
  res.status(201).json({ ok: true, data })
})

module.exports = {
  getThreads,
  getMessages,
  postMessage,
}
