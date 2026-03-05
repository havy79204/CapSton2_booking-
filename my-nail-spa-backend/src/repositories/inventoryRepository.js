const { query, newId } = require('../config/query')

async function listItems(salonKey) {
  const sql = salonKey
    ? `
      WITH existing AS (
        SELECT
          InventoryItemId,
          SalonKey,
          COALESCE(SalonId, SalonKey) AS SalonId,
          SKU,
          Name,
          Type,
          Uom,
          QtyOnHand,
          Cost,
          SalePrice,
          MinStock,
          CreatedAt,
          UpdatedAt
        FROM dbo.InventoryItems
        WHERE SalonKey=@salonKey
      ),
      virtuals AS (
        SELECT
          CONCAT(N'virtual:', @salonKey, N':', t.SKU) AS InventoryItemId,
          @salonKey AS SalonKey,
          @salonKey AS SalonId,
          t.SKU AS SKU,
          t.SKU AS Name,
          N'retail' AS Type,
          N'each' AS Uom,
          SUM(t.QtyDelta) AS QtyOnHand,
          CAST(0 AS DECIMAL(10,2)) AS Cost,
          CAST(NULL AS DECIMAL(10,2)) AS SalePrice,
          CAST(0 AS INT) AS MinStock,
          MIN(t.At) AS CreatedAt,
          MAX(t.At) AS UpdatedAt
        FROM dbo.InventoryTransactions t
        WHERE t.SalonKey=@salonKey
          AND NOT EXISTS (SELECT 1 FROM dbo.InventoryItems ii WHERE ii.SalonKey=@salonKey AND ii.SKU=t.SKU)
        GROUP BY t.SKU
      )
      SELECT * FROM existing
      UNION ALL
      SELECT * FROM virtuals
      ORDER BY SKU`
    : `
      WITH existing AS (
        SELECT
          InventoryItemId,
          SalonKey,
          COALESCE(SalonId, SalonKey) AS SalonId,
          SKU,
          Name,
          Type,
          Uom,
          QtyOnHand,
          Cost,
          SalePrice,
          MinStock,
          CreatedAt,
          UpdatedAt
        FROM dbo.InventoryItems
      ),
      virtuals AS (
        SELECT
          CONCAT(N'virtual:', t.SalonKey, N':', t.SKU) AS InventoryItemId,
          t.SalonKey AS SalonKey,
          t.SalonKey AS SalonId,
          t.SKU AS SKU,
          t.SKU AS Name,
          N'retail' AS Type,
          N'each' AS Uom,
          SUM(t.QtyDelta) AS QtyOnHand,
          CAST(0 AS DECIMAL(10,2)) AS Cost,
          CAST(NULL AS DECIMAL(10,2)) AS SalePrice,
          CAST(0 AS INT) AS MinStock,
          MIN(t.At) AS CreatedAt,
          MAX(t.At) AS UpdatedAt
        FROM dbo.InventoryTransactions t
        WHERE NOT EXISTS (SELECT 1 FROM dbo.InventoryItems ii WHERE ii.SalonKey=t.SalonKey AND ii.SKU=t.SKU)
        GROUP BY t.SalonKey, t.SKU
      )
      SELECT * FROM existing
      UNION ALL
      SELECT * FROM virtuals
      ORDER BY SalonKey, SKU`

  const bind = {}
  if (salonKey) bind.salonKey = salonKey
  const result = await query(sql, bind)
  return result.recordset
}

async function findInventoryItem(salonKey, sku) {
  const r = await query('SELECT TOP 1 * FROM dbo.InventoryItems WHERE SalonKey=@salonKey AND SKU=@sku', { salonKey, sku })
  return r.recordset[0] || null
}

async function upsertInventoryItem({ salonKey, salonId, sku, name, type, uom, cost = 0, salePrice = null, minStock = 0 }) {
  const existing = await findInventoryItem(salonKey, sku)
  if (existing) {
    await query(
      `UPDATE dbo.InventoryItems
       SET Name=@name,
           Type=@type,
           Uom=@uom,
           Cost=@cost,
           SalePrice=@salePrice,
           MinStock=@minStock,
           UpdatedAt=SYSUTCDATETIME()
       WHERE SalonKey=@salonKey AND SKU=@sku`,
      { salonKey, sku, name, type, uom, cost, salePrice: salePrice === undefined ? existing.SalePrice : salePrice, minStock },
    )
    return findInventoryItem(salonKey, sku)
  }

  const id = newId()
  await query(
    `INSERT INTO dbo.InventoryItems(InventoryItemId, SalonKey, SalonId, SKU, Name, Type, Uom, QtyOnHand, Cost, SalePrice, MinStock, CreatedAt, UpdatedAt)
     VALUES(@id, @salonKey, @salonId, @sku, @name, @type, @uom, 0, @cost, @salePrice, @minStock, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    { id, salonKey, salonId: salonId || null, sku, name, type, uom, cost, salePrice: salePrice ?? null, minStock },
  )
  return findInventoryItem(salonKey, sku)
}

async function listTransactions(salonKey, limit = 300) {
  const bind = { limit: Math.max(1, Math.min(5000, Number(limit || 300))) }
  const where = []
  if (salonKey) {
    where.push('SalonKey=@salonKey')
    bind.salonKey = salonKey
  }
  const sql = `SELECT TOP (@limit) * FROM dbo.InventoryTransactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY At DESC`
  const r = await query(sql, bind)
  return r.recordset
}

async function insertTransaction({ salonKey, sku, qtyDelta, reason, refId = null, vendor = null, note = null, performedByRole = null, performedById = null, performedByName = null, performedByEmail = null }) {
  const txId = newId()
  await query(
    `INSERT INTO dbo.InventoryTransactions(
      InventoryTxId, At, SalonKey, SKU, QtyDelta, Reason, RefId, Vendor, Note,
      PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
    ) VALUES(
      @id, SYSUTCDATETIME(), @salonKey, @sku, @qtyDelta, @reason, @refId, @vendor, @note,
      @performedByRole, @performedById, @performedByName, @performedByEmail
    )`,
    {
      id: txId,
      salonKey,
      sku,
      qtyDelta,
      reason,
      refId,
      vendor,
      note,
      performedByRole,
      performedById,
      performedByName,
      performedByEmail,
    },
  )

  // update qty on hand
  await query(
    `UPDATE dbo.InventoryItems
     SET QtyOnHand = QtyOnHand + @qtyDelta,
         UpdatedAt = SYSUTCDATETIME()
     WHERE SalonKey=@salonKey AND SKU=@sku`,
    { salonKey, sku, qtyDelta },
  )

  const txRow = await query('SELECT TOP 1 * FROM dbo.InventoryTransactions WHERE InventoryTxId=@id', { id: txId })
  return txRow.recordset[0]
}

async function insertExternalPOHeader({ id, salonKey, vendor, note, total, performedByRole, performedById, performedByName, performedByEmail }) {
  await query(
    `INSERT INTO dbo.ExternalPurchaseOrders(
      PurchaseOrderId, CreatedAt, SalonKey, Vendor, Note, Total,
      PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
    ) VALUES(
      @id, SYSUTCDATETIME(), @salonKey, @vendor, @note, @total,
      @performedByRole, @performedById, @performedByName, @performedByEmail
    )`,
    { id, salonKey, vendor, note, total, performedByRole, performedById, performedByName, performedByEmail },
  )
}

async function insertExternalPOLine({ poId, sku, qty, unitCost, uom }) {
  await query(
    `INSERT INTO dbo.ExternalPurchaseOrderLines(PurchaseOrderId, SKU, Qty, UnitCost, Uom)
     VALUES(@poId, @sku, @qty, @unitCost, @uom)`,
    { poId, sku, qty, unitCost, uom },
  )
}

async function ensureInventoryItemExists({ salonKey, sku, uom, cost }) {
  const existing = await findInventoryItem(salonKey, sku)
  if (!existing) {
    await query(
      `INSERT INTO dbo.InventoryItems(
        InventoryItemId, SalonKey, SalonId, SKU, Name, Type, Uom, QtyOnHand, Cost, SalePrice, MinStock, CreatedAt, UpdatedAt
      ) VALUES(
        @id, @salonKey, @salonId, @sku, @name, N'retail', @uom, 0, @cost, NULL, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
      )`,
      { id: newId(), salonKey, salonId: salonKey === 'global' ? null : salonKey, sku, name: sku, uom, cost },
    )
  } else {
    await query(
      `UPDATE dbo.InventoryItems
       SET Uom=@uom,
           Cost=@cost,
           UpdatedAt=SYSUTCDATETIME()
       WHERE SalonKey=@salonKey AND SKU=@sku`,
      { salonKey, sku, uom, cost },
    )
  }
}

module.exports = {
  listItems,
  findInventoryItem,
  upsertInventoryItem,
  listTransactions,
  insertTransaction,
  insertExternalPOHeader,
  insertExternalPOLine,
  ensureInventoryItemExists,
}
