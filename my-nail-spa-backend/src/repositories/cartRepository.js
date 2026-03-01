const { query, newId } = require('../config/query')

async function getCartById(cartId) {
  const r = await query('SELECT TOP 1 * FROM dbo.Carts WHERE CartId=@cartId', { cartId })
  return r.recordset[0] || null
}

async function upsertCart(cartId, { userId = null, customerEmail = null, status = null } = {}) {
  await query(
    `MERGE dbo.Carts AS t
       USING (SELECT @cartId AS CartId) AS s
       ON t.CartId = s.CartId
       WHEN MATCHED THEN
         UPDATE SET UserId=@userId, CustomerEmail=@customerEmail, Status=COALESCE(@status, t.Status), UpdatedAt=SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
         INSERT (CartId, UserId, CustomerEmail, Status, CreatedAt, UpdatedAt)
         VALUES(@cartId, @userId, @customerEmail, COALESCE(@status, N'active'), SYSUTCDATETIME(), SYSUTCDATETIME());`,
    { cartId, userId, customerEmail, status },
  )
  return getCartById(cartId)
}

async function getCartItems(cartId) {
  const items = await query('SELECT * FROM dbo.CartItems WHERE CartId=@cartId ORDER BY CartItemId', { cartId })
  return items.recordset
}

async function upsertCartItem({ cartId, productId, qty = 1 }) {
  await query(
    `MERGE dbo.CartItems AS target
       USING (SELECT @cartId AS CartId, @productId AS ProductId, @qty AS Qty) AS source
       ON target.CartId = source.CartId AND target.ProductId = source.ProductId
       WHEN MATCHED THEN
         UPDATE SET Qty = target.Qty + source.Qty, AddedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
         INSERT (CartId, ProductId, Qty) VALUES (source.CartId, source.ProductId, source.Qty);`,
    { cartId, productId, qty },
  )
  return getCartItems(cartId)
}

async function deleteCartItem(itemId) {
  await query('DELETE FROM dbo.CartItems WHERE CartItemId=@itemId', { itemId })
}

module.exports = { getCartById, upsertCart, getCartItems, upsertCartItem, deleteCartItem }
