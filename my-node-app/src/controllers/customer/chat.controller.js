const { asyncHandler } = require('../../utils/asyncHandler')
const chatService = require('../../services/chat.service')
const { sanitizeCustomerResponse } = require('./responseSanitizer')

function getUserIdFromReq(req) {
  const sub = req.user?.sub
  const userId = String(sub || '').trim()
  return userId || null
}

const getMessages = asyncHandler(async (req, res) => {
  const customerUserId = getUserIdFromReq(req)
  if (!customerUserId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const data = await chatService.listCustomerMessages(customerUserId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const postMessage = asyncHandler(async (req, res) => {
  const customerUserId = getUserIdFromReq(req)
  if (!customerUserId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const { text } = req.body || {}
  const data = await chatService.sendCustomerMessage(customerUserId, { text })
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

module.exports = {
  getMessages,
  postMessage,
}
