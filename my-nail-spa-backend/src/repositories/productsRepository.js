const { query, newId } = require('../config/query')

let _hasProductsSkuColumn = null
async function hasProductsSkuColumn() {
  if (_hasProductsSkuColumn !== null) return _hasProductsSkuColumn
  try {
    const r = await query("SELECT COL_LENGTH('dbo.Products', 'SKU') AS Len")
    _hasProductsSkuColumn = Boolean(r?.recordset?.[0]?.Len)
  } catch {
    _hasProductsSkuColumn = false
  }
  return _hasProductsSkuColumn
}

function _mapSalonSelect(includeSku) {
  if (includeSku) return `ii.QtyOnHand AS StockQty, COALESCE(sp.Name, s.Name) AS SalonName, COALESCE(sp.Address, s.Address) AS SalonAddress, COALESCE(sp.AvatarImageUrl, s.LogoUrl) AS SalonAvatarImageUrl`
  return `COALESCE(sp.Name, s.Name) AS SalonName, COALESCE(sp.Address, s.Address) AS SalonAddress, COALESCE(sp.AvatarImageUrl, s.LogoUrl) AS SalonAvatarImageUrl`
}

async function findProducts({ includeSku = false, salonId = null, includeDraft = false } = {}) {
  const where = []
  const bind = {}
  where.push("p.Status <> N'deleted'")
  if (salonId && salonId !== 'mixed') {
    if (salonId === 'global') {
      where.push('p.SalonId IS NULL')
    } else {
      where.push('p.SalonId=@salonId')
      bind.salonId = salonId
    }
  }
  if (!includeDraft) {
    where.push("p.Status IN (N'published', N'active')")
  }

  const sql = includeSku
    ? `SELECT p.*, ${_mapSalonSelect(true)} FROM dbo.Products p LEFT JOIN dbo.InventoryItems ii ON ii.SalonKey = COALESCE(p.SalonId, N'global') AND ii.SKU = p.SKU LEFT JOIN dbo.Salons s ON p.SalonId = s.SalonId LEFT JOIN dbo.SalonProfiles sp ON p.SalonId = sp.SalonId ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.CreatedAt DESC`
    : `SELECT p.*, ${_mapSalonSelect(false)} FROM dbo.Products p LEFT JOIN dbo.Salons s ON p.SalonId = s.SalonId LEFT JOIN dbo.SalonProfiles sp ON p.SalonId = sp.SalonId ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.CreatedAt DESC`

  const r = await query(sql, bind)
  return r.recordset || []
}

async function findBulkByIds(ids = [], includeSku = false) {
  if (!Array.isArray(ids) || !ids.length) return []
  const poolIds = ids.map((_, i) => `@id${i}`).join(',')
  const bind = {}
  ids.forEach((id, i) => { bind[`id${i}`] = id })
  const sql = includeSku
    ? `SELECT p.*, ii.QtyOnHand AS StockQty, ${_mapSalonSelect(true)} FROM dbo.Products p LEFT JOIN dbo.InventoryItems ii ON ii.SalonKey = COALESCE(p.SalonId, N'global') AND ii.SKU = p.SKU LEFT JOIN dbo.Salons s ON p.SalonId = s.SalonId LEFT JOIN dbo.SalonProfiles sp ON p.SalonId = sp.SalonId WHERE p.ProductId IN (${poolIds}) AND p.Status <> N'deleted'`
    : `SELECT p.*, ${_mapSalonSelect(false)} FROM dbo.Products p LEFT JOIN dbo.Salons s ON p.SalonId = s.SalonId LEFT JOIN dbo.SalonProfiles sp ON p.SalonId = sp.SalonId WHERE p.ProductId IN (${poolIds}) AND p.Status <> N'deleted'`
  const r = await query(sql, bind)
  return r.recordset || []
}

async function findById(id, includeSku = false) {
  const sql = includeSku
    ? `SELECT TOP 1 p.*, ii.QtyOnHand AS StockQty, ${_mapSalonSelect(true)} FROM dbo.Products p LEFT JOIN dbo.InventoryItems ii ON ii.SalonKey = COALESCE(p.SalonId, N'global') AND ii.SKU = p.SKU LEFT JOIN dbo.Salons s ON p.SalonId = s.SalonId LEFT JOIN dbo.SalonProfiles sp ON p.SalonId = sp.SalonId WHERE p.ProductId=@id AND p.Status <> N'deleted'`
    : `SELECT TOP 1 p.*, ${_mapSalonSelect(false)} FROM dbo.Products p LEFT JOIN dbo.Salons s ON p.SalonId = s.SalonId LEFT JOIN dbo.SalonProfiles sp ON p.SalonId = sp.SalonId WHERE p.ProductId=@id AND p.Status <> N'deleted'`
  const r = await query(sql, { id })
  return r.recordset[0] || null
}

async function insertProduct({ id, salonId, sku, name, description, badge, imageUrl, price, status }) {
  const pid = id || newId()
  if (sku !== undefined) {
    await query(`INSERT INTO dbo.Products(ProductId, SalonId, SKU, Name, Description, Badge, ImageUrl, Price, Status, CreatedAt, UpdatedAt) VALUES(@id,@salonId,@sku,@name,@description,@badge,@imageUrl,@price,@status,SYSUTCDATETIME(),SYSUTCDATETIME())`, { id: pid, salonId, sku, name, description, badge, imageUrl, price, status })
  } else {
    await query(`INSERT INTO dbo.Products(ProductId, SalonId, Name, Description, Badge, ImageUrl, Price, Status, CreatedAt, UpdatedAt) VALUES(@id,@salonId,@name,@description,@badge,@imageUrl,@price,@status,SYSUTCDATETIME(),SYSUTCDATETIME())`, { id: pid, salonId, name, description, badge, imageUrl, price, status })
  }
  return pid
}

async function updateProduct(id, { sku, name, description, badge, imageUrl, price, status }, includeSku = false, existingRow = {}) {
  if (includeSku) {
    await query(`UPDATE dbo.Products SET SKU=@sku, Name=@name, Description=@description, Badge=@badge, ImageUrl=@imageUrl, Price=@price, Status=@status, UpdatedAt=SYSUTCDATETIME() WHERE ProductId=@id`, { id, sku, name: name ?? existingRow.Name, description: description !== undefined ? (description || null) : existingRow.Description, badge: badge !== undefined ? (badge || null) : existingRow.Badge, imageUrl: imageUrl !== undefined ? (imageUrl || null) : existingRow.ImageUrl, price: price ?? Number(existingRow.Price), status: status ?? existingRow.Status })
  } else {
    await query(`UPDATE dbo.Products SET Name=@name, Description=@description, Badge=@badge, ImageUrl=@imageUrl, Price=@price, Status=@status, UpdatedAt=SYSUTCDATETIME() WHERE ProductId=@id`, { id, name: name ?? existingRow.Name, description: description !== undefined ? (description || null) : existingRow.Description, badge: badge !== undefined ? (badge || null) : existingRow.Badge, imageUrl: imageUrl !== undefined ? (imageUrl || null) : existingRow.ImageUrl, price: price ?? Number(existingRow.Price), status: status ?? existingRow.Status })
  }
}

async function softDeleteProduct(id) {
  await query("UPDATE dbo.Products SET Status=N'deleted', UpdatedAt=SYSUTCDATETIME() WHERE ProductId=@id", { id })
}

module.exports = {
  hasProductsSkuColumn,
  findProducts,
  findBulkByIds,
  findById,
  insertProduct,
  updateProduct,
  softDeleteProduct,
}
