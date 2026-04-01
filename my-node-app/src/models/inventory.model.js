const { formatDmy } = require('../utils/format')

function toInventoryItem(row) {
  const category = row.CategoryName || ''
  return {
    id: row.SkuKey || row.InventoryItemId,
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
  const unitCostRaw = row.UnitCost
  const unitCost = unitCostRaw === null || unitCostRaw === undefined ? null : Number(unitCostRaw)
  const absQty = Math.abs(qty)
  const totalVnd = Number.isFinite(unitCost) ? absQty * unitCost : null

  const ref = String(row.ReferenceId || '').trim()
  const noteFromRef = ref.startsWith('CustomerOrder:') ? `Khach mua hang - ${ref.slice('CustomerOrder:'.length)}` : (ref ? `Ref: ${ref}` : '')

  return {
    id: row.TransactionId,
    date: row.CreatedAt ? formatDmy(row.CreatedAt) : '',
    type: isIn ? 'Stock In' : 'Stock Out',
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
