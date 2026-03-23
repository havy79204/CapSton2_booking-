const { asyncHandler } = require('../../utils/asyncHandler')
const notificationsService = require('../../services/notifications.service')

function getUserIdFromReq(req) {
  const sub = req.user?.sub
  const userId = Number(sub)
  return Number.isFinite(userId) ? userId : null
}

const getNotifications = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await notificationsService.listNotifications({ scope: 'owner', userId })
  res.json({ ok: true, data })
})

const postMarkRead = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await notificationsService.markAllRead({ scope: 'owner', userId })
  res.json({ ok: true, data })
})

module.exports = {
  getNotifications,
  postMarkRead,
}
