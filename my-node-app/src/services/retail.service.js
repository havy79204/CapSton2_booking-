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
let _legacyVariantShadowCleanupPromise = null

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

async function cleanupLegacyVariantShadowRows() {
  if (_legacyVariantShadowCleanupPromise) return _legacyVariantShadowCleanupPromise
  _legacyVariantShadowCleanupPromise = (async () => {
    try {
      await query(
        `UPDATE InventoryItems
         SET ProductId = NULL
         WHERE InventoryItemId LIKE 'retail_variant_%'
           AND ProductId IS NOT NULL`
      )
    } catch (err) {
      console.warn('[retail] cleanupLegacyVariantShadowRows failed:', err?.message || err)
    }
  })()
  return _legacyVariantShadowCleanupPromise
}

async function getSchemaInfo() {
  if (_schemaInfoPromise) {
    await cleanupLegacyVariantShadowRows()
    return _schemaInfoPromise
  }
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
      productsHasSupplier,
      productsHasProductType,
      hasInventoryLots,
      inventoryLotsHasSupplier,
      inventoryHasStatus,
      inventoryHasDescription,
      inventoryHasImageUrl,
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
      columnExists('Products', 'Supplier'),
      columnExists('Products', 'ProductType'),
      tableExists('InventoryLots'),
      columnExists('InventoryLots', 'Supplier'),
      columnExists('InventoryItems', 'Status'),
      columnExists('InventoryItems', 'Description'),
      columnExists('InventoryItems', 'ImageUrl'),
    ])

    const hasProductImages = await tableExists('ProductImages')
    await cleanupLegacyVariantShadowRows()

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
      productsHasSupplier,
      productsHasProductType,
      hasInventoryLots,
      inventoryLotsHasSupplier,
      inventoryHasStatus,
      inventoryHasDescription,
      inventoryHasImageUrl,
    }
  })()
  await cleanupLegacyVariantShadowRows()
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
         ORDER BY Name ASC;`,
    {},
    { timeoutMs: 60000 }
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

function normalizeVariantName(value) {
  return String(value || '').trim().toLowerCase()
}

function extractVariantNameFromNote(note) {
  const raw = String(note || '').trim()
  if (!raw) return ''
  const m = raw.match(/^\[\s*variant\s*:\s*([^\]]+)\]/i)
  return String(m?.[1] || '').trim()
}

function rewriteVariantPrefix(note, nextVariantName) {
  const cleanName = String(nextVariantName || '').trim() || DEFAULT_RETAIL_VARIANT_NAME
  const raw = String(note || '').trim()
  if (!raw) return `[Variant: ${cleanName}]`
  if (/^\[\s*variant\s*:/i.test(raw)) {
    return raw.replace(/^\[\s*variant\s*:\s*[^\]]+\]/i, `[Variant: ${cleanName}]`)
  }
  return `[Variant: ${cleanName}] ${raw}`
}

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
      categoryId: row.CategoryId ?? null,
      variantDisplayName: `${String(row.ProductName || '').trim()} - ${String(row.VariantName || '').trim()}`.trim(),
      variantQty: Number(row.VariantStock || 0),
      priceVndHint: Number.isFinite(Number(priceVndHint)) ? Number(priceVndHint) : null,
    }
  )
}

async function syncVariantLotsFromVariant(variantId) {
  const id = String(variantId || '').trim()
  if (!id) return

  const variant = await query(
    `SELECT TOP 1
       pv.VariantId,
       pv.VariantName,
       COALESCE(pv.Stock, 0) AS VariantStock
     FROM ProductVariants pv
     WHERE pv.VariantId = @id`,
    { id }
  )
  const row = variant.recordset?.[0]
  if (!row) return

  const shadowId = retailVariantShadowId(row.VariantId)
  const variantName = String(row.VariantName || '').trim() || DEFAULT_RETAIL_VARIANT_NAME

  // Repair legacy/mislabeled lot notes so UI can map lots to the correct variant.
  await query(
    `UPDATE InventoryLots
     SET Note =
       CASE
         WHEN Note IS NULL OR LTRIM(RTRIM(Note)) = ''
           THEN CONCAT('[Variant: ', @variantName, ']')
         ELSE @prefix
              + CASE
                  WHEN LOWER(LTRIM(Note)) LIKE '[[]variant:%' AND CHARINDEX(']', LTRIM(Note)) > 0
                    THEN LTRIM(SUBSTRING(LTRIM(Note), CHARINDEX(']', LTRIM(Note)) + 1, 4000))
                  ELSE LTRIM(Note)
                END
       END
     WHERE InventoryItemId = @shadowId`,
    {
      shadowId,
      variantName,
      prefix: `[Variant: ${variantName}] `,
    }
  )

  const targetQty = Math.max(0, Number(row.VariantStock || 0))
  const currentQtyRes = await query(
    `SELECT COALESCE(SUM(COALESCE(RemainingQty, 0)), 0) AS Qty
     FROM InventoryLots
     WHERE InventoryItemId = @shadowId`,
    { shadowId }
  )
  const currentQty = Math.max(0, Number(currentQtyRes.recordset?.[0]?.Qty || 0))
  const delta = Math.trunc(targetQty - currentQty)
  if (!delta) return

  if (delta > 0) {
    await query(
      `INSERT INTO InventoryLots (InventoryItemId, ReceivedQty, RemainingQty, PriceVnd, ReceivedAt, ExpiryDate, Supplier, Note)
       VALUES (@shadowId, @qty, @qty, 0, GETDATE(), NULL, NULL, @note);`,
      {
        shadowId,
        qty: delta,
        note: `[Variant: ${variantName}] Synced from variant stock`,
      }
    )

    await query(
      `INSERT INTO InventoryTransactions (InventoryItemId, Type, Quantity, PriceVnd, [Date], Note)
       VALUES (@shadowId, 'ADJUST', @qty, 0, GETDATE(), @note);`,
      {
        shadowId,
        qty: delta,
        note: `Variant stock sync: +${delta}`,
      }
    )
    return
  }

  let remainingToRemove = Math.abs(delta)
  const lotsRes = await query(
    `SELECT LotId, COALESCE(RemainingQty, 0) AS RemainingQty
     FROM InventoryLots
     WHERE InventoryItemId = @shadowId
       AND COALESCE(RemainingQty, 0) > 0
     ORDER BY ReceivedAt, LotId`,
    { shadowId }
  )

  for (const lot of lotsRes.recordset || []) {
    if (remainingToRemove <= 0) break
    const lotQty = Math.max(0, Number(lot?.RemainingQty || 0))
    if (!lotQty) continue
    const consume = Math.min(lotQty, remainingToRemove)
    await query(
      `UPDATE InventoryLots
       SET RemainingQty = CASE WHEN COALESCE(RemainingQty, 0) - @consume < 0 THEN 0 ELSE COALESCE(RemainingQty, 0) - @consume END
       WHERE LotId = @lotId`,
      {
        lotId: lot.LotId,
        consume,
      }
    )
    remainingToRemove -= consume
  }

  const removedQty = Math.abs(delta) - Math.max(0, remainingToRemove)
  if (removedQty > 0) {
    await query(
      `INSERT INTO InventoryTransactions (InventoryItemId, Type, Quantity, PriceVnd, [Date], Note)
       VALUES (@shadowId, 'ADJUST', @qty, 0, GETDATE(), @note);`,
      {
        shadowId,
        qty: -removedQty,
        note: `Variant stock sync: -${removedQty}`,
      }
    )
  }
}

async function syncProductShadowLotsForVariant(productId, {
  oldVariantName = '',
  newVariantName = '',
  targetStock = undefined,
} = {}) {
  const id = String(productId || '').trim()
  if (!id) return

  const shadowId = retailShadowId(id)
  const sourceName = String(oldVariantName || newVariantName || '').trim() || DEFAULT_RETAIL_VARIANT_NAME
  const nextName = String(newVariantName || oldVariantName || '').trim() || DEFAULT_RETAIL_VARIANT_NAME
  const sourceNorm = normalizeVariantName(sourceName)

  const lotsRes = await query(
    `SELECT LotId, COALESCE(RemainingQty, 0) AS RemainingQty, PriceVnd, ReceivedAt, ExpiryDate, Supplier, Note
     FROM InventoryLots
     WHERE InventoryItemId = @shadowId`,
    { shadowId }
  )
  const lots = Array.isArray(lotsRes.recordset) ? lotsRes.recordset : []

  const matchingLots = lots.filter((lot) => normalizeVariantName(extractVariantNameFromNote(lot?.Note)) === sourceNorm)

  if (normalizeVariantName(sourceName) !== normalizeVariantName(nextName)) {
    for (const lot of matchingLots) {
      await query(
        `UPDATE InventoryLots
         SET Note = @note
         WHERE LotId = @lotId`,
        {
          lotId: lot.LotId,
          note: rewriteVariantPrefix(lot?.Note, nextName),
        }
      )
    }
  }

  if (targetStock === undefined || targetStock === null || !Number.isFinite(Number(targetStock))) return

  const targetQty = Math.max(0, Math.trunc(Number(targetStock)))
  const currentQty = matchingLots.reduce((sum, lot) => sum + Math.max(0, Number(lot?.RemainingQty || 0)), 0)
  const delta = targetQty - currentQty
  if (!delta) return

  if (delta > 0) {
    let remainingToTransfer = delta
    const donorLots = lots
      .filter((lot) => normalizeVariantName(extractVariantNameFromNote(lot?.Note)) !== sourceNorm)
      .filter((lot) => Number(lot?.RemainingQty || 0) > 0)
      .sort((a, b) => String(a?.LotId || '').localeCompare(String(b?.LotId || '')))

    // First re-label stock by transferring from other variant lots to this variant.
    for (const donor of donorLots) {
      if (remainingToTransfer <= 0) break
      const donorQty = Math.max(0, Number(donor?.RemainingQty || 0))
      if (!donorQty) continue
      const moveQty = Math.min(donorQty, remainingToTransfer)

      await query(
        `UPDATE InventoryLots
         SET RemainingQty = CASE WHEN COALESCE(RemainingQty, 0) - @qty < 0 THEN 0 ELSE COALESCE(RemainingQty, 0) - @qty END
         WHERE LotId = @lotId`,
        {
          lotId: donor.LotId,
          qty: moveQty,
        }
      )

      await query(
        `INSERT INTO InventoryLots (InventoryItemId, ReceivedQty, RemainingQty, PriceVnd, ReceivedAt, ExpiryDate, Supplier, Note)
         VALUES (@shadowId, @qty, @qty, @priceVnd, @receivedAt, @expiryDate, @supplier, @note);`,
        {
          shadowId,
          qty: moveQty,
          priceVnd: donor?.PriceVnd ?? 0,
          receivedAt: donor?.ReceivedAt ?? null,
          expiryDate: donor?.ExpiryDate ?? null,
          supplier: donor?.Supplier ?? null,
          note: `[Variant: ${nextName}] Synced from variant stock`,
        }
      )

      remainingToTransfer -= moveQty
    }

    if (remainingToTransfer <= 0) {
      return
    }

    await query(
      `INSERT INTO InventoryLots (InventoryItemId, ReceivedQty, RemainingQty, PriceVnd, ReceivedAt, ExpiryDate, Supplier, Note)
       VALUES (@shadowId, @qty, @qty, 0, GETDATE(), NULL, NULL, @note);`,
      {
        shadowId,
        qty: remainingToTransfer,
        note: `[Variant: ${nextName}] Synced from variant stock`,
      }
    )

    await query(
      `INSERT INTO InventoryTransactions (InventoryItemId, Type, Quantity, PriceVnd, [Date], Note)
       VALUES (@shadowId, 'ADJUST', @qty, 0, GETDATE(), @note);`,
      {
        shadowId,
        qty: remainingToTransfer,
        note: `Variant stock sync (${nextName}): +${remainingToTransfer}`,
      }
    )
    return
  }

  let remainingToRemove = Math.abs(delta)
  const removableLots = matchingLots
    .filter((lot) => Number(lot?.RemainingQty || 0) > 0)
    .sort((a, b) => String(a?.LotId || '').localeCompare(String(b?.LotId || '')))

  for (const lot of removableLots) {
    if (remainingToRemove <= 0) break
    const lotQty = Math.max(0, Number(lot?.RemainingQty || 0))
    if (!lotQty) continue
    const consume = Math.min(lotQty, remainingToRemove)
    await query(
      `UPDATE InventoryLots
       SET RemainingQty = CASE WHEN COALESCE(RemainingQty, 0) - @consume < 0 THEN 0 ELSE COALESCE(RemainingQty, 0) - @consume END
       WHERE LotId = @lotId`,
      {
        lotId: lot.LotId,
        consume,
      }
    )
    remainingToRemove -= consume
  }

  const removedQty = Math.abs(delta) - Math.max(0, remainingToRemove)
  if (removedQty > 0) {
    await query(
      `INSERT INTO InventoryTransactions (InventoryItemId, Type, Quantity, PriceVnd, [Date], Note)
       VALUES (@shadowId, 'ADJUST', @qty, 0, GETDATE(), @note);`,
      {
        shadowId,
        qty: -removedQty,
        note: `Variant stock sync (${nextName}): -${removedQty}`,
      }
    )
  }
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

function normalizeProductType(value, { required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) {
      const err = new Error('Missing type')
      err.status = 400
      throw err
    }
    return null
  }

  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'retail') return 'retail'
  if (normalized === 'supplies' || normalized === 'service') return 'supplies'

  const err = new Error('Invalid type')
  err.status = 400
  throw err
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
     ORDER BY ProductId, COALESCE(SortOrder, 2147483647), ImageId`,
    {},
    { timeoutMs: 60000 }
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
  const parent = await resolveRetailParentRecord(productId)

  if (parent.kind === 'supplies') {
    const lotsRes = await query(
      `SELECT
         LotId,
         COALESCE(RemainingQty, 0) AS RemainingQty,
         Note
       FROM InventoryLots
       WHERE InventoryItemId = @productId
       ORDER BY ReceivedAt, LotId`,
      { productId }
    )

    const grouped = new Map()
    for (const lot of lotsRes.recordset || []) {
      const variantName = extractVariantNameFromNote(lot?.Note) || DEFAULT_RETAIL_VARIANT_NAME
      const key = normalizeVariantName(variantName) || DEFAULT_RETAIL_VARIANT_NAME.toLowerCase()
      const current = grouped.get(key) || {
        id: key,
        productId,
        name: variantName,
        price: 0,
        stock: 0,
      }
      current.stock += Math.max(0, Number(lot?.RemainingQty || 0))
      grouped.set(key, current)
    }

    return Array.from(grouped.values()).sort(
      (a, b) => Number(b.stock || 0) - Number(a.stock || 0) || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    )
  }

  const hasVariantPrice = await columnExists('ProductVariants', 'Price')

  const res = await query(
    `SELECT
       pv.VariantId,
       pv.ProductId,
       pv.VariantName,
       ${hasVariantPrice ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Price), 0)' : 'CAST(0 AS DECIMAL(19,2))'} AS Price,
       COALESCE(lots.TotalQty, COALESCE(pv.Stock, 0), 0) AS Stock
     FROM ProductVariants pv
     OUTER APPLY (
       SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
       FROM InventoryLots l
       WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
     ) lots
     WHERE pv.ProductId = @productId
     ORDER BY COALESCE(lots.TotalQty, COALESCE(pv.Stock, 0), 0) DESC, pv.VariantName ASC`,
    { productId }
  )

  return (res.recordset || []).map((r) => ({
    id: r.VariantId,
    productId: r.ProductId,
    name: r.VariantName || '',
    price: Number(r.Price || 0),
    stock: Number(r.Stock || 0),
  }))
}

async function resolveRetailParentRecord(productId) {
  const id = String(productId || '').trim()
  if (!id) return { kind: null, row: null }

  const schema = await getSchemaInfo()

  const supplyDescriptionSelect = schema.inventoryHasDescription
    ? 'Description'
    : 'CAST(NULL AS NVARCHAR(MAX)) AS Description'
  const supplyImageSelect = schema.inventoryHasImageUrl
    ? 'ImageUrl'
    : 'CAST(NULL AS NVARCHAR(500)) AS ImageUrl'
  const supplyStatusSelect = schema.inventoryHasStatus
    ? 'Status'
    : "CAST(NULL AS NVARCHAR(50)) AS Status"

  const [productRes, supplyRes] = await Promise.all([
    query(
      `SELECT TOP 1 ProductId, Name, Price, Description, ImageUrl, Stock, Status, CategoryId
       FROM Products
       WHERE ProductId = @id`,
      { id },
      { timeoutMs: 60000 }
    ),
    query(
      `SELECT TOP 1
         InventoryItemId,
         Name,
         ${supplyDescriptionSelect},
         ${supplyImageSelect},
         Quantity,
         ReorderLevel,
         ${supplyStatusSelect},
         CategoryId,
         Unit,
         PriceVnd,
         ItemGroup
       FROM InventoryItems
       WHERE InventoryItemId = @id
         AND COALESCE(ItemGroup, 'service') = 'service'
         AND InventoryItemId NOT LIKE 'retail_variant_%'`,
      { id },
      { timeoutMs: 60000 }
    ),
  ])

  if (productRes.recordset?.[0]) {
    return { kind: 'retail', row: productRes.recordset[0] }
  }

  if (supplyRes.recordset?.[0]) {
    return { kind: 'supplies', row: supplyRes.recordset[0] }
  }

  return { kind: null, row: null }
}

async function syncSupplyStockFromVariants(productId) {
  const id = String(productId || '').trim()
  if (!id) return

  const totalRes = await query(
    `SELECT COALESCE(SUM(COALESCE(pv.Stock, 0)), 0) AS TotalStock
     FROM ProductVariants pv
     WHERE pv.ProductId = @id`,
    { id }
  )
  const totalStock = Math.max(0, Math.trunc(Number(totalRes.recordset?.[0]?.TotalStock || 0)))

  await query(
    `UPDATE InventoryItems
     SET Quantity = @totalStock
     WHERE InventoryItemId = @id
       AND COALESCE(ItemGroup, 'service') = 'service'
       AND InventoryItemId NOT LIKE 'retail_variant_%'`,
    { id, totalStock }
  )
}

async function getProduct(productId) {
  const schema = await getSchemaInfo()
  if (!schema.productsHasCategoryId || !schema.hasProductCategories) {
    const err = new Error('Products.CategoryId or ProductCategories is missing')
    err.status = 400
    throw err
  }
  const parent = await resolveRetailParentRecord(productId)
  if (!parent.kind || !parent.row) return null

  const isSupply = parent.kind === 'supplies'
  const row = parent.row
  const categoryId = row.CategoryId ?? null
  const categoryNameRes = await query(
    `SELECT TOP 1 Name, Description
     FROM ProductCategories
     WHERE CategoryId = @categoryId`,
    { categoryId },
    { timeoutMs: 60000 }
  )
  const categoryRow = categoryId ? categoryNameRes.recordset?.[0] || null : null
  const categoryName = categoryRow?.Name || ''

  const stockExpr = isSupply
    ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), i.Quantity), 0)'
    : schema.hasProductVariants
      ? `COALESCE((
           SELECT SUM(COALESCE(vLots.TotalQty, TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0))
           FROM ProductVariants pv
           OUTER APPLY (
             SELECT SUM(TRY_CONVERT(DECIMAL(19,2), l.RemainingQty)) AS TotalQty
             FROM InventoryLots l
             WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
           ) vLots
           WHERE pv.ProductId = p.ProductId
         ), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0))`
      : 'COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0)'

  let soldCount = 0
  let averageRating = null
  let reviewCount = 0
  let supplier = 'Default'
  let images = []

  if (isSupply) {
    const variantAggRes = await query(
      `SELECT COALESCE(SUM(COALESCE(pv.Stock, 0)), 0) AS TotalStock
       FROM ProductVariants pv
       WHERE pv.ProductId = @id`,
      { id: productId },
      { timeoutMs: 60000 }
    )
    const totalStock = Number(variantAggRes.recordset?.[0]?.TotalStock || 0)

    if (schema.hasProductImages) {
      const imgRes = await query(
        `SELECT ImageUrl
         FROM ProductImages
         WHERE ProductId = @id
         ORDER BY COALESCE(SortOrder, 2147483647), ImageId`,
        { id: productId },
        { timeoutMs: 60000 }
      )
      images = (imgRes.recordset || []).map((r) => String(r.ImageUrl || '').trim()).filter(Boolean)
    }

    supplier = row.Supplier || 'Default'
    return {
      id: row.InventoryItemId,
      name: row.Name || '',
      price: null,
      description: row.Description || '',
      imageUrl: images[0] || row.ImageUrl || '',
      images,
      stock: Number.isFinite(totalStock) && totalStock > 0 ? totalStock : Number(row.Quantity || 0),
      soldCount,
      averageRating,
      status: row.Status ?? null,
      supplier,
      kind: categoryName,
      categoryId,
      category: {
        id: categoryId,
        name: categoryName,
        description: categoryRow?.Description || '',
      },
      variants: await listVariants(productId),
      type: 'supplies',
      unit: row.Unit || '',
      minQty: Number(row.ReorderLevel || 0),
    }
  }

  const prodRes = await query(
    `SELECT TOP 1
        p.ProductId,
        p.Name,
        p.Price,
        p.Description,
        p.ImageUrl,
        ${stockExpr} AS Stock,
        p.Status,
        ${schema.hasOrderItems
          ? `(
              SELECT COALESCE(SUM(oi.Quantity), 0)
              FROM OrderItems oi
              ${schema.hasOrders ? 'LEFT JOIN Orders o ON o.OrderId = oi.OrderId' : ''}
              WHERE oi.ProductId = p.ProductId
              ${schema.hasOrders && schema.ordersHasStatus
                ? "AND (o.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), o.Status)))) NOT IN ('cancelled', 'cancelled'))"
                : ''}
            )`
          : 'CAST(0 AS INT)'} AS SoldCount,
        ${schema.hasSalonReviews && schema.salonReviewsHasProductId && schema.salonReviewsHasRating
          ? `(
              SELECT AVG(CAST(rr.Rating AS FLOAT))
              FROM (
                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.ProductId = p.ProductId
                  AND sr.Rating IS NOT NULL
                  AND (sr.OrderItemId IS NOT NULL OR sr.OrderId IS NULL)

                UNION ALL

                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.OrderId IS NOT NULL
                  AND sr.OrderItemId IS NULL
                  AND sr.Rating IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM OrderItems oi
                    WHERE oi.OrderId = sr.OrderId
                      AND oi.ProductId = p.ProductId
                  )
              ) rr
            )`
          : 'CAST(NULL AS FLOAT)'} AS AverageRating,
        ${schema.hasSalonReviews && schema.salonReviewsHasProductId && schema.salonReviewsHasRating
          ? `(
              SELECT COUNT(1)
              FROM (
                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.ProductId = p.ProductId
                  AND sr.Rating IS NOT NULL
                  AND (sr.OrderItemId IS NOT NULL OR sr.OrderId IS NULL)

                UNION ALL

                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.OrderId IS NOT NULL
                  AND sr.OrderItemId IS NULL
                  AND sr.Rating IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM OrderItems oi
                    WHERE oi.OrderId = sr.OrderId
                      AND oi.ProductId = p.ProductId
                  )
              ) rr
            )`
          : 'CAST(0 AS INT)'} AS ReviewCount,
        p.CategoryId,
        ${schema.productsHasSupplier
          ? 'LTRIM(RTRIM(CONVERT(NVARCHAR(120), p.Supplier)))'
          : 'CAST(NULL AS NVARCHAR(120))'} AS Supplier,
        ${schema.hasInventoryLots && schema.inventoryLotsHasSupplier
          ? `(
              SELECT TOP 1 LTRIM(RTRIM(CONVERT(NVARCHAR(120), l.Supplier)))
              FROM InventoryLots l
              WHERE l.InventoryItemId = CONCAT('retail_', p.ProductId)
                 OR (
                   ${schema.hasProductVariants
                     ? `EXISTS (
                         SELECT 1
                         FROM ProductVariants pv
                         WHERE pv.ProductId = p.ProductId
                           AND l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
                       )`
                     : '1 = 0'}
                 )
              ORDER BY l.ReceivedAt DESC, l.LotId DESC
            )`
          : 'CAST(NULL AS NVARCHAR(120))'} AS LotSupplier,
        c.Name AS CategoryName,
        c.Description AS CategoryDescription
     FROM Products p
     LEFT JOIN ProductCategories c ON c.CategoryId = p.CategoryId
     WHERE p.ProductId = @id`,
    { id: productId }
  )

  const retailRow = prodRes.recordset?.[0]
  if (!retailRow) return null

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
  if (!images.length && retailRow.ImageUrl) images = [String(retailRow.ImageUrl).trim()]

  const variants = await listVariants(productId)

  return {
    id: retailRow.ProductId,
    name: retailRow.Name || '',
    price: Number(retailRow.Price || 0),
    description: retailRow.Description || '',
    imageUrl: images[0] || retailRow.ImageUrl || '',
    images,
    stock: Number(retailRow.Stock || 0),
    soldCount: Number(retailRow.SoldCount || 0),
    averageRating: retailRow.AverageRating === null || retailRow.AverageRating === undefined ? null : Number(retailRow.AverageRating),
    status: retailRow.Status ?? null,
    supplier: retailRow.Supplier || retailRow.LotSupplier || 'Default',
    kind: categoryName,
    categoryId,
    category: {
      id: categoryId,
      name: categoryName,
      description: categoryRow?.Description || '',
    },
    variants,
    type: 'retail',
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

async function getVariantLotStock(variantId) {
  const shadowId = retailVariantShadowId(variantId)
  const res = await query(
    `SELECT COALESCE(SUM(COALESCE(RemainingQty, 0)), 0) AS Total
     FROM InventoryLots
     WHERE InventoryItemId = @shadowId`,
    { shadowId }
  )
  return Math.max(0, Math.trunc(Number(res.recordset?.[0]?.Total || 0)))
}

async function assertVariantStockConsistentWithLots(variantId) {
  const lotStock = await getVariantLotStock(variantId)
  const variantRes = await query(
    `SELECT TOP 1 COALESCE(Stock, 0) AS Stock
     FROM ProductVariants
     WHERE VariantId = @id`,
    { id: variantId }
  )
  const variantStock = Math.max(0, Math.trunc(Number(variantRes.recordset?.[0]?.Stock || 0)))
  if (variantStock !== lotStock) {
    const err = new Error('Variant stock must equal total lot stock')
    err.status = 409
    throw err
  }
}

async function syncVariantAndProductStockFromLots(variantId) {
  const id = String(variantId || '').trim()
  if (!id) return null

  const variantRes = await query(
    `SELECT TOP 1 VariantId, ProductId
     FROM ProductVariants
     WHERE VariantId = @id`,
    { id }
  )
  const row = variantRes.recordset?.[0]
  if (!row) return null

  const lotStock = await getVariantLotStock(row.VariantId)
  await query(
    `UPDATE ProductVariants
     SET Stock = @stock
     WHERE VariantId = @id`,
    {
      id: row.VariantId,
      stock: lotStock,
    }
  )

  await query(
    `UPDATE p
     SET Stock = COALESCE(v.TotalStock, 0)
     FROM Products p
     OUTER APPLY (
       SELECT COALESCE(SUM(COALESCE(pv.Stock, 0)), 0) AS TotalStock
       FROM ProductVariants pv
       WHERE pv.ProductId = p.ProductId
     ) v
     WHERE p.ProductId = @productId`,
    { productId: row.ProductId }
  )

  return {
    productId: row.ProductId,
    stock: lotStock,
  }
}

async function resolveVariantAdjustmentImportPriceVnd(variantId, productId) {
  const shadowId = retailVariantShadowId(variantId)
  const lotRes = await query(
    `SELECT TOP 1 COALESCE(TRY_CONVERT(DECIMAL(19,2), UnitCost), 0) AS UnitCost
     FROM InventoryLots
     WHERE InventoryItemId = @shadowId
       AND COALESCE(RemainingQty, 0) > 0
     ORDER BY ReceivedAt DESC, LotId DESC`,
    { shadowId }
  )
  const latestUnitCost = Number(lotRes.recordset?.[0]?.UnitCost || 0)
  if (Number.isFinite(latestUnitCost) && latestUnitCost > 0) {
    return latestUnitCost
  }

  const productRes = await query(
    `SELECT TOP 1 COALESCE(TRY_CONVERT(DECIMAL(19,2), Price), 0) AS Price
     FROM Products
     WHERE ProductId = @id`,
    { id: productId }
  )
  const sellPrice = Number(productRes.recordset?.[0]?.Price || 0)
  if (Number.isFinite(sellPrice) && sellPrice > 0) {
    return sellPrice
  }

  return 1
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

  const parent = await resolveRetailParentRecord(productId)
  if (!parent.kind) {
    const err = new Error('Product not found')
    err.status = 404
    throw err
  }

  const { name, stock } = payload || {}
  const variantName = normalizeRequiredSafeText(name, 'variant name') || 'Default Variant'

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

  const id = newId()
  if (parent.kind === 'retail') {
    const productStock = await getProductStock(productId)
    const currentTotal = await getVariantsTotalStock(productId)
    const nextTotal = Math.trunc(currentTotal) + Math.trunc(stValue)

    // If product stock is less than the total variant stock needed, auto-adjust it
    const newProductStock = Math.max(Math.trunc(productStock), nextTotal)

    await query(
      `UPDATE Products
       SET Stock = @newStock
       WHERE ProductId = @productId;

       INSERT INTO ProductVariants (VariantId, ProductId, VariantName, Stock)
       VALUES (@id, @productId, @name, @stock);`,
      {
        productId,
        newStock: newProductStock,
        id,
        name: variantName,
        stock: stValue,
      }
    )
  } else {
    await query(
      `INSERT INTO ProductVariants (VariantId, ProductId, VariantName, Stock)
       VALUES (@id, @productId, @name, @stock);`,
      {
        productId,
        id,
        name: variantName,
        stock: stValue,
      }
    )
  }

  try {
    if (parent.kind === 'retail') {
      await syncVariantShadowFromVariant(id)
      await syncProductShadowLotsForVariant(productId, {
        newVariantName: variantName,
        targetStock: stValue,
      })
    } else {
      await syncSupplyStockFromVariants(productId)
    }
    await syncVariantLotsFromVariant(id)
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

  // allow partial updates: name, stock and/or price
  const name = payload?.name !== undefined ? normalizeRequiredSafeText(payload.name, 'variant name') : undefined
  const stock = payload?.stock !== undefined ? parseOptionalInt(payload.stock) : undefined
  const price = payload?.price !== undefined ? parseMoneyVnd(payload.price) : payload?.sellPriceVnd !== undefined ? parseMoneyVnd(payload.sellPriceVnd) : undefined

  const currentRes = await query(
    `SELECT TOP 1 VariantId, ProductId, VariantName
     FROM ProductVariants
     WHERE VariantId = @variantId`,
    { variantId }
  )
  const current = currentRes.recordset?.[0]
  if (!current) {
    const err = new Error('Variant not found')
    err.status = 404
    throw err
  }

  const parent = await resolveRetailParentRecord(current.ProductId)

  if (name !== undefined) {
    const dupRes = await query(
    `SELECT TOP 1 VariantId
     FROM ProductVariants
     WHERE ProductId = @productId
       AND VariantId <> @variantId
       AND LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), VariantName)))) = @name`,
    {
      productId: current.ProductId,
      variantId,
      name: name.toLowerCase(),
    }
  )
    if (dupRes.recordset?.length) {
      const err = new Error('Variant name already exists')
      err.status = 409
      throw err
    }
  }

  // Build dynamic update for provided fields
  const sets = []
  const params = { variantId }
  if (name !== undefined) {
    sets.push('VariantName = @name')
    params.name = name
  }
  if (stock !== undefined) {
    if (stock === null || !Number.isFinite(stock) || stock < 0) {
      const err = new Error('Invalid stock')
      err.status = 400
      throw err
    }
    sets.push('Stock = @stock')
    params.stock = stock
  }
  const hasPriceColumn = await columnExists('ProductVariants', 'Price')
  if (price !== undefined && hasPriceColumn) {
    sets.push('Price = @price')
    params.price = price
  }

  if (sets.length > 0) {
    const sql = `UPDATE ProductVariants\n     SET ${sets.join(',\n         ')}\n     WHERE VariantId = @variantId`
    await query(sql, params)
  }

  try {
    if (parent.kind === 'retail') {
      // pass price hint so shadow inventory item PriceVnd can be updated
      await syncVariantShadowFromVariant(variantId, { priceVndHint: price })
      await syncProductShadowLotsForVariant(current.ProductId, {
        oldVariantName: current.VariantName,
        newVariantName: name !== undefined ? name : current.VariantName,
      })
    } else {
      await syncSupplyStockFromVariants(current.ProductId)
    }
    await syncVariantLotsFromVariant(variantId)
  } catch (err) {
    console.warn('[retail.updateVariant] shadow sync failed:', err?.message || err)
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

  const currentRes = await query(
    `SELECT TOP 1 VariantId, ProductId
     FROM ProductVariants
     WHERE VariantId = @variantId`,
    { variantId }
  )
  const current = currentRes.recordset?.[0]
  if (!current) {
    const err = new Error('Variant not found')
    err.status = 404
    throw err
  }

  const parent = await resolveRetailParentRecord(current.ProductId)

  const lotQtyRes = await query(
    `SELECT COALESCE(SUM(COALESCE(RemainingQty, 0)), 0) AS TotalQty
     FROM InventoryLots
     WHERE InventoryItemId = @shadowId`,
    { shadowId: `retail_variant_${variantId}` }
  )
  const totalQty = Number(lotQtyRes.recordset?.[0]?.TotalQty || 0)
  if (totalQty > 0) {
    const err = new Error('Only variants with zero stock can be deleted')
    err.status = 409
    throw err
  }

  await query(
    `DELETE FROM InventoryLots WHERE InventoryItemId = @shadowId;
     DELETE FROM InventoryItems WHERE InventoryItemId = @shadowId;
     DELETE FROM ProductVariants WHERE VariantId = @variantId;`,
    { shadowId: `retail_variant_${variantId}`, variantId }
  )

  if (parent.kind === 'supplies') {
    await syncSupplyStockFromVariants(current.ProductId)
  }

  return { id: variantId }
}

async function updateRetailProduct(productId, payload) {
  if (!productId) {
    const err = new Error('Missing productId')
    err.status = 400
    throw err
  }
  const schema = await getSchemaInfo()

  const [existingProductRes, existingSupplyRes] = await Promise.all([
    query(
      `SELECT TOP 1 ProductId, Name, Price, Status
       FROM Products
       WHERE ProductId = @id`,
      { id: productId },
    ),
    query(
      `SELECT TOP 1 InventoryItemId, Name
       FROM InventoryItems
       WHERE InventoryItemId = @id
         AND COALESCE(ItemGroup, 'service') = 'service'
         AND InventoryItemId NOT LIKE 'retail_variant_%'`,
      { id: productId },
    ),
  ])

  const existingProduct = existingProductRes.recordset?.[0] || null
  const existingSupply = existingSupplyRes.recordset?.[0] || null
  if (!existingProduct && !existingSupply) {
    const err = new Error('Product not found')
    err.status = 404
    throw err
  }

  const name = payload?.name !== undefined ? normalizeRequiredSafeText(payload.name, 'name') : undefined
  const type = payload?.type !== undefined ? normalizeProductType(payload.type) : undefined
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
  const sellPrice = payload?.price !== undefined
    ? parseMoneyVnd(payload.price)
    : payload?.sellPriceVnd !== undefined
      ? parseMoneyVnd(payload.sellPriceVnd)
      : undefined
  const importPrice = payload?.importPriceVnd !== undefined ? parseMoneyVnd(payload.importPriceVnd) : undefined
  const supplier = payload?.supplier !== undefined ? parseOptionalString(payload?.supplier) : undefined
  const unit = payload?.unit !== undefined ? parseOptionalString(payload?.unit) : undefined
  const minQty = payload?.minQty !== undefined ? parseOptionalInt(payload?.minQty) : undefined

  if (minQty !== undefined && (minQty === null || !Number.isFinite(minQty) || minQty < 0)) {
    const err = new Error('Invalid minQty')
    err.status = 400
    throw err
  }

  if (
    existingProduct
    && sellPrice !== undefined
    && (sellPrice === null || !Number.isFinite(sellPrice) || sellPrice <= 0)
  ) {
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

  if (existingProduct && name !== undefined) {
    await ensureRetailProductNameUnique(name, productId)
  }

  if (!existingProduct) {
    if (type && type !== 'supplies') {
      const err = new Error('Cannot change supplies item to retail in this endpoint')
      err.status = 400
      throw err
    }

    const updateSql = `UPDATE InventoryItems
       SET
         Name = COALESCE(@name, Name),
         CategoryId = COALESCE(@categoryId, CategoryId),
         Unit = COALESCE(@unit, Unit),
         ReorderLevel = COALESCE(@minQty, ReorderLevel),
         PriceVnd = COALESCE(@importPriceVnd, PriceVnd)
         ${schema.inventoryHasDescription ? ', Description = CASE WHEN @setDescription = 1 THEN @description ELSE Description END' : ''}
         ${schema.inventoryHasImageUrl ? ', ImageUrl = CASE WHEN @setImage = 1 THEN @imageUrl ELSE ImageUrl END' : ''}
         ${schema.inventoryHasStatus ? ', Status = COALESCE(@status, Status)' : ''}
       WHERE InventoryItemId = @id
         AND COALESCE(ItemGroup, 'service') = 'service'
         AND InventoryItemId NOT LIKE 'retail_variant_%'`

    await query(updateSql, {
      id: productId,
      name: name !== undefined ? name : null,
      categoryId,
      unit: unit === undefined ? null : unit,
      minQty: minQty === undefined ? null : minQty,
      importPriceVnd: importPrice !== undefined ? importPrice : null,
      setDescription: schema.inventoryHasDescription && description !== undefined ? 1 : 0,
      description: schema.inventoryHasDescription && description !== undefined ? description : null,
      setImage: schema.inventoryHasImageUrl && nextImages ? 1 : 0,
      imageUrl: schema.inventoryHasImageUrl && nextImages ? primaryImage : null,
      status: schema.inventoryHasStatus && status !== undefined ? status : null,
    })

    return { id: productId }
  }

  const existing = existingProduct

  const extraSetClauses = []
  if (schema.productsHasSupplier && supplier !== undefined) {
    extraSetClauses.push('Supplier = @supplier')
  }
  if (schema.productsHasProductType && type !== undefined) {
    extraSetClauses.push('ProductType = @productType')
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
       ${extraSetClauses.length ? `,\n       ${extraSetClauses.join(',\n       ')}` : ''}
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
      supplier: supplier === undefined ? null : supplier,
      productType: schema.productsHasProductType && type !== undefined ? type : null,
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
         COALESCE(@unit, 'sp'),
         1,
         COALESCE(p.Stock, 0),
         COALESCE(@minQty, 0),
         COALESCE(@importPriceVnd, NULL),
         CASE WHEN @itemGroup = 'service' THEN 'service' ELSE 'retail' END
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
         Unit = COALESCE(@unit, Unit),
         ConversionRate = COALESCE(1, ConversionRate),
         Quantity = (SELECT COALESCE(Stock, 0) FROM Products WHERE ProductId = @id),
         ReorderLevel = COALESCE(@minQty, ReorderLevel),
         PriceVnd = COALESCE(@importPriceVnd, PriceVnd),
         ItemGroup = CASE WHEN @itemGroup = 'service' THEN 'service' ELSE 'retail' END
       WHERE InventoryItemId = @shadowId;
     END`,
    {
      shadowId,
      id: productId,
      name: name !== undefined ? name : null,
      unit: unit === undefined ? 'sp' : unit,
      minQty: minQty === undefined ? null : minQty,
      importPriceVnd: importPrice !== undefined ? importPrice : null,
      itemGroup: (schema.productsHasProductType && type === 'supplies') ? 'service' : 'retail',
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
  const productStockExpr = schema.hasProductVariants
    ? `CASE
         WHEN EXISTS (SELECT 1 FROM ProductVariants pvCheck WHERE pvCheck.ProductId = p.ProductId)
           THEN COALESCE((
             SELECT SUM(COALESCE(vLots.TotalQty, TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0))
             FROM ProductVariants pv
             OUTER APPLY (
               SELECT SUM(TRY_CONVERT(DECIMAL(19,2), l.RemainingQty)) AS TotalQty
               FROM InventoryLots l
               WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
             ) vLots
             WHERE pv.ProductId = p.ProductId
           ), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0))
         ELSE COALESCE((
             SELECT SUM(COALESCE(l.RemainingQty, 0))
             FROM InventoryLots l
             WHERE l.InventoryItemId = CONCAT('retail_', p.ProductId)
           ), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0))
       END`
    : `COALESCE((
         SELECT SUM(COALESCE(l.RemainingQty, 0))
         FROM InventoryLots l
         WHERE l.InventoryItemId = CONCAT('retail_', p.ProductId)
       ), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0))`
  const variantPriceCountExpr = schema.hasProductVariants
    ? `(SELECT COUNT(1)
        FROM ProductVariants pv
        WHERE pv.ProductId = p.ProductId
          AND TRY_CONVERT(DECIMAL(19,2), pv.Price) > 0)`
    : 'CAST(0 AS INT)'
  const minVariantSellPriceExpr = schema.hasProductVariants
    ? `(SELECT MIN(TRY_CONVERT(DECIMAL(19,2), pv.Price))
        FROM ProductVariants pv
        WHERE pv.ProductId = p.ProductId
          AND TRY_CONVERT(DECIMAL(19,2), pv.Price) > 0)`
    : 'CAST(NULL AS DECIMAL(19,2))'
  const retailTypeFilter = schema.productsHasProductType
    ? `AND (
         p.ProductType IS NULL
         OR LTRIM(RTRIM(CONVERT(NVARCHAR(40), p.ProductType))) = ''
         OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(40), p.ProductType)))) NOT IN ('supplies', 'service')
       )`
    : ''
  const res = await query(
    `SELECT
        p.ProductId,
        p.Name,
        p.Price,
        p.Description,
        p.ImageUrl,
        ${productStockExpr} AS Stock,
        p.Status,
        ${schema.hasOrderItems
          ? `(
              SELECT COALESCE(SUM(oi.Quantity), 0)
              FROM OrderItems oi
              ${schema.hasOrders ? 'LEFT JOIN Orders o ON o.OrderId = oi.OrderId' : ''}
              WHERE oi.ProductId = p.ProductId
              ${schema.hasOrders && schema.ordersHasStatus
                ? "AND (o.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), o.Status)))) NOT IN ('cancelled', 'cancelled'))"
                : ''}
            )`
          : 'CAST(0 AS INT)'} AS SoldCount,
        ${schema.hasSalonReviews && schema.salonReviewsHasProductId && schema.salonReviewsHasRating
          ? `(
              SELECT AVG(CAST(rr.Rating AS FLOAT))
              FROM (
                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.ProductId = p.ProductId
                  AND sr.Rating IS NOT NULL
                  AND (sr.OrderItemId IS NOT NULL OR sr.OrderId IS NULL)

                UNION ALL

                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.OrderId IS NOT NULL
                  AND sr.OrderItemId IS NULL
                  AND sr.Rating IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM OrderItems oi
                    WHERE oi.OrderId = sr.OrderId
                      AND oi.ProductId = p.ProductId
                  )
              ) rr
            )`
          : 'CAST(NULL AS FLOAT)'} AS AverageRating,
        ${schema.hasSalonReviews && schema.salonReviewsHasProductId && schema.salonReviewsHasRating
          ? `(
              SELECT COUNT(1)
              FROM (
                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.ProductId = p.ProductId
                  AND sr.Rating IS NOT NULL
                  AND (sr.OrderItemId IS NOT NULL OR sr.OrderId IS NULL)

                UNION ALL

                SELECT sr.Rating
                FROM SalonReviews sr
                WHERE sr.OrderId IS NOT NULL
                  AND sr.OrderItemId IS NULL
                  AND sr.Rating IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM OrderItems oi
                    WHERE oi.OrderId = sr.OrderId
                      AND oi.ProductId = p.ProductId
                  )
              ) rr
            )`
          : 'CAST(0 AS INT)'} AS ReviewCount,
        p.CategoryId,
        ${schema.productsHasSupplier
          ? 'LTRIM(RTRIM(CONVERT(NVARCHAR(120), p.Supplier)))'
          : 'CAST(NULL AS NVARCHAR(120))'} AS Supplier,
        ${schema.hasInventoryLots && schema.inventoryLotsHasSupplier
          ? `(
              SELECT TOP 1 LTRIM(RTRIM(CONVERT(NVARCHAR(120), l.Supplier)))
              FROM InventoryLots l
              WHERE l.InventoryItemId = CONCAT('retail_', p.ProductId)
                 OR (
                   ${schema.hasProductVariants
                     ? `EXISTS (
                         SELECT 1
                         FROM ProductVariants pv
                         WHERE pv.ProductId = p.ProductId
                           AND l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
                       )`
                     : '1 = 0'}
                 )
              ORDER BY l.ReceivedAt DESC, l.LotId DESC
            )`
          : 'CAST(NULL AS NVARCHAR(120))'} AS LotSupplier,
        CAST('retail' AS NVARCHAR(20)) AS ProductType,
        CAST('retail' AS NVARCHAR(20)) AS ItemGroup,
        COALESCE(shadow.Unit, 'sp') AS Unit,
        COALESCE(TRY_CONVERT(INT, shadow.ReorderLevel), 0) AS MinQty,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Price), 0) AS SellPriceVnd,
        ${variantPriceCountExpr} AS VariantPriceCount,
        ${minVariantSellPriceExpr} AS MinVariantSellPrice,
        c.Name AS CategoryName,
        c.Description AS CategoryDescription
     FROM Products p
     LEFT JOIN ProductCategories c ON c.CategoryId = p.CategoryId
     LEFT JOIN InventoryItems shadow ON shadow.InventoryItemId = CONCAT('retail_', p.ProductId)
      WHERE p.Status IS NULL
        OR LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status))) = ''
        OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) IN ('active', 'inactive')
      ${retailTypeFilter}

      UNION ALL

      SELECT
        i.InventoryItemId AS ProductId,
        i.Name,
        CAST(NULL AS DECIMAL(19,2)) AS Price,
        ${schema.inventoryHasDescription ? 'i.Description' : 'CAST(NULL AS NVARCHAR(MAX))'} AS Description,
        ${schema.inventoryHasImageUrl ? 'i.ImageUrl' : 'CAST(NULL AS NVARCHAR(500))'} AS ImageUrl,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), i.Quantity), 0) AS Stock,
        ${schema.inventoryHasStatus ? 'i.Status' : "CAST('active' AS NVARCHAR(20))"} AS Status,
        CAST(0 AS INT) AS SoldCount,
        CAST(NULL AS FLOAT) AS AverageRating,
        CAST(0 AS INT) AS ReviewCount,
        i.CategoryId,
        CAST(NULL AS NVARCHAR(120)) AS Supplier,
        CAST(NULL AS NVARCHAR(120)) AS LotSupplier,
        CAST('supplies' AS NVARCHAR(20)) AS ProductType,
        COALESCE(i.ItemGroup, 'service') AS ItemGroup,
        i.Unit,
        COALESCE(TRY_CONVERT(INT, i.ReorderLevel), 0) AS MinQty,
        CAST(NULL AS DECIMAL(19,2)) AS SellPriceVnd,
        CAST(0 AS INT) AS VariantPriceCount,
        CAST(NULL AS DECIMAL(19,2)) AS MinVariantSellPrice,
        c.Name AS CategoryName,
        c.Description AS CategoryDescription
      FROM InventoryItems i
      LEFT JOIN ProductCategories c ON c.CategoryId = i.CategoryId
      WHERE COALESCE(i.ItemGroup, 'service') = 'service'
        AND i.InventoryItemId NOT LIKE 'retail_variant_%'
        ${schema.inventoryHasStatus
          ? "AND (i.Status IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(50), i.Status))) = '' OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), i.Status)))) IN ('active', 'inactive'))"
          : ''}

     ORDER BY Name ASC`
    ,
    {},
    { timeoutMs: 60000 }
  )

  const imagesMap = await getProductImagesMap()

  return (res.recordset || []).map((row) => ({
    images: String(row.ProductType || '').toLowerCase() === 'retail'
      ? (imagesMap.get(row.ProductId) || (row.ImageUrl ? [String(row.ImageUrl).trim()] : []))
      : (row.ImageUrl ? [String(row.ImageUrl).trim()] : []),
    id: row.ProductId,
    name: row.Name || '',
    price: row.Price === null || row.Price === undefined ? null : Number(row.Price || 0),
    sellPriceVnd: row.SellPriceVnd === null || row.SellPriceVnd === undefined ? null : Number(row.SellPriceVnd || 0),
    minVariantSellPrice: row.MinVariantSellPrice === null || row.MinVariantSellPrice === undefined ? null : Number(row.MinVariantSellPrice || 0),
    variantPriceCount: Number(row.VariantPriceCount || 0),
    description: row.Description || '',
    imageUrl: (String(row.ProductType || '').toLowerCase() === 'retail'
      ? (imagesMap.get(row.ProductId)?.[0] || row.ImageUrl || '')
      : (row.ImageUrl || '')),
    stock: Number(row.Stock || 0),
    soldCount: Number(row.SoldCount || 0),
    averageRating: row.AverageRating === null || row.AverageRating === undefined ? null : Number(row.AverageRating),
    reviewCount: Number(row.ReviewCount || 0),
    supplier: row.Supplier || row.LotSupplier || 'Default',
    type: normalizeProductType(row.ProductType || row.ItemGroup || 'retail') || 'retail',
    unit: row.Unit || '',
    minQty: Number(row.MinQty || 0),
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
  const type = normalizeProductType(payload?.type ?? payload?.itemGroup ?? payload?.group) || 'retail'

  const schema = await getSchemaInfo()
  const categoryId = await resolveCategoryIdFromPayload(payload)
  const description = parseOptionalString(payload?.description)
  const imageUrl = parseOptionalString(payload?.imageUrl)
  const incomingImages = normalizeImageUrls(payload?.images)
  const nextImages = incomingImages.length ? incomingImages : (imageUrl ? [imageUrl] : [])
  const primaryImage = nextImages[0] || null
  const status = normalizeRetailStatus(payload?.status, { required: true })
  const supplier = parseOptionalString(payload?.supplier)
  const unit = parseOptionalString(payload?.unit)
  const minQty = parseOptionalInt(payload?.minQty)

  const hasSellPricePayload = payload?.price !== undefined || payload?.sellPriceVnd !== undefined
  const sellPrice = payload?.price !== undefined ? parseMoneyVnd(payload.price) : parseMoneyVnd(payload?.sellPriceVnd)
  const importPrice = parseMoneyVnd(payload?.importPriceVnd)

  if (minQty !== null && minQty !== undefined && (!Number.isFinite(minQty) || minQty < 0)) {
    const err = new Error('Invalid minQty')
    err.status = 400
    throw err
  }

  if (type === 'supplies') {
    const duplicate = await query(
      `SELECT TOP 1 InventoryItemId
       FROM InventoryItems
       WHERE COALESCE(ItemGroup, 'service') = 'service'
         AND InventoryItemId NOT LIKE 'retail_variant_%'
         AND LOWER(LTRIM(RTRIM(Name))) = LOWER(@name)`,
      { name }
    )
    if (duplicate.recordset?.length) {
      const err = new Error('Product name already exists')
      err.status = 409
      throw err
    }

    const id = newId()
    const columns = ['InventoryItemId', 'ProductId', 'CategoryId', 'Name', 'Unit', 'ConversionRate', 'Quantity', 'ReorderLevel', 'PriceVnd', 'ItemGroup']
    const values = ['@id', 'NULL', '@categoryId', '@name', '@unit', '1', '0', '@minQty', '@priceVnd', "'service'"]

    if (schema.inventoryHasStatus) {
      columns.push('Status')
      values.push('@status')
    }
    if (schema.inventoryHasDescription) {
      columns.push('Description')
      values.push('@description')
    }
    if (schema.inventoryHasImageUrl) {
      columns.push('ImageUrl')
      values.push('@imageUrl')
    }

    await query(
      `INSERT INTO InventoryItems (${columns.join(', ')})
       VALUES (${values.join(', ')})`,
      {
        id,
        categoryId,
        name,
        unit: unit || 'item',
        minQty: minQty === null || minQty === undefined ? 0 : minQty,
        priceVnd: importPrice !== null && importPrice !== undefined ? importPrice : 0,
        status,
        description: description === undefined ? null : description,
        imageUrl: primaryImage,
      }
    )

    return { id }
  }

  if (hasSellPricePayload && (sellPrice === null || sellPrice === undefined || !Number.isFinite(sellPrice) || sellPrice <= 0)) {
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

  const insertColumns = ['ProductId', 'Name', 'Price', 'Description', 'ImageUrl', 'Stock', 'Status', 'CategoryId']
  const insertValues = ['@id', '@name', '@price', '@description', '@imageUrl', '@stock', '@status', '@categoryId']

  if (schema.productsHasSupplier && supplier !== undefined) {
    insertColumns.push('Supplier')
    insertValues.push('@supplier')
  }
  if (schema.productsHasProductType) {
    insertColumns.push('ProductType')
    insertValues.push("'retail'")
  }

  await query(
    `INSERT INTO Products (${insertColumns.join(', ')})
     VALUES (${insertValues.join(', ')});`,
    {
      id,
      name,
      price: sellPrice !== null && sellPrice !== undefined ? sellPrice : 0,
      description: description === undefined ? null : description,
      imageUrl: primaryImage,
      stock: 0,
      status,
      categoryId,
      supplier,
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
       VALUES (@shadowId, @productId, @categoryId, @name, @unit, 1, 0, @minQty, @priceVnd, 'retail');
     END
     ELSE
     BEGIN
       UPDATE InventoryItems
       SET
         ProductId = COALESCE(@productId, ProductId),
         CategoryId = COALESCE(@categoryId, CategoryId),
         Name = COALESCE(@name, Name),
         Unit = COALESCE(@unit, Unit),
         ConversionRate = COALESCE(1, ConversionRate),
         Quantity = COALESCE(Quantity, 0),
         ReorderLevel = COALESCE(@minQty, ReorderLevel),
         PriceVnd = COALESCE(@priceVnd, PriceVnd),
         ItemGroup = 'retail'
       WHERE InventoryItemId = @shadowId;
     END`,
    {
      shadowId,
      productId: id,
      categoryId,
      name,
      unit: unit || 'sp',
      minQty: minQty === null || minQty === undefined ? 0 : minQty,
      priceVnd: importPrice !== null && importPrice !== undefined ? importPrice : null,
    }
  )

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
     ORDER BY LTRIM(RTRIM(Status)) ASC;`,
    {},
    { timeoutMs: 60000 }
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
  if (raw === 'c' || raw === 'pending' || raw === 'awaiting') return 'PENDING'
  if (raw === 'processing' || raw === 'process' || raw === 'in process' || raw === 'inprocess') return 'PROCESSING'
  if (raw === 'shipping' || raw === 'shipped' || raw === 'delivering' || raw === 'in transit' || raw === 'dang giao hang') return 'SHIPPING'
  if (raw === 'delivered') return 'CONFIRMED'
  if (raw === 'confirmed' || raw === 'customer confirmed') return 'CONFIRMED'
  if (raw === 'completed' || raw === 'complete' || raw === 'done' || raw === 'success' || raw === 'paid') return 'COMPLETED'
  if (raw === 'cancelled' || raw === 'cancel') return 'CANCELLED'
  return null
}

function canTransitionOrderStatus(from, to) {
  const fromStatus = normalizeOrderStatusInput(from)
  const toStatus = normalizeOrderStatusInput(to)
  if (!fromStatus || !toStatus) return false
  const rules = {
    PENDING: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['SHIPPING', 'CANCELLED'],
    SHIPPING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  }
  return (rules[fromStatus] || []).includes(toStatus)
}

function hasStockDeductedForStatus(statusInput) {
  const normalized = normalizeOrderStatusInput(statusInput)
  // Trạng thái đã trừ kho: PROCESSING, SHIPPING, CONFIRMED, COMPLETED
  return (
    normalized === 'PROCESSING' ||
    normalized === 'SHIPPING' ||
    normalized === 'CONFIRMED' ||
    normalized === 'COMPLETED'
  )
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

const CUSTOMER_PHONE_REGEX = /^0(3|5|7|8|9)\d{8}$/

function normalizeCustomerPhone(value) {
  const raw = String(value || '').replace(/[^\d+]/g, '').trim()
  if (!raw) return ''

  if (raw.startsWith('+84')) {
    return `0${raw.slice(3).replace(/\D/g, '')}`
  }

  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length === 11) {
    return `0${digits.slice(2)}`
  }

  return digits
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
    if (status === 'PENDING') {
      where.push(`(${alias}.Status IN ('Pending', 'C'))`)
    } else if (status === 'PROCESSING') {
      where.push(`(${alias}.Status IN ('PROCESSING', 'Processing', 'PROCESS', 'Process'))`)
    } else if (status === 'SHIPPING') {
      where.push(`(${alias}.Status IN ('Shipping', 'Shipped', 'Delivering'))`)
    } else if (status === 'CONFIRMED') {
      where.push(`(${alias}.Status IN ('CONFIRMED', 'Confirmed', 'Customer Confirmed', 'DELIVERED', 'Delivered'))`)
    } else if (status === 'COMPLETED') {
      where.push(`(${alias}.Status IN ('COMPLETED', 'Completed'))`)
    } else if (status === 'CANCELLED') {
      where.push(`(${alias}.Status IN ('CANCELLED', 'Cancelled'))`)
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
  const hasOrderItemVariantId = await columnExists('OrderItems', 'VariantId')
  const hasOrderItemVariantName = await columnExists('OrderItems', 'VariantName')

  const variantIdSelectSql = hasOrderItemVariantId
    ? ', oi.VariantId AS VariantId'
    : ', CAST(NULL AS NVARCHAR(100)) AS VariantId'
  const variantNameSelectSql = hasOrderItemVariantId
    ? (hasOrderItemVariantName
        ? ', COALESCE(oi.VariantName, pv.VariantName) AS VariantName'
        : ', pv.VariantName AS VariantName')
    : ', CAST(NULL AS NVARCHAR(255)) AS VariantName'
  const variantJoinSql = hasOrderItemVariantId
    ? 'LEFT JOIN ProductVariants pv ON pv.VariantId = oi.VariantId'
    : ''

  const itemsRes = await query(
    `SELECT
        oi.OrderItemId,
        oi.OrderId,
        oi.ProductId,
        oi.Quantity,
        oi.Price,
        oi.ProductName,
        p.ImageUrl
        ${variantIdSelectSql}
        ${variantNameSelectSql}
     FROM OrderItems oi
     LEFT JOIN Products p ON p.ProductId = oi.ProductId
     ${variantJoinSql}
     WHERE oi.OrderId = @orderId
     ORDER BY oi.OrderItemId`,
    { orderId }
  )

  return (itemsRes.recordset || []).map((item) => ({
    // Backward compatibility: old schemas may not have OrderItems.VariantName.
    // We can still infer it from a "Product - Variant" product name pattern.
    // This helps stock deduction map to the correct variant for legacy orders.
    OrderItemId: item.OrderItemId,
    OrderId: item.OrderId,
    ProductId: item.ProductId,
    ProductName: item.ProductName || '',
    VariantId: item.VariantId || null,
    VariantName: item.VariantName || inferVariantNameFromProductName(item.ProductName) || null,
    Quantity: Number(item.Quantity || 0),
    Price: Number(item.Price || 0),
    ImageUrl: item.ImageUrl || null,
    LineTotal: Number(item.Quantity || 0) * Number(item.Price || 0),
  }))
}

function normalizeLooseText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function inferVariantNameFromProductName(productName) {
  const raw = String(productName || '').trim()
  if (!raw || !raw.includes('-')) return ''
  return raw.split('-').slice(1).join('-').trim()
}

async function resolveVariantIdentityForOrderItem(item, variantCache) {
  const explicitVariantId = String(item?.VariantId || '').trim()
  const explicitVariantName = String(item?.VariantName || '').trim()
  if (explicitVariantId) {
    return {
      variantId: explicitVariantId,
      variantName: explicitVariantName || null,
    }
  }

  const productId = String(item?.ProductId || '').trim()
  if (!productId) return { variantId: null, variantName: explicitVariantName || null }

  if (!variantCache.has(productId)) {
    const res = await query(
      `SELECT VariantId, VariantName, Price
       FROM ProductVariants
       WHERE ProductId = @productId
       ORDER BY VariantName, VariantId`,
      { productId }
    )
    const variants = (res.recordset || []).map((row) => ({
      variantId: String(row.VariantId || '').trim(),
      variantName: String(row.VariantName || '').trim(),
      price: Number(row.Price || 0),
    })).filter((row) => Boolean(row.variantId))
    variantCache.set(productId, variants)
  }

  const variants = variantCache.get(productId) || []
  if (!variants.length) {
    return { variantId: null, variantName: explicitVariantName || null }
  }

  const byVariantName = normalizeLooseText(explicitVariantName)
  if (byVariantName) {
    const exact = variants.find((v) => normalizeLooseText(v.variantName) === byVariantName)
    if (exact?.variantId) return { variantId: exact.variantId, variantName: exact.variantName || null }
  }

  const suffix = normalizeLooseText(inferVariantNameFromProductName(item?.ProductName))
  if (suffix) {
    const exactSuffix = variants.find((v) => normalizeLooseText(v.variantName) === suffix)
    if (exactSuffix?.variantId) return { variantId: exactSuffix.variantId, variantName: exactSuffix.variantName || null }

    const partialSuffix = variants.find((v) => suffix.includes(normalizeLooseText(v.variantName)))
    if (partialSuffix?.variantId) return { variantId: partialSuffix.variantId, variantName: partialSuffix.variantName || null }
  }

  const itemPrice = Number(item?.Price || 0)
  if (Number.isFinite(itemPrice) && itemPrice > 0) {
    const byPrice = variants.find((v) => Math.abs(Number(v.price || 0) - itemPrice) < 0.0001)
    if (byPrice?.variantId) return { variantId: byPrice.variantId, variantName: byPrice.variantName || null }
  }

  return { variantId: null, variantName: explicitVariantName || null }
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
    Status: normalizeOrderStatusInput(row.Status) || 'PENDING',
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

  const touchedProductIds = new Set()
  const touchedVariantIds = new Set()
  const variantCache = new Map()

  for (const item of items) {
    const quantity = Number(item.Quantity || 0)
    if (quantity <= 0) continue

    const resolved = await resolveVariantIdentityForOrderItem(item, variantCache)
    const variantId = String(resolved.variantId || '').trim()
    if (variantId) {
      const variantStockRes = await query(
        `SELECT TOP 1
           COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) AS Stock,
           pv.VariantName
         FROM ProductVariants pv
         OUTER APPLY (
           SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
           FROM InventoryLots l
           WHERE l.InventoryItemId = @shadowId
         ) vlots
         WHERE pv.VariantId = @variantId
           AND pv.ProductId = @productId`,
        {
          productId: item.ProductId,
          variantId,
          shadowId: retailVariantShadowId(variantId),
        }
      )
      const variantRow = variantStockRes.recordset?.[0]
      const stock = Number(variantRow?.Stock || 0)
      if (stock < quantity) {
        const variantLabel = String(variantRow?.VariantName || resolved.variantName || item.VariantName || variantId).trim()
        const err = new Error(`Variant ${variantLabel} does not have enough stock`)
        err.status = 409
        throw err
      }
      continue
    }

    const stockRes = await query(
      'SELECT TOP 1 Stock FROM Products WHERE ProductId = @productId',
      { productId: item.ProductId }
    )
    const stock = Number(stockRes.recordset?.[0]?.Stock || 0)
    if (stock < quantity) {
      const err = new Error(`Product ${item.ProductName || item.ProductId} does not have enough stock`)
      err.status = 409
      throw err
    }
  }

  for (const item of items) {
    const productId = String(item.ProductId || '').trim()
    const quantity = Number(item.Quantity || 0)
    if (!productId || quantity <= 0) continue

    touchedProductIds.add(productId)

    const resolved = await resolveVariantIdentityForOrderItem(item, variantCache)
    const variantId = String(resolved.variantId || '').trim()
    if (variantId) {
      const shadowId = retailVariantShadowId(variantId)
      touchedVariantIds.add(variantId)

      let remainingToConsume = quantity
      const lotsRes = await query(
        `SELECT LotId, COALESCE(RemainingQty, 0) AS RemainingQty
         FROM InventoryLots
         WHERE InventoryItemId = @shadowId
           AND COALESCE(RemainingQty, 0) > 0
         ORDER BY ReceivedAt, LotId`,
        { shadowId }
      )

      for (const lot of lotsRes.recordset || []) {
        if (remainingToConsume <= 0) break
        const available = Math.max(0, Number(lot?.RemainingQty || 0))
        if (!available) continue

        const consume = Math.min(available, remainingToConsume)
        await query(
          `UPDATE InventoryLots
           SET RemainingQty = CASE WHEN COALESCE(RemainingQty, 0) - @consume < 0 THEN 0 ELSE COALESCE(RemainingQty, 0) - @consume END
           WHERE LotId = @lotId`,
          { lotId: lot.LotId, consume }
        )
        remainingToConsume -= consume
      }

      if (remainingToConsume > 0) {
        const err = new Error(`Variant ${resolved.variantName || item.VariantName || variantId} does not have enough stock`)
        err.status = 409
        throw err
      }

      await query(
        `UPDATE ProductVariants
         SET Stock = CASE WHEN COALESCE(Stock, 0) >= @quantity THEN COALESCE(Stock, 0) - @quantity ELSE 0 END
         WHERE VariantId = @variantId`,
        { variantId, quantity }
      )

      try {
        await query(
          `INSERT INTO InventoryTransactions (
             TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
             PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
           )
           VALUES (
             @txId, @shadowId, 'OUT', @quantity, @referenceId, GETDATE(),
             @performedByRole, @performedById, @performedByName, @performedByEmail
           );`,
          {
            txId: newId(),
            shadowId,
            quantity,
            referenceId: orderRef,
            performedByRole: options?.actor?.roleKey ?? null,
            performedById: options?.actor?.userId ?? null,
            performedByName: options?.actor?.name ?? null,
            performedByEmail: options?.actor?.email ?? null,
          }
        )
      } catch (err) {
        console.warn('[retail] Unable to write inventory transaction for variant order stock-out:', err?.message || err)
      }

      continue
    }

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

  for (const productId of touchedProductIds) {
    await query(
      `UPDATE p
       SET p.Stock = COALESCE(v.TotalQty, p.Stock)
       FROM Products p
       OUTER APPLY (
         SELECT SUM(COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0)) AS TotalQty
         FROM ProductVariants pv
         WHERE pv.ProductId = p.ProductId
       ) v
       WHERE p.ProductId = @productId
         AND EXISTS (SELECT 1 FROM ProductVariants pvx WHERE pvx.ProductId = p.ProductId)`,
      { productId }
    )
  }

  for (const variantId of touchedVariantIds) {
    await syncVariantShadowFromVariant(variantId)
  }

  await syncRetailInventoryByProducts([...touchedProductIds])
}

async function restoreStockForOrder(orderId) {
  const items = await getOrderItems(orderId)
  const touchedProductIds = new Set()
  const touchedVariantIds = new Set()
  const variantCache = new Map()

  for (const item of items) {
    const productId = String(item.ProductId || '').trim()
    const quantity = Number(item.Quantity || 0)
    if (!productId || quantity <= 0) continue
    touchedProductIds.add(productId)

    const resolved = await resolveVariantIdentityForOrderItem(item, variantCache)
    const variantId = String(resolved.variantId || '').trim()
    if (variantId) {
      const shadowId = retailVariantShadowId(variantId)
      touchedVariantIds.add(variantId)

      await query(
        `UPDATE ProductVariants
         SET Stock = COALESCE(Stock, 0) + @quantity
         WHERE VariantId = @variantId`,
        {
          variantId,
          quantity,
        }
      )

      await query(
        `INSERT INTO InventoryLots (InventoryItemId, ReceivedQty, RemainingQty, PriceVnd, ReceivedAt, ExpiryDate, Supplier, Note)
         VALUES (@shadowId, @qty, @qty, 0, GETDATE(), NULL, NULL, @note);`,
        {
          shadowId,
          qty: quantity,
          note: `[Variant: ${String(resolved.variantName || item.VariantName || '').trim() || DEFAULT_RETAIL_VARIANT_NAME}] Restored from cancelled order ${orderId}`,
        }
      )

      try {
        await query(
          `INSERT INTO InventoryTransactions (InventoryItemId, Type, Quantity, PriceVnd, [Date], Note)
           VALUES (@shadowId, 'IN', @qty, 0, GETDATE(), @note);`,
          {
            shadowId,
            qty: quantity,
            note: `Restored stock from cancelled order ${orderId}`,
          }
        )
      } catch (err) {
        console.warn('[retail] Unable to write inventory transaction for variant restore:', err?.message || err)
      }

      continue
    }

    await query(
      `UPDATE Products
       SET Stock = ISNULL(Stock, 0) + @quantity
       WHERE ProductId = @productId`,
      {
        productId,
        quantity,
      }
    )
  }

  for (const productId of touchedProductIds) {
    await query(
      `UPDATE p
       SET p.Stock = COALESCE(v.TotalQty, p.Stock)
       FROM Products p
       OUTER APPLY (
         SELECT SUM(COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0)) AS TotalQty
         FROM ProductVariants pv
         WHERE pv.ProductId = p.ProductId
       ) v
       WHERE p.ProductId = @productId
         AND EXISTS (SELECT 1 FROM ProductVariants pvx WHERE pvx.ProductId = p.ProductId)`,
      { productId }
    )
  }

  for (const variantId of touchedVariantIds) {
    await syncVariantShadowFromVariant(variantId)
  }

  await syncRetailInventoryByProducts([...touchedProductIds])
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
  const hasOrderItemVariantId = await columnExists('OrderItems', 'VariantId')
  const hasOrderItemVariantName = await columnExists('OrderItems', 'VariantName')
  const hasVariantPrice = await columnExists('ProductVariants', 'Price')
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const normalizedItems = rawItems
    .map((item) => ({
      productId: String(item?.productId || '').trim(),
      variantId: String(item?.variantId || '').trim(),
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
    const key = `${line.productId}::${line.variantId || ''}`
    dedupMap.set(key, (dedupMap.get(key) || 0) + line.quantity)
  }
  const dedupItems = [...dedupMap.entries()].map(([key, quantity]) => {
    const splitIndex = key.indexOf('::')
    const productId = splitIndex >= 0 ? key.slice(0, splitIndex) : key
    const variantId = splitIndex >= 0 ? key.slice(splitIndex + 2) : ''
    return { productId, variantId, quantity }
  })

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

    let unitPrice = Number(row.Price || 0)
    let productStock = Number(row.Stock || 0)
    let variantId = ''
    let variantName = null

    if (schema.hasProductVariants) {
      const hasVariantsRes = await query(
        `SELECT TOP 1 1 AS HasVariants
         FROM ProductVariants
         WHERE ProductId = @productId`,
        { productId: line.productId }
      )
      const hasVariants = Boolean(hasVariantsRes.recordset?.length)

      if (hasVariants) {
        variantId = String(line.variantId || '').trim()
        if (!variantId) {
          const err = new Error(`Product ${row.Name || row.ProductId} requires a variant selection`)
          err.status = 400
          throw err
        }

        const variantRes = await query(
          `SELECT TOP 1
             pv.VariantId,
             pv.VariantName,
             ${hasVariantPrice ? 'COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Price), TRY_CONVERT(DECIMAL(19,2), p.Price), 0)' : 'COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Price), 0)'} AS Price,
             COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) AS Stock
           FROM ProductVariants pv
           INNER JOIN Products p ON p.ProductId = pv.ProductId
           OUTER APPLY (
             SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
             FROM InventoryLots l
             WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
           ) vlots
           WHERE pv.ProductId = @productId
             AND pv.VariantId = @variantId`,
          {
            productId: line.productId,
            variantId,
          }
        )

        const variant = variantRes.recordset?.[0]
        if (!variant) {
          const err = new Error(`Variant not found for product ${row.Name || row.ProductId}`)
          err.status = 404
          throw err
        }

        variantName = String(variant.VariantName || '').trim() || null
        unitPrice = Number(variant.Price || row.Price || 0)
        productStock = Number(variant.Stock || 0)
      }
    }

    if (productStock < line.quantity) {
      const itemLabel = variantName
        ? `${row.Name || row.ProductId} - ${variantName}`
        : (row.Name || row.ProductId)
      const err = new Error(`Product ${itemLabel} does not have enough stock`)
      err.status = 409
      throw err
    }

    const displayName = variantName
      ? `${String(row.Name || '').trim()} - ${variantName}`.trim()
      : (row.Name || '')

    resolvedItems.push({
      productId: row.ProductId,
      productName: displayName,
      baseProductName: row.Name || '',
      variantId: variantId || null,
      variantName,
      price: unitPrice,
      quantity: line.quantity,
    })
  }

  const subtotal = resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const total = subtotal
  const customerName = normalizeOptionalCustomerText(payload.customerName, 120)
  const customerPhone = normalizeCustomerPhone(payload.customerPhone)
  const customerAddress = normalizeOptionalCustomerText(payload.customerAddress, 300)
  const paymentMethod = normalizeRetailPaymentMethod(payload.paymentMethod)
  const inputStatus = normalizeOrderStatusInput(payload.status)
  const status = inputStatus || 'PENDING'

  if (!customerName) {
    const err = new Error('Customer name is required')
    err.status = 400
    throw err
  }

  if (!customerPhone) {
    const err = new Error('Phone number is required')
    err.status = 400
    throw err
  }

  if (!CUSTOMER_PHONE_REGEX.test(customerPhone)) {
    const err = new Error('Phone number must be a valid Vietnamese phone number')
    err.status = 400
    throw err
  }

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
    const insertColumns = ['OrderItemId', 'OrderId', 'ProductId', 'Quantity', 'Price', 'ProductName']
    const insertValues = ['@orderItemId', '@orderId', '@productId', '@quantity', '@price', '@productName']

    if (hasOrderItemVariantId) {
      insertColumns.push('VariantId')
      insertValues.push('@variantId')
    }
    if (hasOrderItemVariantName) {
      insertColumns.push('VariantName')
      insertValues.push('@variantName')
    }

    await query(
      `INSERT INTO OrderItems (${insertColumns.join(', ')})
       VALUES (${insertValues.join(', ')})`,
      {
        orderItemId: `OI-${newId()}`,
        orderId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        productName: item.productName,
        variantId: hasOrderItemVariantId ? item.variantId : undefined,
        variantName: hasOrderItemVariantName ? item.variantName : undefined,
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

  const currentStatus = normalizeOrderStatusInput(current.Status) || 'PENDING'
  const nextStatus = payload.status !== undefined ? normalizeOrderStatusInput(payload.status) : null
  if (payload.status !== undefined && !nextStatus) {
    const err = new Error('Invalid status')
    err.status = 400
    throw err
  }

  // Chỉ cho phép sang COMPLETED khi đã CONFIRMED
  if (nextStatus && nextStatus !== currentStatus) {
    if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
      const err = new Error(`Invalid status transition: ${currentStatus} -> ${nextStatus}`)
      err.status = 409
      throw err
    }

    const hadStockDeducted = hasStockDeductedForStatus(currentStatus)
    const shouldDeductStock = hasStockDeductedForStatus(nextStatus)

    if (!hadStockDeducted && shouldDeductStock) {
      await decreaseStockForOrder(orderId, { actor, referenceId: orderId })
    }

    if (hadStockDeducted && !shouldDeductStock) {
      await restoreStockForOrder(orderId)
    }

    // Chỉ cho phép sang COMPLETED nếu trạng thái hiện tại là CONFIRMED
    if (nextStatus === 'COMPLETED' && currentStatus !== 'CONFIRMED') {
      const err = new Error('Order must be CONFIRMED by customer before completing')
      err.status = 409
      throw err
    }

    if (nextStatus === 'COMPLETED') {
      const items = await getOrderItems(orderId)
      await syncRetailInventoryByProducts(items.map((x) => x.ProductId))
    }
  }

  const customerName = payload.customerName !== undefined ? normalizeOptionalCustomerText(payload.customerName, 120) : undefined
  const customerPhone = payload.customerPhone !== undefined ? normalizeCustomerPhone(payload.customerPhone) : undefined
  const customerAddress = payload.customerAddress !== undefined ? parseOptionalString(payload.customerAddress) : undefined
  const paymentMethod = payload.paymentMethod !== undefined ? parseOptionalString(payload.paymentMethod) : undefined

  const hasCustomerFields = payload.customerName !== undefined || payload.customerPhone !== undefined
  if (hasCustomerFields) {
    if (!customerName) {
      const err = new Error('Customer name is required')
      err.status = 400
      throw err
    }
    if (!customerPhone) {
      const err = new Error('Phone number is required')
      err.status = 400
      throw err
    }
    if (!CUSTOMER_PHONE_REGEX.test(customerPhone)) {
      const err = new Error('Phone number must be a valid Vietnamese phone number')
      err.status = 400
      throw err
    }
  }

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
  if (userId && nextStatus && nextStatus !== currentStatus) {
    const statusMap = {
      PENDING: 'order_processing',
      PROCESSING: 'order_processing',
      SHIPPING: 'order_shipping',
      COMPLETED: 'order_delivered',
      CANCELLED: 'order_cancelled',
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

async function transitionRetailOrderStatus(orderIdInput, targetStatusInput, { actor } = {}) {
  const orderId = String(orderIdInput || '').trim()
  const targetStatus = normalizeOrderStatusInput(targetStatusInput)

  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  if (!targetStatus) {
    const err = new Error('Invalid target status')
    err.status = 400
    throw err
  }

  return updateRetailOrder(orderId, { status: targetStatus }, { actor })
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

async function deductRetailOrderStock(orderIdInput, options = {}) {
  const orderId = String(orderIdInput || '').trim()
  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }
  await decreaseStockForOrder(orderId, options)
}

async function restoreRetailOrderStock(orderIdInput) {
  const orderId = String(orderIdInput || '').trim()
  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }
  await restoreStockForOrder(orderId)
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
  transitionRetailOrderStatus,
  deleteRetailOrder,
  deductRetailOrderStock,
  restoreRetailOrderStock,
}
