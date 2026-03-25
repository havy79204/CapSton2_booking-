const { query, newId } = require('../config/query')
const { toAppointmentListItem } = require('../models/appointment.model')

async function listAppointments() {
  const result = await query(
    `SELECT 
    b.BookingId,
    b.CustomerUserId,
    b.BookingTime,
    b.Status AS BookingStatus,
    b.Notes,
    cu.Name AS CustomerName,

    -- ✅ SERVICE NAMES
    ISNULL(STUFF((
        SELECT ', ' + sv.Name
        FROM BookingServices bs2
        JOIN Services sv ON sv.ServiceId = bs2.ServiceId
        WHERE bs2.BookingId = b.BookingId
        FOR XML PATH('')
    ), 1, 2, ''), 'No Service') AS AllServices,

    -- ✅ SERVICE IDS (FIX CHÍNH)
    ISNULL(STUFF((
        SELECT ',' + CAST(bs2.ServiceId AS VARCHAR)
        FROM BookingServices bs2
        WHERE bs2.BookingId = b.BookingId
        FOR XML PATH('')
    ), 1, 1, ''), '') AS ServiceIds,

    -- ✅ TOTAL DURATION
    ISNULL((
        SELECT SUM(ISNULL(sv2.DurationMinutes, 0))
        FROM BookingServices bs3
        JOIN Services sv2 ON sv2.ServiceId = bs3.ServiceId
        WHERE bs3.BookingId = b.BookingId
    ), 30) AS TotalDuration,

    st.StaffId AS StaffIdResolved,
    su.Name AS StaffName

FROM Bookings b
LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
OUTER APPLY (
    SELECT TOP 1 StaffId FROM BookingServices WHERE BookingId = b.BookingId
) bs_ref
LEFT JOIN Staff st ON st.StaffId = bs_ref.StaffId
LEFT JOIN Users su ON su.UserId = st.UserId
ORDER BY b.BookingTime DESC`
  );

  // Phải map qua toAppointmentListItem để Frontend nhận đúng format
  return (result.recordset || []).map(row => {
  const mapped = toAppointmentListItem(row);

  return {
    ...mapped,
    serviceIds: row.ServiceIds
      ? row.ServiceIds.split(',').map(id => String(id))
      : []
  };
});
  return (result.recordset || []).map(toAppointmentListItem);
}

async function createAppointment(payload) {
  const { customerUserId, serviceIds, staffId, date, time, notes } = payload || {}

if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
  throw new Error('At least one service is required')
}
  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }
  // ===== TÍNH TOTAL DURATION (NHIỀU SERVICE) =====
const services = await query(
  `SELECT DurationMinutes 
   FROM Services 
   WHERE ServiceId IN (${serviceIds.map((_, i) => `@id${i}`).join(',')})`,
  Object.fromEntries(serviceIds.map((id, i) => [`id${i}`, id]))
)

const totalDuration = services.recordset.reduce(
  (sum, s) => sum + (s.DurationMinutes || 0),
  0
)

const newStart = when
const newEnd = new Date(when.getTime() + totalDuration * 60000)

// ===== CHECK TRÙNG (ĐÚNG) =====
const conflict = await query(
  `SELECT 
      b.BookingTime,
      SUM(ISNULL(sv.DurationMinutes, 30)) AS TotalDuration
   FROM Bookings b
   JOIN BookingServices bs ON bs.BookingId = b.BookingId
   LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
   WHERE bs.StaffId = @staffId
   GROUP BY b.BookingTime`,
  { staffId }
)

for (let row of conflict.recordset) {
  const existingStart = new Date(row.BookingTime)
  const existingEnd = new Date(existingStart.getTime() + (row.TotalDuration || 30) * 60000)

  if (newStart < existingEnd && newEnd > existingStart) {
    const err = new Error('Staff already has an appointment at this time')
    err.status = 400
    throw err
  }
}

  const bookingId = newId()
  const bookingServiceId = newId()

await query(
  `INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
   VALUES (@bookingId, @customerUserId, @bookingTime, @status, @notes);`,
  {
    bookingId,
    customerUserId,
    bookingTime: when,
    status: 'Booked',
    notes: notes || null,
  }
)

// 🔥 loop insert services
for (let serviceId of serviceIds) {
  const svc = await query(
    'SELECT Price FROM Services WHERE ServiceId = @serviceId',
    { serviceId }
  )

  await query(
    `INSERT INTO BookingServices 
     (BookingServiceId, BookingId, ServiceId, StaffId, Price)
     VALUES (@id, @bookingId, @serviceId, @staffId, @price)`,
    {
      id: newId(),
      bookingId,
      serviceId,
      staffId,
      price: svc.recordset?.[0]?.Price ?? 0
    }
  )
}

// ✅ THÊM DÒNG NÀY
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
  const { customerUserId, serviceIds, staffId, date, time, notes, status } = payload || {}

  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) {
    const err = new Error('Invalid datetime')
    err.status = 400
    throw err
  }

  // ===== CHECK EXIST =====
  const exists = await query(
    'SELECT TOP 1 * FROM Bookings WHERE BookingId = @bookingId',
    { bookingId }
  )

  if (!exists.recordset?.length) {
    const err = new Error('Appointment not found')
    err.status = 404
    throw err
  }

  // ===== UPDATE BOOKING =====
  await query(
    `UPDATE Bookings
     SET CustomerUserId = @customerUserId,
         BookingTime = @bookingTime,
         Notes = @notes,
         Status = @status
     WHERE BookingId = @bookingId`,
    {
      bookingId,
      customerUserId,
      bookingTime: when,
      notes: notes || null,
      status: status || 'Booked',
    }
  )

  // =================🔥 FIX MULTIPLE SERVICES =================

  if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    // ❌ XÓA hết service cũ
    await query(
      'DELETE FROM BookingServices WHERE BookingId = @bookingId',
      { bookingId }
    )

    // ✅ INSERT lại toàn bộ service mới
    for (let serviceId of serviceIds) {
      const svc = await query(
        'SELECT Price FROM Services WHERE ServiceId = @serviceId',
        { serviceId }
      )

      await query(
        `INSERT INTO BookingServices 
         (BookingServiceId, BookingId, ServiceId, StaffId, Price)
         VALUES (@id, @bookingId, @serviceId, @staffId, @price)`,
        {
          id: newId(),
          bookingId,
          serviceId,
          staffId,
          price: svc.recordset?.[0]?.Price ?? 0
        }
      )
    }
  }

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


