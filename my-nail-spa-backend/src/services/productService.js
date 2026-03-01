const productRepo = require('../repositories/productRepository')
const { newId } = require('../db/query')

async function listProducts({ salonId, includeDraft } = {}) {
  return productRepo.findAll({ salonId, includeDraft })
}

async function getProduct(id) {
  if (!id) return null
  return productRepo.findById(id)
}

async function getProductsBulk(ids = []) {
  return productRepo.findBulk(ids)
}

async function createProduct(user, body) {
  const id = newId()
  const requestedSalonId = body.salonId && body.salonId !== 'global' ? body.salonId : null
  const salonId = user?.role === 'owner' ? String(user.salonId || '') || null : requestedSalonId

  if (user?.role === 'owner') {
    const mySalonId = String(user.salonId || '').trim()
    if (!mySalonId) throw Object.assign(new Error('Owner has no salonId'), { status: 403 })
    if (requestedSalonId && String(requestedSalonId) !== mySalonId) throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  const sku = body.sku ? String(body.sku).trim().replace(/\s+/g, '-').toUpperCase() : null

  const item = await productRepo.createProduct({
    id,
    salonId,
    sku,
    name: body.name,
    description: body.description || null,
    badge: body.badge || null,
    imageUrl: body.image || null,
    price: Number(body.price || 0),
    status: body.status || 'published',
  })
  return item
}

async function updateProduct(user, id, body) {
  const existing = await productRepo.findById(id)
  if (!existing) throw Object.assign(new Error('Product not found'), { status: 404 })
  if (user?.role === 'owner') {
    const mySalonId = String(user.salonId || '').trim()
    const productSalonId = existing.salonId || 'global'
    if (!mySalonId) throw Object.assign(new Error('Owner has no salonId'), { status: 403 })
    if (productSalonId !== mySalonId) throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  const sku = body.sku !== undefined ? (String(body.sku || '').trim() ? String(body.sku).trim().replace(/\s+/g, '-').toUpperCase() : null) : existing.sku

  const updated = await productRepo.updateProduct(id, {
    sku,
    name: body.name ?? existing.name,
    description: body.description !== undefined ? (body.description || null) : existing.description,
    badge: body.badge !== undefined ? (body.badge || null) : existing.badge,
    imageUrl: body.image !== undefined ? (body.image || null) : existing.image,
    price: body.price ?? existing.price,
    status: body.status ?? existing.status,
  })
  return updated
}

async function deleteProduct(user, id) {
  const existing = await productRepo.findById(id)
  if (!existing) throw Object.assign(new Error('Product not found'), { status: 404 })
  if (user?.role === 'owner') {
    const mySalonId = String(user.salonId || '').trim()
    const productSalonId = existing.salonId || 'global'
    if (!mySalonId) throw Object.assign(new Error('Owner has no salonId'), { status: 403 })
    if (productSalonId !== mySalonId) throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
  await productRepo.softDeleteProduct(id)
  return true
}

module.exports = { listProducts, getProduct, getProductsBulk, createProduct, updateProduct, deleteProduct }
