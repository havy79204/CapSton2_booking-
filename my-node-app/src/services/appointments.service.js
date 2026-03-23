const { query, newId } = require('../config/query')
const { toAppointmentListItem } = require('../models/appointment.model')

async function listAppointments() {
  const result = await query(
    `SELECT TOP 200
        b.BookingId,
        b.CustomerUserId,
        b.BookingTime,
        b.Status AS BookingStatus,
        b.Notes,
        cu.Name AS CustomerName,
        cu.AvatarUrl AS CustomerAvatarUrl,
        bs.BookingServiceId,
        bs.ServiceId,
        sv.Name AS ServiceName,
        sv.DurationMinutes,
        COALESCE(bs.Price, sv.Price) AS Price,
        bs.StaffId,
        st.StaffId AS StaffIdResolved,
        su.Name AS StaffName,
        su.AvatarUrl AS StaffAvatarUrl
      FROM Bookings b
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      OUTER APPLY (
        SELECT TOP 1 *
        FROM BookingServices x
        WHERE x.BookingId = b.BookingId
        ORDER BY x.BookingServiceId
      ) bs
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
        LEFT JOIN Staff st ON st.StaffId = bs.StaffId
      LEFT JOIN Users su ON su.UserId = st.UserId
      ORDER BY b.BookingTime DESC`
  )

  return (result.recordset || []).map(toAppointmentListItem)
}

async function createAppointment(payload) {
  const { customerUserId, serviceId, staffId, date, time, note } = payload || {}

  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }

  const svc = await query('SELECT Price FROM Services WHERE ServiceId = @serviceId', { serviceId })
  const price = svc.recordset?.[0]?.Price

  const bookingId = newId()
  const bookingServiceId = newId()

  await query(
    `INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
     VALUES (@bookingId, @customerUserId, @bookingTime, @status, @notes);
     INSERT INTO BookingServices (BookingServiceId, BookingId, ServiceId, StaffId, Price, CommissionAmount)
     VALUES (@bookingServiceId, @bookingId, @serviceId, @staffId, @price, NULL);`,
    {
      bookingId,
      customerUserId,
      bookingTime: when,
      status: 'Booked',
      notes: note || null,
      bookingServiceId,
      serviceId,
      staffId,
      price: price ?? 0,
    }
  )

  return { id: bookingId }
}

async function getAppointmentById(bookingId) {
  const result = await query(
    `SELECT TOP 1
        b.BookingId,
        b.CustomerUserId,
        b.BookingTime,
        b.Status AS BookingStatus,
        b.Notes,
        bs.BookingServiceId,
        bs.ServiceId,
        bs.StaffId,
        COALESCE(bs.Price, sv.Price) AS Price
      FROM Bookings b
      OUTER APPLY (
        SELECT TOP 1 *
        FROM BookingServices x
        WHERE x.BookingId = b.BookingId
        ORDER BY x.BookingServiceId
      ) bs
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      WHERE b.BookingId = @bookingId`,
    { bookingId }
  )

  const row = result.recordset?.[0]
  if (!row) return null

  const d = row.BookingTime ? new Date(row.BookingTime) : null
  const iso = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
  const date = iso ? iso.slice(0, 10) : ''
  const time = iso ? iso.slice(11, 16) : ''

  return {
    id: row.BookingId,
    customerUserId: row.CustomerUserId,
    serviceId: row.ServiceId,
    staffId: row.StaffId,
    bookingTime: iso,
    date,
    time,
    status: row.BookingStatus || 'Booked',
    note: row.Notes || '',
    priceVnd: Number(row.Price || 0),
  }
}

async function updateAppointment(bookingId, payload) {
  const { customerUserId, serviceId, staffId, date, time, note } = payload || {}

  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }

  const exists = await query('SELECT TOP 1 BookingId FROM Bookings WHERE BookingId = @bookingId', { bookingId })
  if (!exists.recordset?.length) {
    const err = new Error('Appointment not found')
    err.status = 404
    throw err
  }

  const svc = await query('SELECT Price FROM Services WHERE ServiceId = @serviceId', { serviceId })
  const price = svc.recordset?.[0]?.Price ?? 0

  const bsRes = await query(
    'SELECT TOP 1 BookingServiceId FROM BookingServices WHERE BookingId = @bookingId ORDER BY BookingServiceId',
    { bookingId }
  )
  const bookingServiceId = bsRes.recordset?.[0]?.BookingServiceId || null
  const newBookingServiceId = bookingServiceId || newId()

  await query(
    `UPDATE Bookings
     SET CustomerUserId = @customerUserId,
         BookingTime = @bookingTime,
         Notes = @notes
     WHERE BookingId = @bookingId;

     ${bookingServiceId ? '' : 'INSERT INTO BookingServices (BookingServiceId, BookingId, ServiceId, StaffId, Price, CommissionAmount) VALUES (@bookingServiceId, @bookingId, @serviceId, @staffId, @price, NULL);'}

     ${bookingServiceId ? 'UPDATE BookingServices SET ServiceId = @serviceId, StaffId = @staffId, Price = @price WHERE BookingServiceId = @bookingServiceId;' : ''}
     `,
    {
      bookingId,
      customerUserId,
      bookingTime: when,
      notes: note || null,
      bookingServiceId: newBookingServiceId,
      serviceId,
      staffId,
      price,
    }
  )

  return { id: bookingId }
}

async function cancelAppointment(bookingId) {
  const exists = await query('SELECT TOP 1 BookingId FROM Bookings WHERE BookingId = @bookingId', { bookingId })
  if (!exists.recordset?.length) {
    const err = new Error('Appointment not found')
    err.status = 404
    throw err
  }

  await query('UPDATE Bookings SET Status = @status WHERE BookingId = @bookingId', {
    bookingId,
    status: 'Canceled',
  })
  return { id: bookingId }
}

module.exports = {
  listAppointments,
  createAppointment,
  getAppointmentById,
  updateAppointment,
  cancelAppointment,
}
