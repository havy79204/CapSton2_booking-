const { asyncHandler } = require('../../utils/asyncHandler')
const inventoryService = require('../../services/inventory.service')

// Staff inventory controller - chỉ view và cập nhật stock, không được xóa

const getInventory = asyncHandler(async (req, res) => {
  const result = await inventoryService.getInventory()
  res.json({ ok: true, data: result.items })
})

const getInventoryItemById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }
  
  const data = await inventoryService.getInventoryItemById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Item not found' })
    return
  }
  
  res.json({ ok: true, data })
})

const postInventoryStockIn = asyncHandler(async (req, res) => {
  const { inventoryId, quantity, notes } = req.body || {}
  
  if (!inventoryId || !quantity) {
    res.status(400).json({ ok: false, error: 'Missing inventoryId or quantity' })
    return
  }
  
  const staffId = req.user?.userId || req.user?.sub
  const data = await inventoryService.stockIn({
    inventoryId,
    quantity,
    notes,
    performedBy: staffId
  })
  
  res.status(201).json({ ok: true, data })
})

const postInventoryStockOut = asyncHandler(async (req, res) => {
  const { inventoryId, quantity, notes } = req.body || {}
  
  if (!inventoryId || !quantity) {
    res.status(400).json({ ok: false, error: 'Missing inventoryId or quantity' })
    return
  }
  
  const staffId = req.user?.userId || req.user?.sub
  const data = await inventoryService.stockOut({
    inventoryId,
    quantity,
    notes,
    performedBy: staffId
  })
  
  res.status(201).json({ ok: true, data })
})

// Staff không được tạo mới hoặc xóa inventory items - chỉ Owner mới được

module.exports = {
  getInventory,
  getInventoryItemById,
  postInventoryStockIn,
  postInventoryStockOut,
}
