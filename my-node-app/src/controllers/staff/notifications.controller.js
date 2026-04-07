const { asyncHandler } = require('../../utils/asyncHandler')
const notificationsService = require('../../services/notifications.service')
const { query } = require('../../config/query')

function getUserIdFromReq(req) {
  return String(req.userId || req.user?.userId || req.user?.sub || '').trim()
}

const getNotifications = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const items = []

  const persisted = await notificationsService.listNotifications({ scope: 'staff', userId })
  for (const n of persisted || []) {
    items.push({ ...n, group: String(n.group || n.category || 'general') })
  }

  try {
    const staffRes = await query('SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId', { userId })
    const staffId = staffRes.recordset?.[0]?.StaffId
    const now = new Date()

    if (staffId) {
      const apptRes = await query(
        `SELECT TOP 12
            b.BookingId,
            b.BookingTime,
            b.Status,
            u.Name AS CustomerName,
            ISNULL((
              SELECT TOP 1 STUFF((
                SELECT ', ' + s2.Name
                FROM BookingServices bs2
                JOIN Services s2 ON s2.ServiceId = bs2.ServiceId
                WHERE bs2.BookingId = b.BookingId
                FOR XML PATH(''), TYPE
              ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
            ), 'Dich vu') AS ServiceName
         FROM Bookings b
         INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
         LEFT JOIN Users u ON u.UserId = b.CustomerUserId
         WHERE bs.StaffId = @staffId
         GROUP BY b.BookingId, b.BookingTime, b.Status, u.Name
         ORDER BY b.BookingTime DESC`,
        { staffId },
      )

      for (const row of apptRes.recordset || []) {
        const bookingTime = new Date(row.BookingTime)
        const hh = String(bookingTime.getHours()).padStart(2, '0')
        const mm = String(bookingTime.getMinutes()).padStart(2, '0')
        const timeText = `${hh}:${mm}`
        const customer = String(row.CustomerName || 'Khach hang')
        const service = String(row.ServiceName || 'Dich vu')
        const status = String(row.Status || '').trim().toLowerCase()

        if (status.includes('cancel')) {
          items.push({
            id: `appt-cancel-${row.BookingId}`,
            title: 'Huy lich',
            body: `Khach hang ${customer} da huy lich hen luc ${timeText}.`,
            group: 'appointment',
            category: 'appointment_cancel',
            severity: 'warning',
            createdAt: row.BookingTime,
            read: false,
          })
        } else if (status.includes('reschedule') || status.includes('move')) {
          items.push({
            id: `appt-change-${row.BookingId}`,
            title: 'Thay doi lich',
            body: `Lich hen cua ${customer} da duoc thay doi. Vui long kiem tra khung gio moi.`,
            group: 'appointment',
            category: 'appointment_changed',
            severity: 'info',
            createdAt: row.BookingTime,
            read: false,
          })
        } else {
          items.push({
            id: `appt-new-${row.BookingId}`,
            title: 'Lich hen moi',
            body: `Khach hang ${customer} da dat dich vu ${service} vao luc ${timeText}.`,
            group: 'appointment',
            category: 'appointment_new',
            severity: 'info',
            createdAt: row.BookingTime,
            read: false,
          })
        }

        const diffMinutes = Math.round((bookingTime.getTime() - now.getTime()) / 60000)
        if (diffMinutes >= 0 && diffMinutes <= 15) {
          items.push({
            id: `appt-reminder-${row.BookingId}`,
            title: 'Nhac nho khach den',
            body: 'Khach hang tiep theo se den sau 15 phut. Hay chuan bi dung cu.',
            group: 'appointment',
            category: 'appointment_reminder',
            severity: 'high',
            createdAt: new Date().toISOString(),
            read: false,
          })
        }
      }

      try {
        const ws = await query(
          `SELECT TOP 1 StaffId
           FROM StaffAvailability
           WHERE StaffId = @staffId`,
          { staffId },
        )
        if (ws.recordset?.[0]) {
          items.push({
            id: `schedule-week-${staffId}`,
            title: 'Lich lam viec tuan moi',
            body: 'Lich lam viec tuan sau da co. Hay kiem tra de sap xep thoi gian.',
            group: 'schedule',
            category: 'schedule_weekly',
            severity: 'info',
            createdAt: new Date().toISOString(),
            read: false,
          })
        }
      } catch {
        // ignore if table not available
      }

      try {
        const rv = await query(
          `SELECT TOP 1
              sr.Rating,
              sr.Comment,
              cu.Name AS CustomerName,
              sr.CreatedAt
           FROM SalonReviews sr
           LEFT JOIN Bookings b ON b.BookingId = sr.BookingId
           LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
           WHERE EXISTS (
             SELECT 1
             FROM BookingServices bs
             WHERE bs.StaffId = @staffId
               AND ((sr.BookingServiceId IS NOT NULL AND sr.BookingServiceId = bs.BookingServiceId)
                 OR (sr.BookingServiceId IS NULL AND sr.BookingId IS NOT NULL AND sr.BookingId = bs.BookingId))
           )
           ORDER BY sr.CreatedAt DESC`,
          { staffId },
        )
        const review = rv.recordset?.[0]
        if (review) {
          items.push({
            id: `review-${staffId}-${String(review.CreatedAt || '')}`,
            title: 'Danh gia moi tu khach',
            body: `Khach hang ${String(review.CustomerName || 'Khach hang')} vua de lai ${Number(review.Rating || 0)} sao${review.Comment ? `: "${String(review.Comment)}"` : '.'}`,
            group: 'feedback',
            category: 'new_review',
            severity: 'info',
            createdAt: review.CreatedAt || new Date().toISOString(),
            read: false,
          })
        }
      } catch {
        // ignore if table/column not available
      }
    }
  } catch {
    // ignore fallback errors
  }

  const seen = new Set()
  let data = items
    .filter((x) => x && x.id)
    .filter((x) => {
      if (seen.has(x.id)) return false
      seen.add(x.id)
      return true
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

  if (data.length === 0) {
    const now = new Date().toISOString()
    data = [
      {
        id: 'template-appointment',
        title: 'Lich hen moi',
        body: 'Khi co lich hen moi, ban se nhan thong bao tai day.',
        group: 'appointment',
        category: 'appointment_new',
        severity: 'info',
        createdAt: now,
        read: false,
      },
      {
        id: 'template-schedule',
        title: 'Lich lam viec tuan moi',
        body: 'Khi co lich tuan moi, ban se nhan thong bao tai day.',
        group: 'schedule',
        category: 'schedule_weekly',
        severity: 'info',
        createdAt: now,
        read: false,
      },
      {
        id: 'template-feedback',
        title: 'Danh gia moi tu khach',
        body: 'Khi co danh gia hoac tin nhan moi, ban se nhan thong bao tai day.',
        group: 'feedback',
        category: 'new_review',
        severity: 'info',
        createdAt: now,
        read: false,
      },
    ]
  }

  res.json({ ok: true, data })
})

const postMarkRead = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await notificationsService.markAllRead({ scope: 'staff', userId })
  res.json({ ok: true, data })
})

module.exports = {
  getNotifications,
  postMarkRead,
}
