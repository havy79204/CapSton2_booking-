const { query, newId } = require('../config/query')
const {
  notifyCustomerEvent,
  notifyAllCustomersEvent,
  notifyOwnerEvent,
  notifyWishlistDiscountByProduct,
} = require('./notifications.service')
const fs = require('fs/promises')
const path = require('path')

let _schemaInfoPromise = null

async function ensureProductImagesTable() {
  try {
    await query(
      `IF OBJECT_ID(N'ProductImages', N'U') IS NULL
       BEGIN
         CREATE TABLE ProductImages (
           ImageId NVARCHAR(50) NOT NULL PRIMARY KEY,
           ProductId NVARCHAR(50) NOT NULL,
           ImageUrl NVARCHAR(500) NOT NULL,
           SortOrder INT NULL
         );
       END;

       IF NOT EXISTS (
         SELECT 1 FROM sys.indexes
         WHERE name = 'IX_ProductImages_ProductId'
           AND object_id = OBJECT_ID('ProductImages')
       )
       BEGIN
         CREATE INDEX IX_ProductImages_ProductId ON ProductImages(ProductId);
       END;`
    )
  } catch {
    // Keep API usable even if DB user has limited DDL permissions.
  }
}

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
    await ensureProductImagesTable()
    const [
      productsHasCategoryId,
      inventoryHasCategoryId,
      hasProductCategories,
      hasProductVariants,
      ordersHasChannel,
      ordersHasCannel,
      hasOrderItems,
      hasOrders,
      ordersHasStatus,
      hasSalonReviews,
      salonReviewsHasProductId,
      salonReviewsHasRating,
    ] = await Promise.all([
      columnExists('Products', 'CategoryId'),
      columnExists('InventoryItems', 'CategoryId'),
      tableExists('ProductCategories'),
      tableExists('ProductVariants'),
      columnExists('Orders', 'Channel'),
      columnExists('Orders', 'Cannel'),
      tableExists('OrderItems'),
      tableExists('Orders'),
      columnExists('Orders', 'Status'),
      tableExists('SalonReviews'),
      columnExists('SalonReviews', 'ProductId'),
      columnExists('SalonReviews', 'Rating'),
    ])

    const hasProductImages = await tableExists('ProductImages')

    return {
      productsHasCategoryId,
      inventoryHasCategoryId,
      hasProductCategories,
      hasProductVariants,
      hasProductImages,
      ordersHasChannel,
      ordersHasCannel,
      hasOrderItems,
      hasOrders,
      ordersHasStatus,
      hasSalonReviews,
      salonReviewsHasProductId,
      salonReviewsHasRating,
    }
  })()
  return _schemaInfoPromise
}

async function listProductCategories() {
  const schema = await getSchemaInfo()
  if (!schema.hasProductCategories) return []
  const hasDescription = await columnExists('ProductCategories', 'Description')
  const res = await query(
    hasDescription
      ? `SELECT TOP (1000)
          CategoryId,
          Name,
          Description
         FROM ProductCategories
         ORDER BY Name ASC;`
      : `SELECT TOP (1000)
          CategoryId,
          Name
         FROM ProductCategories
         ORDER BY Name ASC;`
  )
  return (res.recordset || []).map((r) => ({
    id: r.CategoryId,
    name: r.Name || '',
    description: r.Description || '',
  }))
}

async function createProductCategory(payload) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductCategories) {
    const err = new Error('ProductCategories table not found')
    err.status = 400
    throw err
  }

  const rawName = payload?.name ?? payload?.Name
  const name = normalizeRequiredSafeText(rawName, 'name')

  const rawDesc = payload?.description ?? payload?.Description
  const description = typeof rawDesc === 'string' ? rawDesc.trim() : ''

  const exists = await query(
    `SELECT TOP 1 CategoryId
     FROM ProductCategories
     WHERE LTRIM(RTRIM(Name)) = @name`,
    { name }
  )
  if (exists.recordset?.length) {
    const err = new Error('Category already exists')
    err.status = 409
    throw err
  }

  const id = newId()
  const hasDescription = await columnExists('ProductCategories', 'Description')
  const inserted = await query(
    hasDescription
      ? `INSERT INTO ProductCategories (CategoryId, Name, Description)
         OUTPUT INSERTED.CategoryId, INSERTED.Name, INSERTED.Description
         VALUES (@id, @name, @description)`
      : `INSERT INTO ProductCategories (CategoryId, Name)
         OUTPUT INSERTED.CategoryId, INSERTED.Name
         VALUES (@id, @name)`
    ,
    {
      name,
      id,
      description: description || null,
    }
  )

  const row = inserted.recordset?.[0] || null
  return {
    id: row?.CategoryId,
    name: row?.Name || name,
    description: row?.Description || '',
  }
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

function retailShadowId(productId) {
  return `retail_${String(productId ?? '').trim()}`
}

function retailVariantShadowId(variantId) {
  return `retail_variant_${String(variantId ?? '').trim()}`
}

const DEFAULT_RETAIL_VARIANT_NAME = 'Default'

async function syncVariantShadowFromVariant(variantId, { priceVndHint = null } = {}) {
  const id = String(variantId || '').trim()
  if (!id) return

  const schema = await getSchemaInfo()
  if (!schema.inventoryHasCategoryId) return

  const variant = await query(
    `SELECT TOP 1
       pv.VariantId,
       pv.VariantName,
       COALESCE(pv.Stock, 0) AS VariantStock,
       p.ProductId,
       p.Name AS ProductName,
       p.CategoryId,
       COALESCE(p.Stock, 0) AS ProductStock
     FROM ProductVariants pv
     INNER JOIN Products p ON p.ProductId = pv.ProductId
     WHERE pv.VariantId = @id`,
    { id }
  )
  const row = variant.recordset?.[0]
  if (!row) return

  const variantShadowId = retailVariantShadowId(row.VariantId)

  await query(
    `IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @variantShadowId)
     BEGIN
       INSERT INTO InventoryItems (InventoryItemId, ProductId, CategoryId, Name, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
       VALUES (
         @variantShadowId,
         NULL,
         @categoryId,
         @variantDisplayName,
         'sp',
         1,
         @variantQty,
         0,
         @priceVndHint,
         'service'
       )
     END
     ELSE
     BEGIN
       UPDATE InventoryItems
       SET
        ProductId = NULL,
         CategoryId = COALESCE(@categoryId, CategoryId),
         Name = COALESCE(@variantDisplayName, Name),
         Quantity = @variantQty,
         PriceVnd = COALESCE(@priceVndHint, PriceVnd),
         ItemGroup = 'service'
       WHERE InventoryItemId = @variantShadowId
     END`,
    {
      variantShadowId,
      productId: row.ProductId,
      categoryId: row.CategoryId ?? null,
      variantDisplayName: `${String(row.ProductName || '').trim()} - ${String(row.VariantName || '').trim()}`.trim(),
      variantQty: Number(row.VariantStock || 0),
      priceVndHint: Number.isFinite(Number(priceVndHint)) ? Number(priceVndHint) : null,
    }
  )
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

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
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

function normalizeRetailStatus(value, { required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (!required) return null
    const err = new Error('Missing status')
    err.status = 400
    throw err
  }

  const normalized = String(value).trim().toLowerCase()
  if (normalized !== 'active' && normalized !== 'inactive') {
    const err = new Error('Invalid status')
    err.status = 400
    throw err
  }
  return normalized
}

async function ensureRetailProductNameUnique(name, excludeProductId = null) {
  const res = await query(
    `SELECT TOP 1 ProductId
     FROM Products
     WHERE LOWER(LTRIM(RTRIM(Name))) = LOWER(@name)
       AND (@excludeId IS NULL OR ProductId <> @excludeId)`,
    {
      name,
      excludeId: excludeProductId || null,
    }
  )

  if (res.recordset?.length) {
    const err = new Error('Product name already exists')
    err.status = 409
    throw err
  }
}

function getProductUploadDir() {
  return path.join(__dirname, '..', '..', 'uploads', 'products')
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim()
  const m = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const base64 = m[2]
  const buf = Buffer.from(base64, 'base64')
  const ext = kind === 'jpeg' ? 'jpg' : kind
  return { buf, ext }
}

function normalizeImageUrls(input) {
  const arr = Array.isArray(input) ? input : []
  return arr
    .map((x) => (x === undefined || x === null ? '' : String(x).trim()))
    .filter(Boolean)
    .slice(0, 20)
}

async function getProductImagesMap() {
  const schema = await getSchemaInfo()
  if (!schema.hasProductImages) return new Map()

  const res = await query(
    `SELECT ProductId, ImageUrl, SortOrder, ImageId
     FROM ProductImages
     ORDER BY ProductId, COALESCE(SortOrder, 2147483647), ImageId`
  )

  const map = new Map()
  for (const row of res.recordset || []) {
    const pid = row.ProductId
    const url = String(row.ImageUrl || '').trim()
    if (!pid || !url) continue
    if (!map.has(pid)) map.set(pid, [])
    map.get(pid).push(url)
  }
  return map
}

async function replaceProductImages(productId, imageUrls) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductImages) return

  const urls = normalizeImageUrls(imageUrls)
  await query('DELETE FROM ProductImages WHERE ProductId = @productId', { productId })

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i]
    if (url.length > 500) {
      const err = new Error('Image URL too long')
      err.status = 413
      throw err
    }

    await query(
      `INSERT INTO ProductImages (ImageId, ProductId, ImageUrl, SortOrder)
       VALUES (@id, @productId, @url, @sortOrder)`,
      {
        id: newId(),
        productId,
        url,
        sortOrder: i,
      }
    )
  }
}

async function uploadProductImageFromDataUrl({ dataUrl } = {}) {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    const err = new Error('Invalid image data URL. Use PNG or JPG.')
    err.status = 400
    throw err
  }

  if (!parsed.buf || parsed.buf.length === 0) {
    const err = new Error('Empty image')
    err.status = 400
    throw err
  }

  if (parsed.buf.length > 3 * 1024 * 1024) {
    const err = new Error('Image too large (max 3MB)')
    err.status = 413
    throw err
  }

  const dir = getProductUploadDir()
  await fs.mkdir(dir, { recursive: true })

  const fileName = `img_${newId()}.${parsed.ext}`
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, parsed.buf)

  const url = `/uploads/products/${fileName}`
  if (url.length > 500) {
    const err = new Error('Image URL too long')
    err.status = 413
    throw err
  }

  return { url }
}

async function listVariants(productId) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductVariants) return []

  const res = await query(
    `SELECT VariantId, ProductId, VariantName, Stock
     FROM ProductVariants
     WHERE ProductId = @productId
     ORDER BY VariantName ASC`,
    { productId }
  )

  return (res.recordset || []).map((r) => ({
    id: r.VariantId,
    productId: r.ProductId,
    name: r.VariantName || '',
    stock: Number(r.Stock || 0),
  }))
}

async function getProduct(productId) {
  const schema = await getSchemaInfo()
  if (!schema.productsHasCategoryId || !schema.hasProductCategories) {
    const err = new Error('Products.CategoryId or ProductCategories is missing')
    err.status = 400
    throw err
  }
  const prodRes = await query(
    `SELECT TOP 1
        p.ProductId,
        p.Name,
        p.Price,
        p.Description,
        p.ImageUrl,
        p.Stock,
        p.Status,
        ${schema.hasOrderItems
          ? `(
              SELECT COALESCE(SUM(oi.Quantity), 0)
              FROM OrderItems oi
              ${schema.hasOrders ? 'LEFT JOIN Orders o ON o.OrderId = oi.OrderId' : ''}
              WHERE oi.ProductId = p.ProductId
              ${schema.hasOrders && schema.ordersHasStatus
                ? "AND (o.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), o.Status)))) NOT IN ('cancelled', 'canceled'))"
                : ''}
            )`
          : 'CAST(0 AS INT)'} AS SoldCount,
        ${schema.hasSalonReviews && schema.salonReviewsHasProductId && schema.salonReviewsHasRating
          ? `(
              SELECT AVG(CAST(sr.Rating AS FLOAT))
              FROM SalonReviews sr
              WHERE sr.ProductId = p.ProductId
                AND sr.Rating IS NOT NULL
            )`
          : 'CAST(NULL AS FLOAT)'} AS AverageRating,
        p.CategoryId,
        c.Name AS CategoryName,
        c.Description AS CategoryDescription
     FROM Products p
     LEFT JOIN ProductCategories c ON c.CategoryId = p.CategoryId
     WHERE p.ProductId = @id`,
    { id: productId }
  )

  const row = prodRes.recordset?.[0]
  if (!row) return null

  let images = []
  if (schema.hasProductImages) {
    const imgRes = await query(
      `SELECT ImageUrl
       FROM ProductImages
       WHERE ProductId = @id
       ORDER BY COALESCE(SortOrder, 2147483647), ImageId`,
      { id: productId }
    )
    images = (imgRes.recordset || []).map((r) => String(r.ImageUrl || '').trim()).filter(Boolean)
  }
  if (!images.length && row.ImageUrl) images = [String(row.ImageUrl).trim()]

  const variants = await listVariants(productId)

  const categoryId = row.CategoryId ?? null
  const categoryName = row.CategoryName || ''

  return {
    id: row.ProductId,
    name: row.Name || '',
    price: Number(row.Price || 0),
    description: row.Description || '',
    imageUrl: images[0] || row.ImageUrl || '',
    images,
    stock: Number(row.Stock || 0),
    soldCount: Number(row.SoldCount || 0),
    averageRating: row.AverageRating === null || row.AverageRating === undefined ? null : Number(row.AverageRating),
    status: row.Status ?? null,
    kind: categoryName,
    categoryId,
    category: {
      id: categoryId,
      name: categoryName,
      description: row.CategoryDescription || '',
    },
    variants,
  }
}

async function getProductStock(productId) {
  const res = await query(
    `SELECT TOP 1 Stock
     FROM Products
     WHERE ProductId = @id`,
    { id: productId }
  )
  const row = res.recordset?.[0]
  if (!row) {
    const err = new Error('Product not found')
    err.status = 404
    throw err
  }
  return Number(row.Stock || 0)
}

async function getVariantsTotalStock(productId, excludeVariantId) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductVariants) return 0

  const whereExclude = excludeVariantId ? ' AND VariantId <> @excludeId' : ''
  const res = await query(
    `SELECT COALESCE(SUM(COALESCE(Stock, 0)), 0) AS Total
     FROM ProductVariants
     WHERE ProductId = @productId${whereExclude}`,
    excludeVariantId ? { productId, excludeId: excludeVariantId } : { productId }
  )
  return Number(res.recordset?.[0]?.Total || 0)
}

function throwInsufficientStock() {
  const err = new Error('Insufficient stock')
  err.status = 400
  throw err
}

async function createVariant(productId, payload) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductVariants) {
    const err = new Error('ProductVariants table not found')
    err.status = 400
    throw err
  }

  if (!productId) {
    const err = new Error('Missing productId')
    err.status = 400
    throw err
  }

  const { name, stock } = payload || {}
  const variantName = normalizeRequiredSafeText(name, 'variant name')

  const existing = await query(
    `SELECT TOP 1 VariantId
     FROM ProductVariants
     WHERE ProductId = @productId
       AND LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), VariantName)))) = @name`,
    {
      productId,
      name: variantName.toLowerCase(),
    }
  )
  const existingVariantId = String(existing.recordset?.[0]?.VariantId || '').trim()
  if (existingVariantId) {
    return { id: existingVariantId }
  }

  const st = parseOptionalInt(stock)
  const stValue = st === null ? 0 : st
  if (!Number.isFinite(stValue) || stValue < 0) {
    const err = new Error('Invalid stock')
    err.status = 400
    throw err
  }

  const productStock = await getProductStock(productId)
  const currentTotal = await getVariantsTotalStock(productId)
  const nextTotal = Math.trunc(currentTotal) + Math.trunc(stValue)
  if (nextTotal > Math.trunc(productStock)) {
    throwInsufficientStock()
  }

  const id = newId()
  await query(
    `INSERT INTO ProductVariants (VariantId, ProductId, VariantName, Stock)
     VALUES (@id, @productId, @name, @stock);`,
    {
      id,
      productId,
      name: variantName,
      stock: stValue,
    }
  )

  try {
    await syncVariantShadowFromVariant(id)
  } catch (err) {
    console.warn('[retail.createVariant] variant created but shadow sync failed', {
      variantId: id,
      productId,
      error: err?.message || err,
    })
  }

  return { id }
}

async function updateVariant(variantId, payload) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductVariants) {
    const err = new Error('ProductVariants table not found')
    err.status = 400
    throw err
  }

  if (!variantId) {
    const err = new Error('Missing variantId')
    err.status = 400
    throw err
  }

  const current = await query(
    `SELECT TOP 1 VariantId, ProductId
     FROM ProductVariants
     WHERE VariantId = @id`,
    { id: variantId }
  )
  const row = current.recordset?.[0]
  if (!row) {
    const err = new Error('Variant not found')
    err.status = 404
    throw err
  }

  const name = payload?.name !== undefined ? normalizeRequiredSafeText(payload?.name, 'variant name') : undefined
  const stock = payload?.stock !== undefined ? parseOptionalInt(payload.stock) : undefined

  if (stock !== undefined) {
    if (stock === null || !Number.isFinite(stock) || stock < 0) {
      const err = new Error('Invalid stock')
      err.status = 400
      throw err
    }
  }

  if (stock !== undefined) {
    const productStock = await getProductStock(row.ProductId)
    const otherTotal = await getVariantsTotalStock(row.ProductId, row.VariantId)
    const nextTotal = Math.trunc(otherTotal) + Math.trunc(stock)
    if (nextTotal > Math.trunc(productStock)) {
      throwInsufficientStock()
    }
  }

  await query(
    `UPDATE ProductVariants
     SET
       VariantName = COALESCE(@name, VariantName),
       Stock = COALESCE(@stock, Stock)
     WHERE VariantId = @id;`,
    {
      id: variantId,
      name: name !== undefined ? name : null,
      stock: stock !== undefined ? stock : null,
    }
  )

  try {
    await syncVariantShadowFromVariant(variantId)
  } catch (err) {
    console.warn('[retail.updateVariant] variant updated but shadow sync failed', {
      variantId,
      error: err?.message || err,
    })
  }

  return { id: variantId }
}

async function deleteVariant(variantId) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductVariants) {
    const err = new Error('ProductVariants table not found')
    err.status = 400
    throw err
  }

  if (!variantId) {
    const err = new Error('Missing variantId')
    err.status = 400
    throw err
  }

  const current = await query(
    `SELECT TOP 1 VariantId, ProductId, COALESCE(Stock, 0) AS Stock
     FROM ProductVariants
     WHERE VariantId = @id`,
    { id: variantId }
  )
  const row = current.recordset?.[0]
  if (!row) {
    const err = new Error('Variant not found')
    err.status = 404
    throw err
  }

  if (Number(row.Stock || 0) > 0) {
    const err = new Error('Cannot delete variant with remaining stock')
    err.status = 409
    throw err
  }

  const shadowId = retailVariantShadowId(variantId)
  const lotUsage = await query(
    `SELECT TOP 1 LotId
     FROM InventoryLots
     WHERE InventoryItemId = @shadowId
       AND COALESCE(RemainingQty, 0) > 0`,
    { shadowId }
  )
  if (lotUsage.recordset?.length) {
    const err = new Error('Cannot delete variant with active lots')
    err.status = 409
    throw err
  }

  await query('DELETE FROM InventoryTransactions WHERE InventoryItemId = @shadowId', { shadowId })
  await query('DELETE FROM InventoryLots WHERE InventoryItemId = @shadowId', { shadowId })
  await query('DELETE FROM InventoryItems WHERE InventoryItemId = @shadowId', { shadowId })
  await query('DELETE FROM ProductVariants WHERE VariantId = @id;', { id: variantId })

  return { id: variantId }
}

async function updateRetailProduct(productId, payload) {
  if (!productId) {
    const err = new Error('Missing productId')
    err.status = 400
    throw err
  }

  const existingRes = await query(
    `SELECT TOP 1 ProductId, Name, Price, Status
     FROM Products
     WHERE ProductId = @id`,
    { id: productId },
  )
  const existing = existingRes.recordset?.[0]
  if (!existing) {
    const err = new Error('Product not found')
    err.status = 404
    throw err
  }

  const schema = await getSchemaInfo()

  const name = payload?.name !== undefined ? normalizeRequiredSafeText(payload.name, 'name') : undefined
  const categoryId = await resolveCategoryIdFromPayload(payload)
  const description = parseOptionalString(payload?.description)
  const imageUrl = parseOptionalString(payload?.imageUrl)
  const hasImagesField = Object.prototype.hasOwnProperty.call(payload || {}, 'images')
  const incomingImages = hasImagesField ? normalizeImageUrls(payload?.images) : null
  const nextImages = hasImagesField
    ? incomingImages
    : imageUrl !== undefined
      ? (imageUrl ? [imageUrl] : [])
      : null
  const primaryImage = nextImages ? nextImages[0] || null : null
  const status = payload?.status !== undefined ? normalizeRetailStatus(payload?.status, { required: true }) : undefined
  const sellPrice = payload?.price !== undefined ? parseMoneyVnd(payload.price) : undefined
  const importPrice = payload?.importPriceVnd !== undefined ? parseMoneyVnd(payload.importPriceVnd) : undefined
  if (sellPrice !== undefined && (sellPrice === null || !Number.isFinite(sellPrice) || sellPrice <= 0)) {
    const err = new Error('Invalid price')
    err.status = 400
    throw err
  }

  if (importPrice !== undefined && (importPrice === null || !Number.isFinite(importPrice) || importPrice < 0)) {
    const err = new Error('Invalid importPriceVnd')
    err.status = 400
    throw err
  }

  if (!schema.productsHasCategoryId || !schema.hasProductCategories) {
    const err = new Error('Products.CategoryId or ProductCategories is missing')
    err.status = 400
    throw err
  }

  if (name !== undefined) {
    await ensureRetailProductNameUnique(name, productId)
  }

  await query(
    `UPDATE Products
     SET
       Name = COALESCE(@name, Name),
       CategoryId = COALESCE(@categoryId, CategoryId),
       Description = COALESCE(@description, Description),
       ImageUrl = CASE WHEN @setImage = 1 THEN @imageUrl ELSE ImageUrl END,
       Status = COALESCE(@status, Status),
       Price = COALESCE(@price, Price)
     WHERE ProductId = @id;`,
    {
      id: productId,
      name: name !== undefined ? name : null,
      categoryId,
      description: description === undefined ? null : description,
      setImage: nextImages ? 1 : 0,
      imageUrl: nextImages ? primaryImage : null,
      status: status === undefined ? null : status,
      price: sellPrice !== undefined ? sellPrice : null,
    }
  )

  const oldPrice = Number(existing.Price)
  const updatedPrice = sellPrice !== undefined ? Number(sellPrice) : oldPrice
  const updatedName = String(name || existing.Name || '').trim() || 'Product'
  const previousStatus = String(existing.Status || '').trim().toLowerCase()
  const currentStatus = String(status || existing.Status || '').trim().toLowerCase()

  try {
    if (Number.isFinite(oldPrice) && Number.isFinite(updatedPrice) && updatedPrice < oldPrice) {
      await notifyAllCustomersEvent({
        event: 'product_discount',
        payload: {
          productId,
          productName: updatedName,
          oldPrice,
          newPrice: updatedPrice,
          body: `${updatedName} is now discounted from ${oldPrice.toLocaleString('vi-VN')} to ${updatedPrice.toLocaleString('vi-VN')} VND.`,
        },
      })

      await notifyWishlistDiscountByProduct({
        productId,
        oldPrice,
        newPrice: updatedPrice,
        productName: updatedName,
      })
    } else if (previousStatus !== 'active' && currentStatus === 'active') {
      await notifyAllCustomersEvent({
        event: 'product_new',
        payload: {
          productId,
          productName: updatedName,
          body: `${updatedName} is now available in our catalog.`,
        },
      })
    }
  } catch (err) {
    console.warn('[retail] update product notification failed:', err?.message || err)
  }

  if (nextImages) {
    await replaceProductImages(productId, nextImages)
  }

  // Import cost is tracked on the retail shadow row in InventoryItems.
  const shadowId = retailShadowId(productId)
  if (!schema.inventoryHasCategoryId) {
    const err = new Error('InventoryItems.CategoryId is missing')
    err.status = 400
    throw err
  }
  await query(
    `IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @shadowId)
     BEGIN
       INSERT INTO InventoryItems (InventoryItemId, ProductId, CategoryId, Name, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
       SELECT
         @shadowId,
         p.ProductId,
         p.CategoryId,
         COALESCE(@name, p.Name),
         'sp',
         1,
         COALESCE(p.Stock, 0),
         0,
         COALESCE(@importPriceVnd, NULL),
         'retail'
       FROM Products p
       WHERE p.ProductId = @id;
     END
     ELSE
     BEGIN
       UPDATE InventoryItems
       SET
         ProductId = COALESCE(@id, ProductId),
         CategoryId = COALESCE((SELECT TOP 1 CategoryId FROM Products WHERE ProductId = @id), CategoryId),
         Name = COALESCE(@name, Name),
         Unit = COALESCE('sp', Unit),
         ConversionRate = COALESCE(1, ConversionRate),
         Quantity = (SELECT COALESCE(Stock, 0) FROM Products WHERE ProductId = @id),
         ReorderLevel = COALESCE(0, ReorderLevel),
         PriceVnd = COALESCE(@importPriceVnd, PriceVnd),
         ItemGroup = 'retail'
       WHERE InventoryItemId = @shadowId;
     END`,
    {
      shadowId,
      id: productId,
      name: name !== undefined ? name : null,
      importPriceVnd: importPrice !== undefined ? importPrice : null,
    }
  )

  if (schema.hasProductVariants) {
    await query(
      `UPDATE iv
       SET
         ProductId = NULL,
         CategoryId = p.CategoryId,
        Name = LEFT(CONCAT(p.Name, N' - ', pv.VariantName), 120),
         ItemGroup = 'service'
       FROM InventoryItems iv
       INNER JOIN ProductVariants pv ON iv.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
       INNER JOIN Products p ON p.ProductId = pv.ProductId
       WHERE pv.ProductId = @id`,
      { id: productId }
    )
  }

  return { id: productId }
}
async function listRetailProducts() {
  const schema = await getSchemaInfo()
  if (!schema.productsHasCategoryId || !schema.hasProductCategories) {
    const err = new Error('Products.CategoryId or ProductCategories is missing')
    err.status = 400
    throw err
  }
  const res = await query(
    `SELECT
        p.ProductId,
        p.Name,
        p.Price,
        p.Description,
        p.ImageUrl,
        p.Stock,
        p.Status,
        ${schema.hasOrderItems
          ? `(
              SELECT COALESCE(SUM(oi.Quantity), 0)
              FROM OrderItems oi
              ${schema.hasOrders ? 'LEFT JOIN Orders o ON o.OrderId = oi.OrderId' : ''}
              WHERE oi.ProductId = p.ProductId
              ${schema.hasOrders && schema.ordersHasStatus
                ? "AND (o.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), o.Status)))) NOT IN ('cancelled', 'canceled'))"
                : ''}
            )`
          : 'CAST(0 AS INT)'} AS SoldCount,
        ${schema.hasSalonReviews && schema.salonReviewsHasProductId && schema.salonReviewsHasRating
          ? `(
              SELECT AVG(CAST(sr.Rating AS FLOAT))
              FROM SalonReviews sr
              WHERE sr.ProductId = p.ProductId
                AND sr.Rating IS NOT NULL
            )`
          : 'CAST(NULL AS FLOAT)'} AS AverageRating,
        p.CategoryId,
        c.Name AS CategoryName,
        c.Description AS CategoryDescription
     FROM Products p
     LEFT JOIN ProductCategories c ON c.CategoryId = p.CategoryId
      WHERE p.Status IS NULL
        OR LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status))) = ''
        OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) IN ('active', 'inactive')
     ORDER BY p.Name ASC`
  )

  const imagesMap = await getProductImagesMap()

  return (res.recordset || []).map((row) => ({
    images: imagesMap.get(row.ProductId) || (row.ImageUrl ? [String(row.ImageUrl).trim()] : []),
    id: row.ProductId,
    name: row.Name || '',
    price: Number(row.Price || 0),
    description: row.Description || '',
    imageUrl: (imagesMap.get(row.ProductId)?.[0] || row.ImageUrl || ''),
    stock: Number(row.Stock || 0),
    soldCount: Number(row.SoldCount || 0),
    averageRating: row.AverageRating === null || row.AverageRating === undefined ? null : Number(row.AverageRating),
    status: (() => {
      const raw = String(row.Status || '').trim().toLowerCase()
      if (!raw) return 'active'
      if (raw === 'active' || raw === 'inactive') return raw
      return 'inactive'
    })(),
    kind: row.CategoryName || '',
    categoryId: row.CategoryId ?? null,
    categoryName: row.CategoryName || '',
    categoryDescription: row.CategoryDescription || '',
  }))
}

async function deleteRetailProduct(productId) {
  const id = String(productId || '').trim()
  if (!id) {
    const err = new Error('Missing productId')
    err.status = 400
    throw err
  }

  const exists = await query('SELECT TOP 1 ProductId FROM Products WHERE ProductId = @id', { id })
  if (!exists.recordset?.length) {
    const err = new Error('Product not found')
    err.status = 404
    throw err
  }

  const usedInOrders = await query('SELECT TOP 1 OrderItemId FROM OrderItems WHERE ProductId = @id', { id })
  if (usedInOrders.recordset?.length) {
    const err = new Error('Cannot delete product with order history')
    err.status = 409
    throw err
  }

  const schema = await getSchemaInfo()
  const shadowId = retailShadowId(id)

  if (schema.hasProductVariants) {
    await query('DELETE FROM ProductVariants WHERE ProductId = @id', { id })
  }
  if (schema.hasProductImages) {
    await query('DELETE FROM ProductImages WHERE ProductId = @id', { id })
  }
  await query('DELETE FROM InventoryTransactions WHERE InventoryItemId = @shadowId', { shadowId })
  await query('DELETE FROM InventoryItems WHERE InventoryItemId = @shadowId', { shadowId })
  await query('DELETE FROM Products WHERE ProductId = @id', { id })

  return { id }
}

async function createRetailProduct(payload) {
  const name = normalizeRequiredSafeText(payload?.name, 'name')

  const schema = await getSchemaInfo()
  const categoryId = await resolveCategoryIdFromPayload(payload)
  const description = parseOptionalString(payload?.description)
  const imageUrl = parseOptionalString(payload?.imageUrl)
  const incomingImages = normalizeImageUrls(payload?.images)
  const nextImages = incomingImages.length ? incomingImages : (imageUrl ? [imageUrl] : [])
  const primaryImage = nextImages[0] || null
  const status = normalizeRetailStatus(payload?.status, { required: true })

  const sellPrice = payload?.price !== undefined ? parseMoneyVnd(payload.price) : parseMoneyVnd(payload?.sellPriceVnd)
  const importPrice = parseMoneyVnd(payload?.importPriceVnd)

  if (sellPrice === null || sellPrice === undefined || !Number.isFinite(sellPrice) || sellPrice <= 0) {
    const err = new Error('Invalid price')
    err.status = 400
    throw err
  }

  if (importPrice !== null && importPrice !== undefined && (!Number.isFinite(importPrice) || importPrice < 0)) {
    const err = new Error('Invalid importPriceVnd')
    err.status = 400
    throw err
  }

  await ensureRetailProductNameUnique(name)

  const id = newId()
  if (!schema.productsHasCategoryId || !schema.hasProductCategories) {
    const err = new Error('Products.CategoryId or ProductCategories is missing')
    err.status = 400
    throw err
  }
  await query(
    `INSERT INTO Products (ProductId, Name, Price, Description, ImageUrl, Stock, Status, CategoryId)
     VALUES (@id, @name, @price, @description, @imageUrl, @stock, @status, @categoryId);`,
    {
      id,
      name,
      price: sellPrice !== null && sellPrice !== undefined ? sellPrice : 0,
      description: description === undefined ? null : description,
      imageUrl: primaryImage,
      stock: 0,
      status,
      categoryId,
    }
  )

  try {
    if (String(status || '').trim().toLowerCase() === 'active') {
      await notifyAllCustomersEvent({
        event: 'product_new',
        payload: {
          productId: id,
          productName: String(name || '').trim() || 'New product',
          body: `${String(name || 'A new product').trim()} is now available in our catalog.`,
        },
      })
    }
  } catch (err) {
    console.warn('[retail] create product notification failed:', err?.message || err)
  }

  await replaceProductImages(id, nextImages)

  // Create / update retail shadow row for category + import price.
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
       VALUES (@shadowId, @productId, @categoryId, @name, 'sp', 1, 0, 0, @priceVnd, 'retail');
     END
     ELSE
     BEGIN
       UPDATE InventoryItems
       SET
         ProductId = COALESCE(@productId, ProductId),
         CategoryId = COALESCE(@categoryId, CategoryId),
         Name = COALESCE(@name, Name),
         Unit = COALESCE('sp', Unit),
         ConversionRate = COALESCE(1, ConversionRate),
         Quantity = COALESCE(Quantity, 0),
         ReorderLevel = COALESCE(0, ReorderLevel),
         PriceVnd = COALESCE(@priceVnd, PriceVnd),
         ItemGroup = 'retail'
       WHERE InventoryItemId = @shadowId;
     END`,
    {
      shadowId,
      productId: id,
      categoryId,
      name,
      priceVnd: importPrice !== null && importPrice !== undefined ? importPrice : null,
    }
  )

  if (schema.hasProductVariants) {
    await createVariant(id, { name: DEFAULT_RETAIL_VARIANT_NAME, stock: 0 })
  }

  return { id }
}

async function listRetailMeta() {
  const categories = await listProductCategories()

  const statuses = await query(
    `SELECT DISTINCT LTRIM(RTRIM(Status)) AS Name
     FROM Products
     WHERE Status IS NOT NULL
       AND LTRIM(RTRIM(Status)) <> ''
       AND LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) IN ('active', 'inactive')
     ORDER BY LTRIM(RTRIM(Status)) ASC;`
  )

  return {
    // Keep legacy shape for the existing UI (datalist): `kinds` is now category names.
    kinds: categories.map((c) => c.name).filter(Boolean),
    categories,
    statuses: (statuses.recordset || []).map((r) => r.Name).filter(Boolean),
  }
}

function normalizeOrderStatusInput(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'c' || raw === 'pending') return 'Pending'
  if (raw === 'confirmed' || raw === 'confirm') return 'Confirmed'
  if (raw === 'processing') return 'Processing'
  if (raw === 'shipping' || raw === 'shipped' || raw === 'delivering' || raw === 'in transit' || raw === 'dang giao hang') return 'Shipping'
  if (raw === 'completed' || raw === 'complete' || raw === 'delivered') return 'Completed'
  if (raw === 'cancelled' || raw === 'canceled') return 'Cancelled'
  if (raw === 'failed') return 'Failed'
  return null
}

function hasStockDeductedForStatus(statusInput) {
  const normalized = normalizeOrderStatusInput(statusInput)
  return normalized === 'Processing' || normalized === 'Shipping' || normalized === 'Completed'
}

function parseDateOnly(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function normalizeRetailPaymentMethod(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return 'COD'
  if (raw === 'COD' || raw === 'ONLINE' || raw === 'CASH' || raw === 'CARD' || raw === 'TRANSFER') return raw
  return 'COD'
}

function normalizeOptionalCustomerText(value, maxLen = 200) {
  if (value === undefined || value === null) return null
  const out = String(value).trim()
  if (!out) return null
  if (out.length > maxLen) {
    const err = new Error('Customer information is too long')
    err.status = 400
    throw err
  }
  if (hasDangerousInput(out)) {
    const err = new Error('Invalid customer information')
    err.status = 400
    throw err
  }
  return out
}

async function createSequentialOrderId() {
  const idRes = await query(
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

     SELECT @orderId AS OrderId;`
  )

  const orderId = String(idRes.recordset?.[0]?.OrderId || '').trim()
  if (!orderId) {
    const err = new Error('Cannot create order id')
    err.status = 500
    throw err
  }
  return orderId
}

function buildOrderFilters(filters = {}, alias = 'o') {
  const where = ['1=1']
  const params = {}

  const fromDate = parseDateOnly(filters.fromDate || filters.from)
  const toDate = parseDateOnly(filters.toDate || filters.to)

  if (fromDate) {
    where.push(`${alias}.CreatedAt >= @fromDate`)
    params.fromDate = fromDate
  }

  if (toDate) {
    where.push(`${alias}.CreatedAt < DATEADD(day, 1, @toDate)`)
    params.toDate = toDate
  }

  const status = normalizeOrderStatusInput(filters.status)
  if (status) {
    if (status === 'Pending') {
      where.push(`(${alias}.Status IN ('Pending', 'C'))`)
    } else if (status === 'Shipping') {
      where.push(`(${alias}.Status IN ('Shipping', 'Shipped', 'Delivering'))`)
    } else if (status === 'Completed') {
      where.push(`(${alias}.Status IN ('Completed', 'Delivered'))`)
    } else if (status === 'Cancelled') {
      where.push(`(${alias}.Status IN ('Cancelled', 'Canceled'))`)
    } else {
      where.push(`${alias}.Status = @status`)
      params.status = status
    }
  }

  const paymentMethod = String(filters.paymentMethod || '').trim()
  if (paymentMethod) {
    where.push(`${alias}.PaymentMethod = @paymentMethod`)
    params.paymentMethod = paymentMethod
  }

  const keyword = String(filters.keyword || filters.q || '').trim()
  if (keyword) {
    where.push(`(
      ${alias}.OrderId LIKE @keyword OR
      ${alias}.CustomerName LIKE @keyword OR
      ${alias}.CustomerPhone LIKE @keyword OR
      ${alias}.CustomerAddress LIKE @keyword
    )`)
    params.keyword = `%${keyword}%`
  }

  return {
    whereSql: where.join('\n AND '),
    params,
    fromDate: fromDate || null,
    toDate: toDate || null,
  }
}

function resolveOrderSort(sortBy, sortDir, alias = 'o') {
  const by = String(sortBy || 'createdAt').trim().toLowerCase()
  const dir = String(sortDir || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const sortMap = {
    createdat: `${alias}.CreatedAt`,
    total: `${alias}.Total`,
    status: `${alias}.Status`,
    customername: `${alias}.CustomerName`,
    orderid: `${alias}.OrderId`,
  }

  const col = sortMap[by] || `${alias}.CreatedAt`
  return `${col} ${dir}, ${alias}.OrderId DESC`
}

async function getOrderItems(orderId) {
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
    { orderId }
  )

  return (itemsRes.recordset || []).map((item) => ({
    OrderItemId: item.OrderItemId,
    OrderId: item.OrderId,
    ProductId: item.ProductId,
    ProductName: item.ProductName || '',
    Quantity: Number(item.Quantity || 0),
    Price: Number(item.Price || 0),
    ImageUrl: item.ImageUrl || null,
    LineTotal: Number(item.Quantity || 0) * Number(item.Price || 0),
  }))
}

function mapOrderRow(row, items) {
  const seq = Number(row.OrderSeq || 0)
  const orderCode = seq > 0 ? `ORD-${String(seq).padStart(3, '0')}` : String(row.OrderId || '')
  const subtotal = Number(row.Subtotal || 0)
  const total = Number(row.Total || 0)
  const giftApplied = Number(row.GiftCardApplied || 0)
  const discountAmount = giftApplied > 0 ? giftApplied : Math.max(subtotal - total, 0)

  return {
    OrderId: row.OrderId,
    OrderCode: orderCode,
    UserId: row.UserId,
    Status: normalizeOrderStatusInput(row.Status) || 'Pending',
    CreatedAt: row.CreatedAt,
    CustomerName: row.CustomerName || '',
    CustomerPhone: row.CustomerPhone || '',
    CustomerAddress: row.CustomerAddress || '',
    Cannel: row.Cannel || 'Online',
    Subtotal: subtotal,
    Tax: 0,
    Shipping: 0,
    DiscountAmount: discountAmount,
    Total: total,
    PaymentMethod: row.PaymentMethod || 'COD',
    GiftCardCode: row.GiftCardCode || null,
    GiftCardApplied: Number(row.GiftCardApplied || 0),
    Items: items,
  }
}

async function syncRetailInventoryByProducts(productIds) {
  const unique = [...new Set((Array.isArray(productIds) ? productIds : []).map((x) => String(x || '').trim()).filter(Boolean))]
  for (const productId of unique) {
    await query(
      `UPDATE ii
       SET ii.Quantity = COALESCE(p.Stock, 0)
       FROM InventoryItems ii
       INNER JOIN Products p ON p.ProductId = ii.ProductId
       WHERE ii.ProductId = @productId OR ii.InventoryItemId = @shadowId`,
      {
        productId,
        shadowId: retailShadowId(productId),
      }
    )
  }
}

async function decreaseStockForOrder(orderId, options = {}) {
  const items = await getOrderItems(orderId)
  const schema = await getSchemaInfo()

  const orderRefRaw = String(options?.referenceId || orderId || '').trim()
  const orderRef = orderRefRaw ? `CustomerOrder:${orderRefRaw}` : null
  for (const item of items) {
    const stockRes = await query(
      'SELECT TOP 1 Stock FROM Products WHERE ProductId = @productId',
      { productId: item.ProductId }
    )
    const stock = Number(stockRes.recordset?.[0]?.Stock || 0)
    if (stock < Number(item.Quantity || 0)) {
      const err = new Error(`Product ${item.ProductName || item.ProductId} does not have enough stock`)
      err.status = 409
      throw err
    }
  }

  for (const item of items) {
    const productId = String(item.ProductId || '').trim()
    const quantity = Number(item.Quantity || 0)
    await query(
      `UPDATE Products
       SET Stock = CASE WHEN ISNULL(Stock, 0) >= @quantity THEN ISNULL(Stock, 0) - @quantity ELSE 0 END
       WHERE ProductId = @productId`,
      {
        productId,
        quantity,
      }
    )

    if (schema.inventoryHasCategoryId && productId && quantity > 0) {
      const shadowId = retailShadowId(productId)
      try {
        await query(
          `IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @shadowId)
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
             @txId, @shadowId, 'OUT', @quantity, @referenceId, GETDATE(),
             @performedByRole, @performedById, @performedByName, @performedByEmail
           );`,
          {
            shadowId,
            productId,
            txId: newId(),
            quantity,
            referenceId: orderRef,
            performedByRole: options?.actor?.roleKey ?? null,
            performedById: options?.actor?.userId ?? null,
            performedByName: options?.actor?.name ?? null,
            performedByEmail: options?.actor?.email ?? null,
          }
        )
      } catch (err) {
        console.warn('[retail] Unable to write inventory transaction for order stock-out:', err?.message || err)
      }
    }
  }

  await syncRetailInventoryByProducts(items.map((x) => x.ProductId))
}

async function restoreStockForOrder(orderId) {
  const items = await getOrderItems(orderId)
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

  await syncRetailInventoryByProducts(items.map((x) => x.ProductId))
}

async function listRetailOrders(filters = {}) {
  const schema = await getSchemaInfo()
  const page = Math.max(1, Math.trunc(Number(filters.page || 1) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(filters.pageSize || 10) || 10)))
  const offset = (page - 1) * pageSize

  const built = buildOrderFilters(filters, 'o')
  // By default, do not show orders in 'awaiting' state in the retail management listing
  if (!filters || (filters.status === undefined || filters.status === null || String(filters.status || '').trim() === '')) {
    built.whereSql = `${built.whereSql} AND LOWER(LTRIM(RTRIM(ISNULL(o.Status, 'pending')))) <> 'awaiting'`
  }
  const orderBy = resolveOrderSort(filters.sortBy, filters.sortDir, 'o')
  const channelSelectFromOrders = schema.ordersHasChannel
    ? 'o.Channel AS Cannel'
    : schema.ordersHasCannel
      ? 'o.Cannel'
      : 'NULL AS Cannel'

  const rowsRes = await query(
    `WITH OrdersWithSeq AS (
       SELECT
         o.OrderId,
         o.UserId,
         o.Status,
         o.CreatedAt,
         o.CustomerName,
         o.CustomerPhone,
         o.CustomerAddress,
         ${channelSelectFromOrders},
         o.Subtotal,
         o.Total,
         o.PaymentMethod,
         o.GiftCardCode,
         o.GiftCardApplied,
         ROW_NUMBER() OVER (ORDER BY o.CreatedAt ASC, o.OrderId ASC) AS OrderSeq
       FROM Orders o
     )
     SELECT
        o.OrderId,
        o.OrderSeq,
        o.UserId,
        o.Status,
        o.CreatedAt,
        o.CustomerName,
        o.CustomerPhone,
        o.CustomerAddress,
        o.Cannel,
        o.Subtotal,
        o.Total,
        o.PaymentMethod,
        o.GiftCardCode,
        o.GiftCardApplied
     FROM OrdersWithSeq o
     WHERE ${built.whereSql}
     ORDER BY ${orderBy}
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    {
      ...built.params,
      offset,
      pageSize,
    }
  )

  const totalRes = await query(
    `SELECT COUNT(1) AS TotalRows
     FROM Orders o
     WHERE ${built.whereSql}`,
    built.params
  )

  const summaryRes = await query(
    `SELECT
        COUNT(1) AS TotalOrders,
        COALESCE(SUM(COALESCE(o.Total, 0)), 0) AS TotalRevenue,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(o.GiftCardApplied, 0) > 0 THEN COALESCE(o.GiftCardApplied, 0)
            WHEN COALESCE(o.Subtotal, 0) > COALESCE(o.Total, 0) THEN COALESCE(o.Subtotal, 0) - COALESCE(o.Total, 0)
            ELSE 0
          END
        ), 0) AS TotalDiscount,
        COALESCE(SUM(COALESCE(oi.Quantity, 0)), 0) AS TotalQuantity
     FROM Orders o
     LEFT JOIN OrderItems oi ON oi.OrderId = o.OrderId
     WHERE ${built.whereSql}`,
    built.params
  )

  const rows = rowsRes.recordset || []
  const orders = []
  for (const row of rows) {
    const items = await getOrderItems(row.OrderId)
    orders.push(mapOrderRow(row, items))
  }

  return {
    summary: {
      totalOrders: Number(summaryRes.recordset?.[0]?.TotalOrders || 0),
      totalRevenue: Number(summaryRes.recordset?.[0]?.TotalRevenue || 0),
      totalDiscount: Number(summaryRes.recordset?.[0]?.TotalDiscount || 0),
      totalQuantity: Number(summaryRes.recordset?.[0]?.TotalQuantity || 0),
      fromDate: built.fromDate,
      toDate: built.toDate,
    },
    items: orders,
    pagination: {
      page,
      pageSize,
      totalRows: Number(totalRes.recordset?.[0]?.TotalRows || 0),
    },
  }
}

async function getRetailOrder(orderIdInput) {
  const schema = await getSchemaInfo()
  const orderId = String(orderIdInput || '').trim()
  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  const res = await query(
    `SELECT TOP 1
        o.OrderId,
        o.UserId,
        o.Status,
        o.CreatedAt,
        o.CustomerName,
        o.CustomerPhone,
        o.CustomerAddress,
        ${schema.ordersHasChannel ? 'o.Channel AS Cannel' : schema.ordersHasCannel ? 'o.Cannel' : 'NULL AS Cannel'},
        o.Subtotal,
        o.Total,
        o.PaymentMethod,
        o.GiftCardCode,
        o.GiftCardApplied
     FROM Orders o
     WHERE o.OrderId = @orderId`,
    { orderId }
  )

  const row = res.recordset?.[0]
  if (!row) return null
  const items = await getOrderItems(orderId)
  return mapOrderRow(row, items)
}

async function createRetailOrder(payload = {}, { actor } = {}) {
  const schema = await getSchemaInfo()
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const normalizedItems = rawItems
    .map((item) => ({
      productId: String(item?.productId || '').trim(),
      quantity: Math.trunc(Number(item?.quantity || 0)),
    }))
    .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0)

  if (!normalizedItems.length) {
    const err = new Error('No products selected')
    err.status = 400
    throw err
  }

  const dedupMap = new Map()
  for (const line of normalizedItems) {
    dedupMap.set(line.productId, (dedupMap.get(line.productId) || 0) + line.quantity)
  }
  const dedupItems = [...dedupMap.entries()].map(([productId, quantity]) => ({ productId, quantity }))

  const resolvedItems = []
  for (const line of dedupItems) {
    const productRes = await query(
      `SELECT TOP 1 ProductId, Name, Price, Stock
       FROM Products
       WHERE ProductId = @productId`,
      { productId: line.productId }
    )

    const row = productRes.recordset?.[0]
    if (!row) {
      const err = new Error('Product not found')
      err.status = 404
      throw err
    }

    const stock = Number(row.Stock || 0)
    if (stock < line.quantity) {
      const err = new Error(`Product ${row.Name || row.ProductId} does not have enough stock`)
      err.status = 409
      throw err
    }

    resolvedItems.push({
      productId: row.ProductId,
      productName: row.Name || '',
      price: Number(row.Price || 0),
      quantity: line.quantity,
    })
  }

  const subtotal = resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const total = subtotal
  const customerName = normalizeOptionalCustomerText(payload.customerName, 120)
  const customerPhone = normalizeOptionalCustomerText(payload.customerPhone, 40)
  const customerAddress = normalizeOptionalCustomerText(payload.customerAddress, 300)
  const paymentMethod = normalizeRetailPaymentMethod(payload.paymentMethod)
  const inputStatus = normalizeOrderStatusInput(payload.status)
  const status = inputStatus || 'Pending'

  const orderId = await createSequentialOrderId()
  const orderChannelColumn = schema.ordersHasChannel ? 'Channel' : schema.ordersHasCannel ? 'Cannel' : null

  if (orderChannelColumn) {
    await query(
      `INSERT INTO Orders (
         OrderId,
         UserId,
         Status,
         CreatedAt,
         CustomerName,
         CustomerPhone,
         CustomerAddress,
         ${orderChannelColumn},
         Subtotal,
         Total,
         PaymentMethod,
         GiftCardCode,
         GiftCardApplied
       )
       VALUES (
         @orderId,
         @userId,
         @status,
         SYSUTCDATETIME(),
         @customerName,
         @customerPhone,
         @customerAddress,
         @channel,
         @subtotal,
         @total,
         @paymentMethod,
         NULL,
         0
       );`,
      {
        orderId,
        userId: actor?.userId || null,
        status,
        customerName,
        customerPhone,
        customerAddress,
        channel: 'InStore',
        subtotal,
        total,
        paymentMethod,
      }
    )
  } else {
    await query(
      `INSERT INTO Orders (
         OrderId,
         UserId,
         Status,
         CreatedAt,
         CustomerName,
         CustomerPhone,
         CustomerAddress,
         Subtotal,
         Total,
         PaymentMethod,
         GiftCardCode,
         GiftCardApplied
       )
       VALUES (
         @orderId,
         @userId,
         @status,
         SYSUTCDATETIME(),
         @customerName,
         @customerPhone,
         @customerAddress,
         @subtotal,
         @total,
         @paymentMethod,
         NULL,
         0
       );`,
      {
        orderId,
        userId: actor?.userId || null,
        status,
        customerName,
        customerPhone,
        customerAddress,
        subtotal,
        total,
        paymentMethod,
      }
    )
  }

  for (const item of resolvedItems) {
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
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        productName: item.productName,
      }
    )
  }

  if (hasStockDeductedForStatus(status)) {
    await decreaseStockForOrder(orderId, { actor, referenceId: orderId })
  }

  if (actor?.userId) {
    try {
      await notifyCustomerEvent({
        userId: actor.userId,
        event: 'order_created',
        orderId,
        payload: { orderId },
      })

      await notifyOwnerEvent({
        event: 'order_new',
        orderId,
      })
    } catch (err) {
      console.warn('[retail] Create order notify/email failed:', err?.message || err)
    }
  }

  return getRetailOrder(orderId)
}

async function updateRetailOrder(orderIdInput, payload = {}, { actor } = {}) {
  const orderId = String(orderIdInput || '').trim()
  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  const found = await query(
    `SELECT TOP 1 OrderId, Status, UserId
     FROM Orders
     WHERE OrderId = @orderId`,
    { orderId }
  )

  const current = found.recordset?.[0]
  if (!current) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  const nextStatus = payload.status !== undefined ? normalizeOrderStatusInput(payload.status) : null
  if (payload.status !== undefined && !nextStatus) {
    const err = new Error('Invalid status')
    err.status = 400
    throw err
  }

  if (nextStatus && nextStatus !== current.Status) {
    const hadStockDeducted = hasStockDeductedForStatus(current.Status)
    const shouldDeductStock = hasStockDeductedForStatus(nextStatus)

    if (!hadStockDeducted && shouldDeductStock) {
      await decreaseStockForOrder(orderId, { actor, referenceId: orderId })
    }

    if (hadStockDeducted && !shouldDeductStock) {
      await restoreStockForOrder(orderId)
    }

    if (nextStatus === 'Completed') {
      const items = await getOrderItems(orderId)
      await syncRetailInventoryByProducts(items.map((x) => x.ProductId))
    }
  }

  const customerName = payload.customerName !== undefined ? parseOptionalString(payload.customerName) : undefined
  const customerPhone = payload.customerPhone !== undefined ? parseOptionalString(payload.customerPhone) : undefined
  const customerAddress = payload.customerAddress !== undefined ? parseOptionalString(payload.customerAddress) : undefined
  const paymentMethod = payload.paymentMethod !== undefined ? parseOptionalString(payload.paymentMethod) : undefined

  await query(
    `UPDATE Orders
     SET
       Status = COALESCE(@status, Status),
       CustomerName = COALESCE(@customerName, CustomerName),
       CustomerPhone = COALESCE(@customerPhone, CustomerPhone),
       CustomerAddress = COALESCE(@customerAddress, CustomerAddress),
       PaymentMethod = COALESCE(@paymentMethod, PaymentMethod)
     WHERE OrderId = @orderId`,
    {
      orderId,
      status: nextStatus || null,
      customerName: customerName !== undefined ? customerName : null,
      customerPhone: customerPhone !== undefined ? customerPhone : null,
      customerAddress: customerAddress !== undefined ? customerAddress : null,
      paymentMethod: paymentMethod !== undefined ? paymentMethod : null,
    }
  )

  const userId = String(current.UserId || '').trim()
  if (userId && nextStatus && nextStatus !== current.Status) {
    const statusMap = {
      Pending: 'order_processing',
      Processing: 'order_processing',
      Shipping: 'order_shipping',
      Completed: 'order_delivered',
      Cancelled: 'order_cancelled',
      Failed: 'order_failed',
    }

    const event = statusMap[nextStatus] || 'order_processing'
    try {
      await notifyCustomerEvent({
        userId,
        event,
        orderId,
        payload: { orderId },
      })

      await notifyOwnerEvent({
        event,
        orderId,
      })
    } catch (err) {
      console.warn('[retail] Update order status notify/email failed:', err?.message || err)
    }
  }

  if (userId && paymentMethod !== undefined) {
    // Do not emit payment_success from order update. Payment success must come from gateway callback only.
    const paymentEvent = 'payment_pending'
    if (paymentEvent) {
      try {
        await notifyCustomerEvent({
          userId,
          event: paymentEvent,
          orderId,
          payload: { orderId },
        })

        await notifyOwnerEvent({
          event: paymentEvent,
          orderId,
        })
      } catch (err) {
        console.warn('[retail] Update payment notify/email failed:', err?.message || err)
      }
    }
  }

  return getRetailOrder(orderId)
}

async function deleteRetailOrder(orderIdInput) {
  const orderId = String(orderIdInput || '').trim()
  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  const found = await query(
    `SELECT TOP 1 OrderId, Status
     FROM Orders
     WHERE OrderId = @orderId`,
    { orderId }
  )

  const current = found.recordset?.[0]
  if (!current) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  const normalizedStatus = normalizeOrderStatusInput(current.Status) || 'Pending'
  if (hasStockDeductedForStatus(normalizedStatus)) {
    await restoreStockForOrder(orderId)
  }

  await query(
    `DELETE FROM OrderItems WHERE OrderId = @orderId`,
    { orderId }
  )

  await query(
    `DELETE FROM Orders WHERE OrderId = @orderId`,
    { orderId }
  )

  return { orderId }
}

module.exports = {
  getProduct,
  updateRetailProduct,
  listRetailProducts,
  createRetailProduct,
  deleteRetailProduct,
  listRetailMeta,
  listProductCategories,
  createProductCategory,
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  uploadProductImageFromDataUrl,
  listRetailOrders,
  createRetailOrder,
  getRetailOrder,
  updateRetailOrder,
  deleteRetailOrder,
}
