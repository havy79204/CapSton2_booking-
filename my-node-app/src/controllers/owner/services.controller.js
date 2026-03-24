const { asyncHandler } = require('../../utils/asyncHandler')
const servicesService = require('../../services/services.service')

const getServices = asyncHandler(async (req, res) => {
  const data = await servicesService.listServicesGrouped()
  res.json({ ok: true, data })
})

const getServiceCategories = asyncHandler(async (req, res) => {
  const data = await servicesService.listServiceCategories()
  res.json({ ok: true, data })
})

const postServiceCategory = asyncHandler(async (req, res) => {
  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await servicesService.createServiceCategory(req.body)
  res.status(201).json({ ok: true, data })
})

const postService = asyncHandler(async (req, res) => {
  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await servicesService.createService(req.body)
  res.status(201).json({ ok: true, data })
})

const getServiceById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await servicesService.getServiceById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Service not found' })
    return
  }

  res.json({ ok: true, data })
})

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

const deleteService = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await servicesService.deleteService(id)
  res.json({ ok: true, data })
})

const postServiceUploadImage = asyncHandler(async (req, res) => {
  const { dataUrl } = req.body || {}
  const data = await servicesService.uploadServiceImageFromDataUrl({ dataUrl })
  res.json({ ok: true, data })
})

module.exports = {
  getServices,
  getServiceCategories,
  postServiceCategory,
  getServiceById,
  postService,
  putService,
  deleteService,
  postServiceUploadImage,
}
