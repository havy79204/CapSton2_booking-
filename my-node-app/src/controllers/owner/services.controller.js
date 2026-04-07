const { asyncHandler } = require('../../utils/asyncHandler')
const servicesService = require('../../services/services.service')

// 1. Lấy danh sách dịch vụ (đã gom nhóm)
const getServices = asyncHandler(async (req, res) => {
  const data = await servicesService.listServicesGrouped(true)
  res.json({ ok: true, data })
})

// 2. Lấy toàn bộ danh mục dịch vụ (Dùng cho dropdown tĩnh ban đầu)
const getServiceCategories = asyncHandler(async (req, res) => {
  const data = await servicesService.listServiceCategories()
  res.json({ ok: true, data })
})

/**
 * 3. TÌM KIẾM GỢI Ý DANH MỤC (Search Suggestion - Giống Google)
 * URL: GET /services/categories/search?q=móng
 */
const searchServiceCategories = asyncHandler(async (req, res) => {
  const { q } = req.query || {}
  
  // Nếu không có từ khóa, trả về mảng rỗng để FE không bị lỗi
  if (!q || q.trim() === '') {
    return res.json({ ok: true, data: [] })
  }

  // Gọi logic tìm kiếm từ tầng Service
  const data = await servicesService.searchServiceCategories(q)
  res.json({ ok: true, data })
})

// 4. Tạo mới một danh mục dịch vụ
const postServiceCategory = asyncHandler(async (req, res) => {
  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await servicesService.createServiceCategory(req.body)
  res.status(201).json({ ok: true, data })
})

// 5. Tạo mới một dịch vụ
const postService = asyncHandler(async (req, res) => {
  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await servicesService.createService(req.body)
  res.status(201).json({ ok: true, data })
})

// 6. Lấy chi tiết dịch vụ theo ID
const getServiceById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await servicesService.getServiceById(id, true)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Service not found' })
    return
  }

  res.json({ ok: true, data })
})

// 7. Cập nhật thông tin dịch vụ
const putService = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await servicesService.updateService(id, req.body)
  res.json({ ok: true, data })
})

// 8. Xóa dịch vụ
const deleteService = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await servicesService.deleteService(id)
  res.json({ ok: true, data })
})

// 9. Upload ảnh dịch vụ
const postServiceUploadImage = asyncHandler(async (req, res) => {
  const { dataUrl } = req.body || {}
  const data = await servicesService.uploadServiceImageFromDataUrl({ dataUrl })
  res.json({ ok: true, data })
})

module.exports = {
  getServices,
  getServiceCategories,
  searchServiceCategories, // <--- Đã thêm hàm search vào đây
  postServiceCategory,
  getServiceById,
  postService,
  putService,
  deleteService,
  postServiceUploadImage,
}