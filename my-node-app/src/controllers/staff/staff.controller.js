const { asyncHandler } = require('../../utils/asyncHandler')
const staffService = require('../../services/staff.service')

// Staff staff controller - chỉ xem danh sách colleagues, không tạo/sửa/xóa

const getStaff = asyncHandler(async (req, res) => {
  const { keyword, page, pageSize } = req.query || {}
  
  const data = await staffService.listStaff({
    keyword,
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 10,
    status: 'ACTIVE' // Chỉ xem staff đang active
  })
  
  // Ẩn thông tin nhạy cảm như salary
  if (data && Array.isArray(data.items)) {
    data.items = data.items.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      role: s.role,
      status: s.status,
      hireDate: s.hireDate,
      avatar: s.avatar
      // Không bao gồm salary, address chi tiết, v.v.
    }))
  }
  
  res.json({ ok: true, data })
})

const getStaffSkillCategories = asyncHandler(async (req, res) => {
  const data = await staffService.getSkillCategories()
  res.json({ ok: true, data })
})

const getStaffById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing staff id' })
    return
  }
  
  const data = await staffService.getStaffById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Staff not found' })
    return
  }
  
  // Ẩn thông tin nhạy cảm
  const sanitized = {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: data.role,
    status: data.status,
    hireDate: data.hireDate,
    avatar: data.avatar,
    skills: data.skills,
    bio: data.bio
  }
  
  res.json({ ok: true, data: sanitized })
})

// Staff không được tạo, sửa, xóa staff members

module.exports = {
  getStaff,
  getStaffSkillCategories,
  getStaffById,
}
