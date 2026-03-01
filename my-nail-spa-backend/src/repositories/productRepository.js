const products = require('./productsRepository')

module.exports = {
  findAll: products.findProducts,
  findBulk: products.findBulkByIds,
  findById: products.findById,
  createProduct: products.insertProduct,
  updateProduct: products.updateProduct,
  softDeleteProduct: products.softDeleteProduct,
}
const { query } = require('../db/query')

function mapRow(r) {
  return {
    id: r.ProductId,
    salonId: r.SalonId || 'global',
    name: r.Name,
    description: r.Description,
    badge: r.Badge,
    image: r.ImageUrl,
    price: Number(r.Price || 0),
    stockQty: r.StockQty === null || r.StockQty === undefined ? null : Number(r.StockQty),
  }
}

async function findAll({ salonId, includeDraft } = {}) {
  const where = [`p.Status <> N'deleted'`]
  const bind = {}
  if (salonId && salonId !== 'mixed') {
    if (salonId === 'global') {
      where.push('p.SalonId IS NULL')
    } else {
      where.push('p.SalonId=@salonId')
      bind.salonId = salonId
    }
  }
  if (!includeDraft) where.push("p.Status IN (N'published', N'active')")

  const sql = `SELECT TOP 100 p.* FROM dbo.Products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.CreatedAt DESC`
  const res = await query(sql, bind)
  return (res.recordset || []).map(mapRow)
}

async function findById(id) {
  const res = await query('SELECT TOP 1 * FROM dbo.Products WHERE ProductId=@id AND Status <> N\'deleted\'', { id })
  const row = res.recordset && res.recordset[0]
  if (!row) return null
  return mapRow(row)
}

module.exports = { findAll, findById }
