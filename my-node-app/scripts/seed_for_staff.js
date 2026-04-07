#!/usr/bin/env node
const { query, newId } = require('../src/config/query')
const apptService = require('../src/services/appointments.service')

async function pickOneService() {
  const r = await query('SELECT TOP 1 ServiceId, Price FROM Services')
  if (r.recordset && r.recordset.length) return r.recordset[0]
  throw new Error('No service found in DB. Create a service first.')
}

async function insertBooking(customerUserId, staffId, serviceId, price, when) {
  const bookingId = newId()
  await query(
    `INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
     VALUES (@bookingId, @customerUserId, @bookingTime, @status, @notes)`,
    { bookingId, customerUserId, bookingTime: when, status: 'Completed', notes: 'Seed for specific staff' }
  )

  await query(
    `INSERT INTO BookingServices (BookingServiceId, BookingId, ServiceId, StaffId, Price)
     VALUES (@id, @bookingId, @serviceId, @staffId, @price)`,
    { id: newId(), bookingId, serviceId, staffId, price }
  )

  return bookingId
}

async function main() {
  const staffId = String(process.argv[2] || '2')
  try {
    console.log('Seeding bookings for staff', staffId)
    const svc = await pickOneService()
    const serviceId = svc.ServiceId
    const price = svc.Price || 0

    const dates = ['2026-03-02T10:00:00Z', '2026-03-18T13:00:00Z', '2026-01-20T11:00:00Z']
    const customerRes = await query('SELECT TOP 1 UserId FROM Users')
    const customerUserId = customerRes.recordset?.[0]?.UserId
    if (!customerUserId) throw new Error('No users available')

    const inserted = []
    for (const dt of dates) {
      const id = await insertBooking(customerUserId, staffId, serviceId, price, new Date(dt))
      inserted.push(id)
      console.log('Inserted', id)
    }

    console.log('Recalculating commissions...')
    if (typeof apptService.recalculateAllCommissions === 'function') {
      await apptService.recalculateAllCommissions()
      console.log('Recalc done')
    }

    const rows = await query(
      `SELECT bs.BookingServiceId, bs.BookingId, bs.Price, bs.CommissionAmount, b.BookingTime
       FROM BookingServices bs
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       WHERE bs.StaffId = @staffId
       ORDER BY b.BookingTime ASC`,
      { staffId }
    )
    for (const r of rows.recordset || []) console.log(JSON.stringify(r))

    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

if (require.main === module) main()
