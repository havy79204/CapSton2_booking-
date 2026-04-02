const { asyncHandler } = require('../../utils/asyncHandler')
const inventoryService = require('../../services/inventory.service')

function getActor(req) {
  const payload = req.user || {}
  return {
    userId: payload.sub || payload.userId || null,
    roleKey: payload.roleKey || null,
    name: payload.name || null,
    email: payload.email || null,
  }
}

function normalizeRole(input) {
  return String(input || '').trim().toLowerCase()
}

function ensureOwnerOrAdmin(req) {
  const role = normalizeRole(req?.user?.roleKey)
  if (role === '1' || role === 'owner' || role === 'admin') return

  const err = new Error('Forbidden: only owner/admin can modify or delete inventory lots')
  err.status = 403
  throw err
}

const getInventory = asyncHandler(async (req, res) => {
  const data = await inventoryService.getInventory()
  res.json({ ok: true, data })
})

const postInventoryItem = asyncHandler(async (req, res) => {
  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await inventoryService.createInventoryItem(req.body, { actor: getActor(req) })
  res.status(201).json({ ok: true, data })
})

const putInventoryItem = asyncHandler(async (req, res) => {
  const id = req.params?.id
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await inventoryService.updateItem(id, req.body)
  res.json({ ok: true, data })
})

const deleteInventoryItem = asyncHandler(async (req, res) => {
  const id = req.params?.id
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await inventoryService.deleteItem(id)
  res.json({ ok: true, data })
})

const postInventoryStockIn = asyncHandler(async (req, res) => {
  const data = await inventoryService.stockIn(req.body, { actor: getActor(req) })
  res.status(201).json({ ok: true, data })
})

const postInventoryStockOut = asyncHandler(async (req, res) => {
  const data = await inventoryService.stockOut(req.body, { actor: getActor(req) })
  res.status(201).json({ ok: true, data })
})

const postInventoryFifoPreview = asyncHandler(async (req, res) => {
  const data = await inventoryService.fifoPreview(req.body)
  res.json({ ok: true, data })
})

const postInventoryImportExcel = asyncHandler(async (req, res) => {
  const data = await inventoryService.importInventoryFromExcel(req.body, { actor: getActor(req) })
  res.json({ ok: true, data })
})

const putInventoryLot = asyncHandler(async (req, res) => {
  ensureOwnerOrAdmin(req)
  const lotId = req.params?.lotId
  if (!lotId) {
    res.status(400).json({ ok: false, error: 'Missing lotId' })
    return
  }

  const data = await inventoryService.updateLot(lotId, req.body, { actor: getActor(req) })
  res.json({ ok: true, data })
})

const deleteInventoryLot = asyncHandler(async (req, res) => {
  ensureOwnerOrAdmin(req)
  const lotId = req.params?.lotId
  if (!lotId) {
    res.status(400).json({ ok: false, error: 'Missing lotId' })
    return
  }

  const data = await inventoryService.deleteLot(lotId, { actor: getActor(req) })
  res.json({ ok: true, data })
})

const getInventoryImportTemplate = asyncHandler(async (_req, res) => {
  const buffer = await inventoryService.getInventoryImportTemplateBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-import-template.xlsx"')
  res.send(buffer)
})

module.exports = {
  getInventory,
  postInventoryItem,
  putInventoryItem,
  deleteInventoryItem,
  postInventoryStockIn,
  postInventoryStockOut,
  postInventoryFifoPreview,
  postInventoryImportExcel,
  putInventoryLot,
  deleteInventoryLot,
  getInventoryImportTemplate,
}
