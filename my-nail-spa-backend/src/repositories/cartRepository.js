const { query, newId } = require('../config/query')

async function getCartById(cartId) {
  const r = await query('SELECT TOP 1 * FROM dbo.Carts WHERE CartId=@cartId', { cartId })
  return r.recordset[0] || null
}

async function upsertCart(cartId, { userId = null, customerEmail = null, status = null } = {}) {
  // Nếu chưa có cartId → tạo mới
  if (!cartId) {
    const r = await query(
      `
      INSERT INTO dbo.Carts (UserId, CustomerEmail, Status, CreatedAt, UpdatedAt)
      OUTPUT INSERTED.CartId
      VALUES (@userId, @customerEmail, COALESCE(@status, N'active'), SYSUTCDATETIME(), SYSUTCDATETIME())
      `,
      { userId, customerEmail, status },
    )

    const newCartId = r.recordset[0].CartId
    return getCartById(newCartId)
  }

  // Nếu có cartId → update
  await query(
    `
    UPDATE dbo.Carts
    SET UserId=@userId,
        CustomerEmail=@customerEmail,
        Status=COALESCE(@status, Status),
        UpdatedAt=SYSUTCDATETIME()
    WHERE CartId=@cartId
    `,
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
