const { query, newId } = require('../config/query')

async function findBookings({ salonId, dateISO, customerName, customerPhone } = {}) {
  const where = []
  const bind = {}
  if (salonId) {
    where.push('SalonId=@salonId')
    bind.salonId = salonId
  }
  if (dateISO) {
    where.push('DateISO=@dateISO')
    bind.dateISO = dateISO
  }
  if (customerName) {
    where.push('CustomerName=@customerName')
    bind.customerName = customerName
  }
  if (customerPhone) {
    where.push('CustomerPhone=@customerPhone')
    bind.customerPhone = customerPhone
  }

  const sql = `SELECT * FROM dbo.Bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CreatedAt DESC`
  const result = await query(sql, bind)
  return result.recordset || []
}

async function findById(id) {
  const r = await query('SELECT TOP 1 * FROM dbo.Bookings WHERE BookingId=@id', { id })
  return r.recordset[0] || null
}

async function getServicesForBooking(bookingId) {
  const r = await query('SELECT ServiceTypeId FROM dbo.BookingServices WHERE BookingId=@id', { id: bookingId })
  return (r.recordset || []).map((x) => x.ServiceTypeId)
}

async function insertBooking({ id, status, salonId, salonName, dateISO, timeSlot, technicianId, technicianName, totalPrice, customerName, customerPhone, giftCardCode, giftCardApplied } = {}) {
  const bid = id || newId()
  await query(
    `INSERT INTO dbo.Bookings(
      BookingId, CreatedAt, Status, SalonId, SalonName, DateISO, TimeSlot,
      TechnicianId, TechnicianName, TotalPrice, CustomerName, CustomerPhone, GiftCardCode, GiftCardApplied
    ) VALUES(
      @id, SYSUTCDATETIME(), @status, @salonId, @salonName, @dateISO, @timeSlot,
      @technicianId, @technicianName, @totalPrice, @customerName, @customerPhone, @giftCardCode, @giftCardApplied
    )`,
    {
      id: bid,
      status: status || 'Pending',
      salonId,
      salonName: salonName || null,
      dateISO,
      timeSlot: timeSlot || null,
      technicianId: technicianId || null,
      technicianName: technicianName || null,
      totalPrice: totalPrice || 0,
      customerName,
      customerPhone: customerPhone || null,
      giftCardCode: giftCardCode || null,
      giftCardApplied: giftCardApplied || 0,
    },
  )
  return bid
}

async function insertBookingServices(bookingId, serviceIds = []) {
  for (const sid of serviceIds || []) {
    await query('INSERT INTO dbo.BookingServices(BookingId, ServiceTypeId) VALUES(@bookingId, @serviceTypeId)', {
      bookingId,
      serviceTypeId: sid,
    })
  }
}

async function updateBookingStatus(id, status) {
  await query('UPDATE dbo.Bookings SET Status=@status WHERE BookingId=@id', { id, status })
}

async function updateBookingStatusTx(request, id, status) {
  // transaction-aware update using provided sql.Request
  await request.query('UPDATE dbo.Bookings SET Status=@status WHERE BookingId=@id', { status, id })
}

module.exports = {
  findBookings,
  findById,
  getServicesForBooking,
  insertBooking,
  insertBookingServices,
  updateBookingStatus,
  updateBookingStatusTx,
}
