const { asyncHandler } = require('../../utils/asyncHandler')
const retailService = require('../../services/retail.service')

function getActor(req) {
  const payload = req.user || {}
  return {
    userId: payload.sub || payload.userId || null,
    roleKey: payload.roleKey || null,
    name: payload.name || null,
    email: payload.email || null,
  }
}

function ensureOwnerOrAdmin(req) {
  const rawRole = req?.user?.roleKey
  const roleNum = Number(rawRole)
  const roleText = String(rawRole || '').trim().toLowerCase()
  if (roleNum === 1 || roleText === '1' || roleText === 'owner' || roleText === 'admin') return
  const err = new Error('Owner/Admin access required')
  err.status = 403
  throw err
}

const getRetailProducts = asyncHandler(async (req, res) => {
  const opts = req.query || {}
  const data = await retailService.listRetailProducts(opts)
  res.json({ ok: true, data })
})

const postRetailProduct = asyncHandler(async (req, res) => {
  const data = await retailService.createRetailProduct(req.body)
  res.status(201).json({ ok: true, data })
})

const getRetailMeta = asyncHandler(async (req, res) => {
  const data = await retailService.listRetailMeta()
  res.json({ ok: true, data })
})

const getRetailProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params || {}
  if (!productId) {
    res.status(400).json({ ok: false, error: 'Missing productId' })
    return
  }

  const data = await retailService.getProduct(productId)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Product not found' })
    return
  }

  res.json({ ok: true, data })
})

const putRetailProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params || {}
  if (!productId) {
    res.status(400).json({ ok: false, error: 'Missing productId' })
    return
  }

  const data = await retailService.updateRetailProduct(productId, req.body)
  res.json({ ok: true, data })
})

const deleteRetailProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params || {}
  if (!productId) {
    res.status(400).json({ ok: false, error: 'Missing productId' })
    return
  }

  const data = await retailService.deleteRetailProduct(productId)
  res.json({ ok: true, data })
})

const getVariants = asyncHandler(async (req, res) => {
  const { productId } = req.params || {}
  if (!productId) {
    res.status(400).json({ ok: false, error: 'Missing productId' })
    return
  }

  const data = await retailService.listVariants(productId)
  res.json({ ok: true, data })
})

const postVariant = asyncHandler(async (req, res) => {
  const { productId } = req.params || {}
  if (!productId) {
    res.status(400).json({ ok: false, error: 'Missing productId' })
    return
  }

  const data = await retailService.createVariant(productId, req.body)
  res.status(201).json({ ok: true, data })
})

const putVariant = asyncHandler(async (req, res) => {
  const { variantId } = req.params || {}
  if (!variantId) {
    res.status(400).json({ ok: false, error: 'Missing variantId' })
    return
  }

  const data = await retailService.updateVariant(variantId, req.body)
  res.json({ ok: true, data })
})

const deleteVariant = asyncHandler(async (req, res) => {
  const { variantId } = req.params || {}
  if (!variantId) {
    res.status(400).json({ ok: false, error: 'Missing variantId' })
    return
  }

  const data = await retailService.deleteVariant(variantId)
  res.json({ ok: true, data })
})

const postRetailUploadImage = asyncHandler(async (req, res) => {
  const { dataUrl } = req.body || {}
  const data = await retailService.uploadProductImageFromDataUrl({ dataUrl })
  res.json({ ok: true, data })
})

const getRetailCategories = asyncHandler(async (req, res) => {
  const data = await retailService.listProductCategories()
  res.json({ ok: true, data })
})

const postRetailCategory = asyncHandler(async (req, res) => {
  const data = await retailService.createProductCategory(req.body)
  res.status(201).json({ ok: true, data })
})

const getRetailOrders = asyncHandler(async (req, res) => {
  const data = await retailService.listRetailOrders(req.query || {})
  res.json({ ok: true, data })
})

const postRetailOrder = asyncHandler(async (req, res) => {
  const data = await retailService.createRetailOrder(req.body || {}, { actor: getActor(req) })
  res.status(201).json({ ok: true, data })
})

const getRetailOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params || {}
  if (!orderId) {
    res.status(400).json({ ok: false, error: 'Missing orderId' })
    return
  }

  const data = await retailService.getRetailOrder(orderId)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Order not found' })
    return
  }

  res.json({ ok: true, data })
})

const putRetailOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params || {}
  if (!orderId) {
    res.status(400).json({ ok: false, error: 'Missing orderId' })
    return
  }

  const data = await retailService.updateRetailOrder(orderId, req.body || {}, { actor: getActor(req) })
  res.json({ ok: true, data })
})

const patchRetailOrderProcess = asyncHandler(async (req, res) => {
  ensureOwnerOrAdmin(req)
  const { orderId } = req.params || {}
  const data = await retailService.transitionRetailOrderStatus(orderId, 'PROCESSING', { actor: getActor(req) })
  res.json({ ok: true, data })
})

const patchRetailOrderShip = asyncHandler(async (req, res) => {
  ensureOwnerOrAdmin(req)
  const { orderId } = req.params || {}
  const data = await retailService.transitionRetailOrderStatus(orderId, 'SHIPPING', { actor: getActor(req) })
  res.json({ ok: true, data })
})

const patchRetailOrderCancel = asyncHandler(async (req, res) => {
  ensureOwnerOrAdmin(req)
  const { orderId } = req.params || {}
  const data = await retailService.transitionRetailOrderStatus(orderId, 'CANCELLED', { actor: getActor(req) })
  res.json({ ok: true, data })
})

const deleteRetailOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params || {}
  if (!orderId) {
    res.status(400).json({ ok: false, error: 'Missing orderId' })
    return
  }

  const data = await retailService.deleteRetailOrder(orderId)
  res.json({ ok: true, data })
})

module.exports = {
  getRetailProducts,
  postRetailProduct,
  getRetailMeta,
  getRetailProduct,
  putRetailProduct,
  deleteRetailProduct,
  getVariants,
  postVariant,
  putVariant,
  deleteVariant,
  postRetailUploadImage,
  getRetailCategories,
  postRetailCategory,
  getRetailOrders,
  postRetailOrder,
  getRetailOrder,
  putRetailOrder,
  patchRetailOrderProcess,
  patchRetailOrderShip,
  patchRetailOrderCancel,
  deleteRetailOrder,
}
