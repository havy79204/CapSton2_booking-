const { asyncHandler } = require('../../utils/asyncHandler')
const retailService = require('../../services/retail.service')

// Staff products controller - chỉ view, không được tạo/sửa/xóa

const getRetailProducts = asyncHandler(async (req, res) => {
  const data = await retailService.listRetailProducts()
  res.json({ ok: true, data })
})

const getRetailProduct = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing product id' })
    return
  }
  
  const data = await retailService.getProduct(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Product not found' })
    return
  }
  
  res.json({ ok: true, data })
})

const getRetailMeta = asyncHandler(async (req, res) => {
  const data = await retailService.listRetailMeta()
  res.json({ ok: true, data })
})

// Staff không được tạo, sửa, xóa products

module.exports = {
  getRetailProducts,
  getRetailProduct,
  getRetailMeta,
}
