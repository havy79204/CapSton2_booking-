const STAFF_HOURLY_RATE_VND = 25000

function formatDateOnly(value) {
  if (!value) return null

  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})$/)
    if (dateOnly) return dateOnly[1]
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toStaffListItem(row) {
  const totalBookings = Number(row.TotalBookings || 0)
  const workingHours = Number(row.WorkingHours || 0)
  const rating = Number(row.AverageRating || 0)
  const totalTip = Number(row.TotalTip || 0)
  const normalizedWorkingHours = Number.isFinite(workingHours) ? Math.round(workingHours * 100) / 100 : 0
  const normalizedTip = Number.isFinite(totalTip) ? totalTip : 0
  const totalSalary = (normalizedWorkingHours * STAFF_HOURLY_RATE_VND) + normalizedTip

  return {
    id: row.StaffId,
    userId: row.UserId || '',
    name: row.Name || '',
    phone: row.Phone || '',
    email: row.Email || '',
    avatarUrl: row.AvatarUrl || '',
    address: row.Address || '',
    hireDate: formatDateOnly(row.HireDate),
    roleKey: String(row.RoleKey || '').trim(),
    roleName: row.RoleName || '',
    specialty: row.Specialty || '',
    status: String(row.StaffStatus || '').trim(),
    totalBookings: Number.isFinite(totalBookings) ? totalBookings : 0,
    workingHours: normalizedWorkingHours,
    totalSalary: Number.isFinite(totalSalary) ? Math.round(totalSalary) : 0,
    totalTip: normalizedTip,
    rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : 0,
  }
}

module.exports = {
  formatDateOnly,
  toStaffListItem,
}
