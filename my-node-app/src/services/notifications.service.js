const { query, newId } = require('../config/query')

const schemaState = {
  checked: false,
  bookingsHasCustomerUserId: false,
  bookingsHasUserId: false,
  ordersHasCustomerUserId: false,
  ordersHasUserId: false,
}

function toKey({ scope, userId }) {
  const s = String(scope || 'unknown')
  const safeUser = String(userId || '').trim() || '0'
  return `Notifications:${s}:${safeUser}`
}

function toReadMapKey({ scope, userId }) {
  const s = String(scope || 'unknown')
  const safeUser = String(userId || '').trim() || '0'
  return `NotificationsRead:${s}:${safeUser}`
}

async function columnExists(tableName, columnName) {
  const result = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @t AND COLUMN_NAME = @c`,
    { t: tableName, c: columnName },
  )
  return Boolean(result.recordset?.length)
}

async function ensureNotificationSchemaState() {
  if (schemaState.checked) return schemaState

  schemaState.bookingsHasCustomerUserId = await columnExists('Bookings', 'CustomerUserId')
  schemaState.bookingsHasUserId = await columnExists('Bookings', 'UserId')
  schemaState.ordersHasCustomerUserId = await columnExists('Orders', 'CustomerUserId')
  schemaState.ordersHasUserId = await columnExists('Orders', 'UserId')
  schemaState.checked = true

  return schemaState
}

async function getSettingValue(settingKey) {
  const result = await query(
    'SELECT TOP 1 SettingValue FROM SystemSettings WHERE SettingKey = @k',
    { k: settingKey },
  )
  const row = result?.recordset?.[0]
  return row ? row.SettingValue : null
}

async function setSettingValue(settingKey, value) {
  await query(
    `MERGE SystemSettings AS t
     USING (SELECT @k AS SettingKey, @v AS SettingValue) AS s
     ON t.SettingKey = s.SettingKey
     WHEN MATCHED THEN UPDATE SET SettingValue = s.SettingValue
     WHEN NOT MATCHED THEN INSERT (SettingKey, SettingValue) VALUES (s.SettingKey, s.SettingValue);`,
    { k: settingKey, v: value === undefined || value === null ? null : String(value) },
  )
}

function parseList(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseReadMap(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(String(raw))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

function normalizeNotification(n) {
  if (!n || typeof n !== 'object') return null
  return {
    id: n.id || String(newId()),
    title: String(n.title || ''),
    body: String(n.body || ''),
    type: String(n.type || 'info'),
    createdAt: n.createdAt || new Date().toISOString(),
    read: Boolean(n.read),
    readAt: n.readAt || null,
  }
}

async function listNotifications({ scope, userId } = {}) {
  const key = toKey({ scope, userId })
  const list = parseList(await getSettingValue(key))
  return list.map(normalizeNotification).filter(Boolean)
}

function mapBookingStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'confirmed') return 'Booking confirmed successfully'
  if (value === 'C' || value === 'booked') return 'Appointment is C confirmation'
  if (value === 'completed') return 'Service completed'
  if (value === 'cancelled' || value === 'canceled') return 'Appointment has been cancelled'
  return 'Appointment update'
}

function mapOrderStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'delivered' || value === 'completed') return 'Order placed successfully'
  if (value === 'processing' || value === 'C') return 'Order is being processed'
  if (value === 'shipped' || value === 'shipping') return 'Order is being shipped'
  if (value === 'cancelled' || value === 'canceled') return 'Order has been cancelled'
  return 'Order update'
}

function fmtDateForMessage(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'N/A'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function listCustomerNotifications({ userId, limit = 200, type = 'all' } = {}) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return []

  const schema = await ensureNotificationSchemaState()
  const readMapKey = toReadMapKey({ scope: 'customer', userId: safeUserId })
  const readMap = parseReadMap(await getSettingValue(readMapKey))

  const notifications = []
  const maxLimit = Math.min(Math.max(Number(limit) || 200, 1), 500)

  if (type === 'all' || type === 'booking') {
    const bookingWhereClauses = []
    if (schema.bookingsHasCustomerUserId) bookingWhereClauses.push('b.CustomerUserId = @userId')
    if (schema.bookingsHasUserId) bookingWhereClauses.push('b.UserId = @userId')

    if (bookingWhereClauses.length) {
      const bookingRes = await query(
        `SELECT TOP (@limit)
            b.BookingId,
            b.BookingTime,
            b.Status,
            b.CreatedAt
         FROM Bookings b
         WHERE ${bookingWhereClauses.join(' OR ')}
         ORDER BY COALESCE(b.CreatedAt, b.BookingTime) DESC, b.BookingId DESC`,
        { userId: safeUserId, limit: maxLimit },
      )

      for (const row of bookingRes.recordset || []) {
        const bookingId = String(row.BookingId || '').trim()
        if (!bookingId) continue

        const svcRes = await query(
          `SELECT TOP 10 s.Name
           FROM BookingServices bs
           LEFT JOIN Services s ON s.ServiceId = bs.ServiceId
           WHERE bs.BookingId = @bookingId
           ORDER BY bs.BookingServiceId`,
          { bookingId },
        )

        const serviceNames = (svcRes.recordset || [])
          .map((x) => String(x.Name || '').trim())
          .filter(Boolean)

        const id = `booking-${bookingId}`
        const createdAt = row.CreatedAt || row.BookingTime || new Date().toISOString()
        const message = `Service: ${serviceNames.length ? serviceNames.join(', ') : 'Nail Service'} • Time: ${fmtDateForMessage(row.BookingTime)}`

        notifications.push({
          id,
          type: 'booking',
          title: mapBookingStatus(row.Status),
          message,
          createdAt,
          status: row.Status || 'C',
          read: Boolean(readMap[id]),
        })
      }
    }
  }

  if (type === 'all' || type === 'order') {
    const orderWhereClauses = []
    if (schema.ordersHasUserId) orderWhereClauses.push('o.UserId = @userId')
    if (schema.ordersHasCustomerUserId) orderWhereClauses.push('o.CustomerUserId = @userId')

    if (orderWhereClauses.length) {
      const orderRes = await query(
        `SELECT TOP (@limit)
            o.OrderId,
            o.Status,
            o.CreatedAt
         FROM Orders o
         WHERE ${orderWhereClauses.join(' OR ')}
         ORDER BY o.CreatedAt DESC, o.OrderId DESC`,
        { userId: safeUserId, limit: maxLimit },
      )

      for (const row of orderRes.recordset || []) {
        const orderId = String(row.OrderId || '').trim()
        if (!orderId) continue

        const itemRes = await query(
          `SELECT
              oi.Quantity,
              COALESCE(oi.ProductName, p.Name) AS ProductName
           FROM OrderItems oi
           LEFT JOIN Products p ON p.ProductId = oi.ProductId
           WHERE oi.OrderId = @orderId
           ORDER BY oi.OrderItemId`,
          { orderId },
        )

        const items = itemRes.recordset || []
        const productNames = items
          .map((x) => String(x.ProductName || '').trim())
          .filter(Boolean)
        const itemCount = items.reduce((sum, x) => sum + Number(x.Quantity || 0), 0)

        const id = `order-${orderId}`
        const productText = productNames.slice(0, 2).join(', ')
        const message = `${itemCount} products${productText ? ` • ${productText}${productNames.length > 2 ? '...' : ''}` : ''}`

        notifications.push({
          id,
          type: 'order',
          title: mapOrderStatus(row.Status),
          message,
          createdAt: row.CreatedAt || new Date().toISOString(),
          status: row.Status || 'C',
          read: Boolean(readMap[id]),
        })
      }
    }
  }

  return notifications
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, maxLimit)
}

async function setCustomerNotificationRead({ userId, notificationId, read = true } = {}) {
  const safeUserId = String(userId || '').trim()
  const safeNotificationId = String(notificationId || '').trim()
  if (!safeUserId || !safeNotificationId) {
    const err = new Error('Missing userId or notificationId')
    err.status = 400
    throw err
  }

  const key = toReadMapKey({ scope: 'customer', userId: safeUserId })
  const readMap = parseReadMap(await getSettingValue(key))
  if (read) readMap[safeNotificationId] = true
  else delete readMap[safeNotificationId]

  await setSettingValue(key, JSON.stringify(readMap))
  return { notificationId: safeNotificationId, read: Boolean(read) }
}

async function markAllCustomerNotificationsRead({ userId } = {}) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return { updated: 0 }

  const list = await listCustomerNotifications({ userId: safeUserId, limit: 500, type: 'all' })
  const key = toReadMapKey({ scope: 'customer', userId: safeUserId })
  const readMap = parseReadMap(await getSettingValue(key))
  let updated = 0

  for (const item of list) {
    if (!item || !item.id) continue
    if (!readMap[item.id]) {
      readMap[item.id] = true
      updated += 1
    }
  }

  await setSettingValue(key, JSON.stringify(readMap))
  return { updated }
}

async function markAllRead({ scope, userId } = {}) {
  const key = toKey({ scope, userId })
  const list = parseList(await getSettingValue(key))
  const now = new Date().toISOString()
  let updated = 0
  const next = list
    .map(normalizeNotification)
    .filter(Boolean)
    .map((n) => {
      if (n.read) return n
      updated += 1
      return { ...n, read: true, readAt: now }
    })

  await setSettingValue(key, JSON.stringify(next))
  return { updated }
}

async function createNotification({ scope, userId, title, body, type } = {}) {
  const key = toKey({ scope, userId })
  const list = parseList(await getSettingValue(key))

  const item = normalizeNotification({
    id: String(newId()),
    title,
    body,
    type,
    createdAt: new Date().toISOString(),
    read: false,
    readAt: null,
  })

  const next = [item, ...list].slice(0, 50)
  await setSettingValue(key, JSON.stringify(next))
  return item
}

module.exports = {
  listNotifications,
  markAllRead,
  createNotification,
  listCustomerNotifications,
  setCustomerNotificationRead,
  markAllCustomerNotificationsRead,
}
