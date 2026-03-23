const { formatVnd } = require('../utils/format')

function displayStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  if (s === 'active') return 'Active'
  if (s === 'inactive') return 'Inactive'
  return String(status || '').trim() || 'Service'
}

function toServiceListItem(row) {
  return {
    id: row.ServiceId,
    categoryId: row.CategoryId || '',
    category: row.CategoryName || '',
    tag: displayStatus(row.Status),
    name: row.Name,
    durationMinutes: row.DurationMinutes === null || row.DurationMinutes === undefined ? null : Number(row.DurationMinutes),
    duration: `${Number(row.DurationMinutes || 0)} min`,
    priceVnd: Number(row.Price || 0),
    price: formatVnd(row.Price),
    description: row.Description || '',
    status: row.Status || '',
  }
}

module.exports = { toServiceListItem }
