#!/usr/bin/env node
const { query, newId } = require('../src/config/query')
const apptService = require('../src/services/appointments.service')

async function ensureAnyUser() {
  const res = await query('SELECT TOP 1 UserId FROM Users')
  if (res.recordset && res.recordset.length) return res.recordset[0].UserId

  const userId = newId()
  await query(
    `INSERT INTO Users (UserId, Name, Email, Phone, RoleKey, Status)
     VALUES (@userId, @name, @email, @phone, @roleKey, @status)`,
    { userId, name: 'Seed Customer', email: `seed+${userId}@example.com`, phone: '0900000000', roleKey: 'customer', status: 'ACTIVE' }
  )
  return userId
}

async function pickOneStaff() {
  const r = await query('SELECT TOP 1 StaffId FROM Staff')
  if (r.recordset && r.recordset.length) return r.recordset[0].StaffId
  throw new Error('No staff found in DB. Create a staff first.')
}

async function pickOneService() {
  const r = await query('SELECT TOP 1 ServiceId, Price FROM Services')
  if (r.recordset && r.recordset.length) return r.recordset[0]
  throw new Error('No service found in DB. Create a service first.')
}

async function insertBooking(customerUserId, staffId, serviceId, price, isoDatetime) {
  const bookingId = newId()
  await query(
    `INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
     VALUES (@bookingId, @customerUserId, @bookingTime, @status, @notes)`,
    { bookingId, customerUserId, bookingTime: isoDatetime, status: 'Completed', notes: 'Seeded for commission test' }
  )

  const bookingServiceId = newId()
  await query(
    `INSERT INTO BookingServices (BookingServiceId, BookingId, ServiceId, StaffId, Price)
     VALUES (@id, @bookingId, @serviceId, @staffId, @price)`,
    { id: bookingServiceId, bookingId, serviceId, staffId, price }
  )

  return { bookingId, bookingServiceId }
}

async function main() {
  try {
    console.log('Seeding test bookings for Feb and Mar...')
    const customerUserId = await ensureAnyUser()
    const staffId = await pickOneStaff()
    const svc = await pickOneService()
    const serviceId = svc.ServiceId
    const price = svc.Price || 0

    const dates = [
      '2026-03-05T10:00:00Z',
      '2026-03-15T14:30:00Z',
      '2026-02-10T09:00:00Z',
      '2026-02-20T16:00:00Z',
    ]

    const inserted = []
    for (const dt of dates) {
      const info = await insertBooking(customerUserId, staffId, serviceId, price, new Date(dt))
      inserted.push(info.bookingId)
      console.log('Inserted booking', info.bookingId)
    }

    console.log('Triggering commission recalculation for all staff...')
    if (typeof apptService.recalculateAllCommissions === 'function') {
      await apptService.recalculateAllCommissions()
      console.log('Recalculation finished')
    } else {
      console.warn('recalculateAllCommissions not available on appointments service')
    }

    // Show booking service rows for inserted bookings
    const rowsRes = await query(
      `SELECT bs.BookingServiceId, bs.BookingId, bs.ServiceId, bs.StaffId, COALESCE(bs.Price, sv.Price, 0) AS Price, bs.CommissionAmount, b.BookingTime, b.Status
       FROM BookingServices bs
       LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       WHERE bs.BookingId IN (${inserted.map((_, i) => `@bid${i}`).join(',')})
       ORDER BY b.BookingTime ASC`,
      Object.fromEntries(inserted.map((id, i) => [`bid${i}`, id]))
    )

    console.log('Inserted booking services:')
    for (const r of rowsRes.recordset || []) {
      console.log(JSON.stringify(r))
    }

    console.log('Done.')
    process.exit(0)
  } catch (err) {
    console.error('Error seeding bookings:', err)
    process.exit(1)
  }
}

if (require.main === module) main()
