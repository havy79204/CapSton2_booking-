const { asyncHandler } = require('../../utils/asyncHandler')
const notificationsService = require('../../services/notifications.service')

function getUserIdFromReq(req) {
  const sub = req.user?.sub
  const userId = String(sub || '').trim()
  return userId || null
}

const getNotifications = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const type = String(req.query?.type || 'all').trim().toLowerCase()
  const data = await notificationsService.listCustomerNotifications({
    userId,
    type: type || 'all',
  })
  res.json({ ok: true, data })
})

const postMarkRead = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const data = await notificationsService.markAllCustomerNotificationsRead({ userId })
  res.json({ ok: true, data })
})

const postMarkOneRead = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const notificationId = String(req.params?.id || '').trim()
  if (!notificationId) {
    res.status(400).json({ ok: false, error: 'Missing notification id' })
    return
  }

  const read = req.body?.read !== false
  const data = await notificationsService.setCustomerNotificationRead({ userId, notificationId, read })
  res.json({ ok: true, data })
})

module.exports = {
  getNotifications,
  postMarkRead,
  postMarkOneRead,
}
