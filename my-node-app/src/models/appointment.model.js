const { formatHm, formatVnd } = require('../utils/format')

function toAppointmentListItem(row) {
  const d = row.BookingTime ? new Date(row.BookingTime) : null
  const day = d && !Number.isNaN(d.getTime()) ? String(d.getDate()) : ''
  const month = d && !Number.isNaN(d.getTime()) ? `Month ${d.getMonth() + 1}` : ''
  const status = row.BookingStatus || 'Booked'
  const iso = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
  const date = iso ? iso.slice(0, 10) : ''
  const timeValue = iso ? iso.slice(11, 16) : ''

  return {
    id: row.BookingId,
    customerUserId: row.CustomerUserId || '',
    serviceId: row.ServiceId || '',
    staffId: row.StaffId || row.StaffIdResolved || '',
    bookingTime: iso,
    date,
    timeValue,
    day,
    month,
    customer: row.CustomerName || '',
    customerAvatarUrl: row.CustomerAvatarUrl || '',
    status,
    time: formatHm(row.BookingTime),
    duration: `${Number(row.DurationMinutes || 0)} min`,
    staff: row.StaffName || '',
    staffAvatarUrl: row.StaffAvatarUrl || '',
    service: row.ServiceName || '',
    price: formatVnd(row.Price),
    priceVnd: Number(row.Price || 0),
    note: row.Notes || '',
  }
}

module.exports = { toAppointmentListItem }
