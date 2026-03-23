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

module.exports = {
  getInventory,
  postInventoryItem,
  putInventoryItem,
  deleteInventoryItem,
  postInventoryStockIn,
  postInventoryStockOut,
}
