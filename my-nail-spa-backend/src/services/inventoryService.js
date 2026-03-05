const repo = require('../repositories/inventoryRepository')

function mapItemRow(r) {
  return {
    id: r.InventoryItemId,
    salonId: r.SalonKey,
    sku: r.SKU,
    name: r.Name,
    type: r.Type,
    uom: r.Uom,
    qtyOnHand: Number(r.QtyOnHand),
    cost: Number(r.Cost),
    salePrice: r.SalePrice === null || r.SalePrice === undefined ? null : Number(r.SalePrice),
    minStock: Number(r.MinStock),
    createdAt: r.CreatedAt,
    updatedAt: r.UpdatedAt,
  }
}

function mapTxRow(r) {
  return {
    id: r.InventoryTxId,
    at: r.At,
    salonId: r.SalonKey,
    sku: r.SKU,
    qtyDelta: Number(r.QtyDelta),
    reason: r.Reason,
    refId: r.RefId,
    vendor: r.Vendor,
    note: r.Note,
    performedBy: {
      role: r.PerformedByRole,
      id: r.PerformedById,
      name: r.PerformedByName,
      email: r.PerformedByEmail,
    },
  }
}

async function getItems(salonKey) {
  const rows = await repo.listItems(salonKey)
  return rows.map(mapItemRow)
}

async function upsertItem(payload) {
  const saved = await repo.upsertInventoryItem(payload)
  return mapItemRow(saved)
}

async function getTransactions(salonKey, limit) {
  const rows = await repo.listTransactions(salonKey, limit)
  return rows.map(mapTxRow)
}

async function addTransaction(payload, user) {
  const tx = await repo.insertTransaction({
    salonKey: payload.salonId,
    sku: payload.sku,
    qtyDelta: payload.qtyDelta,
    reason: payload.reason,
    refId: payload.refId || null,
    vendor: payload.vendor || null,
    note: payload.note || null,
    performedByRole: user?.role || null,
    performedById: user?.id || null,
    performedByName: user?.name || null,
    performedByEmail: user?.email || null,
  })
  return mapTxRow(tx)
}

async function createExternalPO(payload, user) {
  const poId = require('../config/query').newId()
  const lines = payload.lines.map((l) => ({
    sku: String(l.sku).trim().replace(/\s+/g, '-').toUpperCase(),
    qty: Number(l.qty),
    unitCost: Number(l.unitCost),
    uom: String(l.uom).trim(),
  }))

  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0)

  await repo.insertExternalPOHeader({
    id: poId,
    salonKey: payload.salonId,
    vendor: payload.vendor.trim(),
    note: payload.note || null,
    total,
    performedByRole: user?.role || null,
    performedById: user?.id || null,
    performedByName: user?.name || null,
    performedByEmail: user?.email || null,
  })

  for (const line of lines) {
    await repo.ensureInventoryItemExists({ salonKey: payload.salonId, sku: line.sku, uom: line.uom, cost: line.unitCost })
    await repo.insertExternalPOLine({ poId, sku: line.sku, qty: line.qty, unitCost: line.unitCost, uom: line.uom })
    await repo.insertTransaction({
      salonKey: payload.salonId,
      sku: line.sku,
      qtyDelta: line.qty,
      reason: 'INBOUND_PO',
      refId: poId,
      vendor: payload.vendor.trim(),
      note: payload.note || null,
      performedByRole: user?.role || null,
      performedById: user?.id || null,
      performedByName: user?.name || null,
      performedByEmail: user?.email || null,
    })
  }

  return { id: poId }
}

module.exports = { getItems, upsertItem, getTransactions, addTransaction, createExternalPO }
