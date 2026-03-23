const { query, newId } = require('../config/query')
const {
  toInventoryItem,
  toInventoryHistoryItem,
} = require('../models/inventory.model')

let _schemaInfoPromise = null

async function columnExists(tableName, columnName) {
  const result = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @t AND COLUMN_NAME = @c`,
    { t: tableName, c: columnName }
  )
  return Boolean(result.recordset?.length)
}

async function tableExists(tableName) {
  const result = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = @t`,
    { t: tableName }
  )
  return Boolean(result.recordset?.length)
}

async function getSchemaInfo() {
  if (_schemaInfoPromise) return _schemaInfoPromise
  _schemaInfoPromise = (async () => {
    const [productsHasCategoryId, inventoryHasCategoryId, hasProductCategories] = await Promise.all([
      columnExists('Products', 'CategoryId'),
      columnExists('InventoryItems', 'CategoryId'),
      tableExists('ProductCategories'),
    ])

    return {
      productsHasCategoryId,
      inventoryHasCategoryId,
      hasProductCategories,
    }
  })()
  return _schemaInfoPromise
}

async function resolveCategoryIdFromPayload(payload) {
  const rawId = payload?.categoryId ?? payload?.CategoryId
  if (rawId !== undefined && rawId !== null && rawId !== '') {
    const id = String(rawId).trim()
    if (id) return id
  }

  const name = payload?.kind ?? payload?.category
  const categoryName = typeof name === 'string' ? name.trim() : ''
  if (!categoryName) return null

  const schema = await getSchemaInfo()
  if (!schema.hasProductCategories) return null
  const found = await query(
    `SELECT TOP 1 CategoryId
     FROM ProductCategories
     WHERE LTRIM(RTRIM(Name)) = @name`,
    { name: categoryName }
  )
  return found.recordset?.[0]?.CategoryId ?? null
}

function parseOptionalDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function hasDangerousInput(value) {
  const raw = String(value || '')
  const lower = raw.toLowerCase()
  if (/<\s*script\b/i.test(raw)) return true
  if (/on\w+\s*=\s*/i.test(raw)) return true
  if (/\bor\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i.test(lower)) return true
  if (/\bunion\b\s+\bselect\b/i.test(lower)) return true
  return false
}

function normalizeRequiredSafeText(value, field, maxLen = 120) {
  const out = String(value || '').trim()
  if (!out) {
    const err = new Error(`Missing ${field}`)
    err.status = 400
    throw err
  }
  if (out.length > maxLen) {
    const err = new Error(`${field} is too long`)
    err.status = 400
    throw err
  }
  if (hasDangerousInput(out)) {
    const err = new Error(`Invalid ${field}`)
    err.status = 400
    throw err
  }
  return out
}

function validateNotFutureDate(value, fieldName) {
  if (!value) return null
  const d = parseOptionalDate(value)
  if (!d) {
    const err = new Error(`Invalid ${fieldName}`)
    err.status = 400
    throw err
  }
  const now = new Date()
  if (d.getTime() > now.getTime()) {
    const err = new Error(`${fieldName} cannot be in the future`)
    err.status = 400
    throw err
  }
  return d
}

function parseSku(value) {
  if (!value) return { hint: null, id: null }
  const raw = String(value)
  const idx = raw.indexOf(':')
  if (idx > 0) {
    return { hint: raw.slice(0, idx).toLowerCase(), id: raw.slice(idx + 1) }
  }
  return { hint: null, id: raw }
}

function parseMoneyVnd(value) {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null

  const digitsOnly = raw.replace(/[\s.,]/g, '').replace(/[^0-9-]/g, '')
  if (!digitsOnly || digitsOnly === '-') return null
  const n = Number(digitsOnly)
  if (!Number.isFinite(n)) return null
  return n
}

function parseOptionalString(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const s = String(value).trim()
  return s ? s : null
}

function retailShadowId(productId) {
  return `retail_${String(productId ?? '').trim()}`
}

async function resolveSkuKind(sku) {
  const { hint, id } = parseSku(sku)
  if (!id) return null

  const hintIsInventory = hint === 'service' || hint === 'inventory'
  const hintIsProduct = hint === 'retail' || hint === 'product'

  if (hintIsInventory) {
    const inv = await query('SELECT TOP 1 InventoryItemId FROM InventoryItems WHERE InventoryItemId = @id', { id })
    if (inv.recordset?.length) return { kind: 'inventory', id }
    return null
  }

  if (hintIsProduct) {
    const prod = await query('SELECT TOP 1 ProductId FROM Products WHERE ProductId = @id', { id })
    if (prod.recordset?.length) return { kind: 'product', id }
    return null
  }

  const inv = await query('SELECT TOP 1 InventoryItemId FROM InventoryItems WHERE InventoryItemId = @id', { id })
  if (inv.recordset?.length) return { kind: 'inventory', id }

  const prod = await query('SELECT TOP 1 ProductId FROM Products WHERE ProductId = @id', { id })
  if (prod.recordset?.length) return { kind: 'product', id }

  return null
}

async function getInventory() {
  const schema = await getSchemaInfo()

  const hasCategoryMapping = schema.productsHasCategoryId && schema.inventoryHasCategoryId && schema.hasProductCategories
  const serviceKindExpr = hasCategoryMapping ? 'COALESCE(pcService.Name, CAST(NULL AS NVARCHAR(100)))' : 'CAST(NULL AS NVARCHAR(100))'
  const retailKindExpr = hasCategoryMapping
    ? 'COALESCE(pcRetail.Name, pcShadow.Name, CAST(NULL AS NVARCHAR(100)))'
    : 'CAST(NULL AS NVARCHAR(100))'

  const itemsResult = await query(
    `SELECT
        i.InventoryItemId,
        CAST(CONCAT('service:', i.InventoryItemId) AS NVARCHAR(100)) AS SkuKey,
        i.Name,
        ${serviceKindExpr} AS CategoryName,
        i.Unit,
        i.ConversionRate,
        i.Quantity,
        i.ReorderLevel,
        txInfo.LastAt AS LastAt,
        CAST('service' AS NVARCHAR(20)) AS ItemGroup,
        CAST(COALESCE(i.PriceVnd, 0) AS DECIMAL(12,2)) AS PriceVnd,
        CAST(NULL AS DECIMAL(12,2)) AS SellPriceVnd,
        CAST(NULL AS NVARCHAR(200)) AS Supplier
      FROM InventoryItems i
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcService ON pcService.CategoryId = i.CategoryId' : ''}
      OUTER APPLY (
        SELECT MAX(t.CreatedAt) AS LastAt
        FROM InventoryTransactions t
        WHERE t.InventoryItemId = i.InventoryItemId
          AND t.Type = 'IN'
      ) txInfo
      WHERE COALESCE(i.ItemGroup, 'service') = 'service'

      UNION ALL

      SELECT
        p.ProductId AS InventoryItemId,
        CAST(CONCAT('retail:', p.ProductId) AS NVARCHAR(100)) AS SkuKey,
        p.Name,
        ${retailKindExpr} AS CategoryName,
        CAST('sp' AS NVARCHAR(50)) AS Unit,
        CAST(1 AS DECIMAL(10,2)) AS ConversionRate,
        CAST(COALESCE(p.Stock, 0) AS DECIMAL(10,2)) AS Quantity,
        CAST(0 AS DECIMAL(10,2)) AS ReorderLevel,
        txInfoRetail.LastAt AS LastAt,
        CAST('retail' AS NVARCHAR(20)) AS ItemGroup,
        CAST(COALESCE(r.PriceVnd, 0) AS DECIMAL(12,2)) AS PriceVnd,
        CAST(COALESCE(p.Price, 0) AS DECIMAL(12,2)) AS SellPriceVnd,
        CAST(NULL AS NVARCHAR(200)) AS Supplier
      FROM Products p
      LEFT JOIN InventoryItems r ON r.InventoryItemId = CONCAT('retail_', p.ProductId)
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcRetail ON pcRetail.CategoryId = p.CategoryId' : ''}
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcShadow ON pcShadow.CategoryId = r.CategoryId' : ''}
      OUTER APPLY (
        SELECT MAX(t.CreatedAt) AS LastAt
        FROM InventoryTransactions t
        WHERE t.InventoryItemId = CONCAT('retail_', p.ProductId)
          AND t.Type = 'IN'
      ) txInfoRetail`
  )

  const items = (itemsResult.recordset || []).map(toInventoryItem)

  const historyResult = await query(
    `SELECT
        t.TransactionId,
        t.CreatedAt,
        t.Type,
        t.Quantity,
        i.Name AS ProductName,
        CAST(
          CASE
            WHEN t.Type = 'IN' THEN COALESCE(i.PriceVnd, 0)
            ELSE COALESCE(i.PriceVnd, 0)
          END
          AS DECIMAL(12,2)
        ) AS UnitCost,
        t.ReferenceId,
        COALESCE(t.PerformedByName, t.PerformedByEmail, t.PerformedById, N'System') AS ByName,
        CAST(
          CASE
            WHEN t.Type = 'IN' THEN COALESCE(t.ReferenceId, N'')
            ELSE t.ReferenceId
          END
          AS NVARCHAR(MAX)
        ) AS Note
      FROM InventoryTransactions t
      INNER JOIN InventoryItems i ON i.InventoryItemId = t.InventoryItemId
      WHERE t.Type IN ('IN', 'OUT')
      ORDER BY t.CreatedAt DESC`
  )

  const history = (historyResult.recordset || []).map(toInventoryHistoryItem)

  return { items, history }
}

async function createInventoryItem(payload, { actor } = {}) {
  const { name, qty, minQty, unit, group, category, kind, priceVnd, supplier, importPrice, sellPriceVnd, description, imageUrl, status } = payload || {}
  const schema = await getSchemaInfo()
  const categoryId = await resolveCategoryIdFromPayload(payload)

  const normalizedName = normalizeRequiredSafeText(name, 'name')
  const id = newId()
  const q = Number(qty)
  const min = Number(minQty)
  const normalizedGroup = String(group || '').trim().toLowerCase()

  if (Number.isFinite(q) && q < 0) {
    const err = new Error('Invalid qty')
    err.status = 400
    throw err
  }
  if (Number.isFinite(min) && min < 0) {
    const err = new Error('Invalid minQty')
    err.status = 400
    throw err
  }
  if (!Number.isFinite(q) && qty !== undefined && qty !== null && qty !== '') {
    const err = new Error('Invalid qty')
    err.status = 400
    throw err
  }
  if (!Number.isFinite(min) && minQty !== undefined && minQty !== null && minQty !== '') {
    const err = new Error('Invalid minQty')
    err.status = 400
    throw err
  }

  if (unit !== undefined && unit !== null && String(unit).trim()) {
    normalizeRequiredSafeText(unit, 'unit', 60)
  }
  if (supplier !== undefined && supplier !== null && String(supplier).trim()) {
    normalizeRequiredSafeText(supplier, 'supplier', 120)
  }

  const parsedPrice = parseMoneyVnd(priceVnd)
  const shouldCreateRetail =
    normalizedGroup === 'retail' ||
    normalizedGroup === 'product' ||
    (normalizedGroup !== 'service' && normalizedGroup !== 'inventory' && parsedPrice !== null && parsedPrice > 0)

  const initialQty = Number.isFinite(q) ? q : 0
  const wantsInitialStock = initialQty > 0

  // Retail products
  if (shouldCreateRetail) {
    const stock = 0
    const price = parsedPrice !== null ? parsedPrice : 0
    const sellPrice = parseMoneyVnd(sellPriceVnd)
    if (!Number.isFinite(price) || price < 0) {
      const err = new Error('Invalid priceVnd')
      err.status = 400
      throw err
    }

    if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice < 0)) {
      const err = new Error('Invalid sellPriceVnd')
      err.status = 400
      throw err
    }

    if (!schema.productsHasCategoryId || !schema.hasProductCategories) {
      const err = new Error('Products.CategoryId or ProductCategories is missing')
      err.status = 400
      throw err
    }
    await query(
      `INSERT INTO Products (ProductId, Name, Price, Description, ImageUrl, Stock, Status, CategoryId)
       VALUES (@id, @name, @price, NULL, NULL, @stock, NULL, @categoryId)`,
      {
        id,
        name: normalizedName,
        price: sellPrice !== null ? sellPrice : price,
        stock,
        categoryId,
      }
    )

    const desc = parseOptionalString(description)
    const img = parseOptionalString(imageUrl)
    const st = parseOptionalString(status)
    if (desc !== undefined || img !== undefined || st !== undefined) {
      await query(
        `UPDATE Products
         SET
           Description = COALESCE(@description, Description),
           ImageUrl = COALESCE(@imageUrl, ImageUrl),
           Status = COALESCE(@status, Status)
         WHERE ProductId = @id;`,
        {
          id,
          description: desc === undefined ? null : desc,
          imageUrl: img === undefined ? null : img,
          status: st === undefined ? null : st,
        }
      )
    }

    // Also create a shadow row in InventoryItems so retail stock can be synchronized.
    // IMPORTANT: Use a collision-free id; ProductId may be numeric (1,2,3) and could already exist in InventoryItems.
    const shadowId = retailShadowId(id)
    if (!schema.inventoryHasCategoryId) {
      const err = new Error('InventoryItems.CategoryId is missing')
      err.status = 400
      throw err
    }
    await query(
      `IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @shadowId)
       BEGIN
         INSERT INTO InventoryItems (InventoryItemId, ProductId, CategoryId, Name, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
         VALUES (@shadowId, @productId, @categoryId, @name, @unit, @rate, @qty, @reorder, @priceVnd, 'retail')
       END
       ELSE
       BEGIN
         UPDATE InventoryItems
         SET
           ProductId = COALESCE(@productId, ProductId),
           CategoryId = COALESCE(@categoryId, CategoryId),
           Name = COALESCE(@name, Name),
           Unit = COALESCE(@unit, Unit),
           ConversionRate = COALESCE(@rate, ConversionRate),
           ItemGroup = 'retail',
           PriceVnd = COALESCE(@priceVnd, PriceVnd)
         WHERE InventoryItemId = @shadowId
       END`,
      {
        shadowId,
        productId: id,
        categoryId,
        name: normalizedName,
        unit: 'sp',
        rate: 1,
        qty: 0,
        reorder: 0,
        // Shadow InventoryItems.PriceVnd tracks cost (import price)
        priceVnd: price > 0 ? price : null,
      }
    )

    if (wantsInitialStock) {
      await stockIn(
        {
          inventoryItemId: id,
          qty: Math.trunc(initialQty),
          supplier: supplier || null,
          importPrice: importPrice ?? null,
          note: 'Initial stock setup',
        },
        { actor }
      )
    }

    return { id }
  }

  // Service consumables / inventory items
  if (!schema.inventoryHasCategoryId) {
    const err = new Error('InventoryItems.CategoryId is missing')
    err.status = 400
    throw err
  }
  await query(
    `INSERT INTO InventoryItems (InventoryItemId, Name, CategoryId, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
     VALUES (@id, @name, @categoryId, @unit, @rate, @qty, @reorder, @priceVnd, 'service')`,
    {
      id,
      name: normalizedName,
      categoryId,
      unit: unit || null,
      rate: 1,
      qty: 0,
      reorder: Number.isFinite(min) ? min : 0,
      priceVnd: parsedPrice !== null && Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
    }
  )

  if (wantsInitialStock) {
    await stockIn(
      {
        inventoryItemId: id,
        qty: initialQty,
        supplier: supplier || null,
        // If UI only provides priceVnd during creation, treat it as initial import price for service items.
        importPrice: importPrice ?? (parsedPrice !== null && Number.isFinite(parsedPrice) ? parsedPrice : null),
        note: 'Initial stock setup',
      },
      { actor }
    )
  }

  return { id }
}

async function updateItem(itemId, payload) {
  if (!itemId) {
    const err = new Error('Missing id')
    err.status = 400
    throw err
  }

  const kind = await resolveSkuKind(itemId)
  if (!kind) {
    const err = new Error('Unknown SKU')
    err.status = 404
    throw err
  }

  const { name, unit, minQty, priceVnd, sellPriceVnd, description, imageUrl, status } = payload || {}
  const { category } = payload || {}
  const schema = await getSchemaInfo()
  const categoryId = await resolveCategoryIdFromPayload(payload)

  if (name !== undefined) normalizeRequiredSafeText(name, 'name')

  if (unit !== undefined && unit !== null && String(unit).trim()) {
    normalizeRequiredSafeText(unit, 'unit', 60)
  }

  if (description !== undefined && description !== null && String(description).trim()) {
    normalizeRequiredSafeText(description, 'description', 1000)
  }

  if (imageUrl !== undefined && imageUrl !== null && String(imageUrl).trim() && hasDangerousInput(imageUrl)) {
    const err = new Error('Invalid imageUrl')
    err.status = 400
    throw err
  }

  if (status !== undefined && status !== null && String(status).trim() && hasDangerousInput(status)) {
    const err = new Error('Invalid status')
    err.status = 400
    throw err
  }

  if (category !== undefined && String(category || '').trim().length === 0) {
    const err = new Error('Invalid category')
    err.status = 400
    throw err
  }

  if (kind.kind === 'inventory') {
    const min = minQty !== undefined ? Number(minQty) : null
    if (min !== null && !Number.isFinite(min)) {
      const err = new Error('Invalid minQty')
      err.status = 400
      throw err
    }

    if (!schema.inventoryHasCategoryId) {
      const err = new Error('InventoryItems.CategoryId is missing')
      err.status = 400
      throw err
    }
    await query(
      `UPDATE InventoryItems
       SET
         Name = COALESCE(@name, Name),
         CategoryId = COALESCE(@categoryId, CategoryId),
         Unit = COALESCE(@unit, Unit),
         ReorderLevel = COALESCE(@reorder, ReorderLevel)
       WHERE InventoryItemId = @id;`,
      {
        id: kind.id,
        name: name !== undefined ? String(name).trim() : null,
        categoryId,
        unit: unit !== undefined ? (String(unit).trim() || null) : null,
        reorder: min !== null ? min : null,
      }
    )

    return { id: itemId }
  }

  // Retail products: allow updating name + price.
  const price = parseMoneyVnd(priceVnd)
  const sellPrice = parseMoneyVnd(sellPriceVnd)
  const desc = parseOptionalString(description)
  const img = parseOptionalString(imageUrl)
  const st = parseOptionalString(status)
  if (price !== null && (!Number.isFinite(price) || price <= 0)) {
    const err = new Error('Invalid priceVnd')
    err.status = 400
    throw err
  }

  if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice <= 0)) {
    const err = new Error('Invalid sellPriceVnd')
    err.status = 400
    throw err
  }

  if (!schema.productsHasCategoryId || !schema.hasProductCategories) {
    const err = new Error('Products.CategoryId or ProductCategories is missing')
    err.status = 400
    throw err
  }
  await query(
    `UPDATE Products
     SET
       Name = COALESCE(@name, Name),
       CategoryId = COALESCE(@categoryId, CategoryId),
       Price = COALESCE(@sellPrice, Price),
       Description = COALESCE(@description, Description),
       ImageUrl = COALESCE(@imageUrl, ImageUrl),
       Status = COALESCE(@status, Status)
     WHERE ProductId = @id;`,
    {
      id: kind.id,
      name: name !== undefined ? String(name).trim() : null,
      categoryId,
      importPrice: price,
      sellPrice,
      description: desc === undefined ? null : desc,
      imageUrl: img === undefined ? null : img,
      status: st === undefined ? null : st,
    }
  )

  // Keep retail shadow InventoryItems row in sync as well.
  const shadowId = retailShadowId(kind.id)
  if (!schema.inventoryHasCategoryId) {
    const err = new Error('InventoryItems.CategoryId is missing')
    err.status = 400
    throw err
  }
  await query(
    `IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @shadowId)
     BEGIN
       INSERT INTO InventoryItems (InventoryItemId, ProductId, CategoryId, Name, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
       SELECT @shadowId, p.ProductId, p.CategoryId, COALESCE(@name, p.Name),
       'sp', 1, COALESCE(p.Stock, 0), 0, COALESCE(@importPrice, NULL), 'retail'
       FROM Products p
       WHERE p.ProductId = @id
     END
     ELSE
     BEGIN
       UPDATE InventoryItems
       SET
         ProductId = COALESCE(@productId, ProductId),
         CategoryId = COALESCE((SELECT TOP 1 CategoryId FROM Products WHERE ProductId = @id), CategoryId),
         Name = COALESCE(@name, Name),
         Unit = COALESCE('sp', Unit),
         ConversionRate = COALESCE(1, ConversionRate),
         ItemGroup = 'retail',
         PriceVnd = COALESCE(@importPrice, PriceVnd)
       WHERE InventoryItemId = @shadowId
     END`,
    {
      id: kind.id,
      shadowId,
      productId: kind.id,
      name: name !== undefined ? String(name).trim() : null,
      importPrice: price,
    }
  )

  return { id: itemId }
}

async function stockIn(payload, { actor } = {}) {
  const { inventoryItemId, product, qty, referenceId, supplier, importPrice, date, note } = payload || {}
  const amount = Number(qty)
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Invalid qty')
    err.status = 400
    throw err
  }

  let itemId = inventoryItemId
  if (!itemId && product) {
    const found = await query('SELECT TOP 1 InventoryItemId FROM InventoryItems WHERE Name = @name', { name: product })
    itemId = found.recordset?.[0]?.InventoryItemId
  }

  if (!itemId) {
    const err = new Error('Missing inventoryItemId')
    err.status = 400
    throw err
  }

  const kind = await resolveSkuKind(itemId)
  if (!kind) {
    const err = new Error('Unknown SKU')
    err.status = 404
    throw err
  }

  const when = validateNotFutureDate(date, 'date')
  const unitCost = parseMoneyVnd(importPrice)
  if (unitCost === null || !Number.isFinite(unitCost) || unitCost <= 0) {
    const err = new Error('Invalid importPrice')
    err.status = 400
    throw err
  }
  const schema = await getSchemaInfo()
  const txRef = referenceId || (note ? String(note).slice(0, 100) : null)
  if (kind.kind === 'inventory') {
    const txId = newId()
    await query(
      `UPDATE InventoryItems
       SET
         Quantity = COALESCE(Quantity, 0) + @qty,
         PriceVnd = COALESCE(@unitCost, PriceVnd)
       WHERE InventoryItemId = @iid;`,
      {
        iid: kind.id,
        qty: amount,
        unitCost: unitCost !== null && Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null,
      }
    )

    await query(
      `IF NOT EXISTS (SELECT 1 FROM InventoryTransactions WHERE TransactionId = @txId)
       BEGIN
         INSERT INTO InventoryTransactions (
           TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
           PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
         )
         VALUES (
           @txId, @itemId, 'IN', @qty, @ref, COALESCE(@createdAt, GETDATE()),
           @performedByRole, @performedById, @performedByName, @performedByEmail
         );
       END`,
      {
        txId,
        itemId: kind.id,
        qty: amount,
        ref: txRef,
        createdAt: when,
        performedByRole: actor?.roleKey ?? null,
        performedById: actor?.userId ?? null,
        performedByName: actor?.name ?? null,
        performedByEmail: actor?.email ?? null,
      }
    )
  } else {
    if (!Number.isInteger(amount)) {
      const err = new Error('Invalid qty (must be an integer for retail products)')
      err.status = 400
      throw err
    }
    const shadowId = retailShadowId(kind.id)
    const txId = newId()
    if (!schema.inventoryHasCategoryId) {
      const err = new Error('InventoryItems.CategoryId is missing')
      err.status = 400
      throw err
    }

    await query(
      `UPDATE Products
       SET
          Stock = COALESCE(Stock, 0) + @qty
       WHERE ProductId = @itemId;

       IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @shadowId)
       BEGIN
         INSERT INTO InventoryItems (InventoryItemId, ProductId, CategoryId, Name, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
         SELECT @shadowId, p.ProductId, p.CategoryId, p.Name, 'sp', 1, COALESCE(p.Stock, 0), 0, COALESCE(@unitCost, NULL), 'retail'
         FROM Products p
         WHERE p.ProductId = @itemId;
       END

       UPDATE InventoryItems
       SET
         ProductId = COALESCE(@itemId, ProductId),
         CategoryId = COALESCE((SELECT TOP 1 CategoryId FROM Products WHERE ProductId = @itemId), CategoryId),
         Quantity = (SELECT COALESCE(Stock, 0) FROM Products WHERE ProductId = @itemId),
         PriceVnd = COALESCE(@unitCost, PriceVnd),
         ItemGroup = 'retail'
        WHERE InventoryItemId = @shadowId;

       INSERT INTO InventoryTransactions (
         TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
         PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
       )
       VALUES (
         @txId, @shadowId, 'IN', @qty, @ref, COALESCE(@createdAt, GETDATE()),
         @performedByRole, @performedById, @performedByName, @performedByEmail
       );`,
      {
        itemId: kind.id,
        shadowId,
        txId,
        qty: Math.trunc(amount),
        ref: txRef,
        createdAt: when,
        performedByRole: actor?.roleKey ?? null,
        performedById: actor?.userId ?? null,
        performedByName: actor?.name ?? null,
        performedByEmail: actor?.email ?? null,
        unitCost: unitCost !== null && Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null,
      }
    )
  }

  return { id: txRef || newId() }
}

async function stockOut(payload, { actor } = {}) {
  const { inventoryItemId, qty, date, note } = payload || {}
  const amount = Number(qty)
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Invalid qty')
    err.status = 400
    throw err
  }

  const itemId = inventoryItemId
  if (!itemId) {
    const err = new Error('Missing inventoryItemId')
    err.status = 400
    throw err
  }

  const kind = await resolveSkuKind(itemId)
  if (!kind) {
    const err = new Error('Unknown SKU')
    err.status = 404
    throw err
  }

  const when = validateNotFutureDate(date, 'date')

  if (kind.kind === 'inventory') {
    const currentRes = await query('SELECT TOP 1 Quantity FROM InventoryItems WHERE InventoryItemId = @id', { id: kind.id })
    const cur = Number(currentRes.recordset?.[0]?.Quantity || 0)
    if (cur < amount) {
      const err = new Error('Insufficient stock')
      err.status = 409
      throw err
    }

    const txId = newId()
    await query(
      `UPDATE InventoryItems
       SET Quantity = COALESCE(Quantity, 0) - @qty
       WHERE InventoryItemId = @itemId;

       INSERT INTO InventoryTransactions (
         TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
         PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
       )
       VALUES (
         @txId, @itemId, 'OUT', @qty, @ref, COALESCE(@createdAt, GETDATE()),
         @performedByRole, @performedById, @performedByName, @performedByEmail
       );`,
      {
        txId,
        itemId: kind.id,
        qty: amount,
        ref: note ? String(note).slice(0, 100) : null,
        createdAt: when,
        performedByRole: actor?.roleKey ?? null,
        performedById: actor?.userId ?? null,
        performedByName: actor?.name ?? null,
        performedByEmail: actor?.email ?? null,
      }
    )
    return { id: txId }
  }

  // For retail products, record stock-out in InventoryTransactions (no Orders needed).
  if (!Number.isInteger(amount)) {
    const err = new Error('Invalid qty (must be an integer for retail products)')
    err.status = 400
    throw err
  }

  const currentRes = await query('SELECT TOP 1 Stock FROM Products WHERE ProductId = @id', { id: kind.id })
  const cur = Number(currentRes.recordset?.[0]?.Stock || 0)
  if (cur < amount) {
    const err = new Error('Insufficient stock')
    err.status = 409
    throw err
  }

  const txId = newId()
  const shadowId = retailShadowId(kind.id)
  const ref = note ? String(note).slice(0, 100) : null

  const schema = await getSchemaInfo()
  if (!schema.inventoryHasCategoryId) {
    const err = new Error('InventoryItems.CategoryId is missing')
    err.status = 400
    throw err
  }

  await query(
    `UPDATE Products
     SET Stock = COALESCE(Stock, 0) - @qty
     WHERE ProductId = @productId;

     IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @shadowId)
     BEGIN
       INSERT INTO InventoryItems (InventoryItemId, ProductId, CategoryId, Name, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
       SELECT @shadowId, p.ProductId, p.CategoryId, p.Name, 'sp', 1, COALESCE(p.Stock, 0), 0, NULL, 'retail'
       FROM Products p
       WHERE p.ProductId = @productId;
     END

     UPDATE InventoryItems
     SET
       ProductId = COALESCE(@productId, ProductId),
       CategoryId = COALESCE((SELECT TOP 1 CategoryId FROM Products WHERE ProductId = @productId), CategoryId),
       Quantity = (SELECT COALESCE(Stock, 0) FROM Products WHERE ProductId = @productId),
       ItemGroup = 'retail'
     WHERE InventoryItemId = @shadowId;

     INSERT INTO InventoryTransactions (
       TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
       PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
     )
     VALUES (
       @txId, @shadowId, 'OUT', @qty, @ref, COALESCE(@createdAt, GETDATE()),
       @performedByRole, @performedById, @performedByName, @performedByEmail
     );`,
    {
      productId: kind.id,
      shadowId,
      txId,
      qty: Math.trunc(amount),
      createdAt: when,
      ref,
      performedByRole: actor?.roleKey ?? null,
      performedById: actor?.userId ?? null,
      performedByName: actor?.name ?? null,
      performedByEmail: actor?.email ?? null,
    }
  )

  return { id: txId }
}

async function deleteItem(itemId) {
  if (!itemId) {
    const err = new Error('Missing id')
    err.status = 400
    throw err
  }

  const kind = await resolveSkuKind(itemId)
  if (!kind) {
    const err = new Error('Unknown SKU')
    err.status = 404
    throw err
  }

  if (kind.kind === 'inventory') {
    await query('DELETE FROM InventoryTransactions WHERE InventoryItemId = @id', { id: kind.id })
    await query('DELETE FROM InventoryItems WHERE InventoryItemId = @id', { id: kind.id })
    return { id: itemId }
  }

  const usedInOrders = await query('SELECT TOP 1 OrderItemId FROM OrderItems WHERE ProductId = @id', { id: kind.id })
  if (usedInOrders.recordset?.length) {
    const err = new Error('Cannot delete product with order history')
    err.status = 409
    throw err
  }

  const shadowId = retailShadowId(kind.id)
  await query('DELETE FROM ProductVariants WHERE ProductId = @id', { id: kind.id })
  await query('DELETE FROM ProductImages WHERE ProductId = @id', { id: kind.id }).catch(() => null)
  await query('DELETE FROM InventoryTransactions WHERE InventoryItemId = @shadowId', { shadowId })
  await query('DELETE FROM InventoryItems WHERE InventoryItemId = @shadowId', { shadowId })
  await query('DELETE FROM Products WHERE ProductId = @id', { id: kind.id })

  return { id: itemId }
}

module.exports = {
  getInventory,
  createInventoryItem,
  updateItem,
  stockIn,
  stockOut,
  deleteItem,
}
