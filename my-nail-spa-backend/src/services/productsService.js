const { z } = require('zod')
const productsRepo = require('../repositories/productsRepository')

function mapProductRow(r) {
  return {
    id: r.ProductId,
    salonId: r.SalonId || 'global',
    salon: r.SalonId ? { id: r.SalonId, name: r.SalonName || null, address: r.SalonAddress || null, avatarImageUrl: r.SalonAvatarImageUrl || null } : null,
    sku: r.SKU || null,
    stockQty: r.StockQty === null || r.StockQty === undefined ? null : Number(r.StockQty),
    name: r.Name,
    description: r.Description,
    badge: r.Badge,
    image: r.ImageUrl,
    price: Number(r.Price),
    status: r.Status,
    createdAt: r.CreatedAt,
    updatedAt: r.UpdatedAt,
  }
}

async function listProducts({ salonId, includeDraft, user } = {}) {
  const includeSku = await productsRepo.hasProductsSkuColumn()
  const includeDraftFlag = !!includeDraft && (user?.role === 'admin' || user?.role === 'owner')
  const rows = await productsRepo.findProducts({ includeSku, salonId, includeDraft: includeDraftFlag })
  return rows.map(mapProductRow)
}

async function bulkGet(ids = []) {
  const includeSku = await productsRepo.hasProductsSkuColumn()
  const rows = await productsRepo.findBulkByIds(ids, includeSku)
  return rows.map(mapProductRow)
}

async function getProduct(id) {
  const includeSku = await productsRepo.hasProductsSkuColumn()
  const row = await productsRepo.findById(id, includeSku)
  if (!row) return null
  return mapProductRow(row)
}

async function createProduct(body, user) {
  const schema = z.object({ salonId: z.string().optional(), sku: z.string().optional(), name: z.string().min(1), description: z.string().optional(), badge: z.string().optional(), image: z.string().optional(), price: z.number().nonnegative(), status: z.string().optional() })
  const payload = schema.parse(body)
  const includeSku = await productsRepo.hasProductsSkuColumn()
  const requestedSalonId = payload.salonId && payload.salonId !== 'global' ? payload.salonId : null
  const salonId = user.role === 'owner' ? String(user.salonId || '').trim() || null : requestedSalonId
  if (user.role === 'owner') {
    const mySalonId = String(user.salonId || '').trim()
    if (!mySalonId) throw Object.assign(new Error('Owner has no salonId'), { status: 403 })
    if (requestedSalonId && String(requestedSalonId) !== mySalonId) throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  const sku = includeSku && payload.sku ? String(payload.sku).trim().replace(/\s+/g, '-').toUpperCase() : undefined
  const id = await productsRepo.insertProduct({ salonId, sku, name: payload.name, description: payload.description || null, badge: payload.badge || null, imageUrl: payload.image || null, price: payload.price, status: payload.status || 'published' })
  const created = await productsRepo.findById(id, includeSku)
  return mapProductRow(created)
}

async function updateProduct(id, body, user) {
  const includeSku = await productsRepo.hasProductsSkuColumn()
  const existing = await productsRepo.findById(id, includeSku)
  if (!existing) throw Object.assign(new Error('Product not found'), { status: 404 })
  if (user.role === 'owner') {
    const mySalonId = String(user.salonId || '').trim()
    const productSalonId = existing.SalonId ? String(existing.SalonId) : 'global'
    if (!mySalonId) throw Object.assign(new Error('Owner has no salonId'), { status: 403 })
    if (productSalonId !== mySalonId) throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  const schema = z.object({ sku: z.string().optional(), name: z.string().min(1).optional(), description: z.string().optional(), badge: z.string().optional(), image: z.string().optional(), price: z.number().nonnegative().optional(), status: z.string().optional() })
  const payload = schema.parse(body)
  const sku = includeSku && payload.sku !== undefined ? (String(payload.sku || '').trim() ? String(payload.sku).trim().replace(/\s+/g, '-').toUpperCase() : null) : existing.SKU

  await productsRepo.updateProduct(id, { sku, name: payload.name, description: payload.description, badge: payload.badge, imageUrl: payload.image, price: payload.price, status: payload.status }, includeSku, existing)
  const updated = await productsRepo.findById(id, includeSku)
  return mapProductRow(updated)
}

async function deleteProduct(id, user) {
  const existing = await productsRepo.findById(id, await productsRepo.hasProductsSkuColumn())
  if (!existing) return { ok: true }
  if (user.role === 'owner') {
    const mySalonId = String(user.salonId || '').trim()
    const productSalonId = existing.SalonId ? String(existing.SalonId) : 'global'
    if (!mySalonId) throw Object.assign(new Error('Owner has no salonId'), { status: 403 })
    if (productSalonId !== mySalonId) throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
  await productsRepo.softDeleteProduct(id)
  return { ok: true }
}

module.exports = {
  listProducts,
  bulkGet,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
}
