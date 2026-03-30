const { formatHm, formatVnd } = require('../utils/format')

function toAppointmentListItem(row) {
  const d = row.BookingTime ? new Date(row.BookingTime) : null

  let timeValue = "09:00"
  let dateValue = ""

  if (d && !isNaN(d.getTime())) {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    timeValue = `${hh}:${mm}`

    const yyyy = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    dateValue = `${yyyy}-${month}-${day}`
  }

  return {
    id: row.BookingId,
    customerUserId: row.CustomerUserId,
    staffId: row.StaffIdResolved,

    service: row.AllServices || 'No Service',
    duration: Number(row.TotalDuration || 30),

    customer: row.CustomerName || 'Khách hàng',
    staff: row.StaffName || 'Nhân viên',
    status: (row.BookingStatus || 'pending').toLowerCase(),
    note: row.Notes || '',

    time: timeValue,
    date: dateValue,
    bookingTime: row.BookingTime
  }
}

module.exports = { toAppointmentListItem }