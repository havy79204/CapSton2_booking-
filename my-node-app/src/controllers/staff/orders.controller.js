const { asyncHandler } = require('../../utils/asyncHandler')
const retailService = require('../../services/retail.service')

// Staff orders controller - chỉ view và update status, không được tạo/xóa

const getRetailOrders = asyncHandler(async (req, res) => {
  const { status, keyword, page, pageSize, sortBy, sortDir } = req.query || {}
  const data = await retailService.listRetailOrders({
    status,
    keyword,
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 10,
    sortBy,
    sortDir
  })
  res.json({ ok: true, data })
})

const getRetailOrder = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing order id' })
    return
  }
  
  const data = await retailService.getRetailOrder(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Order not found' })
    return
  }
  
  res.json({ ok: true, data })
})

const putRetailOrder = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  const { status, notes } = req.body || {}
  
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing order id' })
    return
  }
  
  const existing = await retailService.getRetailOrder(id)
  if (!existing) {
    res.status(404).json({ ok: false, error: 'Order not found' })
    return
  }
  
  const allowedUpdates = {}
  if (status) allowedUpdates.status = status
  if (notes) allowedUpdates.notes = notes
  
  if (Object.keys(allowedUpdates).length === 0) {
    res.status(400).json({ ok: false, error: 'No valid fields to update' })
    return
  }
  
  const data = await retailService.updateRetailOrder(id, allowedUpdates)
  res.json({ ok: true, data })
})

module.exports = {
  getRetailOrders,
  getRetailOrder,
  putRetailOrder,
}
