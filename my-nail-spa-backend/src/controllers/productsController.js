const productsSvc = require('../services/productsService')

async function listProducts(req, res, next) {
  try {
    const salonId = req.query.salonId ? String(req.query.salonId) : null
    const includeDraft = String(req.query.includeDraft || '').toLowerCase() === 'true'
    const items = await productsSvc.listProducts({ salonId, includeDraft, user: req.user })
    res.json({ items })
  } catch (err) { next(err) }
}

async function bulkGet(req, res, next) {
  try {
    const raw = String(req.query.ids || '').trim()
    if (!raw) return res.json({ items: [] })
    const ids = raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50)
    const items = await productsSvc.bulkGet(ids)
    res.json({ items })
  } catch (err) { next(err) }
}

async function getProduct(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const item = await productsSvc.getProduct(id)
    if (!item) return res.status(404).json({ error: 'Product not found' })
    res.json({ item })
  } catch (err) { next(err) }
}

async function createProduct(req, res, next) {
  try {
    const item = await productsSvc.createProduct(req.body, req.user)
    res.status(201).json({ item })
  } catch (err) { next(err) }
}

async function patchProduct(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const item = await productsSvc.updateProduct(id, req.body, req.user)
    res.json({ item })
  } catch (err) { next(err) }
}

async function deleteProduct(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const result = await productsSvc.deleteProduct(id, req.user)
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = {
  listProducts,
  bulkGet,
  getProduct,
  createProduct,
  patchProduct,
  deleteProduct,
}

