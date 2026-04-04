const { asyncHandler } = require('../../utils/asyncHandler')
const chatService = require('../../services/chat.service')

// Staff chat controller - tương tự owner nhưng chỉ chat với customers

const getThreads = asyncHandler(async (req, res) => {
  const data = await chatService.getThreads({ scope: 'staff' })
  res.json({ ok: true, data })
})

const getMessages = asyncHandler(async (req, res) => {
  const { threadId } = req.params || {}
  if (!threadId) {
    res.status(400).json({ ok: false, error: 'Missing threadId' })
    return
  }
  const data = await chatService.getMessages(threadId, { scope: 'staff' })
  res.json({ ok: true, data })
})

const postMessage = asyncHandler(async (req, res) => {
  const { threadId } = req.params || {}
  const { text } = req.body || {}
  
  if (!threadId || !text) {
    res.status(400).json({ ok: false, error: 'Missing threadId or text' })
    return
  }
  
  const staffId = req.user?.userId || req.user?.sub
  const data = await chatService.sendMessage({
    threadId,
    text,
    from: 'staff',
    senderId: staffId,
    scope: 'staff'
  })
  
  res.status(201).json({ ok: true, data })
})

module.exports = {
  getThreads,
  getMessages,
  postMessage,
}
