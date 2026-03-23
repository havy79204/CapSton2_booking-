function toStaffListItem(row) {
  return {
    id: row.StaffId,
    userId: row.UserId || '',
    name: row.Name || '',
    phone: row.Phone || '',
    email: row.Email || '',
    avatarUrl: row.AvatarUrl || '',
    specialty: row.Specialty || '',
    status: row.StaffStatus || 'Working',
  }
}

module.exports = { toStaffListItem }
