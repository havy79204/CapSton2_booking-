const { query, newId } = require('../config/query')
const { sendEmail } = require('./email.service')
const { emitOwnerNotification } = require('../realtime/socket')

const schemaState = {
  checked: false,
  bookingsHasCustomerUserId: false,
  bookingsHasUserId: false,
  ordersHasCustomerUserId: false,
  ordersHasUserId: false,
}

const notificationsTableState = {
  checked: false,
  exists: false,
}

const notificationSettingsTableState = {
  checked: false,
  exists: false,
}

const OWNER_MORNING_INSIGHT_LAST_RUN_KEY = 'Notifications:OwnerMorningInsights:LastRunDate'
const OWNER_NOTIFY_SETTING_KEYS = ['NotifyNewAppt', 'NotifyLowStock', 'NotifyNewReview', 'NotifyDailyReport']

function toKey({ scope, userId }) {
  const s = String(scope || 'unknown')
  const safeUser = String(userId || '').trim() || '0'
  return `Notifications:${s}:${safeUser}`
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

async function tableExists(tableName) {
  const result = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = @t`,
    { t: tableName },
  )
  return Boolean(result.recordset?.length)
}

async function firstExistingTable(candidates = []) {
  for (const name of candidates) {
    const tableName = String(name || '').trim()
    if (!tableName) continue
    try {
      if (await tableExists(tableName)) return tableName
    } catch {
      // Keep probing next candidates.
    }
  }
  return ''
}

async function firstExistingColumn(tableName, candidates = []) {
  const safeTable = String(tableName || '').trim()
  if (!safeTable) return ''

  for (const col of candidates) {
    const columnName = String(col || '').trim()
    if (!columnName) continue
    try {
      if (await columnExists(safeTable, columnName)) return columnName
    } catch {
      // Keep probing next candidates.
    }
  }

  return ''
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

async function getOwnerNotificationToggleMap() {
  const res = await query(
    `SELECT SettingKey, SettingValue
     FROM SystemSettings
     WHERE SettingKey IN ('NotifyNewAppt', 'NotifyLowStock', 'NotifyNewReview', 'NotifyDailyReport')`,
    {},
  )

  const defaults = {
    NotifyNewAppt: true,
    NotifyLowStock: true,
    NotifyNewReview: true,
    NotifyDailyReport: false,
  }

  const map = { ...defaults }
  for (const row of res.recordset || []) {
    const key = String(row?.SettingKey || '').trim()
    if (!OWNER_NOTIFY_SETTING_KEYS.includes(key)) continue
    map[key] = parseDbBoolean(row?.SettingValue, defaults[key])
  }

  return map
}

function shouldDispatchOwnerEventBySettings(eventKey, toggles) {
  const key = String(eventKey || '').trim().toLowerCase()
  if (!key) return true

  if (key === 'booking_new') return Boolean(toggles?.NotifyNewAppt)
  if (key.startsWith('inventory_')) return Boolean(toggles?.NotifyLowStock)
  if (key === 'customer_new_review' || key === 'customer_low_review') return Boolean(toggles?.NotifyNewReview)
  if (key === 'revenue_report_daily') return Boolean(toggles?.NotifyDailyReport)

  return true
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

function normalizeNotification(n) {
  if (!n || typeof n !== 'object') return null
  return {
    id: n.id || String(newId()),
    title: String(n.title || ''),
    body: String(n.body || ''),
    type: String(n.type || 'info'),
    category: String(n.category || 'general'),
    severity: String(n.severity || 'info'),
    createdAt: n.createdAt || new Date().toISOString(),
    read: Boolean(n.read),
    readAt: n.readAt || null,
  }
}

async function ensureNotificationsTableState() {
  if (notificationsTableState.checked) return notificationsTableState

  const result = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'Notifications'`,
    {}
  )

  notificationsTableState.exists = Boolean(result.recordset?.length)
  notificationsTableState.checked = true
  return notificationsTableState
}

async function ensureNotificationSettingsTableState() {
  if (notificationSettingsTableState.checked) return notificationSettingsTableState

  const result = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'NotificationSettings'`,
    {},
  )

  notificationSettingsTableState.exists = Boolean(result.recordset?.length)
  notificationSettingsTableState.checked = true
  return notificationSettingsTableState
}

function parseDbBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const s = String(value).trim().toLowerCase()
  if (!s) return fallback
  return ['true', '1', 'yes', 'y', 'on'].includes(s)
}

async function getUserNotificationPreferences(userId) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) {
    return { enableNotifications: true, enableEmail: true }
  }

  const state = await ensureNotificationSettingsTableState()
  if (!state.exists) {
    return { enableNotifications: true, enableEmail: true }
  }

  const res = await query(
    `SELECT TOP 1
        EnableNotifications,
        EnableEmail
     FROM NotificationSettings
     WHERE UserId = @userId
     ORDER BY UpdatedAt DESC, CreatedAt DESC`,
    { userId: safeUserId },
  )

  const row = res.recordset?.[0] || null
  if (!row) {
    return { enableNotifications: true, enableEmail: true }
  }

  return {
    enableNotifications: parseDbBoolean(row.EnableNotifications, true),
    enableEmail: parseDbBoolean(row.EnableEmail, true),
  }
}

function resolveNotificationType(row) {
  const rawType = String(row?.Type || '').trim().toLowerCase()
  if (rawType === 'booking' || rawType.includes('booking')) return 'booking'
  if (rawType === 'order' || rawType.includes('order')) return 'order'
  if (rawType === 'payment' || rawType.includes('payment') || rawType.includes('refund')) return 'payment'
  if (rawType === 'service' || rawType.includes('service')) return 'service'
  if (rawType === 'product' || rawType.includes('product') || rawType.includes('wishlist')) return 'product'
  if (rawType === 'post_service' || rawType.includes('feedback') || rawType.includes('reward')) return 'post_service'
  if (row?.BookingId) return 'booking'
  if (row?.OrderId) return 'order'
  return rawType || 'info'
}

function resolveOwnerCategory(row) {
  const rawType = String(row?.Type || '').trim().toLowerCase()
  const rawChannel = String(row?.Channel || '').trim().toLowerCase()

  if (['operations', 'revenue', 'inventory', 'hr'].includes(rawType)) return rawType
  if (['operations', 'revenue', 'inventory', 'hr'].includes(rawChannel)) return rawChannel
  if (rawType.includes('revenue')) return 'revenue'
  if (rawType.includes('stock') || rawType.includes('inventory')) return 'inventory'
  if (rawType.includes('staff') || rawType.includes('hr')) return 'hr'
  if (rawType.includes('booking') || rawType.includes('order')) return 'operations'
  return 'general'
}

function mapDbNotificationRow(row, { scope = 'customer' } = {}) {
  const createdAt = row?.CreatedAt || row?.UpdatedAt || new Date().toISOString()
  const title = String(row?.Title || '').trim() || 'Notification'
  const body = String(row?.Body || row?.Content || '').trim()
  const type = resolveNotificationType(row)
  const category = scope === 'owner' ? resolveOwnerCategory(row) : type
  const severityRaw = String(row?.Channel || '').trim().toLowerCase()
  const severity = ['info', 'success', 'warning', 'error'].includes(severityRaw) ? severityRaw : 'info'

  return {
    id: String(row?.NotificationId || newId()),
    title,
    body,
    message: body,
    content: body,
    type,
    category,
    severity,
    status: String(row?.Type || '').trim() || null,
    createdAt,
    updatedAt: row?.UpdatedAt || null,
    read: Boolean(row?.IsRead),
    bookingId: row?.BookingId || null,
    orderId: row?.OrderId || null,
    channel: row?.Channel || null,
  }
}

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function startOfDay(value = new Date()) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + Number(days || 0))
  return d
}

async function safeQuery(sqlText, bind, fallbackRecord = {}) {
  try {
    return await query(sqlText, bind)
  } catch {
    return { recordset: [fallbackRecord] }
  }
}

async function getRevenueSum({ fromIso, toIso }) {
  const [bookingRevenueRes, orderRevenueRes] = await Promise.all([
    safeQuery(
      `SELECT SUM(ISNULL(sv.Price, 0)) AS Revenue
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       WHERE CAST(b.BookingTime AS date) BETWEEN @fromDate AND @toDate
         AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')`,
      { fromDate: fromIso, toDate: toIso },
      { Revenue: 0 }
    ),
    safeQuery(
      `SELECT SUM(ISNULL(o.Total, 0)) AS Revenue
       FROM Orders o
       WHERE o.CreatedAt IS NOT NULL
         AND CAST(o.CreatedAt AS date) BETWEEN @fromDate AND @toDate
         AND LOWER(LTRIM(RTRIM(COALESCE(o.Status, '')))) IN ('completed', 'complete', 'done')`,
      { fromDate: fromIso, toDate: toIso },
      { Revenue: 0 }
    ),
  ])

  const bookingRevenue = Number(bookingRevenueRes.recordset?.[0]?.Revenue || 0)
  const orderRevenue = Number(orderRevenueRes.recordset?.[0]?.Revenue || 0)
  return bookingRevenue + orderRevenue
}

function fmtVnd(value) {
  const amount = Number(value || 0)
  return amount.toLocaleString('vi-VN')
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmailSubject(rawSubject) {
  const core = String(rawSubject || 'Thong bao').trim()
  return `[Nail Salon] ${core}`
}

function toViPriorityLabel(priority) {
  const p = String(priority || '').trim().toLowerCase()
  if (p === 'high') return 'Cao'
  if (p === 'medium') return 'Trung binh'
  if (p === 'low') return 'Thap'
  return 'Trung binh'
}

function toViCategoryLabel(category) {
  const c = String(category || '').trim().toLowerCase()
  if (c === 'operations') return 'Van hanh'
  if (c === 'revenue') return 'Doanh thu'
  if (c === 'inventory') return 'Ton kho'
  if (c === 'hr') return 'Nhan su'
  return 'Tong hop'
}

function buildProfessionalEmailContent({
  title,
  message,
  audience = 'customer',
  metadataLines = [],
} = {}) {
  const safeTitle = String(title || 'Thong bao').trim() || 'Thong bao'
  const safeMessage = String(message || '').trim() || 'He thong vua ghi nhan mot cap nhat moi.'
  const intro = audience === 'owner'
    ? 'Kinh gui Chu tiem,'
    : 'Kinh gui Quy khach,'
  const outro = audience === 'owner'
    ? 'Vui long dang nhap he thong de xem chi tiet va xu ly kip thoi.'
    : 'Vui long mo ung dung de xem chi tiet cap nhat.'

  const plainMeta = Array.isArray(metadataLines)
    ? metadataLines.map((x) => String(x || '').trim()).filter(Boolean)
    : []

  const text = [
    intro,
    '',
    safeTitle,
    safeMessage,
    ...(plainMeta.length ? ['', ...plainMeta] : []),
    '',
    outro,
    '',
    'Tran trong,',
    'Nail Salon Service',
  ].join('\n')

  const htmlMeta = plainMeta.length
    ? `<ul style="margin:12px 0 0;padding-left:18px;color:#334155;">${plainMeta.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
    : ''

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:640px;">
      <p>${escapeHtml(intro)}</p>
      <h3 style="margin:8px 0 6px;color:#0f172a;">${escapeHtml(safeTitle)}</h3>
      <p style="margin:0;color:#334155;">${escapeHtml(safeMessage)}</p>
      ${htmlMeta}
      <p style="margin-top:14px;color:#334155;">${escapeHtml(outro)}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
      <p style="margin:0;color:#64748b;font-size:12px;">Tran trong,<br/>Nail Salon Notification Service</p>
    </div>
  `.trim()

  return { text, html }
}

function runInBackground(task, label = 'background-task') {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        console.warn(`[notifications] ${label} failed:`, err?.message || err)
      })
  })
}

function startOfWeek(value = new Date()) {
  const d = startOfDay(value)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d
}

function startOfMonth(value = new Date()) {
  const d = startOfDay(value)
  d.setDate(1)
  return d
}

function toLocalDateKey(value = new Date()) {
  const d = new Date(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function isOwnerMorningInsightDue(now = new Date()) {
  const d = new Date(now)
  if (Number.isNaN(d.getTime())) return false
  if (d.getHours() < 6) return false

  const todayKey = toLocalDateKey(d)
  const lastRunDate = String(await getSettingValue(OWNER_MORNING_INSIGHT_LAST_RUN_KEY) || '').trim()
  return lastRunDate !== todayKey
}

async function markOwnerMorningInsightRun(now = new Date()) {
  await setSettingValue(OWNER_MORNING_INSIGHT_LAST_RUN_KEY, toLocalDateKey(now))
}

function shouldEmailOwnerPriority(priority) {
  const p = String(priority || '').trim().toLowerCase()
  if (p === 'high') return true
  return false
}

function formatOwnerDateTime(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function resolveOwnerActorLabel(eventKey, payload = {}) {
  const explicit = [
    payload.actorName,
    payload.performedBy,
    payload.changedBy,
    payload.customerName,
    payload.staffName,
  ].map((x) => String(x || '').trim()).find(Boolean)
  if (explicit) return explicit

  const role = String(payload.actorRole || '').trim().toLowerCase()
  if (role === 'customer') return 'Customer'
  if (role === 'staff') return 'Staff'
  if (role === 'owner' || role === 'admin') return 'Owner/Admin'

  const key = String(eventKey || '').trim().toLowerCase()
  if (key.startsWith('booking_')) {
    if (key === 'booking_new') return 'Customer'
    if (key === 'booking_cancelled' || key === 'booking_rescheduled') return 'Customer/Staff'
  }
  if (key.startsWith('order_') || key.startsWith('payment_')) return 'Customer/System'

  return 'System'
}

function buildOwnerBodyWithContext(baseBody, { eventKey, bookingId, orderId, payload = {} } = {}) {
  const lines = []
  const actorLabel = resolveOwnerActorLabel(eventKey, payload)
  if (actorLabel) lines.push(`Actor: ${actorLabel}`)

  const eventTime = payload.bookingTime
    || payload.eventTime
    || payload.occurredAt
    || payload.createdAt
    || payload.updatedAt
    || null
  const formattedTime = formatOwnerDateTime(eventTime)
  if (formattedTime) lines.push(`Time: ${formattedTime}`)

  const safeBookingId = String(bookingId || payload.bookingId || '').trim()
  if (safeBookingId) lines.push(`Booking ID: ${safeBookingId}`)

  const safeOrderId = String(orderId || payload.orderId || '').trim()
  if (safeOrderId) lines.push(`Order ID: ${safeOrderId}`)

  const metadata = lines.length ? ` Details: ${lines.join(' | ')}` : ''
  return `${String(baseBody || '').trim()}${metadata}`.trim()
}

async function listOwnerUsers(limit = 50) {
  const maxLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const res = await query(
    `SELECT TOP (@limit)
        UserId,
        Email,
        Name,
        RoleKey
     FROM Users
     WHERE UserId IS NOT NULL
       AND LOWER(LTRIM(RTRIM(ISNULL(RoleKey, '')))) IN ('owner', 'admin', '1')
       AND (
         Status IS NULL
         OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'inactive', 'disabled', 'banned')
       )
     ORDER BY CreatedAt DESC, UserId DESC`,
    { limit: maxLimit },
  )

  return (res.recordset || []).map((x) => ({
    userId: String(x.UserId || '').trim(),
    email: String(x.Email || '').trim(),
    name: String(x.Name || '').trim(),
    roleKey: String(x.RoleKey || '').trim(),
  })).filter((x) => x.userId)
}

function buildOwnerEventTemplate(eventKey, payload = {}) {
  const bookingId = String(payload.bookingId || '').trim()
  const orderId = String(payload.orderId || '').trim()
  const staffName = String(payload.staffName || '').trim()
  const reason = String(payload.reason || '').trim()

  const map = {
    booking_new: {
      title: 'New booking request',
      body: bookingId ? `A new booking was created: ${bookingId}.` : 'A new booking was created.',
      category: 'operations',
      severity: 'info',
      priority: 'high',
      typeKey: 'operations.booking_new',
      subject: 'Owner Alert: New Booking',
    },
    booking_cancelled: {
      title: 'Booking cancelled',
      body: bookingId ? `A booking was cancelled: ${bookingId}.` : 'A booking was cancelled by customer/staff.',
      category: 'operations',
      severity: 'warning',
      priority: 'high',
      typeKey: 'operations.booking_cancelled',
      subject: 'Owner Alert: Booking Cancelled',
    },
    booking_rescheduled: {
      title: 'Booking rescheduled',
      body: bookingId ? `A booking was rescheduled: ${bookingId}.` : 'A booking was rescheduled.',
      category: 'operations',
      severity: 'warning',
      priority: 'high',
      typeKey: 'operations.booking_rescheduled',
      subject: 'Owner Alert: Booking Rescheduled',
    },
    booking_unassigned: {
      title: 'Booking has no staff assigned',
      body: bookingId ? `Booking ${bookingId} has no assigned specialist.` : 'A booking has no assigned specialist.',
      category: 'operations',
      severity: 'warning',
      priority: 'high',
      typeKey: 'operations.booking_unassigned',
      subject: 'Owner Alert: Unassigned Booking',
    },
    booking_conflict: {
      title: 'Booking conflict detected',
      body: reason || 'A booking conflict was detected (overlap or duplicate slot).',
      category: 'operations',
      severity: 'error',
      priority: 'high',
      typeKey: 'operations.booking_conflict',
      subject: 'Owner Alert: Booking Conflict',
    },
    booking_rejected: {
      title: 'Booking rejected',
      body: reason || 'A booking was rejected due to full capacity or outside working hours.',
      category: 'operations',
      severity: 'warning',
      priority: 'high',
      typeKey: 'operations.booking_rejected',
      subject: 'Owner Alert: Booking Rejected',
    },
    booking_idle_slots: {
      title: 'Many empty booking slots today',
      body: payload.body || 'Today has many empty slots. Consider running a promotion campaign.',
      category: 'operations',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'operations.booking_idle_slots',
      subject: 'Owner Advisory: Empty Slots Today',
    },
    staff_shift_registered: {
      title: 'Staff shift registration update',
      body: payload.body || 'A staff shift registration was submitted.',
      category: 'hr',
      severity: 'info',
      priority: 'medium',
      typeKey: 'hr.staff_shift_registered',
      subject: 'Owner HR Update: Shift Registration',
    },
    staff_shift_changed: {
      title: 'Staff shift changed',
      body: payload.body || 'A staff shift was changed or canceled.',
      category: 'hr',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'hr.staff_shift_changed',
      subject: 'Owner HR Alert: Shift Changed',
    },
    staff_late_or_no_checkin: {
      title: 'Staff late/no check-in',
      body: payload.body || 'A staff member is late or has not checked in.',
      category: 'hr',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'hr.staff_late_or_no_checkin',
      subject: 'Owner HR Alert: Late/No Check-in',
    },
    staff_leave_exceed_days: {
      title: 'Staff leave exceeds threshold',
      body: payload.body || 'A staff member has exceeded the allowed leave-off threshold.',
      category: 'hr',
      severity: 'warning',
      priority: 'high',
      typeKey: 'hr.staff_leave_exceed_days',
      subject: 'Owner HR Alert: Excessive Leave Days',
    },
    staff_overload: {
      title: 'Staff booking overload',
      body: payload.body || 'A staff member has too many bookings.',
      category: 'hr',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'hr.staff_overload',
      subject: 'Owner HR Alert: Staff Overload',
    },
    staff_assignment_changed: {
      title: 'Staff assignment update',
      body: payload.body || 'Staff assignment changed for customer bookings.',
      category: 'hr',
      severity: 'info',
      priority: 'medium',
      typeKey: 'hr.staff_assignment_changed',
      subject: 'Owner HR Update: Assignment Change',
    },
    staff_low_rating: {
      title: 'Staff low rating alert',
      body: payload.body || 'A staff member has low average rating.',
      category: 'hr',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'hr.staff_low_rating',
      subject: 'Owner HR Alert: Low Staff Rating',
    },
    order_new: {
      title: 'New order received',
      body: orderId ? `A new order was placed: ${orderId}.` : 'A new order was placed.',
      category: 'operations',
      severity: 'info',
      priority: 'high',
      typeKey: 'operations.order_new',
      subject: 'Owner Alert: New Order',
    },
    order_cancelled: {
      title: 'Order cancelled',
      body: orderId ? `Order cancelled: ${orderId}.` : 'An order was cancelled.',
      category: 'operations',
      severity: 'warning',
      priority: 'high',
      typeKey: 'operations.order_cancelled',
      subject: 'Owner Alert: Order Cancelled',
    },
    order_failed: {
      title: 'Order failed',
      body: orderId ? `Order failed: ${orderId}.` : 'An order processing failed.',
      category: 'operations',
      severity: 'error',
      priority: 'high',
      typeKey: 'operations.order_failed',
      subject: 'Owner Alert: Order Failed',
    },
    order_processing: {
      title: 'Order processing',
      body: orderId ? `Order is processing: ${orderId}.` : 'An order is processing.',
      category: 'operations',
      severity: 'info',
      priority: 'medium',
      typeKey: 'operations.order_processing',
      subject: 'Owner Update: Order Processing',
    },
    order_shipping: {
      title: 'Order shipping',
      body: orderId ? `Order is shipping: ${orderId}.` : 'An order is shipping.',
      category: 'operations',
      severity: 'info',
      priority: 'medium',
      typeKey: 'operations.order_shipping',
      subject: 'Owner Update: Order Shipping',
    },
    order_delivered: {
      title: 'Order delivered',
      body: orderId ? `Order delivered successfully: ${orderId}.` : 'An order was delivered successfully.',
      category: 'operations',
      severity: 'success',
      priority: 'medium',
      typeKey: 'operations.order_delivered',
      subject: 'Owner Update: Order Delivered',
    },
    order_delivery_failed: {
      title: 'Order delivery failed',
      body: orderId ? `Delivery failed for order: ${orderId}.` : 'An order delivery failed.',
      category: 'operations',
      severity: 'error',
      priority: 'high',
      typeKey: 'operations.order_delivery_failed',
      subject: 'Owner Alert: Delivery Failed',
    },
    payment_success: {
      title: 'Payment successful',
      body: orderId ? `Payment successful for order: ${orderId}.` : 'A payment was completed successfully.',
      category: 'revenue',
      severity: 'success',
      priority: 'high',
      typeKey: 'revenue.payment_success',
      subject: 'Owner Revenue: Payment Successful',
    },
    payment_failed: {
      title: 'Payment failed',
      body: orderId ? `Payment failed for order: ${orderId}.` : 'A payment transaction failed.',
      category: 'revenue',
      severity: 'error',
      priority: 'high',
      typeKey: 'revenue.payment_failed',
      subject: 'Owner Revenue Alert: Payment Failed',
    },
    payment_pending: {
      title: 'Payment pending',
      body: orderId ? `Payment is pending for order: ${orderId}.` : 'A payment is pending.',
      category: 'revenue',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'revenue.payment_pending',
      subject: 'Owner Revenue Update: Payment Pending',
    },
    payment_refund: {
      title: 'Refund processed',
      body: orderId ? `Refund processed for order: ${orderId}.` : 'A refund has been processed.',
      category: 'revenue',
      severity: 'warning',
      priority: 'high',
      typeKey: 'revenue.payment_refund',
      subject: 'Owner Revenue Alert: Refund Processed',
    },
    revenue_report_daily: {
      title: 'Daily revenue report',
      body: payload.body || 'Daily revenue summary is ready.',
      category: 'revenue',
      severity: 'info',
      priority: 'medium',
      typeKey: 'revenue.report_daily',
      subject: 'Owner Report: Daily Revenue',
    },
    revenue_report_weekly: {
      title: 'Weekly revenue report',
      body: payload.body || 'Weekly revenue summary is ready.',
      category: 'revenue',
      severity: 'info',
      priority: 'medium',
      typeKey: 'revenue.report_weekly',
      subject: 'Owner Report: Weekly Revenue',
    },
    revenue_report_monthly: {
      title: 'Monthly revenue report',
      body: payload.body || 'Monthly revenue summary is ready.',
      category: 'revenue',
      severity: 'info',
      priority: 'medium',
      typeKey: 'revenue.report_monthly',
      subject: 'Owner Report: Monthly Revenue',
    },
    revenue_compare_prev_period: {
      title: 'Revenue period comparison',
      body: payload.body || 'Revenue comparison with previous period is ready.',
      category: 'revenue',
      severity: 'info',
      priority: 'medium',
      typeKey: 'revenue.compare_prev_period',
      subject: 'Owner Report: Revenue Comparison',
    },
    revenue_drop: {
      title: 'Revenue drop alert',
      body: payload.body || 'Revenue dropped significantly compared with previous period.',
      category: 'revenue',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'revenue.drop_alert',
      subject: 'Owner Revenue Alert: Revenue Drop',
    },
    revenue_spike: {
      title: 'Revenue spike alert',
      body: payload.body || 'Revenue increased unusually compared with previous period.',
      category: 'revenue',
      severity: 'info',
      priority: 'medium',
      typeKey: 'revenue.spike_alert',
      subject: 'Owner Revenue Alert: Revenue Spike',
    },
    top_services_products: {
      title: 'Top selling highlights',
      body: payload.body || 'Top services/products report is ready.',
      category: 'revenue',
      severity: 'info',
      priority: 'medium',
      typeKey: 'revenue.top_selling',
      subject: 'Owner Insight: Top Selling Items',
    },
    inventory_low_stock: {
      title: 'Low stock warning',
      body: payload.body || 'Some inventory items are running low.',
      category: 'inventory',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'inventory.low_stock',
      subject: 'Owner Inventory Alert: Low Stock',
    },
    inventory_out_of_stock: {
      title: 'Out of stock alert',
      body: payload.body || 'Some inventory items are out of stock.',
      category: 'inventory',
      severity: 'error',
      priority: 'high',
      typeKey: 'inventory.out_of_stock',
      subject: 'Owner Inventory Alert: Out Of Stock',
    },
    inventory_high_stock: {
      title: 'High stock warning',
      body: payload.body || 'Some inventory levels are unusually high.',
      category: 'inventory',
      severity: 'info',
      priority: 'medium',
      typeKey: 'inventory.high_stock',
      subject: 'Owner Inventory Insight: High Stock',
    },
    inventory_restock_success: {
      title: 'Restock completed',
      body: payload.body || 'A restock operation completed successfully.',
      category: 'inventory',
      severity: 'success',
      priority: 'medium',
      typeKey: 'inventory.restock_success',
      subject: 'Owner Inventory Update: Restock Completed',
    },
    inventory_insufficient_tomorrow_booking: {
      title: 'Insufficient inventory for tomorrow bookings',
      body: payload.body || 'Inventory may not be enough for tomorrow booking demand.',
      category: 'inventory',
      severity: 'warning',
      priority: 'high',
      typeKey: 'inventory.insufficient_tomorrow_booking',
      subject: 'Owner Inventory Alert: Tomorrow Shortage Risk',
    },
    customer_new_review: {
      title: 'New customer review',
      body: payload.body || 'A new customer review has been submitted.',
      category: 'operations',
      severity: 'info',
      priority: 'medium',
      typeKey: 'operations.customer_review_new',
      subject: 'Owner Customer Update: New Review',
    },
    customer_low_review: {
      title: 'Low rating review alert',
      body: payload.body || 'A low rating review requires attention.',
      category: 'operations',
      severity: 'warning',
      priority: 'high',
      typeKey: 'operations.customer_review_low',
      subject: 'Owner Alert: Low Rating Review',
    },
    customer_vip_returned: {
      title: 'VIP customers returned',
      body: payload.body || 'VIP customers have returned after a long inactive period.',
      category: 'operations',
      severity: 'success',
      priority: 'high',
      typeKey: 'operations.customer_vip_returned',
      subject: 'Owner Customer Insight: VIP Return',
    },
    customer_lapsed: {
      title: 'Lapsed customer alert',
      body: payload.body || 'Several customers have not returned for a long time.',
      category: 'operations',
      severity: 'warning',
      priority: 'medium',
      typeKey: 'operations.customer_lapsed',
      subject: 'Owner Customer Alert: Lapsed Customers',
    },
    campaign_effective: {
      title: 'Campaign performing well',
      body: payload.body || 'A promotion campaign is performing effectively.',
      category: 'operations',
      severity: 'success',
      priority: 'medium',
      typeKey: 'operations.campaign_effective',
      subject: 'Owner Marketing Insight: Campaign Effective',
    },
    ai_upsell_opportunity: {
      title: 'AI upsell opportunity',
      body: payload.body || 'AI detected an upsell opportunity from customer behavior.',
      category: 'operations',
      severity: 'info',
      priority: 'low',
      typeKey: 'operations.ai_upsell_opportunity',
      subject: 'Owner Suggestion: AI Upsell Opportunity',
    },
    marketing_suggestion: {
      title: 'Marketing suggestion',
      body: payload.body || 'AI suggests a promotion/combo to boost bookings.',
      category: 'operations',
      severity: 'info',
      priority: 'low',
      typeKey: 'operations.marketing_suggestion',
      subject: 'Owner Suggestion: Marketing Idea',
    },
    system_error: {
      title: 'System error detected',
      body: reason || payload.body || 'A system/API error occurred and needs attention.',
      category: 'operations',
      severity: 'error',
      priority: 'high',
      typeKey: 'operations.system_error',
      subject: 'Owner System Alert: Error',
    },
    system_maintenance: {
      title: 'System maintenance update',
      body: payload.body || 'System maintenance/backup update available.',
      category: 'operations',
      severity: 'info',
      priority: 'low',
      typeKey: 'operations.system_maintenance',
      subject: 'Owner System Update',
    },
  }

  const selected = map[eventKey] || {
    title: 'Owner notification',
    body: payload.body || 'You have a new owner notification.',
    category: 'operations',
    severity: 'info',
    priority: 'medium',
    typeKey: `operations.${eventKey || 'update'}`,
    subject: 'Owner Notification',
  }

  return selected
}

function buildOwnerEmailTemplateVi(eventKey, payload = {}, fallback = {}) {
  const bookingId = String(payload.bookingId || '').trim()
  const orderId = String(payload.orderId || '').trim()

  const map = {
    booking_new: {
      subject: 'Phat sinh lich hen moi',
      title: 'Phat sinh lich hen moi',
      body: bookingId ? `He thong vua ghi nhan lich hen moi: ${bookingId}.` : 'He thong vua ghi nhan mot lich hen moi.',
    },
    booking_cancelled: {
      subject: 'Lich hen da bi huy',
      title: 'Cap nhat huy lich hen',
      body: bookingId ? `Lich hen ${bookingId} da duoc huy.` : 'Co lich hen vua duoc huy.',
    },
    booking_rescheduled: {
      subject: 'Lich hen da doi gio',
      title: 'Cap nhat doi lich hen',
      body: bookingId ? `Lich hen ${bookingId} vua duoc doi thoi gian.` : 'Co lich hen vua duoc doi thoi gian.',
    },
    booking_unassigned: {
      subject: 'Lich hen chua co nhan vien phu trach',
      title: 'Can phan cong nhan vien',
      body: bookingId ? `Lich hen ${bookingId} hien chua co nhan vien phu trach.` : 'Co lich hen chua duoc phan cong nhan vien.',
    },
    booking_conflict: {
      subject: 'Canh bao trung lich hen',
      title: 'Canh bao trung lich',
      body: 'He thong phat hien xung dot lich hen (trung khung gio hoac trung tai nguyen).',
    },
    booking_rejected: {
      subject: 'Thong bao tu choi lich hen',
      title: 'Lich hen bi tu choi',
      body: 'Yeu cau dat lich bi tu choi do khong du dieu kien phuc vu.',
    },
    booking_idle_slots: {
      subject: 'Thong bao khung gio trong',
      title: 'Lich hen trong ngay con trong',
      body: 'Lich hen trong ngay hien con nhieu khung gio trong. Nen can nhac chuong trinh uu dai de tang dat lich.',
    },
    staff_shift_registered: {
      subject: 'Cap nhat dang ky ca lam',
      title: 'Nhan vien vua cap nhat ca lam',
      body: 'He thong da ghi nhan dang ky cap nhat ca lam cua nhan vien.',
    },
    staff_shift_changed: {
      subject: 'Thong bao thay doi ca lam',
      title: 'Ca lam cua nhan vien da thay doi',
      body: 'Co thay doi hoac huy ca lam cua nhan vien can duoc theo doi.',
    },
    staff_late_or_no_checkin: {
      subject: 'Canh bao cham gio hoac chua check-in',
      title: 'Bat thuong cham cong nhan vien',
      body: 'He thong phat hien nhan vien den muon hoac chua check-in.',
    },
    staff_leave_exceed_days: {
      subject: 'Canh bao nghi phep vuot nguong',
      title: 'Nhan vien nghi phep nhieu ngay',
      body: 'Co nhan vien nghi phep vuot nguong cho phep trong chu ky theo doi.',
    },
    staff_overload: {
      subject: 'Canh bao qua tai lich cua nhan vien',
      title: 'Nhan vien dang qua tai',
      body: 'Co nhan vien dang co so luong lich hen qua cao.',
    },
    staff_assignment_changed: {
      subject: 'Cap nhat phan cong nhan vien',
      title: 'Phan cong nhan vien da thay doi',
      body: 'He thong da ghi nhan thay doi phan cong nhan vien cho lich hen.',
    },
    staff_low_rating: {
      subject: 'Canh bao danh gia nhan vien thap',
      title: 'Chat luong phuc vu can duoc theo doi',
      body: 'Co nhan vien co diem danh gia trung binh thap hon muc ky vong.',
    },
    order_new: {
      subject: 'Don hang moi can xu ly',
      title: 'Phat sinh don hang moi',
      body: orderId ? `Don hang moi da duoc tao: ${orderId}.` : 'He thong vua ghi nhan mot don hang moi.',
    },
    order_cancelled: {
      subject: 'Don hang da bi huy',
      title: 'Cap nhat huy don hang',
      body: orderId ? `Don hang ${orderId} da duoc huy.` : 'Co don hang vua duoc huy.',
    },
    order_failed: {
      subject: 'Canh bao loi xu ly don hang',
      title: 'Loi xu ly don hang',
      body: orderId ? `Don hang ${orderId} gap loi trong qua trinh xu ly.` : 'Co don hang gap loi trong qua trinh xu ly.',
    },
    order_processing: {
      subject: 'Cap nhat don hang dang xu ly',
      title: 'Don hang dang trong qua trinh xu ly',
      body: orderId ? `Don hang ${orderId} dang duoc xu ly.` : 'Co don hang dang duoc xu ly.',
    },
    order_shipping: {
      subject: 'Cap nhat don hang dang giao',
      title: 'Don hang dang van chuyen',
      body: orderId ? `Don hang ${orderId} dang trong qua trinh van chuyen.` : 'Co don hang dang trong qua trinh van chuyen.',
    },
    order_delivered: {
      subject: 'Thong bao giao hang thanh cong',
      title: 'Don hang da giao thanh cong',
      body: orderId ? `Don hang ${orderId} da duoc giao thanh cong.` : 'Don hang da duoc giao thanh cong.',
    },
    order_delivery_failed: {
      subject: 'Canh bao giao hang that bai',
      title: 'Giao hang that bai',
      body: orderId ? `Don hang ${orderId} giao that bai.` : 'Co don hang giao that bai.',
    },
    payment_success: {
      subject: 'Thanh toan thanh cong',
      title: 'Cap nhat thanh toan',
      body: orderId ? `Thanh toan cho don ${orderId} da thanh cong.` : 'He thong ghi nhan mot giao dich thanh toan thanh cong.',
    },
    payment_failed: {
      subject: 'Canh bao thanh toan that bai',
      title: 'Thanh toan that bai',
      body: orderId ? `Thanh toan cho don ${orderId} that bai.` : 'He thong ghi nhan mot giao dich thanh toan that bai.',
    },
    payment_pending: {
      subject: 'Thanh toan dang cho xac nhan',
      title: 'Cap nhat thanh toan dang cho',
      body: orderId ? `Thanh toan cho don ${orderId} dang cho xac nhan.` : 'Co giao dich thanh toan dang cho xac nhan.',
    },
    payment_refund: {
      subject: 'Da xu ly hoan tien',
      title: 'Cap nhat hoan tien',
      body: orderId ? `Yeu cau hoan tien cho don ${orderId} da duoc xu ly.` : 'He thong da ghi nhan mot giao dich hoan tien.',
    },
    revenue_report_daily: {
      subject: 'Bao cao doanh thu ngay',
      title: 'Bao cao doanh thu ngay',
      body: fallback.body || 'Bao cao doanh thu ngay da san sang.',
    },
    revenue_report_weekly: {
      subject: 'Bao cao doanh thu tuan',
      title: 'Bao cao doanh thu tuan',
      body: fallback.body || 'Bao cao doanh thu tuan da san sang.',
    },
    revenue_report_monthly: {
      subject: 'Bao cao doanh thu thang',
      title: 'Bao cao doanh thu thang',
      body: 'Bao cao doanh thu thang da san sang.',
    },
    revenue_compare_prev_period: {
      subject: 'So sanh doanh thu voi ky truoc',
      title: 'Bao cao so sanh doanh thu',
      body: 'Bao cao so sanh doanh thu voi ky truoc da duoc cap nhat.',
    },
    revenue_drop: {
      subject: 'Canh bao suy giam doanh thu',
      title: 'Doanh thu giam manh',
      body: 'Doanh thu dang giam so voi ky truoc. Vui long kiem tra va dieu chinh ke hoach van hanh.',
    },
    revenue_spike: {
      subject: 'Thong bao tang truong doanh thu',
      title: 'Doanh thu tang manh',
      body: 'Doanh thu dang tang ro ret so voi ky truoc.',
    },
    top_services_products: {
      subject: 'Bao cao san pham va dich vu noi bat',
      title: 'Top ban chay da cap nhat',
      body: 'He thong da cap nhat danh sach dich vu va san pham ban chay.',
    },
    inventory_low_stock: {
      subject: 'Canh bao ton kho sap het',
      title: 'Canh bao ton kho thap',
      body: 'Co mat hang ton kho dang o muc thap.',
    },
    inventory_out_of_stock: {
      subject: 'Canh bao het hang',
      title: 'Canh bao ton kho het hang',
      body: 'Co mat hang da het ton kho.',
    },
    inventory_high_stock: {
      subject: 'Thong bao ton kho cao',
      title: 'Ton kho cao bat thuong',
      body: 'Mot so mat hang dang co ton kho cao bat thuong.',
    },
    inventory_restock_success: {
      subject: 'Nhap kho thanh cong',
      title: 'Cap nhat nhap kho',
      body: 'He thong ghi nhan phieu nhap kho thanh cong.',
    },
    inventory_insufficient_tomorrow_booking: {
      subject: 'Canh bao thieu ton kho cho ngay mai',
      title: 'Rui ro thieu ton kho',
      body: 'Ton kho hien tai co the khong du dap ung nhu cau lich hen cua ngay mai.',
    },
    customer_new_review: {
      subject: 'Khach hang vua danh gia moi',
      title: 'Co danh gia moi tu khach hang',
      body: 'He thong vua ghi nhan danh gia moi tu khach hang.',
    },
    customer_low_review: {
      subject: 'Canh bao danh gia thap tu khach hang',
      title: 'Can xu ly phan hoi danh gia thap',
      body: 'Co phan hoi danh gia thap tu khach hang can duoc xu ly som.',
    },
    customer_vip_returned: {
      subject: 'Khach VIP quay lai',
      title: 'Tin hieu tich cuc tu nhom VIP',
      body: 'He thong ghi nhan khach VIP quay lai sau thoi gian vang mat.',
    },
    customer_lapsed: {
      subject: 'Canh bao khach hang co nguy co roi bo',
      title: 'Khach hang lau ngay chua quay lai',
      body: 'Co nhom khach hang lau ngay chua quay lai, can chuong trinh cham soc phu hop.',
    },
    campaign_effective: {
      subject: 'Chien dich khuyen mai dang hieu qua',
      title: 'Hieu qua chien dich duoc cai thien',
      body: 'Chien dich khuyen mai dang cho ket qua tich cuc.',
    },
    ai_upsell_opportunity: {
      subject: 'Goi y co hoi upsell tu AI',
      title: 'Co hoi tang doanh thu bo sung',
      body: 'He thong AI phat hien co hoi de tang doanh thu bo sung tu hanh vi khach hang.',
    },
    marketing_suggestion: {
      subject: 'Goi y marketing tu he thong',
      title: 'De xuat marketing moi',
      body: 'He thong de xuat y tuong uu dai/combo de tang dat lich.',
    },
    system_error: {
      subject: 'Canh bao su co he thong',
      title: 'Su co he thong can xu ly',
      body: 'He thong vua ghi nhan su co can duoc kiem tra.',
    },
    system_maintenance: {
      subject: 'Thong bao bao tri he thong',
      title: 'Cap nhat bao tri he thong',
      body: 'He thong co cap nhat bao tri dinh ky.',
    },
  }

  const selected = map[eventKey] || {}
  return {
    subject: selected.subject || 'Thong bao van hanh he thong',
    title: selected.title || 'Thong bao tu he thong',
    body: selected.body || 'He thong vua ghi nhan mot cap nhat moi.',
  }
}

async function notifyOwnerEvent({
  event,
  bookingId = null,
  orderId = null,
  payload = {},
  sendEmailOverride,
  awaitEmail = false,
} = {}) {
  const state = await ensureNotificationsTableState()
  if (!state.exists) return { targeted: 0, saved: 0, emailed: 0 }

  const eventKey = String(event || '').trim().toLowerCase()
  const ownerToggles = await getOwnerNotificationToggleMap()
  if (!shouldDispatchOwnerEventBySettings(eventKey, ownerToggles)) {
    return { targeted: 0, saved: 0, emailed: 0, skipped: true, reason: 'event_disabled_by_owner_settings' }
  }

  const tpl = buildOwnerEventTemplate(eventKey, {
    ...payload,
    bookingId,
    orderId,
  })
  const enrichedBody = buildOwnerBodyWithContext(tpl.body, {
    eventKey,
    bookingId,
    orderId,
    payload,
  })

  const owners = await listOwnerUsers(50)
  if (!owners.length) return { targeted: 0, saved: 0, emailed: 0 }

  let saved = 0
  let emailed = 0
  const sendEmailNow = sendEmailOverride !== undefined
    ? Boolean(sendEmailOverride)
    : shouldEmailOwnerPriority(tpl.priority)

  for (const owner of owners) {
    const ownerPrefs = await getUserNotificationPreferences(owner.userId)
    if (!ownerPrefs.enableNotifications) continue

    const notificationId = String(newId())
    const nowIso = new Date().toISOString()

    await query(
      `INSERT INTO Notifications (
         NotificationId,
         UserId,
         Title,
         Content,
         Body,
         IsRead,
         CreatedAt,
         UpdatedAt,
         Type,
         Channel,
         BookingId,
         OrderId,
         ScheduledAt,
         SentAt,
         EmailSentAt
       )
       VALUES (
         @notificationId,
         @userId,
         @title,
         @content,
         @body,
         0,
         @createdAt,
         @updatedAt,
         @type,
         @channel,
         @bookingId,
         @orderId,
         NULL,
         NULL,
         NULL
       )`,
      {
        notificationId,
        userId: owner.userId,
        title: tpl.title,
        content: enrichedBody,
        body: enrichedBody,
        createdAt: nowIso,
        updatedAt: nowIso,
        type: tpl.typeKey,
        channel: tpl.severity,
        bookingId: bookingId || null,
        orderId: orderId || null,
      },
    )

    saved += 1

    if (sendEmailNow && ownerPrefs.enableEmail && owner.email) {
      const viTpl = buildOwnerEmailTemplateVi(eventKey, payload, {
        subject: tpl.subject,
        title: tpl.title,
        body: enrichedBody,
      })
      const { text, html } = buildProfessionalEmailContent({
        title: viTpl.title,
        message: viTpl.body,
        audience: 'owner',
        metadataLines: [
          `Muc do uu tien: ${toViPriorityLabel(tpl.priority)}`,
          `Nhom thong bao: ${toViCategoryLabel(tpl.category)}`,
        ],
      })
      const sendOwnerEmailTask = async () => {
        const sent = await sendEmail({
          to: owner.email,
          subject: buildEmailSubject(viTpl.subject),
          text,
          html,
        })

        if (sent.sent) {
          await query(
            `UPDATE Notifications
             SET EmailSentAt = SYSUTCDATETIME(),
                 SentAt = SYSUTCDATETIME(),
                 UpdatedAt = SYSUTCDATETIME()
             WHERE NotificationId = @notificationId`,
            { notificationId },
          )
          return true
        }

        return false
      }

      if (awaitEmail) {
        const didSend = await sendOwnerEmailTask()
        if (didSend) emailed += 1
      } else {
        runInBackground(sendOwnerEmailTask, 'owner-email-send')
      }
    }
  }

  try {
    emitOwnerNotification({
      event: eventKey,
      category: tpl.category,
      severity: tpl.severity,
      priority: tpl.priority,
      bookingId: bookingId || null,
      orderId: orderId || null,
      message: tpl.title,
      body: enrichedBody,
      occurredAt: new Date().toISOString(),
    })
  } catch {
    // Keep persistence path safe even when realtime channel is unavailable.
  }

  return { targeted: owners.length, saved, emailed }
}

async function hasRecentOwnerNotification(typeKeyPrefix, minutes = 60) {
  const safePrefix = String(typeKeyPrefix || '').trim()
  if (!safePrefix) return false

  const min = Math.min(Math.max(Number(minutes) || 60, 1), 24 * 60)
  const res = await query(
    `SELECT TOP 1 NotificationId
     FROM Notifications
     WHERE Type LIKE @typeLike
       AND CreatedAt >= DATEADD(MINUTE, -@mins, SYSUTCDATETIME())
       AND (UserId IS NOT NULL)
     ORDER BY CreatedAt DESC`,
    {
      typeLike: `${safePrefix}%`,
      mins: min,
    },
  )

  return Boolean(res.recordset?.length)
}

async function dispatchOwnerInsights(options = {}) {
  const morningOnly = Boolean(options?.morningOnly)
  const now = options?.now ? new Date(options.now) : new Date()

  if (morningOnly) {
    const due = await isOwnerMorningInsightDue(now)
    if (!due) return { dispatched: 0, skipped: true }
  }

  const state = await ensureNotificationsTableState()
  if (!state.exists) return { dispatched: 0 }

  let dispatched = 0

  try {
    const shiftRegisteredExists = await hasRecentOwnerNotification('hr.staff_shift_registered', 18 * 60)
    if (!shiftRegisteredExists) {
      const shiftTable = await firstExistingTable(['StaffAvailability', 'StaffShifts'])
      if (shiftTable) {
        const shiftDateCol = await firstExistingColumn(shiftTable, ['WeekStartDate', 'ShiftDate', 'WorkDate', 'Date'])
        const shiftDayIndexCol = await firstExistingColumn(shiftTable, ['DayIndex'])
        const shiftCreatedCol = await firstExistingColumn(shiftTable, ['CreatedAt', 'CreatedDate'])

        if (shiftDateCol) {
          const shiftDateExpr = shiftDayIndexCol
            ? `DATEADD(DAY, ISNULL(TRY_CONVERT(INT, [${shiftDayIndexCol}]), 0), CAST([${shiftDateCol}] AS DATE))`
            : `CAST([${shiftDateCol}] AS DATE)`

          const createdFilter = shiftCreatedCol
            ? `AND TRY_CONVERT(datetime2, [${shiftCreatedCol}]) >= DATEADD(DAY, -1, SYSUTCDATETIME())`
            : ''

          const regRes = await query(
            `SELECT COUNT(1) AS ShiftCount
             FROM [${shiftTable}]
             WHERE ${shiftDateExpr} BETWEEN CAST(SYSUTCDATETIME() AS DATE) AND DATEADD(DAY, 1, CAST(SYSUTCDATETIME() AS DATE))
             ${createdFilter}`,
            {},
          )

          const shiftCount = Number(regRes.recordset?.[0]?.ShiftCount || 0)
          if (shiftCount > 0) {
            await notifyOwnerEvent({
              event: 'staff_shift_registered',
              payload: { body: `${shiftCount} shift registration/update(s) detected for today and tomorrow.` },
            })
            dispatched += 1
          }
        }
      }
    }
  } catch {}

  try {
    const assignmentExists = await hasRecentOwnerNotification('hr.staff_assignment_changed', 18 * 60)
    if (!assignmentExists) {
      const assignmentRes = await query(
        `SELECT
           SUM(CASE WHEN bs.StaffId IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(100), bs.StaffId))) = '' THEN 1 ELSE 0 END) AS UnassignedCount,
           SUM(CASE WHEN bs.StaffId IS NOT NULL AND LTRIM(RTRIM(CONVERT(NVARCHAR(100), bs.StaffId))) <> '' THEN 1 ELSE 0 END) AS AssignedCount
         FROM BookingServices bs
         INNER JOIN Bookings b ON b.BookingId = bs.BookingId
         WHERE b.BookingTime >= DATEADD(DAY, -1, SYSUTCDATETIME())
           AND b.BookingTime < DATEADD(DAY, 1, SYSUTCDATETIME())
           AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) NOT IN ('cancelled', 'canceled', 'deleted')`,
        {},
      )

      const row = assignmentRes.recordset?.[0] || {}
      const assignedCount = Number(row.AssignedCount || 0)
      const unassignedCount = Number(row.UnassignedCount || 0)
      if (assignedCount > 0 || unassignedCount > 0) {
        await notifyOwnerEvent({
          event: 'staff_assignment_changed',
          payload: {
            body: `Booking assignment update: ${assignedCount} assigned, ${unassignedCount} unassigned booking service(s) in the recent window.`,
          },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const idleExists = await hasRecentOwnerNotification('operations.booking_idle_slots', 6 * 60)
    if (!idleExists) {
      const todayRes = await query(
        `SELECT COUNT(1) AS BookingCount
         FROM Bookings
         WHERE CAST(BookingTime AS date) = CAST(SYSUTCDATETIME() AS date)
           AND LOWER(LTRIM(RTRIM(ISNULL(Status, '')))) NOT IN ('cancelled', 'canceled', 'deleted')`,
        {},
      )
      const count = Number(todayRes.recordset?.[0]?.BookingCount || 0)
      if (count <= 3) {
        await notifyOwnerEvent({
          event: 'booking_idle_slots',
          payload: {
            body: `Only ${count} active booking(s) today. Consider running promotions to fill empty slots.`,
          },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const overloadExists = await hasRecentOwnerNotification('hr.staff_overload', 6 * 60)
    if (!overloadExists) {
      const overloadRes = await query(
        `SELECT TOP 1 bs.StaffId, COUNT(1) AS BookingCount
         FROM BookingServices bs
         INNER JOIN Bookings b ON b.BookingId = bs.BookingId
         WHERE CAST(b.BookingTime AS date) = CAST(SYSUTCDATETIME() AS date)
           AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) NOT IN ('cancelled', 'canceled', 'deleted')
         GROUP BY bs.StaffId
         HAVING COUNT(1) >= 8
         ORDER BY COUNT(1) DESC`,
        {},
      )
      const row = overloadRes.recordset?.[0]
      if (row?.StaffId) {
        await notifyOwnerEvent({
          event: 'staff_overload',
          payload: {
            body: `Staff ${row.StaffId} has ${Number(row.BookingCount || 0)} bookings today.`,
          },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const lateExists = await hasRecentOwnerNotification('hr.staff_late_or_no_checkin', 2 * 60)
    if (!lateExists) {
      const shiftTable = await firstExistingTable(['StaffAvailability', 'StaffShifts'])
      const attendanceTable = await firstExistingTable(['StaffAttendance', 'Attendance', 'AttendanceLogs', 'CheckIns', 'Timekeeping'])
      if (shiftTable && attendanceTable) {
        const shiftStaffCol = await firstExistingColumn(shiftTable, ['StaffId', 'UserId'])
        const shiftDateCol = await firstExistingColumn(shiftTable, ['WeekStartDate', 'ShiftDate', 'WorkDate', 'Date'])
        const shiftDayIndexCol = await firstExistingColumn(shiftTable, ['DayIndex'])
        const shiftStartCol = await firstExistingColumn(shiftTable, ['StartHour', 'StartTime', 'ShiftStart', 'FromHour'])

        const attStaffCol = await firstExistingColumn(attendanceTable, ['StaffId', 'UserId'])
        const attCheckinCol = await firstExistingColumn(attendanceTable, ['CheckInTime', 'CheckInAt', 'ClockInTime', 'ClockInAt', 'CheckIn', 'CreatedAt'])

        if (shiftStaffCol && shiftDateCol && attStaffCol && attCheckinCol) {
          const shiftDateExpr = shiftDayIndexCol
            ? `DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sft.[${shiftDayIndexCol}]), 0), CAST(sft.[${shiftDateCol}] AS DATE))`
            : `CAST(sft.[${shiftDateCol}] AS DATE)`

          const expectedStartExpr = shiftStartCol
            ? `COALESCE(
                 TRY_CONVERT(datetime2, CONCAT(CONVERT(varchar(10), ${shiftDateExpr}, 23), ' ', CONVERT(varchar(8), TRY_CONVERT(time, sft.[${shiftStartCol}]), 108))),
                 DATEADD(MINUTE, TRY_CONVERT(INT, ROUND(TRY_CONVERT(FLOAT, sft.[${shiftStartCol}]) * 60, 0)), CAST(${shiftDateExpr} AS datetime2)),
                 CAST(${shiftDateExpr} AS datetime2)
               )`
            : `CAST(${shiftDateExpr} AS datetime2)`

          const lateRes = await query(
            `WITH expected AS (
               SELECT
                 sft.[${shiftStaffCol}] AS StaffId,
                 MIN(${expectedStartExpr}) AS ExpectedStart
               FROM [${shiftTable}] sft
               WHERE sft.[${shiftStaffCol}] IS NOT NULL
                 AND CAST(${shiftDateExpr} AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
               GROUP BY sft.[${shiftStaffCol}]
             ),
             actual AS (
               SELECT
                 att.[${attStaffCol}] AS StaffId,
                 MIN(TRY_CONVERT(datetime2, att.[${attCheckinCol}])) AS FirstCheckIn
               FROM [${attendanceTable}] att
               WHERE att.[${attStaffCol}] IS NOT NULL
                 AND TRY_CONVERT(datetime2, att.[${attCheckinCol}]) IS NOT NULL
                 AND CAST(TRY_CONVERT(datetime2, att.[${attCheckinCol}]) AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
               GROUP BY att.[${attStaffCol}]
             )
             SELECT TOP 5
               e.StaffId,
               e.ExpectedStart,
               a.FirstCheckIn,
               DATEDIFF(MINUTE, e.ExpectedStart, a.FirstCheckIn) AS LateMinutes
             FROM expected e
             LEFT JOIN actual a ON a.StaffId = e.StaffId
             WHERE a.FirstCheckIn IS NULL
                OR DATEDIFF(MINUTE, e.ExpectedStart, a.FirstCheckIn) >= 20
             ORDER BY
               CASE WHEN a.FirstCheckIn IS NULL THEN 1 ELSE 0 END DESC,
               DATEDIFF(MINUTE, e.ExpectedStart, a.FirstCheckIn) DESC`,
            {},
          )

          const lateRows = lateRes.recordset || []
          if (lateRows.length > 0) {
            const text = lateRows
              .map((x) => {
                const lateMins = Number(x.LateMinutes || 0)
                if (!x.FirstCheckIn) return `${x.StaffId}(no check-in)`
                return lateMins > 0 ? `${x.StaffId}(late ${lateMins}m)` : `${x.StaffId}(late)`
              })
              .join(', ')

            await notifyOwnerEvent({
              event: 'staff_late_or_no_checkin',
              payload: { body: `Today attendance anomalies: ${text}.` },
            })
            dispatched += 1
          }
        }
      }
    }
  } catch {}

  try {
    const leaveExists = await hasRecentOwnerNotification('hr.staff_leave_exceed_days', 12 * 60)
    if (!leaveExists) {
      const shiftTable = await firstExistingTable(['StaffAvailability', 'StaffShifts'])
      const attendanceTable = await firstExistingTable(['StaffAttendance', 'Attendance', 'AttendanceLogs', 'CheckIns', 'Timekeeping'])
      if (shiftTable && attendanceTable) {
        const shiftStaffCol = await firstExistingColumn(shiftTable, ['StaffId', 'UserId'])
        const shiftDateCol = await firstExistingColumn(shiftTable, ['WeekStartDate', 'ShiftDate', 'WorkDate', 'Date'])
        const shiftDayIndexCol = await firstExistingColumn(shiftTable, ['DayIndex'])

        const attStaffCol = await firstExistingColumn(attendanceTable, ['StaffId', 'UserId'])
        const attCheckinCol = await firstExistingColumn(attendanceTable, ['CheckInTime', 'CheckInAt', 'ClockInTime', 'ClockInAt', 'CheckIn', 'CreatedAt'])

        if (shiftStaffCol && shiftDateCol && attStaffCol && attCheckinCol) {
          const shiftDateExpr = shiftDayIndexCol
            ? `DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sft.[${shiftDayIndexCol}]), 0), CAST(sft.[${shiftDateCol}] AS DATE))`
            : `CAST(sft.[${shiftDateCol}] AS DATE)`

          const leaveRes = await query(
            `WITH expectedDays AS (
               SELECT
                 sft.[${shiftStaffCol}] AS StaffId,
                 CAST(${shiftDateExpr} AS DATE) AS ShiftDate
               FROM [${shiftTable}] sft
               WHERE sft.[${shiftStaffCol}] IS NOT NULL
                 AND CAST(${shiftDateExpr} AS DATE) BETWEEN DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)) AND CAST(SYSUTCDATETIME() AS DATE)
               GROUP BY sft.[${shiftStaffCol}], CAST(${shiftDateExpr} AS DATE)
             ),
             presentDays AS (
               SELECT
                 att.[${attStaffCol}] AS StaffId,
                 CAST(TRY_CONVERT(datetime2, att.[${attCheckinCol}]) AS DATE) AS WorkDate
               FROM [${attendanceTable}] att
               WHERE att.[${attStaffCol}] IS NOT NULL
                 AND TRY_CONVERT(datetime2, att.[${attCheckinCol}]) IS NOT NULL
                 AND CAST(TRY_CONVERT(datetime2, att.[${attCheckinCol}]) AS DATE) BETWEEN DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE)) AND CAST(SYSUTCDATETIME() AS DATE)
               GROUP BY att.[${attStaffCol}], CAST(TRY_CONVERT(datetime2, att.[${attCheckinCol}]) AS DATE)
             )
             SELECT TOP 5
               e.StaffId,
               COUNT(1) AS PlannedDays,
               SUM(CASE WHEN p.WorkDate IS NULL THEN 1 ELSE 0 END) AS MissingDays
             FROM expectedDays e
             LEFT JOIN presentDays p ON p.StaffId = e.StaffId AND p.WorkDate = e.ShiftDate
             GROUP BY e.StaffId
             HAVING SUM(CASE WHEN p.WorkDate IS NULL THEN 1 ELSE 0 END) >= 4
             ORDER BY SUM(CASE WHEN p.WorkDate IS NULL THEN 1 ELSE 0 END) DESC`,
            {},
          )

          const leaveRows = leaveRes.recordset || []
          if (leaveRows.length > 0) {
            const text = leaveRows
              .map((x) => `${x.StaffId}(${Number(x.MissingDays || 0)}/${Number(x.PlannedDays || 0)} missing)`)
              .join(', ')

            await notifyOwnerEvent({
              event: 'staff_leave_exceed_days',
              payload: { body: `Last 30 days leave-off exceeds threshold: ${text}.` },
            })
            dispatched += 1
          }
        }
      }
    }
  } catch {}

  try {
    const lowRatingExists = await hasRecentOwnerNotification('hr.staff_low_rating', 18 * 60)
    if (!lowRatingExists) {
      const lowRatingRes = await query(
        `SELECT TOP 3
           bs.StaffId,
           AVG(CAST(br.Rating AS FLOAT)) AS AvgRating,
           COUNT(1) AS ReviewCount
         FROM SalonReviews br
         INNER JOIN BookingServices bs ON bs.BookingId = br.BookingId
         INNER JOIN Bookings b ON b.BookingId = br.BookingId
         WHERE bs.StaffId IS NOT NULL
           AND br.BookingId IS NOT NULL
           AND br.Rating IS NOT NULL
           AND b.BookingTime >= DATEADD(DAY, -30, SYSUTCDATETIME())
         GROUP BY bs.StaffId
         HAVING AVG(CAST(br.Rating AS FLOAT)) < 3.5 AND COUNT(1) >= 3
         ORDER BY AVG(CAST(br.Rating AS FLOAT)) ASC, COUNT(1) DESC`,
        {},
      )

      const rows = lowRatingRes.recordset || []
      if (rows.length > 0) {
        const text = rows
          .map((x) => `${x.StaffId}(avg ${Number(x.AvgRating || 0).toFixed(1)}/5, ${Number(x.ReviewCount || 0)} reviews)`)
          .join(', ')
        await notifyOwnerEvent({
          event: 'staff_low_rating',
          payload: { body: `Low-rating staff detected: ${text}.` },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const revenueReportExists = await hasRecentOwnerNotification('revenue.report_daily', 12 * 60)
    if (!revenueReportExists) {
      const todayIso = toIsoDate(new Date())
      const todayRevenue = await getRevenueSum({ fromIso: todayIso, toIso: todayIso })
      await notifyOwnerEvent({
        event: 'revenue_report_daily',
        payload: {
          body: `Today's revenue: ${fmtVnd(todayRevenue)} VND.`,
        },
      })
      dispatched += 1
    }
  } catch {}

  try {
    const anomalyExists = await hasRecentOwnerNotification('revenue.drop_alert', 12 * 60)
      || await hasRecentOwnerNotification('revenue.spike_alert', 12 * 60)
    if (!anomalyExists) {
      const today = startOfDay(new Date())
      const yesterday = addDays(today, -1)
      const tIso = toIsoDate(today)
      const yIso = toIsoDate(yesterday)
      const todayRevenue = await getRevenueSum({ fromIso: tIso, toIso: tIso })
      const yesterdayRevenue = await getRevenueSum({ fromIso: yIso, toIso: yIso })

      if (yesterdayRevenue > 0) {
        const ratio = todayRevenue / yesterdayRevenue
        if (ratio <= 0.6) {
          await notifyOwnerEvent({
            event: 'revenue_drop',
            payload: {
              body: `Revenue dropped strongly vs yesterday (${fmtVnd(todayRevenue)} vs ${fmtVnd(yesterdayRevenue)} VND).`,
            },
          })
          dispatched += 1
        } else if (ratio >= 1.6) {
          await notifyOwnerEvent({
            event: 'revenue_spike',
            payload: {
              body: `Revenue increased strongly vs yesterday (${fmtVnd(todayRevenue)} vs ${fmtVnd(yesterdayRevenue)} VND).`,
            },
          })
          dispatched += 1
        }
      }
    }
  } catch {}

  try {
    const weeklyExists = await hasRecentOwnerNotification('revenue.report_weekly', 20 * 60)
    if (!weeklyExists) {
      const weekStart = startOfWeek(now)
      const weekRevenue = await getRevenueSum({ fromIso: toIsoDate(weekStart), toIso: toIsoDate(now) })
      await notifyOwnerEvent({
        event: 'revenue_report_weekly',
        payload: { body: `Weekly revenue (from Monday): ${fmtVnd(weekRevenue)} VND.` },
      })
      dispatched += 1
    }
  } catch {}

  try {
    const monthlyExists = await hasRecentOwnerNotification('revenue.report_monthly', 20 * 60)
    if (!monthlyExists) {
      const monthStart = startOfMonth(now)
      const monthRevenue = await getRevenueSum({ fromIso: toIsoDate(monthStart), toIso: toIsoDate(now) })
      await notifyOwnerEvent({
        event: 'revenue_report_monthly',
        payload: { body: `Monthly revenue: ${fmtVnd(monthRevenue)} VND.` },
      })
      dispatched += 1
    }
  } catch {}

  try {
    const compareExists = await hasRecentOwnerNotification('revenue.compare_prev_period', 20 * 60)
    if (!compareExists) {
      const today = startOfDay(now)
      const yesterday = addDays(today, -1)
      const weekStart = startOfWeek(now)
      const prevWeekStart = addDays(weekStart, -7)
      const prevWeekEnd = addDays(weekStart, -1)
      const monthStart = startOfMonth(now)
      const prevMonthEnd = addDays(monthStart, -1)
      const prevMonthStart = startOfMonth(prevMonthEnd)

      const [dayRevenue, dayPrevRevenue, weekRevenue, weekPrevRevenue, monthRevenue, monthPrevRevenue] = await Promise.all([
        getRevenueSum({ fromIso: toIsoDate(today), toIso: toIsoDate(today) }),
        getRevenueSum({ fromIso: toIsoDate(yesterday), toIso: toIsoDate(yesterday) }),
        getRevenueSum({ fromIso: toIsoDate(weekStart), toIso: toIsoDate(now) }),
        getRevenueSum({ fromIso: toIsoDate(prevWeekStart), toIso: toIsoDate(prevWeekEnd) }),
        getRevenueSum({ fromIso: toIsoDate(monthStart), toIso: toIsoDate(now) }),
        getRevenueSum({ fromIso: toIsoDate(prevMonthStart), toIso: toIsoDate(prevMonthEnd) }),
      ])

      await notifyOwnerEvent({
        event: 'revenue_compare_prev_period',
        payload: {
          body: `Period comparison - Day: ${fmtVnd(dayRevenue)} vs ${fmtVnd(dayPrevRevenue)}; Week: ${fmtVnd(weekRevenue)} vs ${fmtVnd(weekPrevRevenue)}; Month: ${fmtVnd(monthRevenue)} vs ${fmtVnd(monthPrevRevenue)} VND.`,
        },
      })
      dispatched += 1
    }
  } catch {}

  try {
    const topExists = await hasRecentOwnerNotification('revenue.top_selling', 18 * 60)
    if (!topExists) {
      const [topServicesRes, topProductsRes] = await Promise.all([
        safeQuery(
          `SELECT TOP 3
             ISNULL(sv.Name, CONVERT(NVARCHAR(120), bs.ServiceId)) AS Name,
             COUNT(1) AS Qty
           FROM BookingServices bs
           INNER JOIN Bookings b ON b.BookingId = bs.BookingId
           LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
           WHERE b.BookingTime >= DATEADD(DAY, -30, SYSUTCDATETIME())
             AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'complete', 'done')
           GROUP BY ISNULL(sv.Name, CONVERT(NVARCHAR(120), bs.ServiceId))
           ORDER BY COUNT(1) DESC`,
          {},
          {},
        ),
        safeQuery(
          `SELECT TOP 3
             COALESCE(oi.ProductName, p.Name, 'Unknown') AS Name,
             SUM(COALESCE(oi.Quantity, 0)) AS Qty
           FROM OrderItems oi
           INNER JOIN Orders o ON o.OrderId = oi.OrderId
           LEFT JOIN Products p ON p.ProductId = oi.ProductId
           WHERE o.CreatedAt >= DATEADD(DAY, -30, SYSUTCDATETIME())
             AND LOWER(LTRIM(RTRIM(ISNULL(o.Status, '')))) IN ('completed', 'complete', 'done')
           GROUP BY COALESCE(oi.ProductName, p.Name, 'Unknown')
           ORDER BY SUM(COALESCE(oi.Quantity, 0)) DESC`,
          {},
          {},
        ),
      ])

      const topServices = (topServicesRes.recordset || []).map((x) => `${x.Name}(${Number(x.Qty || 0)})`).join(', ')
      const topProducts = (topProductsRes.recordset || []).map((x) => `${x.Name}(${Number(x.Qty || 0)})`).join(', ')
      if (topServices || topProducts) {
        await notifyOwnerEvent({
          event: 'top_services_products',
          payload: {
            body: `Top 30d - Services: ${topServices || 'N/A'}; Products: ${topProducts || 'N/A'}.`,
          },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const vipReturnExists = await hasRecentOwnerNotification('operations.customer_vip_returned', 12 * 60)
    if (!vipReturnExists) {
      const stateMap = await ensureNotificationSchemaState()
      const bookingUserExpr = stateMap.bookingsHasCustomerUserId
        ? 'b.CustomerUserId'
        : (stateMap.bookingsHasUserId ? 'b.UserId' : 'NULL')
      const orderUserExpr = stateMap.ordersHasCustomerUserId
        ? 'o.CustomerUserId'
        : (stateMap.ordersHasUserId ? 'o.UserId' : 'NULL')

      const vipRes = await query(
        `WITH bookingSpend AS (
           SELECT
             ${bookingUserExpr} AS UserId,
             SUM(ISNULL(bs.Price, sv.Price)) AS Amount
           FROM Bookings b
           LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
           LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
           WHERE ${bookingUserExpr} IS NOT NULL
           GROUP BY ${bookingUserExpr}
         ),
         orderSpend AS (
           SELECT
             ${orderUserExpr} AS UserId,
             SUM(ISNULL(o.Total, 0)) AS Amount
           FROM Orders o
           WHERE ${orderUserExpr} IS NOT NULL
           GROUP BY ${orderUserExpr}
         ),
         spend AS (
           SELECT UserId, SUM(Amount) AS TotalSpend
           FROM (
             SELECT UserId, Amount FROM bookingSpend
             UNION ALL
             SELECT UserId, Amount FROM orderSpend
           ) x
           GROUP BY UserId
         ),
         activity AS (
           SELECT ${bookingUserExpr} AS UserId, CAST(b.BookingTime AS datetime2) AS EventAt
           FROM Bookings b
           WHERE ${bookingUserExpr} IS NOT NULL
             AND b.BookingTime IS NOT NULL
           UNION ALL
           SELECT ${orderUserExpr} AS UserId, CAST(o.CreatedAt AS datetime2) AS EventAt
           FROM Orders o
           WHERE ${orderUserExpr} IS NOT NULL
             AND o.CreatedAt IS NOT NULL
         ),
         ranked AS (
           SELECT
             UserId,
             EventAt,
             ROW_NUMBER() OVER (PARTITION BY UserId ORDER BY EventAt DESC) AS rn
           FROM activity
         )
         SELECT TOP 5
           u.UserId,
           u.Name,
           s.TotalSpend,
           lastA.EventAt AS LastVisit,
           prevA.EventAt AS PrevVisit,
           DATEDIFF(DAY, prevA.EventAt, lastA.EventAt) AS GapDays
         FROM spend s
         INNER JOIN ranked lastA ON lastA.UserId = s.UserId AND lastA.rn = 1
         INNER JOIN ranked prevA ON prevA.UserId = s.UserId AND prevA.rn = 2
         LEFT JOIN Users u ON u.UserId = s.UserId
         WHERE s.TotalSpend >= 5000000
           AND lastA.EventAt >= DATEADD(DAY, -2, SYSUTCDATETIME())
           AND DATEDIFF(DAY, prevA.EventAt, lastA.EventAt) >= 30
         ORDER BY s.TotalSpend DESC, lastA.EventAt DESC`,
        {},
      )

      const vipRows = vipRes.recordset || []
      if (vipRows.length > 0) {
        const text = vipRows
          .map((x) => {
            const name = String(x.Name || x.UserId || 'Unknown').trim()
            const gap = Number(x.GapDays || 0)
            return `${name} (after ${gap}d gap)`
          })
          .join(', ')

        await notifyOwnerEvent({
          event: 'customer_vip_returned',
          payload: { body: `VIP comeback detected: ${text}.` },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const lapsedExists = await hasRecentOwnerNotification('operations.customer_lapsed', 24 * 60)
    if (!lapsedExists) {
      const stateMap = await ensureNotificationSchemaState()
      const bookingUserExpr = stateMap.bookingsHasCustomerUserId
        ? 'b.CustomerUserId'
        : (stateMap.bookingsHasUserId ? 'b.UserId' : 'NULL')
      const orderUserExpr = stateMap.ordersHasCustomerUserId
        ? 'o.CustomerUserId'
        : (stateMap.ordersHasUserId ? 'o.UserId' : 'NULL')

      const lapsedRes = await query(
        `WITH activity AS (
           SELECT ${bookingUserExpr} AS UserId, CAST(b.BookingTime AS datetime2) AS EventAt
           FROM Bookings b
           WHERE ${bookingUserExpr} IS NOT NULL
             AND b.BookingTime IS NOT NULL
           UNION ALL
           SELECT ${orderUserExpr} AS UserId, CAST(o.CreatedAt AS datetime2) AS EventAt
           FROM Orders o
           WHERE ${orderUserExpr} IS NOT NULL
             AND o.CreatedAt IS NOT NULL
         ),
         agg AS (
           SELECT UserId, COUNT(1) AS VisitCount, MAX(EventAt) AS LastVisit
           FROM activity
           GROUP BY UserId
         )
         SELECT TOP 8
           u.UserId,
           u.Name,
           a.VisitCount,
           a.LastVisit,
           DATEDIFF(DAY, a.LastVisit, SYSUTCDATETIME()) AS InactiveDays
         FROM agg a
         LEFT JOIN Users u ON u.UserId = a.UserId
         WHERE a.VisitCount >= 2
           AND DATEDIFF(DAY, a.LastVisit, SYSUTCDATETIME()) >= 45
         ORDER BY InactiveDays DESC, VisitCount DESC`,
        {},
      )

      const lapsedRows = lapsedRes.recordset || []
      if (lapsedRows.length > 0) {
        const text = lapsedRows
          .slice(0, 5)
          .map((x) => {
            const name = String(x.Name || x.UserId || 'Unknown').trim()
            return `${name} (${Number(x.InactiveDays || 0)}d)`
          })
          .join(', ')

        await notifyOwnerEvent({
          event: 'customer_lapsed',
          payload: { body: `Customers at churn risk (>=45 inactive days): ${text}.` },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const campaignExists = await hasRecentOwnerNotification('operations.campaign_effective', 12 * 60)
    if (!campaignExists) {
      const campaignRes = await query(
        `WITH periodData AS (
           SELECT
             CAST(b.BookingTime AS DATE) AS d,
             CASE WHEN ISNULL(b.Notes, '') LIKE '%PROMO_CODE:%' THEN 1 ELSE 0 END AS IsPromo,
             ISNULL(bs.Price, sv.Price) AS Revenue
           FROM Bookings b
           LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
           LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
           WHERE b.BookingTime >= DATEADD(DAY, -14, SYSUTCDATETIME())
             AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) NOT IN ('cancelled', 'canceled', 'deleted')
         )
         SELECT
           SUM(CASE WHEN IsPromo = 1 THEN 1 ELSE 0 END) AS PromoRows,
           SUM(CASE WHEN IsPromo = 0 THEN 1 ELSE 0 END) AS NonPromoRows,
           SUM(CASE WHEN IsPromo = 1 THEN ISNULL(Revenue, 0) ELSE 0 END) AS PromoRevenue,
           SUM(CASE WHEN IsPromo = 0 THEN ISNULL(Revenue, 0) ELSE 0 END) AS NonPromoRevenue
         FROM periodData`,
        {},
      )

      const row = campaignRes.recordset?.[0] || {}
      const promoRows = Number(row.PromoRows || 0)
      const nonPromoRows = Number(row.NonPromoRows || 0)
      const promoRevenue = Number(row.PromoRevenue || 0)
      const nonPromoRevenue = Number(row.NonPromoRevenue || 0)
      const totalRows = promoRows + nonPromoRows
      const promoShare = totalRows > 0 ? promoRows / totalRows : 0
      const promoAvg = promoRows > 0 ? promoRevenue / promoRows : 0
      const nonPromoAvg = nonPromoRows > 0 ? nonPromoRevenue / nonPromoRows : 0

      if (promoRows >= 5 && promoShare >= 0.2 && promoAvg >= nonPromoAvg) {
        await notifyOwnerEvent({
          event: 'campaign_effective',
          payload: {
            body: `Promo impact (14d): ${promoRows}/${totalRows} bookings used campaign (${Math.round(promoShare * 100)}%), avg revenue ${fmtVnd(promoAvg)} vs ${fmtVnd(nonPromoAvg)} VND.`,
          },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const upsellExists = await hasRecentOwnerNotification('operations.ai_upsell_opportunity', 12 * 60)
    if (!upsellExists) {
      const stateMap = await ensureNotificationSchemaState()
      const bookingUserExpr = stateMap.bookingsHasCustomerUserId
        ? 'b.CustomerUserId'
        : (stateMap.bookingsHasUserId ? 'b.UserId' : 'NULL')
      const orderUserExpr = stateMap.ordersHasCustomerUserId
        ? 'o.CustomerUserId'
        : (stateMap.ordersHasUserId ? 'o.UserId' : 'NULL')

      const upsellRes = await query(
        `WITH serviceDemand AS (
           SELECT TOP 1
             bs.ServiceId,
             ISNULL(sv.Name, CONVERT(NVARCHAR(120), bs.ServiceId)) AS ServiceName,
             COUNT(DISTINCT b.BookingId) AS BookingCount,
             COUNT(DISTINCT ${bookingUserExpr}) AS CustomerCount
           FROM BookingServices bs
           INNER JOIN Bookings b ON b.BookingId = bs.BookingId
           LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
           WHERE b.BookingTime >= DATEADD(DAY, -30, SYSUTCDATETIME())
             AND ${bookingUserExpr} IS NOT NULL
             AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'complete', 'done')
           GROUP BY bs.ServiceId, sv.Name
           ORDER BY COUNT(DISTINCT b.BookingId) DESC
         ),
         productAttach AS (
           SELECT COUNT(DISTINCT ${orderUserExpr}) AS BuyerCount
           FROM Orders o
           WHERE o.CreatedAt >= DATEADD(DAY, -30, SYSUTCDATETIME())
             AND ${orderUserExpr} IS NOT NULL
             AND LOWER(LTRIM(RTRIM(ISNULL(o.Status, '')))) IN ('completed', 'complete', 'done')
         )
         SELECT
           sd.ServiceName,
           sd.BookingCount,
           sd.CustomerCount,
           pa.BuyerCount
         FROM serviceDemand sd
         CROSS JOIN productAttach pa`,
        {},
      )

      const row = upsellRes.recordset?.[0]
      if (row) {
        const serviceName = String(row.ServiceName || 'Top service').trim()
        const bookingCount = Number(row.BookingCount || 0)
        const serviceCustomers = Number(row.CustomerCount || 0)
        const buyerCount = Number(row.BuyerCount || 0)
        const attachRate = serviceCustomers > 0 ? buyerCount / serviceCustomers : 0

        if (bookingCount >= 20 && serviceCustomers >= 15 && attachRate < 0.35) {
          await notifyOwnerEvent({
            event: 'ai_upsell_opportunity',
            payload: {
              body: `AI upsell: ${serviceName} has strong demand (${bookingCount} bookings/30d) but low product attach (${Math.round(attachRate * 100)}%). Suggest combo add-on after booking checkout.`,
            },
          })
          dispatched += 1
        }
      }
    }
  } catch {}

  try {
    const lowExists = await hasRecentOwnerNotification('inventory.low_stock', 6 * 60)
    if (!lowExists) {
      const lowRes = await query(
        `SELECT TOP 5 ProductId, Name, Stock
         FROM Products
         WHERE Stock BETWEEN 1 AND 3
         ORDER BY Stock ASC, ProductId ASC`,
        {},
      )
      const list = lowRes.recordset || []
      if (list.length > 0) {
        const text = list.map((x) => `${x.Name || x.ProductId}(${Number(x.Stock || 0)})`).join(', ')
        await notifyOwnerEvent({
          event: 'inventory_low_stock',
          payload: { body: `Low stock items: ${text}.` },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const highExists = await hasRecentOwnerNotification('inventory.high_stock', 18 * 60)
    if (!highExists) {
      const minCol = await firstExistingColumn('Products', ['MinQty', 'ReorderLevel', 'MinStock', 'MinStockLevel'])
      const thresholdExpr = minCol
        ? `CASE WHEN ISNULL([${minCol}], 0) > 0 THEN ISNULL([${minCol}], 0) * 5 ELSE 100 END`
        : '100'

      const highRes = await query(
        `SELECT TOP 5 ProductId, Name, Stock
         FROM Products
         WHERE ISNULL(Stock, 0) >= ${thresholdExpr}
         ORDER BY ISNULL(Stock, 0) DESC, ProductId ASC`,
        {},
      )

      const rows = highRes.recordset || []
      if (rows.length > 0) {
        const text = rows.map((x) => `${x.Name || x.ProductId}(${Number(x.Stock || 0)})`).join(', ')
        await notifyOwnerEvent({
          event: 'inventory_high_stock',
          payload: { body: `Abnormally high stock items: ${text}.` },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const outExists = await hasRecentOwnerNotification('inventory.out_of_stock', 6 * 60)
    if (!outExists) {
      const outRes = await query(
        `SELECT TOP 5 ProductId, Name
         FROM Products
         WHERE ISNULL(Stock, 0) <= 0
         ORDER BY ProductId ASC`,
        {},
      )
      const list = outRes.recordset || []
      if (list.length > 0) {
        const text = list.map((x) => x.Name || x.ProductId).join(', ')
        await notifyOwnerEvent({
          event: 'inventory_out_of_stock',
          payload: { body: `Out-of-stock items: ${text}.` },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const restockExists = await hasRecentOwnerNotification('inventory.restock_success', 18 * 60)
    if (!restockExists) {
      const txRes = await safeQuery(
        `SELECT
           COUNT(1) AS TxCount,
           SUM(TRY_CONVERT(FLOAT, Quantity)) AS TotalQty
         FROM InventoryTransactions
         WHERE UPPER(LTRIM(RTRIM(ISNULL(Type, '')))) IN ('IN', 'STOCK IN', 'RESTOCK')
           AND CreatedAt >= DATEADD(DAY, -1, SYSUTCDATETIME())`,
        {},
        { TxCount: 0, TotalQty: 0 },
      )
      const txCount = Number(txRes.recordset?.[0]?.TxCount || 0)
      if (txCount > 0) {
        const totalQty = Number(txRes.recordset?.[0]?.TotalQty || 0)
        await notifyOwnerEvent({
          event: 'inventory_restock_success',
          payload: { body: `Restock completed: ${txCount} transaction(s), total in quantity ${Math.round(totalQty)} in last 24h.` },
        })
        dispatched += 1
      }
    }
  } catch {}

  try {
    const insufficientExists = await hasRecentOwnerNotification('inventory.insufficient_tomorrow_booking', 18 * 60)
    if (!insufficientExists) {
      const tomorrowRes = await query(
        `SELECT COUNT(1) AS BookingCount
         FROM Bookings
         WHERE CAST(BookingTime AS DATE) = DATEADD(DAY, 1, CAST(SYSUTCDATETIME() AS DATE))
           AND LOWER(LTRIM(RTRIM(ISNULL(Status, '')))) NOT IN ('cancelled', 'canceled', 'deleted')`,
        {},
      )
      const tomorrowBookingCount = Number(tomorrowRes.recordset?.[0]?.BookingCount || 0)

      if (tomorrowBookingCount > 0) {
        const inventoryRiskRes = await safeQuery(
          `SELECT COUNT(1) AS RiskCount
           FROM InventoryItems
           WHERE ISNULL(Quantity, 0) <= ISNULL(ReorderLevel, 0)
              OR ISNULL(Quantity, 0) <= 3`,
          {},
          { RiskCount: 0 },
        )
        const riskCount = Number(inventoryRiskRes.recordset?.[0]?.RiskCount || 0)

        if (riskCount > 0) {
          await notifyOwnerEvent({
            event: 'inventory_insufficient_tomorrow_booking',
            payload: {
              body: `Tomorrow has ${tomorrowBookingCount} active booking(s) while ${riskCount} inventory item(s) are low/critical. Review stock for gels/tools before opening.`,
            },
          })
          dispatched += 1
        }
      }
    }
  } catch {}

  if (morningOnly) {
    await markOwnerMorningInsightRun(now)
  }

  return { dispatched }
}

async function listOwnerNotifications({ userId, limit = 80 } = {}) {
  const state = await ensureNotificationsTableState()
  if (!state.exists) return []

  const safeUserId = String(userId || '').trim() || ''
  const maxLimit = Math.min(Math.max(Number(limit) || 80, 1), 500)

  const res = await query(
    `SELECT TOP (@limit)
        NotificationId,
        UserId,
        Title,
        Content,
        Body,
        Type,
        Channel,
        BookingId,
        OrderId,
        IsRead,
        CreatedAt,
        UpdatedAt
     FROM Notifications
     WHERE (@userId = '' OR UserId = @userId OR UserId IS NULL)
       AND (ScheduledAt IS NULL OR ScheduledAt <= SYSUTCDATETIME())
     ORDER BY COALESCE(CreatedAt, UpdatedAt) DESC, NotificationId DESC`,
    { limit: maxLimit, userId: safeUserId },
  )

  return (res.recordset || []).map((row) => mapDbNotificationRow(row, { scope: 'owner' }))
}

async function markAllOwnerNotificationsRead({ userId } = {}) {
  const state = await ensureNotificationsTableState()
  if (!state.exists) return { updated: 0 }

  const safeUserId = String(userId || '').trim() || ''
  const result = await query(
    `UPDATE Notifications
     SET IsRead = 1,
         UpdatedAt = SYSUTCDATETIME()
     WHERE IsRead = 0
       AND (@userId = '' OR UserId = @userId OR UserId IS NULL);
     SELECT @@ROWCOUNT AS UpdatedCount;`,
    { userId: safeUserId },
  )

  return { updated: Number(result.recordset?.[0]?.UpdatedCount || 0) }
}

async function listNotifications({ scope, userId } = {}) {
  const key = toKey({ scope, userId })
  const list = parseList(await getSettingValue(key))
  return list.map(normalizeNotification).filter(Boolean)
}

function fmtDateForMessage(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'N/A'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function listCustomerNotifications({ userId, limit = 200, type = 'all' } = {}) {
  const state = await ensureNotificationsTableState()
  if (!state.exists) return []

  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return []

  const maxLimit = Math.min(Math.max(Number(limit) || 200, 1), 500)
  const typeFilter = String(type || 'all').trim().toLowerCase()

  const res = await query(
    `SELECT TOP (@limit)
        NotificationId,
        UserId,
        Title,
        Content,
        Body,
        Type,
        Channel,
        BookingId,
        OrderId,
        IsRead,
        CreatedAt,
        UpdatedAt
     FROM Notifications
     WHERE (UserId = @userId OR UserId IS NULL)
       AND (ScheduledAt IS NULL OR ScheduledAt <= SYSUTCDATETIME())
     ORDER BY COALESCE(CreatedAt, UpdatedAt) DESC, NotificationId DESC`,
    { limit: maxLimit, userId: safeUserId },
  )

  const mapped = (res.recordset || []).map((row) => mapDbNotificationRow(row, { scope: 'customer' }))
  if (typeFilter === 'all') return mapped
  if (typeFilter === 'service') {
    return mapped.filter((item) => {
      const t = String(item.type || '').toLowerCase()
      return t === 'service' || t === 'post_service'
    })
  }
  return mapped.filter((item) => String(item.type || '').toLowerCase() === typeFilter)
}

async function setCustomerNotificationRead({ userId, notificationId, read = true } = {}) {
  const safeUserId = String(userId || '').trim()
  const safeNotificationId = String(notificationId || '').trim()
  if (!safeUserId || !safeNotificationId) {
    const err = new Error('Missing userId or notificationId')
    err.status = 400
    throw err
  }

  const state = await ensureNotificationsTableState()
  if (!state.exists) return { notificationId: safeNotificationId, read: Boolean(read) }

  await query(
    `UPDATE Notifications
     SET IsRead = @isRead,
         UpdatedAt = SYSUTCDATETIME()
     WHERE NotificationId = @notificationId
       AND (UserId = @userId OR UserId IS NULL)`,
    {
      isRead: read ? 1 : 0,
      notificationId: safeNotificationId,
      userId: safeUserId,
    },
  )

  return { notificationId: safeNotificationId, read: Boolean(read) }
}

async function markAllCustomerNotificationsRead({ userId } = {}) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return { updated: 0 }

  const state = await ensureNotificationsTableState()
  if (!state.exists) return { updated: 0 }

  const result = await query(
    `UPDATE Notifications
     SET IsRead = 1,
         UpdatedAt = SYSUTCDATETIME()
     WHERE IsRead = 0
       AND (UserId = @userId OR UserId IS NULL);
     SELECT @@ROWCOUNT AS UpdatedCount;`,
    { userId: safeUserId },
  )

  return { updated: Number(result.recordset?.[0]?.UpdatedCount || 0) }
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

async function getUserEmail(userId) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return ''
  const res = await query(
    `SELECT TOP 1 Email
     FROM Users
     WHERE UserId = @userId`,
    { userId: safeUserId },
  )
  return String(res.recordset?.[0]?.Email || '').trim()
}

function buildCustomerEventTemplate(eventKey, payload = {}) {
  const salonName = String(payload.salonName || 'Salon').trim() || 'Salon'
  const bookingTimeText = payload.bookingTime ? fmtDateForMessage(payload.bookingTime) : null
  const orderIdText = String(payload.orderId || '').trim()

  const map = {
    booking_created: {
      type: 'booking',
      title: 'Booking confirmed',
      body: bookingTimeText ? `Your appointment is confirmed for ${bookingTimeText}.` : 'Your appointment has been booked successfully.',
      subject: 'Xac nhan lich hen tai Salon',
    },
    booking_reminder_1d: {
      type: 'booking',
      title: 'Appointment reminder (1 day)',
      body: bookingTimeText ? `Reminder: your appointment is tomorrow at ${bookingTimeText}.` : 'Reminder: your appointment is tomorrow.',
      subject: 'Appointment Reminder - Tomorrow',
    },
    booking_reminder_2h: {
      type: 'booking',
      title: 'Appointment reminder (2 hours)',
      body: bookingTimeText ? `Reminder: your appointment starts at ${bookingTimeText}.` : 'Reminder: your appointment starts soon.',
      subject: 'Appointment Reminder - Starts Soon',
    },
    booking_rescheduled: {
      type: 'booking',
      title: 'Booking rescheduled',
      body: bookingTimeText ? `Your booking has been moved to ${bookingTimeText}.` : 'Your booking has been rescheduled.',
      subject: 'Booking Schedule Updated',
    },
    booking_cancelled: {
      type: 'booking',
      title: 'Booking cancelled',
      body: 'Your booking has been cancelled.',
      subject: 'Booking Cancelled',
    },
    booking_staff_assigned: {
      type: 'booking',
      title: 'Specialist assigned',
      body: payload.staffName
        ? `A specialist has been assigned: ${payload.staffName}.`
        : 'A specialist has been assigned to your booking.',
      subject: 'Specialist Assigned To Your Booking',
    },
    booking_rejected: {
      type: 'booking',
      title: 'Booking was declined',
      body: payload.reason || 'Your requested time slot is no longer available.',
      subject: 'Booking Request Declined',
    },
    service_new: {
      type: 'service',
      title: 'New service available',
      body: payload.body || 'A new service has just been added. Check it out now.',
      subject: 'New Service At Salon',
    },
    service_hot: {
      type: 'service',
      title: 'Trending service',
      body: payload.body || 'A service is trending right now. Book while slots are open.',
      subject: 'Trending Service This Week',
    },
    service_ai_suggestion: {
      type: 'service',
      title: 'Recommended for you',
      body: payload.body || 'We found a service that matches your style.',
      subject: 'Personalized Service Suggestion',
    },
    service_discount: {
      type: 'service',
      title: 'Service discount',
      body: payload.body || 'A service you may like is now discounted.',
      subject: 'Service Discount For You',
    },
    post_feedback_request: {
      type: 'post_service',
      title: 'Please rate your service',
      body: 'Tell us about your experience. Your feedback helps us improve.',
      subject: 'Please Share Your Feedback',
    },
    post_reward_points: {
      type: 'post_service',
      title: 'Loyalty reward updated',
      body: payload.body || 'Your points and rewards have been updated.',
      subject: 'Reward Points Updated',
    },
    post_service_history: {
      type: 'post_service',
      title: 'Service history updated',
      body: 'Your service history has a new entry.',
      subject: 'Service History Update',
    },
    order_created: {
      type: 'order',
      title: 'Order placed successfully',
      body: orderIdText ? `Your order ${orderIdText} has been placed successfully.` : 'Your order has been placed successfully.',
      subject: 'Xac nhan don hang cua ban',
    },
    order_failed: {
      type: 'order',
      title: 'Order failed',
      body: payload.reason || 'Your order could not be completed. Please try again.',
      subject: 'Order Failed',
    },
    order_cancelled: {
      type: 'order',
      title: 'Order cancelled',
      body: orderIdText ? `Order ${orderIdText} has been cancelled.` : 'Your order has been cancelled.',
      subject: 'Order Cancelled',
    },
    order_processing: {
      type: 'order',
      title: 'Order is processing',
      body: orderIdText ? `Order ${orderIdText} is being processed.` : 'Your order is being processed.',
      subject: 'Order Processing Update',
    },
    order_shipping: {
      type: 'order',
      title: 'Order is shipping',
      body: orderIdText ? `Order ${orderIdText} is out for delivery.` : 'Your order is out for delivery.',
      subject: 'Order Shipping Update',
    },
    order_in_transit: {
      type: 'order',
      title: 'Order in transit',
      body: orderIdText ? `Order ${orderIdText} is in transit.` : 'Your order is in transit.',
      subject: 'Order In Transit',
    },
    order_delivered: {
      type: 'order',
      title: 'Order delivered',
      body: orderIdText ? `Order ${orderIdText} was delivered successfully.` : 'Your order was delivered successfully.',
      subject: 'Order Delivered',
    },
    order_delivery_failed: {
      type: 'order',
      title: 'Delivery failed',
      body: orderIdText ? `Delivery failed for order ${orderIdText}.` : 'Delivery failed for your order.',
      subject: 'Order Delivery Failed',
    },
    payment_success: {
      type: 'payment',
      title: 'Payment successful',
      body: 'Your payment was processed successfully.',
      subject: 'Payment Successful',
    },
    payment_failed: {
      type: 'payment',
      title: 'Payment failed',
      body: payload.reason || 'Payment failed. Please try another method.',
      subject: 'Payment Failed',
    },
    payment_pending: {
      type: 'payment',
      title: 'Payment pending',
      body: 'Your payment is pending confirmation.',
      subject: 'Payment Pending',
    },
    payment_refund: {
      type: 'payment',
      title: 'Refund processed',
      body: 'Your refund has been processed successfully.',
      subject: 'Refund Confirmation',
    },
    product_hot: {
      type: 'product',
      title: 'Best-selling product',
      body: payload.body || 'A best-selling product is trending now.',
      subject: 'Best-Selling Product Alert',
    },
    product_new: {
      type: 'product',
      title: 'New product available',
      body: payload.body || 'A new product is now available.',
      subject: 'New Product At Salon',
    },
    product_discount: {
      type: 'product',
      title: 'Product discount',
      body: payload.body || 'A product you may like is now discounted.',
      subject: 'Product Discount For You',
    },
    product_wishlist_discount: {
      type: 'product',
      title: 'Wishlist item discounted',
      body: payload.body || 'A product in your wishlist is now on sale.',
      subject: 'Wishlist Discount Alert',
    },
  }

  const selected = map[eventKey] || {
    type: 'info',
    title: 'Notification',
    body: payload.body || 'You have a new update.',
    subject: `Update from ${salonName}`,
  }

  return {
    type: selected.type,
    title: selected.title,
    body: selected.body,
    subject: selected.subject,
  }
}

function buildCustomerEmailTemplateVi(eventKey, payload = {}, fallback = {}) {
  const orderIdText = String(payload.orderId || '').trim()
  const bookingTimeText = payload.bookingTime ? fmtDateForMessage(payload.bookingTime) : null

  const map = {
    booking_created: {
      subject: 'Xac nhan lich hen',
      title: 'Dat lich thanh cong',
      body: bookingTimeText ? `Lich hen cua Quy khach da duoc xac nhan vao ${bookingTimeText}.` : 'Lich hen cua Quy khach da duoc xac nhan thanh cong.',
    },
    booking_reminder_1d: {
      subject: 'Nhac lich hen truoc 1 ngay',
      title: 'Nhac lich hen',
      body: bookingTimeText ? `Quy khach co lich hen vao ${bookingTimeText}. Vui long sap xep thoi gian den dung hen.` : 'Quy khach co lich hen vao ngay mai. Vui long den dung gio.',
    },
    booking_reminder_2h: {
      subject: 'Nhac lich hen truoc 2 gio',
      title: 'Lich hen sap bat dau',
      body: bookingTimeText ? `Lich hen cua Quy khach se bat dau luc ${bookingTimeText}.` : 'Lich hen cua Quy khach se bat dau trong it gio toi.',
    },
    booking_rescheduled: {
      subject: 'Cap nhat thay doi lich hen',
      title: 'Lich hen da duoc dieu chinh',
      body: bookingTimeText ? `Lich hen cua Quy khach da duoc doi sang ${bookingTimeText}.` : 'Lich hen cua Quy khach da duoc dieu chinh thoi gian.',
    },
    booking_cancelled: {
      subject: 'Thong bao huy lich hen',
      title: 'Lich hen da duoc huy',
      body: 'Lich hen cua Quy khach da duoc huy. Vui long dat lai khi can.',
    },
    booking_staff_assigned: {
      subject: 'Thong bao phan cong ky thuat vien',
      title: 'Da phan cong ky thuat vien',
      body: 'Lich hen cua Quy khach da duoc phan cong ky thuat vien phu trach.',
    },
    booking_rejected: {
      subject: 'Thong bao khong the xac nhan lich hen',
      title: 'Yeu cau dat lich chua duoc chap nhan',
      body: 'Khung gio yeu cau tam thoi khong con phu hop. Vui long chon khung gio khac.',
    },
    service_new: {
      subject: 'Thong bao dich vu moi',
      title: 'Salon vua co dich vu moi',
      body: 'Salon vua bo sung dich vu moi. Moi Quy khach tham khao va trai nghiem.',
    },
    service_hot: {
      subject: 'Thong bao dich vu duoc quan tam',
      title: 'Dich vu noi bat trong tuan',
      body: 'Mot dich vu dang duoc nhieu khach hang lua chon trong tuan nay.',
    },
    service_ai_suggestion: {
      subject: 'Goi y dich vu phu hop',
      title: 'De xuat dich vu danh cho Quy khach',
      body: 'He thong de xuat dich vu phu hop voi nhu cau cua Quy khach.',
    },
    service_discount: {
      subject: 'Thong bao uu dai dich vu',
      title: 'Dich vu dang co uu dai',
      body: 'Dich vu Quy khach quan tam hien dang co chuong trinh uu dai.',
    },
    post_feedback_request: {
      subject: 'Moi Quy khach danh gia dich vu',
      title: 'Xin y kien danh gia sau dich vu',
      body: 'Y kien cua Quy khach rat quan trong de Salon nang cao chat luong phuc vu.',
    },
    post_reward_points: {
      subject: 'Cap nhat diem thuong',
      title: 'Diem thuong cua Quy khach da duoc cap nhat',
      body: 'He thong da cap nhat diem thuong va quyen loi khach hang than thiet cua Quy khach.',
    },
    post_service_history: {
      subject: 'Cap nhat lich su su dung dich vu',
      title: 'Lich su dich vu da duoc bo sung',
      body: 'Lich su su dung dich vu cua Quy khach da duoc cap nhat.',
    },
    order_created: {
      subject: 'Xac nhan don hang',
      title: 'Don hang da duoc tiep nhan',
      body: orderIdText ? `Don hang ${orderIdText} da duoc tiep nhan va dang duoc xu ly.` : 'Don hang cua Quy khach da duoc tiep nhan.',
    },
    order_failed: {
      subject: 'Thong bao don hang chua thanh cong',
      title: 'Xu ly don hang gap su co',
      body: 'Don hang cua Quy khach chua the hoan tat. Vui long thu lai hoac lien he ho tro.',
    },
    order_cancelled: {
      subject: 'Thong bao huy don hang',
      title: 'Don hang da duoc huy',
      body: orderIdText ? `Don hang ${orderIdText} da duoc huy theo yeu cau.` : 'Don hang cua Quy khach da duoc huy.',
    },
    order_processing: {
      subject: 'Cap nhat don hang dang xu ly',
      title: 'Don hang dang xu ly',
      body: orderIdText ? `Don hang ${orderIdText} dang duoc xu ly.` : 'Don hang cua Quy khach dang duoc xu ly.',
    },
    order_shipping: {
      subject: 'Cap nhat don hang dang giao',
      title: 'Don hang dang van chuyen',
      body: orderIdText ? `Don hang ${orderIdText} dang duoc van chuyen.` : 'Don hang cua Quy khach dang duoc van chuyen.',
    },
    order_in_transit: {
      subject: 'Cap nhat don hang dang tren duong giao',
      title: 'Don hang dang tren duong van chuyen',
      body: orderIdText ? `Don hang ${orderIdText} dang tren duong giao den Quy khach.` : 'Don hang cua Quy khach dang tren duong giao den.',
    },
    order_delivered: {
      subject: 'Thong bao giao hang thanh cong',
      title: 'Don hang da giao thanh cong',
      body: orderIdText ? `Don hang ${orderIdText} da duoc giao thanh cong.` : 'Don hang cua Quy khach da duoc giao thanh cong.',
    },
    order_delivery_failed: {
      subject: 'Thong bao giao hang chua thanh cong',
      title: 'Giao hang chua thanh cong',
      body: orderIdText ? `Viec giao don ${orderIdText} chua thanh cong. Chung toi se lien he lai som.` : 'Viec giao hang chua thanh cong. Chung toi se lien he lai som.',
    },
    payment_success: {
      subject: 'Xac nhan thanh toan thanh cong',
      title: 'Thanh toan thanh cong',
      body: 'He thong da ghi nhan giao dich thanh toan thanh cong cua Quy khach.',
    },
    payment_failed: {
      subject: 'Thong bao thanh toan that bai',
      title: 'Thanh toan that bai',
      body: 'Giao dich thanh toan chua thanh cong. Vui long thu lai hoac chon phuong thuc khac.',
    },
    payment_pending: {
      subject: 'Thong bao thanh toan dang cho xac nhan',
      title: 'Thanh toan dang cho xac nhan',
      body: 'Giao dich thanh toan cua Quy khach dang trong qua trinh xac nhan.',
    },
    payment_refund: {
      subject: 'Thong bao hoan tien',
      title: 'Hoan tien thanh cong',
      body: 'Yeu cau hoan tien cua Quy khach da duoc xu ly thanh cong.',
    },
    product_hot: {
      subject: 'Thong bao san pham noi bat',
      title: 'San pham duoc ua chuong',
      body: 'Mot san pham dang duoc nhieu khach hang lua chon.',
    },
    product_new: {
      subject: 'Thong bao san pham moi',
      title: 'Salon vua co san pham moi',
      body: 'Salon vua bo sung san pham moi. Moi Quy khach tham khao ngay.',
    },
    product_discount: {
      subject: 'Thong bao uu dai san pham',
      title: 'San pham dang co khuyen mai',
      body: 'San pham Quy khach quan tam hien dang co chuong trinh khuyen mai.',
    },
    product_wishlist_discount: {
      subject: 'Thong bao giam gia tu danh sach yeu thich',
      title: 'San pham yeu thich dang giam gia',
      body: 'Mot san pham trong danh sach yeu thich cua Quy khach dang duoc giam gia.',
    },
  }

  const selected = map[eventKey] || {}
  return {
    subject: selected.subject || 'Thong bao cap nhat tu Nail Salon',
    title: selected.title || 'Thong bao cap nhat',
    body: selected.body || 'He thong vua ghi nhan mot cap nhat moi.',
  }
}

async function notifyCustomerEvent({
  userId,
  event,
  bookingId = null,
  orderId = null,
  scheduledAt = null,
  sendEmailNow = true,
  awaitEmail = false,
  payload = {},
} = {}) {
  const state = await ensureNotificationsTableState()
  if (!state.exists) return null

  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return null

  const prefs = await getUserNotificationPreferences(safeUserId)
  if (!prefs.enableNotifications) {
    return { skipped: true, reason: 'notifications_disabled' }
  }

  const eventKey = String(event || '').trim().toLowerCase()

  const tpl = buildCustomerEventTemplate(eventKey, {
    ...payload,
    orderId: orderId || payload.orderId,
  })

  const notificationId = String(newId())
  const nowIso = new Date().toISOString()
  const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null

  await query(
    `INSERT INTO Notifications (
       NotificationId,
       UserId,
       Title,
       Content,
       Body,
       IsRead,
       CreatedAt,
       UpdatedAt,
       Type,
       Channel,
       BookingId,
       OrderId,
       ScheduledAt,
       SentAt,
       EmailSentAt
     )
     VALUES (
       @notificationId,
       @userId,
       @title,
       @content,
       @body,
       0,
       @createdAt,
       @updatedAt,
       @type,
       @channel,
       @bookingId,
       @orderId,
       @scheduledAt,
       NULL,
       NULL
     )`,
    {
      notificationId,
      userId: safeUserId,
      title: tpl.title,
      content: tpl.body,
      body: tpl.body,
      createdAt: nowIso,
      updatedAt: nowIso,
      type: String(event || tpl.type || 'info'),
      channel: payload.channel || null,
      bookingId: bookingId || null,
      orderId: orderId || null,
      scheduledAt: scheduledIso,
    },
  )

  if (scheduledIso || !sendEmailNow || !prefs.enableEmail) {
    return { notificationId, queuedEmail: Boolean(scheduledIso) }
  }

  const to = await getUserEmail(safeUserId)
  if (!to) return { notificationId, queuedEmail: false, emailSent: false, reason: 'missing_user_email' }

  const viTpl = buildCustomerEmailTemplateVi(eventKey, payload, {
    subject: tpl.subject,
    title: tpl.title,
    body: tpl.body,
  })

  const { text, html } = buildProfessionalEmailContent({
    title: viTpl.title,
    message: viTpl.body,
    audience: 'customer',
  })
  const sendCustomerEmailTask = async () => {
    const sent = await sendEmail({ to, subject: buildEmailSubject(viTpl.subject), text, html })

    if (sent.sent) {
      await query(
        `UPDATE Notifications
         SET EmailSentAt = SYSUTCDATETIME(),
             SentAt = SYSUTCDATETIME(),
             UpdatedAt = SYSUTCDATETIME()
         WHERE NotificationId = @notificationId`,
        { notificationId },
      )
    }

    return sent
  }

  if (awaitEmail) {
    const sent = await sendCustomerEmailTask()
    return { notificationId, emailSent: Boolean(sent.sent), emailResult: sent }
  }

  runInBackground(sendCustomerEmailTask, 'customer-email-send')
  return { notificationId, emailDeferred: true }
}

async function scheduleBookingReminders({ userId, bookingId, bookingTime } = {}) {
  const baseTime = bookingTime ? new Date(bookingTime) : null
  if (!baseTime || Number.isNaN(baseTime.getTime())) return { scheduled: 0 }

  const now = new Date()
  const oneDayBefore = new Date(baseTime.getTime() - 24 * 60 * 60 * 1000)
  const twoHoursBefore = new Date(baseTime.getTime() - 2 * 60 * 60 * 1000)

  let count = 0
  if (oneDayBefore > now) {
    await notifyCustomerEvent({
      userId,
      event: 'booking_reminder_1d',
      bookingId,
      scheduledAt: oneDayBefore,
      sendEmailNow: false,
      payload: { bookingTime },
    })
    count += 1
  }

  if (twoHoursBefore > now) {
    await notifyCustomerEvent({
      userId,
      event: 'booking_reminder_2h',
      bookingId,
      scheduledAt: twoHoursBefore,
      sendEmailNow: false,
      payload: { bookingTime },
    })
    count += 1
  }

  return { scheduled: count }
}

async function dispatchDueNotificationEmails(limit = 50) {
  const state = await ensureNotificationsTableState()
  if (!state.exists) return { processed: 0, sent: 0 }

  const settingsState = await ensureNotificationSettingsTableState()

  const maxLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const sqlText = settingsState.exists
    ? `SELECT TOP (@limit)
         n.NotificationId,
         n.UserId,
         n.Type,
         n.Title,
         COALESCE(NULLIF(LTRIM(RTRIM(n.Body)), ''), NULLIF(LTRIM(RTRIM(n.Content)), ''), N'You have a new update.') AS MessageBody,
         u.Email
       FROM Notifications n
       LEFT JOIN Users u ON u.UserId = n.UserId
       OUTER APPLY (
         SELECT TOP 1 ns.EnableEmail
         FROM NotificationSettings ns
         WHERE ns.UserId = n.UserId
         ORDER BY ns.UpdatedAt DESC, ns.CreatedAt DESC
       ) ns
       WHERE n.ScheduledAt IS NOT NULL
         AND n.ScheduledAt <= SYSUTCDATETIME()
         AND n.EmailSentAt IS NULL
         AND ISNULL(ns.EnableEmail, 1) = 1
       ORDER BY n.ScheduledAt ASC, n.NotificationId ASC`
    : `SELECT TOP (@limit)
         n.NotificationId,
         n.UserId,
         n.Type,
         n.Title,
         COALESCE(NULLIF(LTRIM(RTRIM(n.Body)), ''), NULLIF(LTRIM(RTRIM(n.Content)), ''), N'You have a new update.') AS MessageBody,
         u.Email
       FROM Notifications n
       LEFT JOIN Users u ON u.UserId = n.UserId
       WHERE n.ScheduledAt IS NOT NULL
         AND n.ScheduledAt <= SYSUTCDATETIME()
         AND n.EmailSentAt IS NULL
       ORDER BY n.ScheduledAt ASC, n.NotificationId ASC`

  const res = await query(sqlText, { limit: maxLimit })

  const rows = res.recordset || []
  let sentCount = 0

  for (const row of rows) {
    const to = String(row.Email || '').trim()
    if (!to) continue

    const eventKey = String(row.Type || '').trim().toLowerCase()
    const viTpl = buildCustomerEmailTemplateVi(eventKey, {}, {
      subject: String(row.Title || 'Thong bao cap nhat tu Nail Salon'),
      title: String(row.Title || 'Thong bao cap nhat'),
      body: String(row.MessageBody || ''),
    })
    const subject = buildEmailSubject(viTpl.subject)
    const { text, html } = buildProfessionalEmailContent({
      title: viTpl.title,
      message: viTpl.body,
      audience: 'customer',
    })
    const result = await sendEmail({ to, subject, text, html })

    if (!result.sent) continue

    sentCount += 1
    await query(
      `UPDATE Notifications
       SET EmailSentAt = SYSUTCDATETIME(),
           SentAt = SYSUTCDATETIME(),
           UpdatedAt = SYSUTCDATETIME()
       WHERE NotificationId = @notificationId`,
      { notificationId: row.NotificationId },
    )
  }

  return { processed: rows.length, sent: sentCount }
}

async function listCustomerUserIds(limit = 300) {
  const maxLimit = Math.min(Math.max(Number(limit) || 300, 1), 1000)
  const res = await query(
    `SELECT TOP (@limit) UserId
     FROM Users
     WHERE UserId IS NOT NULL
       AND LOWER(LTRIM(RTRIM(ISNULL(RoleKey, '')))) IN ('customer', 'client', '3')
       AND (
         Status IS NULL
         OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'inactive', 'disabled', 'banned')
       )
     ORDER BY CreatedAt DESC, UserId DESC`,
    { limit: maxLimit },
  )

  return [...new Set((res.recordset || []).map((x) => String(x.UserId || '').trim()).filter(Boolean))]
}

async function listWishlistUserIdsByProduct(productId, limit = 300) {
  const safeProductId = String(productId || '').trim()
  if (!safeProductId) return []

  const maxLimit = Math.min(Math.max(Number(limit) || 300, 1), 1000)
  const candidates = [
    `SELECT DISTINCT TOP (@limit) w.UserId AS UserId
     FROM Wishlists w
     WHERE w.ProductId = @productId`,
    `SELECT DISTINCT TOP (@limit) w.UserId AS UserId
     FROM Wishlist w
     WHERE w.ProductId = @productId`,
    `SELECT DISTINCT TOP (@limit) uw.UserId AS UserId
     FROM UserWishlist uw
     WHERE uw.ProductId = @productId`,
    `SELECT DISTINCT TOP (@limit) cw.UserId AS UserId
     FROM CustomerWishlist cw
     WHERE cw.ProductId = @productId`,
    `SELECT DISTINCT TOP (@limit) ws.UserId AS UserId
     FROM WishlistItems wi
     INNER JOIN Wishlists ws ON ws.WishlistId = wi.WishlistId
     WHERE wi.ProductId = @productId`,
  ]

  for (const sqlText of candidates) {
    try {
      const res = await query(sqlText, { limit: maxLimit, productId: safeProductId })
      const userIds = [...new Set((res.recordset || []).map((x) => String(x.UserId || '').trim()).filter(Boolean))]
      if (userIds.length > 0) return userIds
    } catch {
      // Try next schema candidate.
    }
  }

  return []
}

async function notifyAllCustomersEvent({ event, payload = {}, limit = 300 } = {}) {
  const userIds = await listCustomerUserIds(limit)
  let sent = 0

  for (const userId of userIds) {
    try {
      await notifyCustomerEvent({ userId, event, payload })
      sent += 1
    } catch {
      // Continue to next user.
    }
  }

  return { targeted: userIds.length, sent }
}

async function notifyWishlistDiscountByProduct({ productId, oldPrice, newPrice, productName } = {}) {
  const safeProductId = String(productId || '').trim()
  if (!safeProductId) return { targeted: 0, sent: 0 }

  const oldAmount = Number(oldPrice)
  const newAmount = Number(newPrice)
  if (!Number.isFinite(oldAmount) || !Number.isFinite(newAmount) || newAmount >= oldAmount) {
    return { targeted: 0, sent: 0 }
  }

  const userIds = await listWishlistUserIdsByProduct(safeProductId, 500)
  if (!userIds.length) return { targeted: 0, sent: 0 }

  const readableName = String(productName || '').trim() || 'This product'
  const body = `${readableName} in your wishlist is now discounted from ${oldAmount.toLocaleString('vi-VN')} to ${newAmount.toLocaleString('vi-VN')} VND.`

  let sent = 0
  for (const userId of userIds) {
    try {
      await notifyCustomerEvent({
        userId,
        event: 'product_wishlist_discount',
        payload: {
          productId: safeProductId,
          productName: readableName,
          oldPrice: oldAmount,
          newPrice: newAmount,
          body,
        },
      })
      sent += 1
    } catch {
      // Continue to next user.
    }
  }

  return { targeted: userIds.length, sent }
}

module.exports = {
  listNotifications,
  listOwnerNotifications,
  markAllRead,
  markAllOwnerNotificationsRead,
  listCustomerNotifications,
  setCustomerNotificationRead,
  markAllCustomerNotificationsRead,
  notifyCustomerEvent,
  notifyOwnerEvent,
  dispatchOwnerInsights,
  scheduleBookingReminders,
  dispatchDueNotificationEmails,
  notifyAllCustomersEvent,
  notifyWishlistDiscountByProduct,
}
