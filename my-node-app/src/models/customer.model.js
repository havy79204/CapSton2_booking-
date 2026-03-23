const { formatDmy } = require('../utils/format')

function toCustomerListItem(row) {
  return {
    id: row.UserId,
    name: row.Name,
    phone: row.Phone || '',
    email: row.Email || '',
    avatarUrl: row.AvatarUrl || '',
    note: '',
    visits: Number(row.Visits || 0),
    last: row.LastBooking ? formatDmy(row.LastBooking) : '',
  }
}

module.exports = { toCustomerListItem }
