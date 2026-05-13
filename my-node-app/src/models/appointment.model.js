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
        bookingCode: row.BookingCode || row.bookingCode || null,
        createdAt: row.BookingCreatedAt || row.CreatedAt || row.createdAt || null,
        customerUserId: row.CustomerUserId,
        staffId: row.StaffIdResolved,

    service: row.AllServices || row.FirstService || 'No Service',
    duration: Number(row.TotalDuration || 30),

        customer: row.CustomerName || 'Khách hàng',
        customerPhone: row.CustomerPhone || '',
        staff: row.StaffName || 'Nhân viên',
        status: (row.BookingStatus || 'pending').toLowerCase(),
        note: row.Notes || '',
        price: Number(row.TotalPrice || 0),

    time: timeValue,
    date: dateValue,
    bookingTime: row.BookingTime,
    
    // Preserve price fields if they exist
    price: row.Price ? Number(row.Price) : undefined,
    discount: row.Discount ? Number(row.Discount) : undefined,
    discountType: row.DiscountType,
    totalPrice: row.TotalPrice ? Number(row.TotalPrice) : undefined
  }
}

module.exports = { toAppointmentListItem }