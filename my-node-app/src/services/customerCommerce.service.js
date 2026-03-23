const { query, newId } = require('../config/query')

let _ordersChannelColumnPromise = null

function requireUserId(userId) {
  const value = String(userId || '').trim()
  if (!value) {
    const err = new Error('Unauthorized')
    err.status = 401
    throw err
  }
  return value
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizePaymentMethod(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'online') return 'Online'
  if (value === 'store') return 'Store'
  return 'COD'
}

function derivePaymentStatus(orderStatus, paymentMethod) {
  const status = String(orderStatus || '').trim().toLowerCase()
  const method = String(paymentMethod || '').trim().toLowerCase()

  if (status === 'cancelled' || status === 'canceled' || status === 'failed') return 'Failed'
  if (status === 'completed' || status === 'delivered') return 'Paid'
  if (method === 'cod' || method === 'store') return 'Pay On Delivery'
  return 'C Payment'
}

function isCStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  return value === 'C' || value === 'awaiting'
}

function calcOrderDiscountAmount(row) {
  const subtotal = Number(row?.Subtotal || 0)
  const total = Number(row?.Total || 0)
  const giftApplied = Number(row?.GiftCardApplied || 0)
  if (giftApplied > 0) return giftApplied
  const diff = subtotal - total
  return diff > 0 ? diff : 0
}

async function columnExists(tableName, columnName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @tableName
       AND COLUMN_NAME = @columnName`,
    { tableName, columnName }
  )
  return Boolean(res.recordset?.length)
}

async function getOrdersChannelColumn() {
  if (_ordersChannelColumnPromise) return _ordersChannelColumnPromise
  _ordersChannelColumnPromise = (async () => {
    if (await columnExists('Orders', 'Channel')) return 'Channel'
    if (await columnExists('Orders', 'Cannel')) return 'Cannel'
    return null
  })()
  return _ordersChannelColumnPromise
}

async function getDefaultAddress(userId) {
  const res = await query(
    `SELECT TOP 1
        AddressId,
        UserId,
        FullName,
        PhoneNumber,
        AddressLine,
        City,
        Country,
        IsDefault
     FROM Addresses
     WHERE UserId = @userId
     ORDER BY ISNULL(IsDefault, 0) DESC, AddressId`,
    { userId }
  )

  const row = res.recordset?.[0]
  if (!row) return null

  return {
    AddressId: row.AddressId,
    UserId: row.UserId,
    FullName: row.FullName || '',
    PhoneNumber: row.PhoneNumber || '',
    AddressLine: row.AddressLine || '',
    City: row.City || '',
    Country: row.Country || '',
    IsDefault: Boolean(row.IsDefault),
  }
}

async function listAddresses(userIdInput) {
  const userId = requireUserId(userIdInput)
  const res = await query(
    `SELECT
        AddressId,
        UserId,
        FullName,
        PhoneNumber,
        AddressLine,
        City,
        Country,
        IsDefault
     FROM Addresses
     WHERE UserId = @userId
     ORDER BY ISNULL(IsDefault, 0) DESC, AddressId DESC`,
    { userId }
  )

  return (res.recordset || []).map((row) => ({
    AddressId: row.AddressId,
    UserId: row.UserId,
    FullName: row.FullName || '',
    PhoneNumber: row.PhoneNumber || '',
    AddressLine: row.AddressLine || '',
    City: row.City || '',
    Country: row.Country || '',
    IsDefault: Boolean(row.IsDefault),
  }))
}

async function upsertAddress(userIdInput, payload = {}, addressIdInput = null) {
  const userId = requireUserId(userIdInput)
  const addressId = String(addressIdInput || payload.addressId || '').trim()

  const fullName = String(payload.fullName || '').trim()
  const phoneNumber = String(payload.phoneNumber || '').trim()
  const addressLine = String(payload.addressLine || '').trim()
  const city = String(payload.city || '').trim()
  const country = String(payload.country || '').trim()
  const isDefault = Boolean(payload.isDefault)

  if (!fullName || !addressLine) {
    const err = new Error('fullName and addressLine are required')
    err.status = 400
    throw err
  }

  if (addressId) {
    await query(
      `UPDATE Addresses
       SET FullName = @fullName,
           PhoneNumber = @phoneNumber,
           AddressLine = @addressLine,
           City = @city,
           Country = @country,
           IsDefault = @isDefault
       WHERE AddressId = @addressId AND UserId = @userId`,
      {
        addressId,
        userId,
        fullName,
        phoneNumber: phoneNumber || null,
        addressLine,
        city: city || null,
        country: country || null,
        isDefault,
      }
    )
  } else {
    await query(
      `INSERT INTO Addresses (
        AddressId,
        UserId,
        FullName,
        PhoneNumber,
        AddressLine,
        City,
        Country,
        IsDefault
      )
      VALUES (
        @addressId,
        @userId,
        @fullName,
        @phoneNumber,
        @addressLine,
        @city,
        @country,
        @isDefault
      )`,
      {
        addressId: `ADR-${newId()}`,
        userId,
        fullName,
        phoneNumber: phoneNumber || null,
        addressLine,
        city: city || null,
        country: country || null,
        isDefault,
      }
    )
  }

  if (isDefault) {
    const targetId = addressId || null
    const latest = await query(
      `SELECT TOP 1 AddressId
       FROM Addresses
       WHERE UserId = @userId
       ORDER BY AddressId DESC`,
      { userId }
    )
    const resolvedId = targetId || latest.recordset?.[0]?.AddressId || ''
    if (resolvedId) {
      await setDefaultAddress(userId, resolvedId)
    }
  }

  return listAddresses(userId)
}

async function deleteAddress(userIdInput, addressIdInput) {
  const userId = requireUserId(userIdInput)
  const addressId = String(addressIdInput || '').trim()
  if (!addressId) {
    const err = new Error('Missing addressId')
    err.status = 400
    throw err
  }

  await query(
    `DELETE FROM Addresses
     WHERE AddressId = @addressId AND UserId = @userId`,
    { addressId, userId }
  )

  const remain = await listAddresses(userId)
  if (remain.length > 0 && !remain.some((x) => x.IsDefault)) {
    await setDefaultAddress(userId, remain[0].AddressId)
    return listAddresses(userId)
  }

  return remain
}

async function setDefaultAddress(userIdInput, addressIdInput) {
  const userId = requireUserId(userIdInput)
  const addressId = String(addressIdInput || '').trim()
  if (!addressId) {
    const err = new Error('Missing addressId')
    err.status = 400
    throw err
  }

  await query(
    `UPDATE Addresses
     SET IsDefault = CASE WHEN AddressId = @addressId THEN 1 ELSE 0 END
     WHERE UserId = @userId`,
    { userId, addressId }
  )

  return listAddresses(userId)
}

async function getCustomerContext(userIdInput) {
  const userId = requireUserId(userIdInput)

  const [userRes, defaultAddress] = await Promise.all([
    query(
      `SELECT TOP 1 UserId, Name, Email, Phone, AvatarUrl, RoleKey, Status
       FROM Users
       WHERE UserId = @userId`,
      { userId }
    ),
    getDefaultAddress(userId),
  ])

  const user = userRes.recordset?.[0]
  if (!user) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }

  return {
    user: {
      UserId: user.UserId,
      Name: user.Name,
      Email: user.Email,
      Phone: user.Phone,
      AvatarUrl: user.AvatarUrl,
      RoleKey: user.RoleKey,
      Status: user.Status,
    },
    defaultAddress,
  }
}

async function listAvailableStaff(serviceIdsInput = []) {
  const serviceIds = Array.isArray(serviceIdsInput)
    ? [...new Set(serviceIdsInput.map((id) => String(id || '').trim()).filter(Boolean))]
    : []

  const params = {}
  let staffFilterClause = ''
  let specialtySelectSql = `CAST('' AS NVARCHAR(255)) AS Specialty`
  let specialtyJoinSql = ''

  const hasStaffSkills = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffSkills'`
  ).then((x) => Boolean(x.recordset?.length)).catch(() => false)

  if (hasStaffSkills) {
    const hasCategoryIdInSkills = await columnExists('StaffSkills', 'CategoryId')
    const hasServiceCategories = await query(
      `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ServiceCategories'`
    ).then((x) => Boolean(x.recordset?.length)).catch(() => false)

    if (hasCategoryIdInSkills && hasServiceCategories) {
      const hasCategoryName = await columnExists('ServiceCategories', 'CategoryName')
      const hasName = await columnExists('ServiceCategories', 'Name')
      const categoryNameColumn = hasCategoryName ? 'CategoryName' : (hasName ? 'Name' : null)

      if (categoryNameColumn) {
        specialtySelectSql = `ISNULL(sp.Specialty, '') AS Specialty`
        specialtyJoinSql = `
          OUTER APPLY (
            SELECT STUFF((
              SELECT ', ' + COALESCE(sc.${categoryNameColumn}, CONVERT(NVARCHAR(100), ssx.CategoryId))
              FROM StaffSkills ssx
              LEFT JOIN ServiceCategories sc ON sc.CategoryId = ssx.CategoryId
              WHERE ssx.StaffId = s.StaffId
              FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Specialty
          ) sp`
      }
    } else if (hasCategoryIdInSkills) {
      specialtySelectSql = `ISNULL(sp.Specialty, '') AS Specialty`
      specialtyJoinSql = `
        OUTER APPLY (
          SELECT STUFF((
            SELECT ', ' + CONVERT(NVARCHAR(100), ssx.CategoryId)
            FROM StaffSkills ssx
            WHERE ssx.StaffId = s.StaffId
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Specialty
        ) sp`
    }
  }

  if (hasStaffSkills && serviceIds.length > 0) {
    const hasCategoryIdInSkills = await columnExists('StaffSkills', 'CategoryId')
    const hasServiceIdInSkills = await columnExists('StaffSkills', 'ServiceId')

    if (hasCategoryIdInSkills) {
      const serviceParams = serviceIds.map((serviceId, idx) => {
        const key = `serviceId${idx}`
        params[key] = serviceId
        return `@${key}`
      })

      const categoryRes = await query(
        `SELECT DISTINCT CategoryId
         FROM Services
         WHERE ServiceId IN (${serviceParams.join(', ')})
           AND CategoryId IS NOT NULL`,
        params
      )

      const categoryIds = (categoryRes.recordset || [])
        .map((row) => String(row.CategoryId || '').trim())
        .filter(Boolean)

      if (categoryIds.length > 0) {
        const categoryParams = categoryIds.map((categoryId, idx) => {
          const key = `categoryId${idx}`
          params[key] = categoryId
          return `@${key}`
        })

        staffFilterClause = `
          AND EXISTS (
            SELECT 1
            FROM StaffSkills ss
            WHERE ss.StaffId = s.StaffId
              AND ss.CategoryId IN (${categoryParams.join(', ')})
          )`
      }
    } else if (hasServiceIdInSkills) {
      const serviceParams = serviceIds.map((serviceId, idx) => {
        const key = `serviceFilterId${idx}`
        params[key] = serviceId
        return `@${key}`
      })

      staffFilterClause = `
        AND EXISTS (
          SELECT 1
          FROM StaffSkills ss
          WHERE ss.StaffId = s.StaffId
            AND ss.ServiceId IN (${serviceParams.join(', ')})
        )`
    }
  }

  const res = await query(
    `SELECT
        s.StaffId,
        s.UserId,
        ${specialtySelectSql},
        s.Status AS StaffStatus,
        u.Name,
        u.Phone,
        u.Email,
        u.AvatarUrl
     FROM Staff s
     LEFT JOIN Users u ON u.UserId = s.UserId
      ${specialtyJoinSql}
     WHERE (s.Status IS NULL OR LOWER(LTRIM(RTRIM(s.Status))) NOT IN (N'nghỉ', 'inactive', 'off'))
     ${staffFilterClause}
     ORDER BY u.Name, s.StaffId`,
    params
  )

  return (res.recordset || []).map((row) => ({
    StaffId: row.StaffId,
    UserId: row.UserId || '',
    Name: row.Name || row.StaffId || 'Specialist',
    Specialty: row.Specialty || '',
    Phone: row.Phone || '',
    Email: row.Email || '',
    AvatarUrl: row.AvatarUrl || null,
    Status: row.StaffStatus || '',
  }))
}

async function hasPreviousBookings(userId) {
  const res = await query(
    `SELECT TOP 1 BookingId
     FROM Bookings
     WHERE CustomerUserId = @userId`,
    { userId }
  )

  return Boolean(res.recordset?.[0]?.BookingId)
}

async function getAutoAssignedStaffId() {
  const res = await query(
    `SELECT TOP 1
        s.StaffId,
        COUNT(bs.BookingServiceId) AS ActiveBookings
     FROM Staff s
     LEFT JOIN BookingServices bs ON bs.StaffId = s.StaffId
     LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
       AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, 'C')))) IN ('C', 'confirmed', 'booked')
     WHERE s.Status IS NULL
       OR LOWER(LTRIM(RTRIM(s.Status))) NOT IN (N'nghỉ', 'inactive', 'off')
     GROUP BY s.StaffId
     ORDER BY COUNT(bs.BookingServiceId), s.StaffId`
  )

  return String(res.recordset?.[0]?.StaffId || '').trim() || null
}

async function getAutoAssignedStaffIdForService(serviceIdInput) {
  const serviceId = String(serviceIdInput || '').trim()
  if (!serviceId) return getAutoAssignedStaffId()

  const hasStaffSkills = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffSkills'`
  ).then((x) => Boolean(x.recordset?.length)).catch(() => false)

  if (!hasStaffSkills) return getAutoAssignedStaffId()

  const hasCategoryIdInSkills = await columnExists('StaffSkills', 'CategoryId')
  const hasServiceIdInSkills = await columnExists('StaffSkills', 'ServiceId')

  if (hasCategoryIdInSkills) {
    const res = await query(
      `SELECT TOP 1
          s.StaffId,
          COUNT(bs.BookingServiceId) AS ActiveBookings
       FROM Staff s
       INNER JOIN StaffSkills ss ON ss.StaffId = s.StaffId
       INNER JOIN Services sv ON sv.ServiceId = @serviceId
         AND sv.CategoryId = ss.CategoryId
       LEFT JOIN BookingServices bs ON bs.StaffId = s.StaffId
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, 'C')))) IN ('c', 'confirmed', 'booked')
       WHERE s.Status IS NULL
         OR LOWER(LTRIM(RTRIM(s.Status))) NOT IN (N'nghỉ', 'inactive', 'off')
       GROUP BY s.StaffId
       ORDER BY COUNT(bs.BookingServiceId), s.StaffId`,
      { serviceId }
    )

    const staffId = String(res.recordset?.[0]?.StaffId || '').trim()
    if (staffId) return staffId
  }

  if (hasServiceIdInSkills) {
    const res = await query(
      `SELECT TOP 1
          s.StaffId,
          COUNT(bs.BookingServiceId) AS ActiveBookings
       FROM Staff s
       INNER JOIN StaffSkills ss ON ss.StaffId = s.StaffId
         AND ss.ServiceId = @serviceId
       LEFT JOIN BookingServices bs ON bs.StaffId = s.StaffId
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, 'C')))) IN ('c', 'confirmed', 'booked')
       WHERE s.Status IS NULL
         OR LOWER(LTRIM(RTRIM(s.Status))) NOT IN (N'nghỉ', 'inactive', 'off')
       GROUP BY s.StaffId
       ORDER BY COUNT(bs.BookingServiceId), s.StaffId`,
      { serviceId }
    )

    const staffId = String(res.recordset?.[0]?.StaffId || '').trim()
    if (staffId) return staffId
  }

  return getAutoAssignedStaffId()
}

async function staffSupportsService(staffIdInput, serviceIdInput) {
  const staffId = String(staffIdInput || '').trim()
  const serviceId = String(serviceIdInput || '').trim()
  if (!staffId || !serviceId) return false

  const hasStaffSkills = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffSkills'`
  ).then((x) => Boolean(x.recordset?.length)).catch(() => false)

  if (!hasStaffSkills) return true

  const hasCategoryIdInSkills = await columnExists('StaffSkills', 'CategoryId')
  const hasServiceIdInSkills = await columnExists('StaffSkills', 'ServiceId')

  if (hasCategoryIdInSkills) {
    const res = await query(
      `SELECT TOP 1 1 AS ok
       FROM StaffSkills ss
       INNER JOIN Services s ON s.CategoryId = ss.CategoryId
       WHERE ss.StaffId = @staffId
         AND s.ServiceId = @serviceId`,
      { staffId, serviceId }
    )
    return Boolean(res.recordset?.length)
  }

  if (hasServiceIdInSkills) {
    const res = await query(
      `SELECT TOP 1 1 AS ok
       FROM StaffSkills ss
       WHERE ss.StaffId = @staffId
         AND ss.ServiceId = @serviceId`,
      { staffId, serviceId }
    )
    return Boolean(res.recordset?.length)
  }

  return true
}

async function ensureCart(userId) {
  const found = await query(
    `SELECT TOP 1 CartId
     FROM Cart
     WHERE UserId = @userId
     ORDER BY CreatedAt DESC, CartId DESC`,
    { userId }
  )

  const cartId = found.recordset?.[0]?.CartId
  if (cartId) return cartId

  const newCartId = `CRT-${newId()}`
  await query(
    `INSERT INTO Cart (CartId, UserId, CreatedAt)
     VALUES (@cartId, @userId, SYSUTCDATETIME())`,
    { cartId: newCartId, userId }
  )
  return newCartId
}

function mapCartItem(row) {
  return {
    CartItemId: row.CartItemId,
    CartId: row.CartId,
    ProductId: row.ProductId,
    Quantity: Number(row.Quantity || 0),
    Name: row.Name || '',
    Description: row.Description || '',
    Price: Number(row.Price || 0),
    ImageUrl: row.ImageUrl || null,
    Stock: Number(row.Stock || 0),
    CategoryId: row.CategoryId || null,
    LineTotal: Number(row.Price || 0) * Number(row.Quantity || 0),
  }
}

async function getCart(userIdInput) {
  const userId = requireUserId(userIdInput)
  const cartId = await ensureCart(userId)

  const ctx = await getCustomerContext(userId)

  const [itemsRes, defaultAddress] = await Promise.all([
    query(
      `SELECT
          ci.CartItemId,
          ci.CartId,
          ci.ProductId,
          ci.Quantity,
          p.Name,
          p.Description,
          p.Price,
          p.ImageUrl,
          p.Stock,
          p.CategoryId
       FROM CartItems ci
       LEFT JOIN Products p ON p.ProductId = ci.ProductId
       WHERE ci.CartId = @cartId
       ORDER BY ci.CartItemId DESC`,
      { cartId }
    ),
    getDefaultAddress(userId),
  ])

  const items = (itemsRes.recordset || []).map(mapCartItem)
  const subtotal = items.reduce((sum, item) => sum + item.LineTotal, 0)

  return {
    CartId: cartId,
    Customer: ctx.user,
    Items: items,
    Summary: {
      ItemCount: items.length,
      QuantityCount: items.reduce((sum, item) => sum + item.Quantity, 0),
      Subtotal: subtotal,
    },
    DefaultAddress: defaultAddress,
  }
}

async function addCartItem(userIdInput, payload = {}) {
  const userId = requireUserId(userIdInput)
  const productId = String(payload.productId || '').trim()
  const quantity = Math.max(1, Math.trunc(toNumber(payload.quantity, 1)))

  if (!productId) {
    const err = new Error('Missing productId')
    err.status = 400
    throw err
  }

  const productRes = await query(
    `SELECT TOP 1 ProductId, Name, Price, Stock
     FROM Products
     WHERE ProductId = @productId`,
    { productId }
  )

  const product = productRes.recordset?.[0]
  if (!product) {
    const err = new Error('Product not found')
    err.status = 404
    throw err
  }

  if (Number(product.Stock || 0) <= 0) {
    const err = new Error('Product is out of stock')
    err.status = 409
    throw err
  }

  const cartId = await ensureCart(userId)
  const existingRes = await query(
    `SELECT TOP 1 CartItemId, Quantity
     FROM CartItems
     WHERE CartId = @cartId AND ProductId = @productId
     ORDER BY CartItemId`,
    { cartId, productId }
  )

  const existing = existingRes.recordset?.[0]
  if (existing) {
    const nextQuantity = Number(existing.Quantity || 0) + quantity
    if (nextQuantity > Number(product.Stock || 0)) {
      const err = new Error('Quantity exceeds stock')
      err.status = 409
      throw err
    }

    await query(
      `UPDATE CartItems
       SET Quantity = @quantity
       WHERE CartItemId = @cartItemId`,
      { quantity: nextQuantity, cartItemId: existing.CartItemId }
    )
  } else {
    if (quantity > Number(product.Stock || 0)) {
      const err = new Error('Quantity exceeds stock')
      err.status = 409
      throw err
    }

    await query(
      `INSERT INTO CartItems (CartItemId, CartId, ProductId, Quantity)
       VALUES (@cartItemId, @cartId, @productId, @quantity)`,
      {
        cartItemId: `CI-${newId()}`,
        cartId,
        productId,
        quantity,
      }
    )
  }

  return getCart(userId)
}

async function updateCartItem(userIdInput, cartItemIdInput, payload = {}) {
  const userId = requireUserId(userIdInput)
  const cartItemId = String(cartItemIdInput || '').trim()
  const quantity = Math.trunc(toNumber(payload.quantity, 0))

  if (!cartItemId) {
    const err = new Error('Missing cartItemId')
    err.status = 400
    throw err
  }

  const itemRes = await query(
    `SELECT TOP 1 ci.CartItemId, ci.CartId, ci.ProductId, ci.Quantity
     FROM CartItems ci
     INNER JOIN Cart c ON c.CartId = ci.CartId
     WHERE ci.CartItemId = @cartItemId AND c.UserId = @userId`,
    { cartItemId, userId }
  )

  const item = itemRes.recordset?.[0]
  if (!item) {
    const err = new Error('Cart item not found')
    err.status = 404
    throw err
  }

  if (quantity <= 0) {
    await query('DELETE FROM CartItems WHERE CartItemId = @cartItemId', { cartItemId })
    return getCart(userId)
  }

  const stockRes = await query(
    'SELECT TOP 1 Stock FROM Products WHERE ProductId = @productId',
    { productId: item.ProductId }
  )
  const stock = Number(stockRes.recordset?.[0]?.Stock || 0)
  if (quantity > stock) {
    const err = new Error('Quantity exceeds stock')
    err.status = 409
    throw err
  }

  await query(
    `UPDATE CartItems
     SET Quantity = @quantity
     WHERE CartItemId = @cartItemId`,
    { quantity, cartItemId }
  )

  return getCart(userId)
}

async function removeCartItem(userIdInput, cartItemIdInput) {
  const userId = requireUserId(userIdInput)
  const cartItemId = String(cartItemIdInput || '').trim()

  await query(
    `DELETE ci
     FROM CartItems ci
     INNER JOIN Cart c ON c.CartId = ci.CartId
     WHERE ci.CartItemId = @cartItemId AND c.UserId = @userId`,
    { cartItemId, userId }
  )

  return getCart(userId)
}

async function clearCart(userIdInput) {
  const userId = requireUserId(userIdInput)
  await query(
    `DELETE ci
     FROM CartItems ci
     INNER JOIN Cart c ON c.CartId = ci.CartId
     WHERE c.UserId = @userId`,
    { userId }
  )

  return getCart(userId)
}

async function checkoutCart(userIdInput, payload = {}) {
  const userId = requireUserId(userIdInput)
  const cart = await getCart(userId)
  const itemIds = Array.isArray(payload.itemIds) ? payload.itemIds.map((x) => String(x || '').trim()).filter(Boolean) : []

  const selectedItems = itemIds.length
    ? cart.Items.filter((item) => itemIds.includes(String(item.CartItemId)))
    : cart.Items

  if (!selectedItems.length) {
    const err = new Error('No items selected for checkout')
    err.status = 400
    throw err
  }

  for (const item of selectedItems) {
    const stockRes = await query(
      'SELECT TOP 1 Stock FROM Products WHERE ProductId = @productId',
      { productId: item.ProductId }
    )

    const stock = Number(stockRes.recordset?.[0]?.Stock || 0)
    if (stock < item.Quantity) {
      const err = new Error(`Product ${item.Name} does not have enough stock`)
      err.status = 409
      throw err
    }
  }

  const ctx = await getCustomerContext(userId)
  const defaultAddress = ctx.defaultAddress
  const subtotal = selectedItems.reduce((sum, item) => sum + item.LineTotal, 0)
  const total = subtotal

  const paymentMethod = normalizePaymentMethod(payload.paymentMethod)
  const customerName = String(payload.customerName || defaultAddress?.FullName || ctx.user.Name || '').trim() || null
  const customerPhone = String(payload.customerPhone || defaultAddress?.PhoneNumber || ctx.user.Phone || '').trim() || null
  const addressText = String(
    payload.customerAddress
      || (defaultAddress ? `${defaultAddress.AddressLine || ''}, ${defaultAddress.City || ''}, ${defaultAddress.Country || ''}` : '')
      || ''
  ).trim() || null

  const channel = String(payload.channel || 'Online').trim() || 'Online'
  const orderChannelColumn = await getOrdersChannelColumn()
  const orderChannelColumnSql = orderChannelColumn ? `${orderChannelColumn},` : ''
  const orderChannelValueSql = orderChannelColumn ? '@channel,' : ''

  const insertOrderRes = await query(
    `DECLARE @nextSeq INT;
     DECLARE @seqText VARCHAR(20);
     DECLARE @orderId NVARCHAR(50);

     SELECT @nextSeq = ISNULL(MAX(
       CASE
         WHEN o.OrderId LIKE 'ORD-%' THEN TRY_CONVERT(INT, SUBSTRING(o.OrderId, 5, 50))
         ELSE TRY_CONVERT(INT, o.OrderId)
       END
     ), 0) + 1
     FROM Orders o WITH (UPDLOCK, HOLDLOCK)
     WHERE o.OrderId IS NOT NULL;

     SET @seqText = CAST(@nextSeq AS VARCHAR(20));
     SET @orderId = CONCAT('ORD-', CASE WHEN LEN(@seqText) >= 3 THEN @seqText ELSE RIGHT(CONCAT('000', @seqText), 3) END);

     INSERT INTO Orders (
       OrderId,
       UserId,
       Status,
       CreatedAt,
       CustomerName,
       CustomerPhone,
       CustomerAddress,
      ${orderChannelColumnSql}
       Subtotal,
       Total,
       PaymentMethod,
       GiftCardCode,
       GiftCardApplied
     )
     OUTPUT INSERTED.OrderId
     VALUES (
       @orderId,
       @userId,
       @status,
       SYSUTCDATETIME(),
       @customerName,
       @customerPhone,
       @customerAddress,
      ${orderChannelValueSql}
       @subtotal,
       @total,
       @paymentMethod,
       @giftCardCode,
       @giftCardApplied
     );`,
    {
      userId,
      status: 'C',
      customerName,
      customerPhone,
      customerAddress: addressText,
      channel,
      subtotal,
      total,
      paymentMethod,
      giftCardCode: payload.giftCode ? String(payload.giftCode).trim() : null,
      giftCardApplied: 0,
    }
  )

  const orderId = String(insertOrderRes.recordset?.[0]?.OrderId || '').trim()
  if (!orderId) {
    const err = new Error('Cannot create order id')
    err.status = 500
    throw err
  }

  for (const item of selectedItems) {
    await query(
      `INSERT INTO OrderItems (
        OrderItemId,
        OrderId,
        ProductId,
        Quantity,
        Price,
        ProductName
      )
      VALUES (
        @orderItemId,
        @orderId,
        @productId,
        @quantity,
        @price,
        @productName
      )`,
      {
        orderItemId: `OI-${newId()}`,
        orderId,
        productId: item.ProductId,
        quantity: item.Quantity,
        price: item.Price,
        productName: item.Name,
      }
    )

    await query(
      `UPDATE Products
       SET Stock = CASE WHEN ISNULL(Stock, 0) >= @quantity THEN ISNULL(Stock, 0) - @quantity ELSE 0 END
       WHERE ProductId = @productId`,
      {
        productId: item.ProductId,
        quantity: item.Quantity,
      }
    )
  }

  for (const item of selectedItems) {
    await query('DELETE FROM CartItems WHERE CartItemId = @cartItemId', { cartItemId: item.CartItemId })
  }

  return {
    OrderId: orderId,
    Status: 'C',
    PaymentMethod: paymentMethod,
    PaymentStatus: derivePaymentStatus('C', paymentMethod),
    Summary: {
      Subtotal: subtotal,
      Tax: 0,
      Shipping: 0,
      DiscountAmount: 0,
      Total: total,
      ItemCount: selectedItems.length,
    },
  }
}

async function listBookings(userIdInput, limit = 20) {
  const userId = requireUserId(userIdInput)
  const res = await query(
    `SELECT TOP (@limit)
        b.BookingId,
        b.CustomerUserId,
        b.BookingTime,
        b.Status,
        b.Notes,
        b.CreatedAt
     FROM Bookings b
     WHERE b.CustomerUserId = @userId
     ORDER BY b.BookingTime DESC, b.CreatedAt DESC`,
    { userId, limit: Math.min(Math.max(Number(limit) || 20, 1), 100) }
  )

  const rows = res.recordset || []
  const results = []

  for (const row of rows) {
    const svcRes = await query(
      `SELECT
          bs.BookingServiceId,
          bs.ServiceId,
          bs.StaffId,
          COALESCE(bs.Price, s.Price) AS Price,
          s.Name AS ServiceName,
          s.DurationMinutes
       FROM BookingServices bs
       LEFT JOIN Services s ON s.ServiceId = bs.ServiceId
       WHERE bs.BookingId = @bookingId
       ORDER BY bs.BookingServiceId`,
      { bookingId: row.BookingId }
    )

    const services = (svcRes.recordset || []).map((s) => ({
      BookingServiceId: s.BookingServiceId,
      ServiceId: s.ServiceId,
      ServiceName: s.ServiceName || '',
      StaffId: s.StaffId || null,
      DurationMinutes: Number(s.DurationMinutes || 0),
      Price: Number(s.Price || 0),
    }))

    results.push({
      BookingId: row.BookingId,
      CustomerUserId: row.CustomerUserId,
      BookingTime: row.BookingTime,
      Status: row.Status || 'C',
      Notes: row.Notes || '',
      CreatedAt: row.CreatedAt,
      Services: services,
      TotalPrice: services.reduce((sum, s) => sum + s.Price, 0),
      TotalDuration: services.reduce((sum, s) => sum + s.DurationMinutes, 0),
    })
  }

  return results
}

async function createBooking(userIdInput, payload = {}) {
  const userId = requireUserId(userIdInput)
  const serviceItems = Array.isArray(payload.serviceItems) ? payload.serviceItems : []
  const preferredStaffId = String(payload.staffId || '').trim() || null

  const normalizedItems = serviceItems
    .map((item) => ({
      serviceId: String(item?.serviceId || item?.ServiceId || '').trim(),
      quantity: Math.max(1, Math.trunc(toNumber(item?.quantity, 1))),
      staffId: String(item?.staffId || '').trim() || preferredStaffId,
    }))
    .filter((item) => Boolean(item.serviceId))

  if (!normalizedItems.length) {
    const singleServiceId = String(payload.serviceId || '').trim()
    if (singleServiceId) {
      normalizedItems.push({ serviceId: singleServiceId, quantity: 1, staffId: preferredStaffId })
    }
  }

  if (!normalizedItems.length) {
    const err = new Error('Please select at least one service')
    err.status = 400
    throw err
  }

  const bookingDate = String(payload.date || '').trim()
  const bookingTime = String(payload.time || '').trim()
  let when = null

  if (payload.bookingTime) {
    when = new Date(payload.bookingTime)
  } else if (bookingDate && bookingTime) {
    when = new Date(`${bookingDate}T${bookingTime}:00`)
  }

  if (!when || Number.isNaN(when.getTime())) {
    const err = new Error('Invalid booking time')
    err.status = 400
    throw err
  }

  const isReturningCustomer = await hasPreviousBookings(userId)
  const autoStaffId = !isReturningCustomer ? await getAutoAssignedStaffId() : null

  const bookingId = `BKG-${newId()}`
  await query(
    `INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes, CreatedAt)
     VALUES (@bookingId, @userId, @bookingTime, @status, @notes, SYSUTCDATETIME())`,
    {
      bookingId,
      userId,
      bookingTime: when,
      status: 'C',
      notes: String(payload.notes || '').trim() || null,
    }
  )

  for (const item of normalizedItems) {
    const svcRes = await query(
      'SELECT TOP 1 ServiceId, Price FROM Services WHERE ServiceId = @serviceId',
      { serviceId: item.serviceId }
    )

    const svc = svcRes.recordset?.[0]
    if (!svc) {
      const err = new Error(`Service not found: ${item.serviceId}`)
      err.status = 404
      throw err
    }

    let resolvedStaffId = item.staffId || null
    if (!resolvedStaffId && !isReturningCustomer) {
      resolvedStaffId = await getAutoAssignedStaffIdForService(item.serviceId)
      if (!resolvedStaffId) resolvedStaffId = autoStaffId
    }

    if (!resolvedStaffId && isReturningCustomer) {
      const err = new Error('Please choose a specialist for your booking')
      err.status = 400
      throw err
    }

    if (resolvedStaffId) {
      const supported = await staffSupportsService(resolvedStaffId, item.serviceId)
      if (!supported) {
        if (!isReturningCustomer) {
          const fallbackStaffId = await getAutoAssignedStaffIdForService(item.serviceId)
          if (fallbackStaffId) {
            resolvedStaffId = fallbackStaffId
          }
        }

        const supportedAfterFallback = await staffSupportsService(resolvedStaffId, item.serviceId)
        if (!supportedAfterFallback) {
          const err = new Error('Selected specialist does not match the chosen service')
          err.status = 409
          throw err
        }
      }
    }

    for (let i = 0; i < item.quantity; i += 1) {
      await query(
        `INSERT INTO BookingServices (
          BookingServiceId,
          BookingId,
          ServiceId,
          StaffId,
          Price,
          CommissionAmount
        )
        VALUES (
          @bookingServiceId,
          @bookingId,
          @serviceId,
          @staffId,
          @price,
          NULL
        )`,
        {
          bookingServiceId: `BKS-${newId()}`,
          bookingId,
          serviceId: item.serviceId,
          staffId: resolvedStaffId,
          price: Number(svc.Price || 0),
        }
      )
    }
  }

  const latest = await listBookings(userId, 1)
  return latest[0] || { BookingId: bookingId }
}

async function listOrders(userIdInput, limit = 20) {
  const userId = requireUserId(userIdInput)
  const orderChannelColumn = await getOrdersChannelColumn()
  const orderChannelSelectSql = orderChannelColumn === 'Channel'
    ? 'o.Channel AS Cannel'
    : orderChannelColumn === 'Cannel'
      ? 'o.Cannel'
      : 'NULL AS Cannel'

  const res = await query(
    `SELECT TOP (@limit)
        o.OrderId,
        o.UserId,
        o.Status,
        o.CreatedAt,
        o.CustomerName,
        o.CustomerPhone,
        o.CustomerAddress,
        ${orderChannelSelectSql},
        o.Subtotal,
        o.Total,
        o.PaymentMethod,
        o.GiftCardCode,
        o.GiftCardApplied
     FROM Orders o
      WHERE o.UserId = @userId
     ORDER BY o.CreatedAt DESC, o.OrderId DESC`,
    {
      userId,
      limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
    }
  )

  const rows = res.recordset || []
  const orders = []

  for (const row of rows) {
    const itemsRes = await query(
      `SELECT
          oi.OrderItemId,
          oi.OrderId,
          oi.ProductId,
          oi.Quantity,
          oi.Price,
          oi.ProductName,
          p.ImageUrl
       FROM OrderItems oi
       LEFT JOIN Products p ON p.ProductId = oi.ProductId
       WHERE oi.OrderId = @orderId
       ORDER BY oi.OrderItemId`,
      { orderId: row.OrderId }
    )

    const items = (itemsRes.recordset || []).map((item) => ({
      OrderItemId: item.OrderItemId,
      OrderId: item.OrderId,
      ProductId: item.ProductId,
      ProductName: item.ProductName || '',
      Quantity: Number(item.Quantity || 0),
      Price: Number(item.Price || 0),
      ImageUrl: item.ImageUrl || null,
      LineTotal: Number(item.Quantity || 0) * Number(item.Price || 0),
    }))

    orders.push({
      OrderId: row.OrderId,
      UserId: row.UserId,
      Status: row.Status || 'C',
      CreatedAt: row.CreatedAt,
      CustomerName: row.CustomerName || '',
      CustomerPhone: row.CustomerPhone || '',
      CustomerAddress: row.CustomerAddress || '',
      Cannel: row.Cannel || 'Online',
      Subtotal: Number(row.Subtotal || 0),
      Tax: 0,
      Shipping: 0,
      DiscountAmount: calcOrderDiscountAmount(row),
      Total: Number(row.Total || 0),
      PaymentMethod: row.PaymentMethod || 'COD',
      PaymentStatus: derivePaymentStatus(row.Status, row.PaymentMethod),
      GiftCardCode: row.GiftCardCode || null,
      GiftCardApplied: Number(row.GiftCardApplied || 0),
      Items: items,
    })
  }

  return orders
}

async function cancelBooking(userIdInput, bookingIdInput) {
  const userId = requireUserId(userIdInput)
  const bookingId = String(bookingIdInput || '').trim()

  if (!bookingId) {
    const err = new Error('Missing bookingId')
    err.status = 400
    throw err
  }

  const bookingRes = await query(
    `SELECT TOP 1 BookingId, CustomerUserId, Status
     FROM Bookings
     WHERE BookingId = @bookingId AND CustomerUserId = @userId`,
    { bookingId, userId }
  )

  const booking = bookingRes.recordset?.[0]
  if (!booking) {
    const err = new Error('Booking not found')
    err.status = 404
    throw err
  }

  if (!isCStatus(booking.Status)) {
    const err = new Error('Only C bookings can be cancelled')
    err.status = 409
    throw err
  }

  await query(
    `UPDATE Bookings
     SET Status = @status
     WHERE BookingId = @bookingId AND CustomerUserId = @userId`,
    {
      bookingId,
      userId,
      status: 'Cancelled',
    }
  )

  return { BookingId: bookingId, Status: 'Cancelled' }
}

async function cancelOrder(userIdInput, orderIdInput) {
  const userId = requireUserId(userIdInput)
  const orderId = String(orderIdInput || '').trim()

  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  const orderRes = await query(
    `SELECT TOP 1 OrderId, Status
     FROM Orders
     WHERE OrderId = @orderId AND UserId = @userId`,
    { orderId, userId }
  )

  const order = orderRes.recordset?.[0]
  if (!order) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  if (!isCStatus(order.Status)) {
    const err = new Error('Only C orders can be cancelled')
    err.status = 409
    throw err
  }

  const itemsRes = await query(
    `SELECT ProductId, Quantity
     FROM OrderItems
     WHERE OrderId = @orderId`,
    { orderId }
  )

  const items = itemsRes.recordset || []
  for (const item of items) {
    await query(
      `UPDATE Products
       SET Stock = ISNULL(Stock, 0) + @quantity
       WHERE ProductId = @productId`,
      {
        productId: item.ProductId,
        quantity: Number(item.Quantity || 0),
      }
    )
  }

  await query(
    `UPDATE Orders
     SET Status = @status
     WHERE OrderId = @orderId AND UserId = @userId`,
    {
      orderId,
      userId,
      status: 'Cancelled',
    }
  )

  return { OrderId: orderId, Status: 'Cancelled' }
}

module.exports = {
  getCustomerContext,
  listAvailableStaff,
  listAddresses,
  upsertAddress,
  deleteAddress,
  setDefaultAddress,
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  checkoutCart,
  listBookings,
  createBooking,
  listOrders,
  cancelBooking,
  cancelOrder,
}
