const { query, newId } = require('../config/query')

async function hasProductsSkuColumn() {
  try {
    const r = await query("SELECT COL_LENGTH('dbo.Products', 'SKU') AS Len")
    return Boolean(r?.recordset?.[0]?.Len)
  } catch {
    return false
  }
}

async function ensureOrderGiftColumns() {
  try {
    const r1 = await query("SELECT COL_LENGTH('dbo.Orders', 'GiftCardCode') AS Len")
    const r2 = await query("SELECT COL_LENGTH('dbo.Orders', 'GiftCardApplied') AS Len")
    const hasCode = Boolean(r1?.recordset?.[0]?.Len)
    const hasApplied = Boolean(r2?.recordset?.[0]?.Len)
    if (!hasCode) {
      await query("ALTER TABLE dbo.Orders ADD GiftCardCode NVARCHAR(64) NULL")
    }
    if (!hasApplied) {
      await query("ALTER TABLE dbo.Orders ADD GiftCardApplied MONEY NULL DEFAULT 0")
    }
    return true
  } catch {
    return false
  }
}

async function getProductById(productId) {
  const r = await query('SELECT TOP 1 ProductId, SalonId, SKU, Name, Status FROM dbo.Products WHERE ProductId=@id', { id: productId })
  return r.recordset[0] || null
}

async function getQtyOnHand(salonKey, sku) {
  const r = await query('SELECT TOP 1 QtyOnHand FROM dbo.InventoryItems WHERE SalonKey=@salonKey AND SKU=@sku', { salonKey, sku })
  return r.recordset.length ? Number(r.recordset[0].QtyOnHand) : 0
}

async function ensureInventoryItem({ id, salonKey, salonId, sku, name, type = 'retail', uom = 'each', salePrice = null } = {}) {
  const existing = await query('SELECT TOP 1 * FROM dbo.InventoryItems WHERE SalonKey=@salonKey AND SKU=@sku', { salonKey, sku })
  if (existing.recordset.length) return existing.recordset[0]

  const itemId = id || newId()
  await query(
    `INSERT INTO dbo.InventoryItems(InventoryItemId, SalonKey, SalonId, SKU, Name, Type, Uom, QtyOnHand, Cost, SalePrice, MinStock, CreatedAt, UpdatedAt)
     VALUES(@id, @salonKey, @salonId, @sku, @name, @type, @uom, 0, 0, @salePrice, 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    {
      id: itemId,
      salonKey,
      salonId: salonId || null,
      sku,
      name: String(name || sku).trim() || sku,
      type,
      uom,
      salePrice,
    },
  )

  const saved = await query('SELECT TOP 1 * FROM dbo.InventoryItems WHERE SalonKey=@salonKey AND SKU=@sku', { salonKey, sku })
  return saved.recordset[0]
}

async function recordInventoryTx({ id, salonKey, sku, qtyDelta, reason, refId, note } = {}) {
  const txId = id || newId()
  await query(
    `INSERT INTO dbo.InventoryTransactions(
      InventoryTxId, At, SalonKey, SKU, QtyDelta, Reason, RefId, Vendor, Note,
      PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
    ) VALUES(
      @id, SYSUTCDATETIME(), @salonKey, @sku, @qtyDelta, @reason, @refId, NULL, @note,
      N'system', NULL, N'Web checkout', NULL
    )`,
    {
      id: txId,
      salonKey,
      sku,
      qtyDelta,
      reason,
      refId: refId || null,
      note: note || null,
    },
  )

  await query(
    `UPDATE dbo.InventoryItems
     SET QtyOnHand = QtyOnHand + @qtyDelta,
         UpdatedAt = SYSUTCDATETIME()
     WHERE SalonKey=@salonKey AND SKU=@sku`,
    { salonKey, sku, qtyDelta },
  )
}

async function insertOrder(order) {
  await query(
    `INSERT INTO dbo.Orders(
      OrderId, CreatedAt, Status, Channel, SalonKey, SalonId,
      CustomerUserId, CustomerEmail, CustomerName, CustomerPhone, CustomerAddress,
      Subtotal, Tax, Total, PaymentMethod, GiftCardCode, GiftCardApplied
    ) VALUES(
      @id, SYSUTCDATETIME(), @status, @channel, @salonKey, @salonId,
      @customerUserId, @customerEmail, @customerName, @customerPhone, @customerAddress,
      @subtotal, @tax, @total, @paymentMethod, @giftCardCode, @giftCardApplied
    )`,
    order,
  )
}

async function insertOrderItem(orderId, item) {
  await query(
    `INSERT INTO dbo.OrderItems(OrderId, ProductId, ProductName, Price, Qty)
     VALUES(@orderId, @productId, @name, @price, @qty)`,
    {
      orderId,
      productId: item.productId || null,
      name: item.name,
      price: item.price,
      qty: item.qty,
    },
  )
}

async function getOrders({ userId, email, salonKey } = {}) {
  const where = []
  const bind = {}
  if (userId) {
    where.push('CustomerUserId=@userId')
    bind.userId = userId
  }
  if (email) {
    where.push('CustomerEmail=@email')
    bind.email = email
  }
  if (salonKey) {
    where.push('SalonKey=@salonKey')
    bind.salonKey = salonKey
  }
  const sql = `SELECT * FROM dbo.Orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CreatedAt DESC`
  const result = await query(sql, bind)
  return result.recordset
}

async function getOrderById(id) {
  const r = await query('SELECT TOP 1 * FROM dbo.Orders WHERE OrderId=@id', { id })
  return r.recordset[0] || null
}

async function getOrderItems(orderId) {
  const it = await query(
    `
    SELECT
      oi.OrderItemId,
      oi.ProductId,
      CASE
        WHEN oi.ProductName = oi.ProductId THEN COALESCE(p.Name, oi.ProductName)
        ELSE oi.ProductName
      END AS ProductName,
      oi.Price,
      oi.Qty
    FROM dbo.OrderItems oi
    LEFT JOIN dbo.Products p ON p.ProductId = oi.ProductId
    WHERE oi.OrderId=@id
    ORDER BY oi.OrderItemId`,
    { id: orderId },
  )
  return it.recordset
}

async function updateOrderStatus(id, status) {
  await query('UPDATE dbo.Orders SET Status=@status WHERE OrderId=@id', { id, status })
}

async function updateOrderStatusTx(request, id, status) {
  // transaction-aware update using provided sql.Request
  await request.query('UPDATE dbo.Orders SET Status=@status WHERE OrderId=@id', { status, id })
}

async function updateOrderPaymentMethodTx(request, id, method) {
  // transaction-aware update for PaymentMethod using provided sql.Request
  await request.query('UPDATE dbo.Orders SET PaymentMethod=COALESCE(PaymentMethod, @method) WHERE OrderId=@id', { method, id })
}

async function clearCartsByUserOrEmail(userId, email) {
  await query(
    "DELETE FROM dbo.CartItems WHERE CartId IN (SELECT CartId FROM dbo.Carts WHERE Status='active' AND (UserId=@userId OR (CustomerEmail IS NOT NULL AND LOWER(CustomerEmail)=LOWER(@email))))",
    { userId, email },
  )
}

module.exports = {
  hasProductsSkuColumn,
  ensureOrderGiftColumns,
  getProductById,
  getQtyOnHand,
  ensureInventoryItem,
  recordInventoryTx,
  insertOrder,
  insertOrderItem,
  getOrders,
  getOrderById,
  getOrderItems,
  updateOrderStatus,
  updateOrderStatusTx,
  updateOrderPaymentMethodTx,
  clearCartsByUserOrEmail,
}
