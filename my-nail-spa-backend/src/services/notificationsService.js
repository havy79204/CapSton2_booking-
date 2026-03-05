const repo = require('../repositories/notificationsRepository')
const { newId, query } = require('../config/query')
const mail = require('../services/mail')

async function getSettings(userId) {
  return repo.getSettingsRow(userId)
}

async function updateSettings(userId, payload) {
  return repo.upsertSettings(userId, payload)
}

async function listNotifications(userId, limit = 100) {
  return repo.getNotificationsForUser(userId, limit)
}

async function createNotification({ id, userId, bookingId, orderId, title, body, type = 'general', channel = 'app', emailSent = false }) {
  const nid = id || newId()
  await repo.insertNotification({ id: nid, userId, bookingId, orderId, title, body, type, channel, emailSent })
  return nid
}

async function markRead(ids = []) {
  return repo.markRead(ids)
}

async function getUserSettings(userId) {
  if (!userId) return { enableNotifications: true, enableEmail: true }
  const row = await repo.getSettingsRow(userId)
  if (!row) return { enableNotifications: true, enableEmail: true }
  return {
    enableNotifications: row.EnableNotifications !== false,
    enableEmail: row.EnableEmail !== false,
  }
}

async function sendNotificationNow({ userId, bookingId, orderId, title, body, type = 'info', channel = 'in-app', sendEmail = false, email, skipIfCancelled = false }) {
  const settings = await getUserSettings(userId)
  if (!settings.enableNotifications) return null

  if (skipIfCancelled && bookingId) {
    const b = await query('SELECT Status FROM dbo.Bookings WHERE BookingId=@id', { id: bookingId })
    const status = String(b?.recordset?.[0]?.Status || '').toLowerCase()
    if (status === 'cancelled') return null
  }

  const id = newId()
  await repo.insertNotification({ id, userId, bookingId, orderId, title, body, type, channel, emailSent: sendEmail })

  if (sendEmail && settings.enableEmail && email && mail.canSendMail()) {
    try {
      await mail.sendMail({ to: email, subject: title, text: body })
    } catch {
      // ignore email errors
    }
  }

  return { id, sentAt: new Date() }
}

function scheduleNotification({ when, ...rest }) {
  const ms = when instanceof Date ? when.getTime() - Date.now() : when - Date.now()
  if (!Number.isFinite(ms) || ms <= 0 || ms > 1000 * 60 * 60 * 24 * 3) {
    return sendNotificationNow(rest)
  }
  setTimeout(() => {
    sendNotificationNow(rest).catch(() => {})
  }, ms)
  return null
}

module.exports = {
  getSettings,
  updateSettings,
  listNotifications,
  createNotification,
  markRead,
  // compatibility
  getUserSettings,
  upsertSettings: updateSettings,
  sendNotificationNow,
  scheduleNotification,
}
