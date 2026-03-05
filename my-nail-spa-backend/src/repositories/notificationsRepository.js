const { query } = require('../config/query')

async function getSettingsRow(userId) {
  if (!userId) return null
  const res = await query('SELECT TOP 1 * FROM dbo.NotificationSettings WHERE UserId=@userId', { userId })
  return res.recordset[0] || null
}

async function upsertSettings(userId, { enableNotifications, enableEmail }) {
  await query(
    `MERGE dbo.NotificationSettings AS t
     USING (SELECT @userId AS UserId) AS s ON t.UserId = s.UserId
     WHEN MATCHED THEN UPDATE SET EnableNotifications=@en, EnableEmail=@ee, UpdatedAt=SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT(UserId, EnableNotifications, EnableEmail, CreatedAt, UpdatedAt)
       VALUES(@userId, @en, @ee, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    { userId, en: enableNotifications ? 1 : 0, ee: enableEmail ? 1 : 0 },
  )
  return { enableNotifications: !!enableNotifications, enableEmail: !!enableEmail }
}

async function insertNotification({ id, userId, bookingId, orderId, title, body, type, channel, emailSent }) {
  await query(
    `INSERT INTO dbo.Notifications(NotificationId, UserId, BookingId, OrderId, Title, Body, Type, Channel, IsRead, ScheduledAt, SentAt, EmailSentAt)
     VALUES(@id, @userId, @bookingId, @orderId, @title, @body, @type, @channel, 0, NULL, SYSUTCDATETIME(), CASE WHEN @emailSent=1 THEN SYSUTCDATETIME() ELSE NULL END)`,
    {
      id,
      userId: userId || null,
      bookingId: bookingId || null,
      orderId: orderId || null,
      title,
      body,
      type,
      channel,
      emailSent: emailSent ? 1 : 0,
    },
  )
}

async function getNotificationsForUser(userId, limit = 100) {
  const res = await query('SELECT TOP (@limit) * FROM dbo.Notifications WHERE UserId=@userId ORDER BY CreatedAt DESC', { userId, limit })
  return res.recordset
}

async function markRead(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return
  const placeholders = ids.map((_, idx) => `@id${idx}`).join(',')
  const bind = {}
  ids.forEach((v, idx) => { bind[`id${idx}`] = v })
  const sql = `UPDATE dbo.Notifications SET IsRead=1 WHERE NotificationId IN (${placeholders})`
  await query(sql, bind)
}

module.exports = {
  getSettingsRow,
  upsertSettings,
  insertNotification,
  getNotificationsForUser,
  markRead,
}
