const { asyncHandler } = require('../../utils/asyncHandler')
const servicesService = require('../../services/services.service')

// Staff services controller - chỉ view services và categories

const getServices = asyncHandler(async (req, res) => {
  const data = await servicesService.listServicesGrouped()
  res.json({ ok: true, data })
})

const getServiceCategories = asyncHandler(async (req, res) => {
  const data = await servicesService.listServiceCategories()
  res.json({ ok: true, data })
})

const getServiceById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing service id' })
    return
  }
  
  const data = await servicesService.getServiceById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Service not found' })
    return
  }
  
  res.json({ ok: true, data })
})

// Staff không được tạo, sửa, xóa services

module.exports = {
  getServices,
  getServiceCategories,
  getServiceById,
}
