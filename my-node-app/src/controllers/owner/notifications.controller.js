const { asyncHandler } = require('../../utils/asyncHandler')
const notificationsService = require('../../services/notifications.service')

function getUserIdFromReq(req) {
  const sub = req.user?.sub
  const userId = String(sub || '').trim()
  return userId || null
}

const getNotifications = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await notificationsService.listOwnerNotifications({ userId })
  res.json({ ok: true, data })
})

const postMarkRead = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await notificationsService.markAllOwnerNotificationsRead({ userId })
  res.json({ ok: true, data })
})

module.exports = {
  getNotifications,
  postMarkRead,
}
