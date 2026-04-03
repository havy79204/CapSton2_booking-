const { formatDmy } = require('../utils/format')

function toInventoryItem(row) {
  const category = row.CategoryName || ''
  return {
    id: row.SkuKey || row.InventoryItemId,
    productId: row.BaseId || row.InventoryItemId,
    variantId: row.VariantId || null,
    skuType: row.VariantId ? 'variant' : (String(row.ItemGroup || '').toLowerCase() === 'retail' ? 'retail' : 'service'),
    name: row.Name,
    category,
    kind: category,
    group: row.ItemGroup || 'service',
    stock: Number(row.Quantity || 0),
    minQty: Number(row.ReorderLevel || 0),
    unit: row.Unit || '',
    priceVnd: Number(row.PriceVnd || 0),
    sellPriceVnd: row.SellPriceVnd === null || row.SellPriceVnd === undefined ? null : Number(row.SellPriceVnd),
    supplier: row.Supplier || '',
    lastIn: row.LastAt ? formatDmy(row.LastAt) : '',
  }
}

function toInventoryHistoryItem(row) {
  const qty = Number(row.Quantity || 0)
  const t = String(row.Type || '').toUpperCase()
  const isIn = t === 'IN' ? true : t === 'OUT' ? false : qty >= 0
  let label = isIn ? 'Stock In' : 'Stock Out'
  if (t === 'ADJUST') label = 'Lot Adjust'
  if (t === 'DELETE') label = 'Lot Delete'
  const unitCostRaw = row.UnitCost
  const totalRaw = row.TotalCostVnd
  const unitCost = unitCostRaw === null || unitCostRaw === undefined ? null : Number(unitCostRaw)
  const totalFromRow = totalRaw === null || totalRaw === undefined ? null : Number(totalRaw)
  const absQty = Math.abs(qty)
  const totalVnd = Number.isFinite(totalFromRow)
    ? totalFromRow
    : Number.isFinite(unitCost)
      ? absQty * unitCost
      : null

  const ref = String(row.ReferenceId || '').trim()
  const noteFromRef = ref.startsWith('CustomerOrder:') ? `Khach mua hang - ${ref.slice('CustomerOrder:'.length)}` : (ref ? `Ref: ${ref}` : '')

  return {
    id: row.TransactionId,
    date: row.CreatedAt ? formatDmy(row.CreatedAt) : '',
    type: label,
    product: row.ProductName || '',
    qty: isIn ? Math.abs(qty) : -Math.abs(qty),
    unitCost,
    totalVnd,
    by: row.ByName || 'System',
    note: row.Note || noteFromRef,
  }
}

module.exports = {
  toInventoryItem,
  toInventoryHistoryItem,
}
