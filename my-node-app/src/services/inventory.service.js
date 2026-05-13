const { query, newId, sql } = require('../config/query')
const { getPool } = require('../config/db')
const XLSX = require('xlsx')
const ExcelJS = require('exceljs')
const {
  toInventoryItem,
  toInventoryHistoryItem,
} = require('../models/inventory.model')

let _schemaInfoPromise = null
let _legacyVariantShadowCleanupPromise = null
const MAX_INVENTORY_QTY = 99999999
const MAX_PRICE_VND = 9999999999
const MAX_REFERENCE_ID_LEN = 50
const DEFAULT_RETAIL_VARIANT_NAME = 'Default'
const INVENTORY_IMPORT_COLUMNS = [
  'ProductName',
  'Category',
  'Type',
  'Unit',
  'ImportPrice',
  'SellPrice',
  'StockQuantity',
  'MinStock',
  'SupplierName',
  'ReceivedDate',
  'ExpiryDate',
  'Description',
  'Variant',
]

function validateMaxNumber(value, field, max, { min = 0, integer = false } = {}) {
  if (value === null || value === undefined) return
  if (!Number.isFinite(value)) {
    const err = new Error(`Invalid ${field}`)
    err.status = 400
    throw err
  }
  if (integer && !Number.isInteger(value)) {
    const err = new Error(`Invalid ${field}`)
    err.status = 400
    throw err
  }
  if (value < min || value > max) {
    const err = new Error(`${field} must be between ${min} and ${max}`)
    err.status = 400
    throw err
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
      console.warn('[inventory] cleanupLegacyVariantShadowRows failed:', err?.message || err)
    }
  })()
  return _legacyVariantShadowCleanupPromise
}

async function initializeInventoryService() {
  // Run cleanup once at startup to fix any legacy data
  console.log('[inventory] Running startup cleanup for legacy variant shadows...')
  try {
    await cleanupLegacyVariantShadowRows()
    console.log('[inventory] Startup cleanup completed')
  } catch (err) {
    console.warn('[inventory] Startup cleanup failed:', err?.message || err)
  }
}

async function getSchemaInfo() {
  if (_schemaInfoPromise) {
    return _schemaInfoPromise
  }
  _schemaInfoPromise = (async () => {
    const [
      productsHasCategoryId,
      inventoryHasCategoryId,
      hasProductCategories,
      hasProductVariants,
      productsHasStatus,
      inventoryHasStatus,
      productsHasImageUrl,
      inventoryHasImageUrl,
      inventoryHasDescription,
      hasProductImages,
    ] = await Promise.all([
      columnExists('Products', 'CategoryId'),
      columnExists('InventoryItems', 'CategoryId'),
      tableExists('ProductCategories'),
      tableExists('ProductVariants'),
      columnExists('Products', 'Status'),
      columnExists('InventoryItems', 'Status'),
      columnExists('Products', 'ImageUrl'),
      columnExists('InventoryItems', 'ImageUrl'),
      columnExists('InventoryItems', 'Description'),
      tableExists('ProductImages'),
    ])

    return {
      productsHasCategoryId,
      inventoryHasCategoryId,
      hasProductCategories,
      hasProductVariants,
      productsHasStatus,
      inventoryHasStatus,
      productsHasImageUrl,
      inventoryHasImageUrl,
      inventoryHasDescription,
      hasProductImages,
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
     WHERE LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), Name)))) = @name`,
    { name: categoryName.toLowerCase() }
  )
  return found.recordset?.[0]?.CategoryId ?? null
}

async function getCategoryNamesForImportTemplate() {
  const schema = await getSchemaInfo()
  if (!schema.hasProductCategories) return []
  const result = await query(
    `SELECT Name
     FROM ProductCategories
     WHERE LTRIM(RTRIM(CONVERT(NVARCHAR(255), Name))) <> ''
     ORDER BY Name ASC`
  )
  return (result.recordset || [])
    .map((r) => String(r?.Name || '').trim())
    .filter(Boolean)
}

async function ensureUniqueItemName(name, schema) {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized) return

  const existingInventory = await query(
    `SELECT TOP 1 InventoryItemId
     FROM InventoryItems
     WHERE LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), Name)))) = @name
       ${schema.inventoryHasStatus
        ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete'))"
        : "AND COALESCE(ItemGroup, 'service') <> 'deleted'"}`,
    { name: normalized }
  )
  if (existingInventory.recordset?.length) {
    const err = new Error('Name already exists')
    err.status = 400
    throw err
  }

  const existingProduct = await query(
    `SELECT TOP 1 ProductId
     FROM Products
     WHERE LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), Name)))) = @name
       ${schema.productsHasStatus
        ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete'))"
        : ''}`,
    { name: normalized }
  )
  if (existingProduct.recordset?.length) {
    const err = new Error('Name already exists')
    err.status = 400
    throw err
  }
}

function parseOptionalDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null

  // Date input from browser is usually YYYY-MM-DD; parse it as local date
  // to avoid UTC conversion shifting and false "future" validation.
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  let d = null
  if (dateOnlyMatch) {
    const y = Number(dateOnlyMatch[1])
    const m = Number(dateOnlyMatch[2])
    const day = Number(dateOnlyMatch[3])
    d = new Date(y, m - 1, day, 0, 0, 0, 0)
  } else {
    d = new Date(raw)
  }
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
  const raw = String(value).trim()
  const d = parseOptionalDate(raw)
  if (!d) {
    const err = new Error(`Invalid ${fieldName}`)
    err.status = 400
    throw err
  }

  const isDateOnlyInput = /^(\d{4})-(\d{2})-(\d{2})$/.test(raw)
  const now = new Date()
  if (isDateOnlyInput) {
    const [y, m, day] = raw.split('-').map((x) => Number(x))
    const inputDate = new Date(y, m - 1, day)
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Tolerate up to 2 days drift between client and server local calendars.
    const allowedDate = new Date(todayDate)
    allowedDate.setDate(allowedDate.getDate() + 2)

    if (inputDate.getTime() > allowedDate.getTime()) {
      const err = new Error(`${fieldName} cannot be in the future`)
      err.status = 400
      throw err
    }
    return inputDate
  }

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

function normalizeReferenceId(value) {
  const raw = parseOptionalString(value)
  if (!raw) return null
  return raw.slice(0, MAX_REFERENCE_ID_LEN)
}

function extractVariantFromLotNote(note) {
  const raw = String(note || '').trim()
  if (!raw) return ''
  const m = raw.match(/^\[\s*Variant\s*:\s*([^\]]+)\]/i)
  if (!m) return ''
  return String(m[1] || '').trim()
}

function normalizeVariantLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function parseNonNegativeDecimal(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return value
  }
  const raw = String(value).trim()
  if (!raw) return null
  const normalized = raw.replace(/,/g, '')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n
}

function parseNonNegativeInt(value) {
  const n = parseNonNegativeDecimal(value)
  if (n === null || !Number.isInteger(n)) return null
  return n
}

function normalizeImportType(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'supplies') return 'service'
  if (raw === 'retail') return 'retail'
  return null
}

function parseExcelDateValue(value) {
  if (value === undefined || value === null || value === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value
  }

  if (typeof value === 'number') {
    const decoded = XLSX.SSF.parse_date_code(value)
    if (!decoded || !decoded.y || !decoded.m || !decoded.d) return null
    return new Date(decoded.y, decoded.m - 1, decoded.d)
  }

  const raw = String(value).trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mon = Number(m[2])
  const d = Number(m[3])
  const date = new Date(y, mon - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mon - 1 || date.getDate() !== d) return null
  return date
}

function formatDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateOnlyForImport(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${m}-${d}-${y}`
}

function normalizeBase64Payload(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const idx = raw.indexOf('base64,')
  if (idx >= 0) return raw.slice(idx + 7)
  return raw
}

function normalizeExportGroup(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'service' || raw === 'supplies') return 'service'
  if (raw === 'retail' || raw === 'product') return 'retail'
  return 'all'
}

function normalizeHistoryTypeFilter(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw || raw === 'all') return 'all'
  if (raw === 'stock in' || raw === 'in') return 'stock in'
  if (raw === 'stock out' || raw === 'out') return 'stock out'
  if (raw === 'lot adjust' || raw === 'adjust') return 'lot adjust'
  if (raw === 'lot delete' || raw === 'delete') return 'lot delete'
  return 'all'
}

function parseDateBoundary(value, endOfDay = false) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null

  const y = Number(m[1])
  const mon = Number(m[2])
  const day = Number(m[3])
  const d = new Date(y, mon - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function parseDmyDate(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const mon = Number(m[2])
  const y = Number(m[3])
  const d = new Date(y, mon - 1, day, 12, 0, 0, 0)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function safeExcelText(value) {
  const text = String(value ?? '')
  if (!text) return ''
  if (/^[=+\-@]/.test(text)) return `'${text}`
  return text
}

function isVariantInventoryItem(item) {
  return String(item?.skuType || '').toLowerCase() === 'variant' || Boolean(item?.variantId)
}

async function findExistingItemByName(name, schema) {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized) return null

  const inv = await query(
    `SELECT TOP 1 InventoryItemId, Quantity
     FROM InventoryItems
     WHERE COALESCE(ItemGroup, 'service') = 'service'
       AND LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), Name)))) = @name
       ${schema.inventoryHasStatus
        ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete'))"
        : ''}`,
    { name: normalized }
  )
  if (inv.recordset?.length) {
    return {
      kind: 'inventory',
      id: inv.recordset[0].InventoryItemId,
      stock: Number(inv.recordset[0].Quantity || 0),
      type: 'service',
    }
  }

  const prod = await query(
    `SELECT TOP 1 ProductId, Stock
     FROM Products
     WHERE LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), Name)))) = @name
       ${schema.productsHasStatus
        ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete'))"
        : ''}`,
    { name: normalized }
  )
  if (prod.recordset?.length) {
    return {
      kind: 'product',
      id: prod.recordset[0].ProductId,
      stock: Number(prod.recordset[0].Stock || 0),
      type: 'retail',
    }
  }

  return null
}

async function ensureRetailVariantByName(productId, variantName) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductVariants) {
    const err = new Error('ProductVariants table not found')
    err.status = 400
    throw err
  }

  const normalizedVariant = normalizeRequiredSafeText(variantName, 'Variant', 120)
  const found = await query(
    `SELECT TOP 1 VariantId
     FROM ProductVariants
     WHERE ProductId = @productId
       AND LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), VariantName)))) = @name`,
    {
      productId,
      name: normalizedVariant.toLowerCase(),
    }
  )

  const existingVariantId = found.recordset?.[0]?.VariantId
  if (existingVariantId) return existingVariantId

  const id = newId()
  await query(
    `INSERT INTO ProductVariants (VariantId, ProductId, VariantName, Stock)
     VALUES (@id, @productId, @name, 0)`,
    {
      id,
      productId,
      name: normalizedVariant,
    }
  )
  return id
}

async function getRetailVariantCount(productId) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductVariants) return 0
  const res = await query(
    `SELECT COUNT(1) AS Total
     FROM ProductVariants
     WHERE ProductId = @productId`,
    { productId }
  )
  return Number(res.recordset?.[0]?.Total || 0)
}

async function getInventoryImportTemplateBuffer() {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('InventoryImportTemplate')
  const listSheet = workbook.addWorksheet('__lists')
  const categories = await getCategoryNamesForImportTemplate()

  ws.columns = [
    { header: 'ProductName', key: 'ProductName', width: 28 },
    { header: 'Category', key: 'Category', width: 24 },
    { header: 'Type', key: 'Type', width: 14 },
    { header: 'Unit', key: 'Unit', width: 14 },
    { header: 'ImportPrice', key: 'ImportPrice', width: 14 },
    { header: 'SellPrice', key: 'SellPrice', width: 14 },
    { header: 'StockQuantity', key: 'StockQuantity', width: 14 },
    { header: 'MinStock', key: 'MinStock', width: 12 },
    { header: 'SupplierName', key: 'SupplierName', width: 24 },
    { header: 'ReceivedDate', key: 'ReceivedDate', width: 14 },
    { header: 'ExpiryDate', key: 'ExpiryDate', width: 14 },
    { header: 'Description', key: 'Description', width: 36 },
    { header: 'Variant', key: 'Variant', width: 24 },
  ]

  ws.addRow({
    ProductName: 'Acetone 500ml',
    Category: categories[0] || 'Nail Remover',
    Type: 'Supplies',
    Unit: 'bottle',
    ImportPrice: 120000,
    SellPrice: null,
    StockQuantity: 20,
    MinStock: 5,
    SupplierName: 'Beauty Supply Co',
    ReceivedDate: '2026-03-10',
    ExpiryDate: '2027-12-31',
    Description: 'Salon acetone for removing gel polish.',
    Variant: '500ml',
  })

  ws.addRow({
    ProductName: 'Gel Polish Red #12',
    Category: categories[1] || categories[0] || 'Gel Polish',
    Type: 'Retail',
    Unit: 'bottle',
    ImportPrice: 45000,
    SellPrice: 69000,
    StockQuantity: 15,
    MinStock: 3,
    SupplierName: '',
    ReceivedDate: '2026-03-11',
    ExpiryDate: '',
    Description: 'Retail gel polish item.',
    Variant: 'Red #12',
  })

  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const headerRow = ws.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE6D4' } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB79F6A' } },
      left: { style: 'thin', color: { argb: 'FFB79F6A' } },
      bottom: { style: 'thin', color: { argb: 'FFB79F6A' } },
      right: { style: 'thin', color: { argb: 'FFB79F6A' } },
    }
  })

  for (let r = 2; r <= 300; r += 1) {
    for (let c = 1; c <= INVENTORY_IMPORT_COLUMNS.length; c += 1) {
      const cell = ws.getCell(r, c)
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD4C3A1' } },
        left: { style: 'thin', color: { argb: 'FFD4C3A1' } },
        bottom: { style: 'thin', color: { argb: 'FFD4C3A1' } },
        right: { style: 'thin', color: { argb: 'FFD4C3A1' } },
      }
    }
  }

  ws.getColumn('E').numFmt = '#,##0.00'
  ws.getColumn('F').numFmt = '#,##0.00'
  ws.getColumn('G').numFmt = '0'
  ws.getColumn('H').numFmt = '0'

  listSheet.getCell('A1').value = 'Supplies'
  listSheet.getCell('A2').value = 'Retail'
  const categoryList = categories.length ? categories : ['NoCategoryConfigured']
  categoryList.forEach((name, idx) => {
    listSheet.getCell(idx + 1, 2).value = name
  })
  listSheet.state = 'veryHidden'

  for (let r = 2; r <= 300; r += 1) {
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['=__lists!$A$1:$A$2'],
      showErrorMessage: true,
      errorTitle: 'Invalid Type',
      error: 'Type must be Supplies or Retail.',
    }

    ws.getCell(`B${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`=__lists!$B$1:$B$${Math.max(1, categoryList.length)}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Please select a category from the dropdown list.',
    }

    ws.getCell(`J${r}`).dataValidation = {
      type: 'date',
      operator: 'greaterThan',
      allowBlank: true,
      formulae: [new Date('1900-01-01')],
      showErrorMessage: true,
      errorTitle: 'Invalid Date',
      error: 'Use date format yyyy-MM-dd.',
    }

    ws.getCell(`K${r}`).dataValidation = {
      type: 'date',
      operator: 'greaterThan',
      allowBlank: true,
      formulae: [new Date('1900-01-01')],
      showErrorMessage: true,
      errorTitle: 'Invalid Date',
      error: 'Use date format yyyy-MM-dd.',
    }
  }

  const arr = await workbook.xlsx.writeBuffer()
  return Buffer.from(arr)
}

async function getInventorySnapshotExportBuffer(filters = {}) {
  const data = await getInventory()
  const queryText = String(filters?.q || filters?.query || '').trim().toLowerCase()
  const categoryFilter = String(filters?.category || 'all').trim().toLowerCase()
  const stockState = String(filters?.stockState || 'all').trim().toLowerCase()
  const groupFilter = normalizeExportGroup(filters?.group)

  let items = (Array.isArray(data?.items) ? data.items : []).filter((i) => !isVariantInventoryItem(i))
  if (groupFilter !== 'all') {
    items = items.filter((i) => String(i?.group || '').toLowerCase() === groupFilter)
  }

  if (queryText) {
    items = items.filter((i) => {
      const name = String(i?.name || '').toLowerCase()
      const category = String(i?.category || '').toLowerCase()
      return name.includes(queryText) || category.includes(queryText)
    })
  }

  if (categoryFilter && categoryFilter !== 'all') {
    items = items.filter((i) => String(i?.category || '').trim().toLowerCase() === categoryFilter)
  }

  if (stockState !== 'all') {
    items = items.filter((i) => {
      const stock = Number(i?.stock || 0)
      const minQty = Number(i?.minQty || 0)
      if (stockState === 'out') return stock <= 0
      if (stockState === 'low') return stock > 0 && minQty > 0 && stock <= minQty
      if (stockState === 'healthy') return stock > 0 && (minQty <= 0 || stock > minQty)
      return true
    })
  }

  items.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }))

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Inventory Snapshot')
  ws.columns = [
    { header: 'No', key: 'no', width: 8 },
    { header: 'ProductId', key: 'productId', width: 24 },
    { header: 'ProductName', key: 'name', width: 34 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Unit', key: 'unit', width: 12 },
    { header: 'CurrentStock', key: 'stock', width: 14 },
    { header: 'MinStock', key: 'minQty', width: 12 },
    { header: 'StockState', key: 'stockState', width: 14 },
    { header: 'ImportPriceVnd', key: 'importPriceVnd', width: 16 },
    { header: 'SellPriceVnd', key: 'sellPriceVnd', width: 14 },
    { header: 'StockValueVnd', key: 'stockValueVnd', width: 16 },
    { header: 'LastStockIn', key: 'lastIn', width: 16 },
  ]

  const now = new Date()
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx]
    const stock = Number(item?.stock || 0)
    const minQty = Number(item?.minQty || 0)
    const importPrice = Number(item?.priceVnd || 0)
    const stockStateLabel = stock <= 0 ? 'Out' : (minQty > 0 && stock <= minQty ? 'Low' : 'Healthy')
    ws.addRow({
      no: idx + 1,
      productId: safeExcelText(item?.productId || item?.id || ''),
      name: safeExcelText(item?.name || ''),
      type: String(item?.group || '').toLowerCase() === 'retail' ? 'Retail' : 'Supplies',
      category: safeExcelText(item?.category || ''),
      unit: safeExcelText(item?.unit || ''),
      stock,
      minQty,
      stockState: stockStateLabel,
      importPriceVnd: importPrice,
      sellPriceVnd: item?.sellPriceVnd === null || item?.sellPriceVnd === undefined ? null : Number(item.sellPriceVnd),
      stockValueVnd: Number.isFinite(importPrice) ? stock * importPrice : null,
      lastIn: safeExcelText(item?.lastIn || ''),
    })
  }

  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.getColumn('J').numFmt = '#,##0'
  ws.getColumn('K').numFmt = '#,##0'
  ws.getColumn('L').numFmt = '#,##0'
  ws.getCell('A1').note = `Generated at ${now.toISOString()}`

  const arr = await workbook.xlsx.writeBuffer()
  return Buffer.from(arr)
}

async function getInventoryMovementExportBuffer(filters = {}) {
  const data = await getInventory()
  const allItems = Array.isArray(data?.items) ? data.items : []
  const displayItems = allItems.filter((i) => !isVariantInventoryItem(i))

  const groupFilter = normalizeExportGroup(filters?.group)
  const queryText = String(filters?.q || filters?.query || '').trim().toLowerCase()
  const typeFilter = normalizeHistoryTypeFilter(filters?.historyType || filters?.type)
  const from = parseDateBoundary(filters?.fromDate, false)
  const to = parseDateBoundary(filters?.toDate, true)

  let history = Array.isArray(data?.history) ? data.history : []

  if (groupFilter !== 'all') {
    const allowedNameSet = new Set(
      displayItems
        .filter((i) => String(i?.group || '').toLowerCase() === groupFilter)
        .map((i) => String(i?.name || '').trim().toLowerCase())
        .filter(Boolean)
    )
    history = history.filter((h) => allowedNameSet.has(String(h?.product || '').trim().toLowerCase()))
  }

  if (queryText) {
    history = history.filter((h) => {
      const product = String(h?.product || '').toLowerCase()
      const note = String(h?.note || '').toLowerCase()
      return product.includes(queryText) || note.includes(queryText)
    })
  }

  if (typeFilter !== 'all') {
    history = history.filter((h) => String(h?.type || '').trim().toLowerCase() === typeFilter)
  }

  if (from || to) {
    history = history.filter((h) => {
      const d = parseDmyDate(h?.date)
      if (!d) return false
      if (from && d.getTime() < from.getTime()) return false
      if (to && d.getTime() > to.getTime()) return false
      return true
    })
  }

  history.sort((a, b) => {
    const da = parseDmyDate(a?.date)?.getTime() || 0
    const db = parseDmyDate(b?.date)?.getTime() || 0
    return db - da
  })

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Inventory Movement')
  ws.columns = [
    { header: 'No', key: 'no', width: 8 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Product', key: 'product', width: 34 },
    { header: 'Quantity', key: 'qty', width: 12 },
    { header: 'UnitCostVnd', key: 'unitCostVnd', width: 14 },
    { header: 'TotalValueVnd', key: 'totalVnd', width: 16 },
    { header: 'PerformedBy', key: 'by', width: 24 },
    { header: 'Note', key: 'note', width: 42 },
  ]

  for (let idx = 0; idx < history.length; idx += 1) {
    const row = history[idx]
    const qty = Number(row?.qty || 0)
    const unitCost = Number.isFinite(Number(row?.unitCost)) ? Number(row.unitCost) : null
    const totalVnd = Number.isFinite(Number(row?.totalVnd))
      ? Number(row.totalVnd)
      : (Number.isFinite(unitCost) ? Math.abs(qty) * unitCost : null)

    ws.addRow({
      no: idx + 1,
      date: safeExcelText(row?.date || ''),
      type: safeExcelText(row?.type || ''),
      product: safeExcelText(row?.product || ''),
      qty,
      unitCostVnd: unitCost,
      totalVnd,
      by: safeExcelText(row?.by || 'System'),
      note: safeExcelText(row?.note || ''),
    })
  }

  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.getColumn('F').numFmt = '#,##0'
  ws.getColumn('G').numFmt = '#,##0'

  const arr = await workbook.xlsx.writeBuffer()
  return Buffer.from(arr)
}

async function getInventoryLowStockExportBuffer(filters = {}) {
  const data = await getInventory()
  const queryText = String(filters?.q || filters?.query || '').trim().toLowerCase()
  const categoryFilter = String(filters?.category || 'all').trim().toLowerCase()
  const groupFilter = normalizeExportGroup(filters?.group)

  let items = (Array.isArray(data?.items) ? data.items : []).filter((i) => !isVariantInventoryItem(i))
  if (groupFilter !== 'all') {
    items = items.filter((i) => String(i?.group || '').toLowerCase() === groupFilter)
  }

  if (queryText) {
    items = items.filter((i) => {
      const name = String(i?.name || '').toLowerCase()
      const category = String(i?.category || '').toLowerCase()
      return name.includes(queryText) || category.includes(queryText)
    })
  }

  if (categoryFilter && categoryFilter !== 'all') {
    items = items.filter((i) => String(i?.category || '').trim().toLowerCase() === categoryFilter)
  }

  items = items.filter((i) => {
    const stock = Number(i?.stock || 0)
    const minQty = Number(i?.minQty || 0)
    return stock <= 0 || (minQty > 0 && stock <= minQty)
  })

  items.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }))

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Low Stock Alert')
  ws.columns = [
    { header: 'No', key: 'no', width: 8 },
    { header: 'ProductId', key: 'productId', width: 24 },
    { header: 'ProductName', key: 'name', width: 34 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'CurrentStock', key: 'stock', width: 14 },
    { header: 'MinStock', key: 'minQty', width: 12 },
    { header: 'AlertLevel', key: 'alertLevel', width: 14 },
    { header: 'GapToMin', key: 'gapToMin', width: 12 },
    { header: 'LastStockIn', key: 'lastIn', width: 16 },
  ]

  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx]
    const stock = Number(item?.stock || 0)
    const minQty = Number(item?.minQty || 0)
    const isOut = stock <= 0
    const alertLevel = isOut ? 'Out of stock' : 'Low stock'
    const gapToMin = minQty > 0 ? (minQty - stock) : null

    ws.addRow({
      no: idx + 1,
      productId: safeExcelText(item?.productId || item?.id || ''),
      name: safeExcelText(item?.name || ''),
      type: String(item?.group || '').toLowerCase() === 'retail' ? 'Retail' : 'Supplies',
      category: safeExcelText(item?.category || ''),
      stock,
      minQty,
      alertLevel,
      gapToMin,
      lastIn: safeExcelText(item?.lastIn || ''),
    })
  }

  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const arr = await workbook.xlsx.writeBuffer()
  return Buffer.from(arr)
}

async function importInventoryFromExcel(payload, { actor } = {}) {
  const schema = await getSchemaInfo()
  const duplicateModeRaw = String(payload?.duplicateMode || 'update').trim().toLowerCase()
  const duplicateMode = duplicateModeRaw === 'reject' ? 'reject' : 'update'
  const updatePrices = payload?.updatePrices !== false
  const base64 = normalizeBase64Payload(payload?.fileBase64)
  if (!base64) {
    const err = new Error('Missing fileBase64')
    err.status = 400
    throw err
  }

  let wb
  try {
    const buf = Buffer.from(base64, 'base64')
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  } catch {
    const err = new Error('Invalid Excel file')
    err.status = 400
    throw err
  }

  const firstSheet = wb?.SheetNames?.[0]
  if (!firstSheet) {
    const err = new Error('Excel file has no sheets')
    err.status = 400
    throw err
  }

  const ws = wb.Sheets[firstSheet]
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false })
  if (!Array.isArray(matrix) || matrix.length === 0) {
    const err = new Error('Excel file is empty')
    err.status = 400
    throw err
  }

  const header = (matrix[0] || []).map((x) => String(x || '').trim())
  const strictHeaderOk =
    header.length === INVENTORY_IMPORT_COLUMNS.length &&
    INVENTORY_IMPORT_COLUMNS.every((c, idx) => header[idx] === c)
  if (!strictHeaderOk) {
    const err = new Error(`Invalid header format. Expected: ${INVENTORY_IMPORT_COLUMNS.join(', ')}`)
    err.status = 400
    throw err
  }

  const dataRows = matrix.slice(1)
  const rowErrors = []
  const logs = []
  let inserted = 0
  let updated = 0
  let failed = 0
  const seenNames = new Set()

  for (let i = 0; i < dataRows.length; i += 1) {
    const rowNumber = i + 2
    const row = Array.isArray(dataRows[i]) ? dataRows[i] : []
    const valueByCol = Object.fromEntries(INVENTORY_IMPORT_COLUMNS.map((c, idx) => [c, row[idx] ?? null]))

    try {
      const productName = normalizeRequiredSafeText(valueByCol.ProductName, 'ProductName')
      const category = normalizeRequiredSafeText(valueByCol.Category, 'Category')
      const categoryId = await resolveCategoryIdFromPayload({ category })
      if (!categoryId) {
        throw new Error(`Category \"${category}\" was not found in database. Download latest template and select from dropdown.`)
      }
      const type = normalizeImportType(valueByCol.Type)
      if (!type) throw new Error('Type must be either Supplies or Retail')

      const unit = normalizeRequiredSafeText(valueByCol.Unit, 'Unit', 60)
      const importPrice = parseNonNegativeDecimal(valueByCol.ImportPrice)
      if (importPrice === null || importPrice < 0) throw new Error('ImportPrice must be a non-negative decimal')
      validateMaxNumber(importPrice, 'ImportPrice', MAX_PRICE_VND)

      const rawSell = parseNonNegativeDecimal(valueByCol.SellPrice)
      if (type === 'service' && rawSell !== null) throw new Error('SellPrice must be empty for Supplies')
      if (type === 'retail') {
        if (rawSell === null) throw new Error('SellPrice is required for Retail')
        if (rawSell < importPrice) throw new Error('SellPrice must be greater than or equal to ImportPrice')
        validateMaxNumber(rawSell, 'SellPrice', MAX_PRICE_VND)
      }

      const stockQuantity = parseNonNegativeInt(valueByCol.StockQuantity)
      if (stockQuantity === null || stockQuantity < 0) throw new Error('StockQuantity must be a non-negative integer')
      validateMaxNumber(stockQuantity, 'StockQuantity', MAX_INVENTORY_QTY, { integer: true })

      const minStock = parseNonNegativeInt(valueByCol.MinStock)
      if (minStock === null || minStock < 0) throw new Error('MinStock must be a non-negative integer')
      validateMaxNumber(minStock, 'MinStock', MAX_INVENTORY_QTY, { integer: true })

      const supplierName = parseOptionalString(valueByCol.SupplierName)
      if (supplierName) normalizeRequiredSafeText(supplierName, 'SupplierName', 120)

      const receivedDate = parseExcelDateValue(valueByCol.ReceivedDate)
      if (valueByCol.ReceivedDate !== null && valueByCol.ReceivedDate !== '' && !receivedDate) {
        throw new Error('ReceivedDate must be a valid date in yyyy-MM-dd format')
      }

      const expiryDate = parseExcelDateValue(valueByCol.ExpiryDate)
      if (valueByCol.ExpiryDate !== null && valueByCol.ExpiryDate !== '' && !expiryDate) {
        throw new Error('ExpiryDate must be a valid date in yyyy-MM-dd format')
      }
      if (receivedDate && expiryDate && expiryDate.getTime() < receivedDate.getTime()) {
        throw new Error('ExpiryDate must be greater than or equal to ReceivedDate')
      }

      const description = parseOptionalString(valueByCol.Description)
      if (description) normalizeRequiredSafeText(description, 'Description', 1000)

      const variant = parseOptionalString(valueByCol.Variant)
      if (variant) normalizeRequiredSafeText(variant, 'Variant', 120)

      const nameKey = productName.toLowerCase()
      if (duplicateMode === 'reject' && seenNames.has(nameKey)) {
        throw new Error('Duplicate ProductName in import file')
      }
      seenNames.add(nameKey)

      const existing = await findExistingItemByName(productName, schema)
      if (!existing) {
        const importDate = formatDateOnlyForImport(receivedDate)
        const importExpiry = formatDateOnlyForImport(expiryDate)
        const effectiveVariant = type === 'retail'
          ? (variant || DEFAULT_RETAIL_VARIANT_NAME)
          : variant
        const importLotNote = effectiveVariant ? `[Variant: ${effectiveVariant}] Imported from Excel` : 'Imported from Excel'
        const useVariantStockIn = type === 'retail'
          ? stockQuantity > 0
          : Boolean(effectiveVariant && stockQuantity > 0)
        const createPayload = {
          name: productName,
          category,
          categoryId,
          group: type,
          unit,
          qty: useVariantStockIn ? 0 : stockQuantity,
          minQty: minStock,
          priceVnd: importPrice,
          importPrice,
          supplier: supplierName,
        }
        if (description) createPayload.description = description
        if (receivedDate) createPayload.date = receivedDate
        if (type === 'service' && expiryDate) createPayload.expiryDate = expiryDate
        if (type === 'retail') createPayload.sellPriceVnd = rawSell
        const created = await createInventoryItem(createPayload, { actor })

        if (useVariantStockIn) {
          if (type === 'retail') {
            const variantId = await ensureRetailVariantByName(created.id, effectiveVariant)
            await stockIn(
              {
                inventoryItemId: `variant:${variantId}`,
                qty: stockQuantity,
                supplier: supplierName,
                importPrice,
                date: importDate,
                expiryDate: importExpiry,
                note: importLotNote,
              },
              { actor }
            )
          } else {
            await stockIn(
              {
                inventoryItemId: created.id,
                qty: stockQuantity,
                supplier: supplierName,
                importPrice,
                date: importDate,
                expiryDate: importExpiry,
                note: importLotNote,
              },
              { actor }
            )
          }
        }

        inserted += 1
        logs.push({ row: rowNumber, action: 'insert', status: 'success', productName })
        continue
      }

      if (duplicateMode === 'reject') {
        throw new Error('ProductName already exists')
      }

      if (existing.type !== type) {
        throw new Error(`Existing product type is ${existing.type === 'service' ? 'Supplies' : 'Retail'}, but row type is ${String(valueByCol.Type)}`)
      }

      const importDate = formatDateOnlyForImport(receivedDate)
      const importExpiry = formatDateOnlyForImport(expiryDate)
      const effectiveVariant = type === 'retail'
        ? (variant || DEFAULT_RETAIL_VARIANT_NAME)
        : variant
      const importLotNote = effectiveVariant ? `[Variant: ${effectiveVariant}] Imported from Excel` : 'Imported from Excel'
      const useVariantStockIn = type === 'retail'
        ? stockQuantity > 0
        : Boolean(effectiveVariant && stockQuantity > 0)
      const nextStock = useVariantStockIn
        ? Number(existing.stock || 0)
        : Number(existing.stock || 0) + stockQuantity
      const updatePayload = {
        name: productName,
        category,
        categoryId,
        unit,
        minQty: minStock,
        stock: nextStock,
      }
      if (description) updatePayload.description = description
      if (receivedDate) updatePayload.date = receivedDate
      if (type === 'service' && expiryDate && stockQuantity > 0) {
        updatePayload.expiryDate = expiryDate
      }
      if (updatePrices) {
        updatePayload.priceVnd = importPrice
        if (type === 'retail') updatePayload.sellPriceVnd = rawSell
      }

      await updateItem(existing.id, updatePayload)

      if (useVariantStockIn) {
        if (type === 'retail') {
          const variantId = await ensureRetailVariantByName(existing.id, effectiveVariant)
          await stockIn(
            {
              inventoryItemId: `variant:${variantId}`,
              qty: stockQuantity,
              supplier: supplierName,
              importPrice,
              date: importDate,
              expiryDate: importExpiry,
              note: importLotNote,
            },
            { actor }
          )
        } else {
          await stockIn(
            {
              inventoryItemId: existing.id,
              qty: stockQuantity,
              supplier: supplierName,
              importPrice,
              date: importDate,
              expiryDate: importExpiry,
              note: importLotNote,
            },
            { actor }
          )
        }
      }

      updated += 1
      logs.push({ row: rowNumber, action: 'update', status: 'success', productName })
    } catch (e) {
      failed += 1
      const message = e?.message || 'Invalid row'
      rowErrors.push({ row: rowNumber, message })
      logs.push({ row: rowNumber, action: 'none', status: 'failed', message })
    }
  }

  return {
    inserted,
    updated,
    failed,
    errors: rowErrors,
    logs,
    totalRows: dataRows.length,
    options: {
      duplicateMode,
      updatePrices,
    },
  }
}

function normalizeImageUrls(input) {
  const arr = Array.isArray(input) ? input : []
  return arr
    .map((x) => (x === undefined || x === null ? '' : String(x).trim()))
    .filter(Boolean)
    .slice(0, 4)
}

async function replaceProductImages(productId, images) {
  const schema = await getSchemaInfo()
  if (!schema.hasProductImages) return

  const urls = normalizeImageUrls(images)
  await query('DELETE FROM ProductImages WHERE ProductId = @productId', { productId })

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i]
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

function retailShadowId(productId) {
  return `retail_${String(productId ?? '').trim()}`
}

function retailVariantShadowId(variantId) {
  return `retail_variant_${String(variantId ?? '').trim()}`
}

function parseVariantIdFromRetailShadowId(inventoryItemId) {
  const raw = String(inventoryItemId || '')
  const prefix = 'retail_variant_'
  if (!raw.startsWith(prefix)) return ''
  return raw.slice(prefix.length)
}

async function resolveSkuKind(sku) {
  const schema = await getSchemaInfo()
  const { hint, id } = parseSku(sku)
  if (!id) return null

  const hintIsInventory = hint === 'service' || hint === 'inventory'
  const hintIsProduct = hint === 'retail' || hint === 'product'
  const hintIsVariant = hint === 'variant'

  if (hintIsInventory) {
    const inv = await query(
      `SELECT TOP 1 InventoryItemId
       FROM InventoryItems
       WHERE InventoryItemId = @id
         ${schema.inventoryHasStatus
          ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
          : "AND COALESCE(ItemGroup, 'service') <> 'deleted'"}`,
      { id }
    )
    if (inv.recordset?.length) return { kind: 'inventory', id }
    return null
  }

  if (hintIsProduct) {
    const prod = await query(
      `SELECT TOP 1 ProductId
       FROM Products
       WHERE ProductId = @id
         ${schema.productsHasStatus
          ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
          : ''}`,
      { id }
    )
    if (prod.recordset?.length) return { kind: 'product', id }
    return null
  }

  if (hintIsVariant) {
    if (!schema.hasProductVariants) return null
    const variant = await query(
      `SELECT TOP 1 pv.VariantId, pv.ProductId
       FROM ProductVariants pv
       INNER JOIN Products p ON p.ProductId = pv.ProductId
       WHERE pv.VariantId = @id
         ${schema.productsHasStatus
          ? "AND (p.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
          : ''}`,
      { id }
    )
    const row = variant.recordset?.[0]
    if (row) return { kind: 'variant', id: row.VariantId, productId: row.ProductId }
    return null
  }

  const inv = await query(
    `SELECT TOP 1 InventoryItemId
     FROM InventoryItems
     WHERE InventoryItemId = @id
      ${schema.inventoryHasStatus
       ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
        : "AND COALESCE(ItemGroup, 'service') <> 'deleted'"}`,
    { id }
  )
  if (inv.recordset?.length) return { kind: 'inventory', id }

  const prod = await query(
    `SELECT TOP 1 ProductId
     FROM Products
     WHERE ProductId = @id
      ${schema.productsHasStatus
       ? "AND (Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
        : ''}`,
    { id }
  )
  if (prod.recordset?.length) return { kind: 'product', id }

  if (schema.hasProductVariants) {
    const variant = await query(
      `SELECT TOP 1 pv.VariantId, pv.ProductId
       FROM ProductVariants pv
       INNER JOIN Products p ON p.ProductId = pv.ProductId
       WHERE pv.VariantId = @id
         ${schema.productsHasStatus
          ? "AND (p.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
          : ''}`,
      { id }
    )
    const row = variant.recordset?.[0]
    if (row) return { kind: 'variant', id: row.VariantId, productId: row.ProductId }
  }

  return null
}

async function getInventory() {
  const schema = await getSchemaInfo()

  const hasCategoryMapping = schema.productsHasCategoryId && schema.inventoryHasCategoryId && schema.hasProductCategories
  const serviceKindExpr = hasCategoryMapping ? 'COALESCE(pcService.Name, CAST(NULL AS NVARCHAR(100)))' : 'CAST(NULL AS NVARCHAR(100))'
  const retailKindExpr = hasCategoryMapping
    ? 'COALESCE(pcRetail.Name, pcShadow.Name, CAST(NULL AS NVARCHAR(100)))'
    : 'CAST(NULL AS NVARCHAR(100))'
  const serviceVisibleWhere = schema.inventoryHasStatus
    ? "AND (i.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), i.Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
    : "AND COALESCE(i.ItemGroup, 'service') <> 'deleted'"
  const retailVisibleWhere = schema.productsHasStatus
    ? "(p.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
    : '1=1'
  const variantRetailVisibleWhere = schema.productsHasStatus
    ? "(p.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), p.Status)))) NOT IN ('deleted', 'delete', 'inactive'))"
    : '1=1'
  const variantUnionSql = schema.hasProductVariants
    ? `

      UNION ALL

      SELECT
        pv.VariantId AS InventoryItemId,
        p.ProductId AS BaseId,
        CAST(CONCAT('variant:', pv.VariantId) AS NVARCHAR(100)) AS SkuKey,
        CAST(CONCAT(p.Name, N' - ', pv.VariantName) AS NVARCHAR(255)) AS Name,
        ${retailKindExpr} AS CategoryName,
        CAST('sp' AS NVARCHAR(50)) AS Unit,
        CAST(1 AS DECIMAL(19,2)) AS ConversionRate,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0) AS Quantity,
        CAST(0 AS DECIMAL(19,2)) AS ReorderLevel,
        txInfoVariant.LastAt AS LastAt,
        CAST('retail' AS NVARCHAR(20)) AS ItemGroup,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), rv.PriceVnd), TRY_CONVERT(DECIMAL(19,2), r.PriceVnd), 0) AS PriceVnd,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Price), TRY_CONVERT(DECIMAL(19,2), p.Price), 0) AS SellPriceVnd,
        CAST(NULL AS NVARCHAR(200)) AS Supplier,
        pv.VariantId AS VariantId
      FROM ProductVariants pv
      INNER JOIN Products p ON p.ProductId = pv.ProductId
      LEFT JOIN InventoryItems r ON r.InventoryItemId = CONCAT('retail_', p.ProductId)
      LEFT JOIN InventoryItems rv ON rv.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcRetail ON pcRetail.CategoryId = p.CategoryId' : ''}
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcShadow ON pcShadow.CategoryId = r.CategoryId' : ''}
      OUTER APPLY (
        SELECT MAX(t.CreatedAt) AS LastAt
        FROM InventoryTransactions t
        WHERE t.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
          AND t.Type = 'IN'
      ) txInfoVariant
      WHERE ${variantRetailVisibleWhere}`
    : ''

  const itemsResult = await query(
    `SELECT
        i.InventoryItemId,
        i.InventoryItemId AS BaseId,
        CAST(CONCAT('service:', i.InventoryItemId) AS NVARCHAR(100)) AS SkuKey,
        i.Name,
        ${serviceKindExpr} AS CategoryName,
        i.Unit,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), i.ConversionRate), 1) AS ConversionRate,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), i.Quantity), 0) AS Quantity,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), i.ReorderLevel), 0) AS ReorderLevel,
        txInfo.LastAt AS LastAt,
        CAST('service' AS NVARCHAR(20)) AS ItemGroup,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), i.PriceVnd), 0) AS PriceVnd,
        CAST(NULL AS DECIMAL(19,2)) AS SellPriceVnd,
        CAST(NULL AS NVARCHAR(200)) AS Supplier,
        CAST(NULL AS NVARCHAR(100)) AS VariantId
      FROM InventoryItems i
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcService ON pcService.CategoryId = i.CategoryId' : ''}
      OUTER APPLY (
        SELECT MAX(t.CreatedAt) AS LastAt
        FROM InventoryTransactions t
        WHERE t.InventoryItemId = i.InventoryItemId
          AND t.Type = 'IN'
      ) txInfo
      WHERE COALESCE(i.ItemGroup, 'service') = 'service'
      AND i.InventoryItemId NOT LIKE 'retail_variant_%'
      ${serviceVisibleWhere}

      UNION ALL

      SELECT
        p.ProductId AS InventoryItemId,
        p.ProductId AS BaseId,
        CAST(CONCAT('retail:', p.ProductId) AS NVARCHAR(100)) AS SkuKey,
        p.Name,
        ${retailKindExpr} AS CategoryName,
        CAST('sp' AS NVARCHAR(50)) AS Unit,
        CAST(1 AS DECIMAL(19,2)) AS ConversionRate,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0) AS Quantity,
        CAST(0 AS DECIMAL(19,2)) AS ReorderLevel,
        txInfoRetail.LastAt AS LastAt,
        CAST('retail' AS NVARCHAR(20)) AS ItemGroup,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), r.PriceVnd), 0) AS PriceVnd,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Price), 0) AS SellPriceVnd,
        CAST(NULL AS NVARCHAR(200)) AS Supplier,
        CAST(NULL AS NVARCHAR(100)) AS VariantId
      FROM Products p
      LEFT JOIN InventoryItems r ON r.InventoryItemId = CONCAT('retail_', p.ProductId)
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcRetail ON pcRetail.CategoryId = p.CategoryId' : ''}
      ${hasCategoryMapping ? 'LEFT JOIN ProductCategories pcShadow ON pcShadow.CategoryId = r.CategoryId' : ''}
      OUTER APPLY (
        SELECT MAX(t.CreatedAt) AS LastAt
        FROM InventoryTransactions t
        WHERE t.InventoryItemId = CONCAT('retail_', p.ProductId)
          AND t.Type = 'IN'
      ) txInfoRetail
        WHERE ${retailVisibleWhere}
        ${variantUnionSql}`
  )

  const items = (itemsResult.recordset || []).map(toInventoryItem)

  const inventoryItemIds = items
    .map((item) => {
      const group = String(item?.group || '').toLowerCase()
      const baseId = item.productId || parseSku(item.id).id
      if (!baseId) return null
      const variantId = String(item?.variantId || '').trim()
      if (group === 'retail' && variantId) return retailVariantShadowId(variantId)
      return group === 'retail' ? retailShadowId(baseId) : baseId
    })
    .filter(Boolean)

  const lotsByItemId = new Map()
  if (inventoryItemIds.length) {
    const lotRes = await query(
      `SELECT
         l.InventoryItemId,
         l.LotId,
         l.VariantId,
         COALESCE(TRY_CONVERT(DECIMAL(19,3), RemainingQty), 0) AS RemainingQty,
         COALESCE(TRY_CONVERT(DECIMAL(19,2), UnitCost), 0) AS UnitCost,
         COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Price), 0) AS SellPriceVnd,
         l.ReceivedAt,
         CONVERT(NVARCHAR(10), l.ExpiryDate, 23) AS ExpiryDate,
         l.Note
       FROM InventoryLots l
       LEFT JOIN ProductVariants pv ON pv.VariantId = l.VariantId
       WHERE l.InventoryItemId IN (${inventoryItemIds.map((_, idx) => `@id${idx}`).join(', ')})
         AND COALESCE(l.RemainingQty, 0) > 0
       ORDER BY l.InventoryItemId, l.ExpiryDate ASC, l.ReceivedAt ASC, l.LotId ASC`,
      Object.fromEntries(inventoryItemIds.map((id, idx) => [`id${idx}`, id]))
    )

    for (const row of lotRes.recordset || []) {
      const key = row.InventoryItemId
      const list = lotsByItemId.get(key) || []
      list.push({
        lotId: row.LotId,
        variantId: row.VariantId || null,
        remaining: Number(row.RemainingQty || 0),
        price: Number(row.UnitCost || 0),
        sellPriceVnd: row.SellPriceVnd === null || row.SellPriceVnd === undefined ? null : Number(row.SellPriceVnd),
        receivedAt: row.ReceivedAt,
        expiryDate: row.ExpiryDate,
        note: row.Note || '',
      })
      lotsByItemId.set(key, list)
    }
  }

  const retailVariantIdsByProduct = new Map()
  for (const item of items) {
    const group = String(item?.group || '').toLowerCase()
    if (group !== 'retail') continue
    const variantId = String(item?.variantId || '').trim()
    const productId = String(item?.productId || '').trim()
    if (!variantId || !productId) continue
    const list = retailVariantIdsByProduct.get(productId) || []
    list.push(variantId)
    retailVariantIdsByProduct.set(productId, list)
  }

  for (const item of items) {
    const group = String(item?.group || '').toLowerCase()
    const baseId = item.productId || parseSku(item.id).id
    const variantId = String(item?.variantId || '').trim()
    let lots = []

    if (group === 'retail') {
      if (variantId) {
        const variantLotKey = retailVariantShadowId(variantId)
        lots = variantLotKey ? lotsByItemId.get(variantLotKey) || [] : []
      } else {
        const ownLotKey = retailShadowId(baseId)
        const ownLots = ownLotKey ? lotsByItemId.get(ownLotKey) || [] : []
        const variantIds = retailVariantIdsByProduct.get(String(baseId || '').trim()) || []
        const variantLots = variantIds.flatMap((vid) => lotsByItemId.get(retailVariantShadowId(vid)) || [])
        lots = [...ownLots, ...variantLots].sort((a, b) => {
          const aExp = String(a?.expiryDate || '9999-12-31')
          const bExp = String(b?.expiryDate || '9999-12-31')
          if (aExp !== bExp) return aExp.localeCompare(bExp)
          const aRec = new Date(a?.receivedAt || 0).getTime()
          const bRec = new Date(b?.receivedAt || 0).getTime()
          if (aRec !== bRec) return aRec - bRec
          return String(a?.lotId || '').localeCompare(String(b?.lotId || ''))
        })
      }
    } else {
      const lotKey = baseId
      lots = lotKey ? lotsByItemId.get(lotKey) || [] : []
    }

    const totalQty = lots.reduce((sum, lot) => sum + Number(lot.remaining || 0), 0)
    item.lots = lots
    item.totalQty = lots.length ? totalQty : Number(item.stock || 0)
    if (lots.length) item.stock = totalQty
  }

  const historyResult = await query(
    `SELECT
        t.TransactionId,
        t.CreatedAt,
        t.Type,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), t.Quantity), 0) AS Quantity,
        i.Name AS ProductName,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), t.UnitCost), TRY_CONVERT(DECIMAL(19,2), t.ImportPrice), TRY_CONVERT(DECIMAL(19,2), i.PriceVnd), 0) AS UnitCost,
        COALESCE(
          TRY_CONVERT(DECIMAL(19,2), t.TotalCostVnd),
          ABS(COALESCE(TRY_CONVERT(DECIMAL(19,2), t.Quantity), 0))
            * COALESCE(
              TRY_CONVERT(DECIMAL(19,2), t.UnitCost),
              TRY_CONVERT(DECIMAL(19,2), t.ImportPrice),
              TRY_CONVERT(DECIMAL(19,2), i.PriceVnd),
              0
            )
        ) AS TotalCostVnd,
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
        WHERE t.Type IN ('IN', 'OUT', 'ADJUST', 'DELETE')
      ORDER BY t.CreatedAt DESC`
  )

  const history = (historyResult.recordset || []).map(toInventoryHistoryItem)

  return { items, history }
}

async function fifoPreview(payload) {
  const { inventoryItemId, qty } = payload || {}
  const amount = Number(qty)
  if (!inventoryItemId) {
    const err = new Error('Missing inventoryItemId')
    err.status = 400
    throw err
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Invalid qty')
    err.status = 400
    throw err
  }

  const kind = await resolveSkuKind(inventoryItemId)
  if (!kind) {
    const err = new Error('Unknown SKU')
    err.status = 404
    throw err
  }
  if (kind.kind !== 'inventory') {
    const err = new Error('FIFO preview is only available for supplies')
    err.status = 400
    throw err
  }

  const totalRes = await query(
    `SELECT COALESCE(SUM(RemainingQty), 0) AS TotalQty
     FROM InventoryLots
     WHERE InventoryItemId = @id`,
    { id: kind.id }
  )
  const totalQty = Number(totalRes.recordset?.[0]?.TotalQty || 0)
  if (totalQty < amount) {
    const err = new Error('Insufficient stock')
    err.status = 409
    throw err
  }

  const lotsRes = await query(
    `SELECT LotId, RemainingQty, UnitCost
     FROM InventoryLots
     WHERE InventoryItemId = @id
       AND COALESCE(RemainingQty, 0) > 0
     ORDER BY ExpiryDate ASC, ReceivedAt ASC, LotId ASC`,
    { id: kind.id }
  )

  let remaining = amount
  const preview = []
  for (const lot of lotsRes.recordset || []) {
    if (remaining <= 0) break
    const available = Number(lot?.RemainingQty || 0)
    if (!Number.isFinite(available) || available <= 0) continue
    const take = Math.min(available, remaining)
    remaining -= take
    preview.push({
      lotId: lot.LotId,
      take,
      price: Number(lot?.UnitCost || 0),
    })
  }

  return preview
}

async function createInventoryItem(payload, { actor } = {}) {
  const {
    name,
    qty,
    minQty,
    unit,
    group,
    category,
    kind,
    priceVnd,
    supplier,
    importPrice,
    sellPriceVnd,
    description,
    imageUrl,
    images,
    status,
    expiryDate,
    date,
  } = payload || {}
  const schema = await getSchemaInfo()
  const categoryId = await resolveCategoryIdFromPayload(payload)

  const normalizedName = normalizeRequiredSafeText(name, 'name')
  const id = newId()
  const q = Number(qty)
  const min = Number(minQty)
  const normalizedGroup = String(group || '').trim().toLowerCase()
  const hasSellPricePayload = Object.prototype.hasOwnProperty.call(payload || {}, 'sellPriceVnd')
  const hasSellPriceValue = hasSellPricePayload && String(payload?.sellPriceVnd ?? '').trim() !== ''

  await ensureUniqueItemName(normalizedName, schema)

  if ((normalizedGroup === 'service' || normalizedGroup === 'inventory') && hasSellPriceValue) {
    const err = new Error('sellPriceVnd is not allowed for supplies')
    err.status = 400
    throw err
  }

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
  if (Number.isFinite(q)) validateMaxNumber(q, 'qty', MAX_INVENTORY_QTY)
  if (Number.isFinite(min)) validateMaxNumber(min, 'minQty', MAX_INVENTORY_QTY)

  if (unit !== undefined && unit !== null && String(unit).trim()) {
    normalizeRequiredSafeText(unit, 'unit', 60)
  }
  if (supplier !== undefined && supplier !== null && String(supplier).trim()) {
    normalizeRequiredSafeText(supplier, 'supplier', 120)
  }

  const parsedPrice = parseMoneyVnd(priceVnd)
  const normalizedImages = normalizeImageUrls(images)
  const parsedImageUrl = parseOptionalString(imageUrl)
  const primaryImageUrl = normalizedImages[0] || parsedImageUrl
  if (parsedPrice !== null) validateMaxNumber(parsedPrice, 'priceVnd', MAX_PRICE_VND)
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
    if (sellPrice !== null) validateMaxNumber(sellPrice, 'sellPriceVnd', MAX_PRICE_VND)

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
    const img = primaryImageUrl
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

    const imagesForSave = normalizedImages.length ? normalizedImages : (img ? [img] : [])
    if (imagesForSave.length) {
      await replaceProductImages(id, imagesForSave)
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

    const defaultVariantId = await ensureRetailVariantByName(id, DEFAULT_RETAIL_VARIANT_NAME)

    if (wantsInitialStock) {
      await stockIn(
        {
          inventoryItemId: `variant:${defaultVariantId}`,
          qty: Math.trunc(initialQty),
          supplier: supplier || null,
          importPrice: importPrice ?? null,
          sellPriceVnd: sellPrice !== null && Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : null,
          date: date || null,
          expiryDate: expiryDate || null,
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

  if ((description !== undefined && description !== null) || primaryImageUrl) {
    const desc = parseOptionalString(description)
    if (schema.inventoryHasDescription || schema.inventoryHasImageUrl) {
      await query(
        `UPDATE InventoryItems
         SET
           ${schema.inventoryHasDescription ? 'Description = COALESCE(@description, Description)' : ''}
           ${schema.inventoryHasDescription && schema.inventoryHasImageUrl ? ',' : ''}
           ${schema.inventoryHasImageUrl ? 'ImageUrl = COALESCE(@imageUrl, ImageUrl)' : ''}
         WHERE InventoryItemId = @id;`,
        {
          id,
          description: desc === undefined ? null : desc,
          imageUrl: primaryImageUrl || null,
        }
      )
    }
  }

  if (wantsInitialStock) {
    await stockIn(
      {
        inventoryItemId: id,
        qty: initialQty,
        supplier: supplier || null,
        // If UI only provides priceVnd during creation, treat it as initial import price for service items.
        importPrice: importPrice ?? (parsedPrice !== null && Number.isFinite(parsedPrice) ? parsedPrice : null),
        date: date || null,
        expiryDate: expiryDate || null,
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
  if (kind.kind === 'variant') {
    const err = new Error('Use variant APIs to update retail variants')
    err.status = 400
    throw err
  }

  const { name, unit, minQty, priceVnd, sellPriceVnd, description, imageUrl, status, stock, group, images, expiryDate, date } = payload || {}
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
    let qty = stock !== undefined ? Number(stock) : null
    const parsedPrice = parseMoneyVnd(priceVnd)
    const expiryRaw = expiryDate !== undefined && expiryDate !== null ? String(expiryDate).trim() : ''
    const parsedExpiry = expiryRaw ? parseOptionalDate(expiryRaw) : null
    const rawGroup = group !== undefined ? String(group || '').trim().toLowerCase() : null
    const parsedGroup = rawGroup === 'supplies' ? 'service' : rawGroup
    const hasSellPricePayload = Object.prototype.hasOwnProperty.call(payload || {}, 'sellPriceVnd')
    const hasSellPriceValue = hasSellPricePayload && String(payload?.sellPriceVnd ?? '').trim() !== ''
    const desc = parseOptionalString(description)
    const img = parseOptionalString(imageUrl)
    if (min !== null && !Number.isFinite(min)) {
      const err = new Error('Invalid minQty')
      err.status = 400
      throw err
    }
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      const err = new Error('Invalid stock')
      err.status = 400
      throw err
    }
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      const err = new Error('Invalid priceVnd')
      err.status = 400
      throw err
    }
    if (min !== null) validateMaxNumber(min, 'minQty', MAX_INVENTORY_QTY)
    if (qty !== null) validateMaxNumber(qty, 'stock', MAX_INVENTORY_QTY)
    if (parsedPrice !== null) validateMaxNumber(parsedPrice, 'priceVnd', MAX_PRICE_VND)
    if (parsedGroup !== null && parsedGroup !== 'service' && parsedGroup !== 'inventory') {
      const err = new Error('Invalid type for supplies')
      err.status = 400
      throw err
    }
    if (hasSellPriceValue) {
      const err = new Error('sellPriceVnd is not allowed for supplies')
      err.status = 400
      throw err
    }
    if (expiryRaw && !parsedExpiry) {
      const err = new Error('Invalid expiryDate')
      err.status = 400
      throw err
    }

    if (qty !== null) {
      const totalRes = await query(
        `SELECT COALESCE(SUM(RemainingQty), 0) AS TotalQty
         FROM InventoryLots
         WHERE InventoryItemId = @id`,
        { id: kind.id }
      )
      const totalQty = Number(totalRes.recordset?.[0]?.TotalQty || 0)
      const delta = qty - totalQty

      if (delta > 0) {
        let effectivePrice = parsedPrice
        if (effectivePrice === null) {
          const priceRes = await query(
            `SELECT TOP 1 PriceVnd
             FROM InventoryItems
             WHERE InventoryItemId = @id`,
            { id: kind.id }
          )
          const currentPrice = Number(priceRes.recordset?.[0]?.PriceVnd || 0)
          effectivePrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null
        }
        if (effectivePrice === null || !Number.isFinite(effectivePrice) || effectivePrice <= 0) {
          const err = new Error('Import price is required for stock increase')
          err.status = 400
          throw err
        }

        await stockIn({
          inventoryItemId: kind.id,
          qty: delta,
          importPrice: effectivePrice,
          date: date || null,
          expiryDate: parsedExpiry ? parsedExpiry.toISOString().slice(0, 10) : null,
          note: 'Adjustment from edit',
        })
      } else if (delta < 0) {
        await stockOut({
          inventoryItemId: kind.id,
          qty: Math.abs(delta),
          date: date || null,
          note: 'Adjustment from edit',
        })
      }

      qty = null
    }

    if (!schema.inventoryHasCategoryId) {
      const err = new Error('InventoryItems.CategoryId is missing')
      err.status = 400
      throw err
    }
    const updateSql = `UPDATE InventoryItems
       SET
         Name = COALESCE(@name, Name),
         CategoryId = COALESCE(@categoryId, CategoryId),
         Unit = COALESCE(@unit, Unit),
         Quantity = COALESCE(@qty, Quantity),
         ReorderLevel = COALESCE(@reorder, ReorderLevel),
         PriceVnd = COALESCE(@priceVnd, PriceVnd),
         ItemGroup = COALESCE(@itemGroup, ItemGroup)
         ${schema.inventoryHasDescription ? ', Description = COALESCE(@description, Description)' : ''}
         ${schema.inventoryHasImageUrl ? ', ImageUrl = COALESCE(@imageUrl, ImageUrl)' : ''}
       WHERE InventoryItemId = @id;`

    await query(updateSql, {
      id: kind.id,
      name: name !== undefined ? String(name).trim() : null,
      categoryId,
      unit: unit !== undefined ? (String(unit).trim() || null) : null,
      qty: qty !== null ? qty : null,
      reorder: min !== null ? min : null,
      priceVnd: parsedPrice !== null ? parsedPrice : null,
      itemGroup: parsedGroup || null,
      description: desc === undefined ? null : desc,
      imageUrl: img === undefined ? null : img,
    })

    return { id: itemId }
  }

  // Retail products: allow updating name + price.
  const price = parseMoneyVnd(priceVnd)
  const sellPrice = parseMoneyVnd(sellPriceVnd)
  const stockQty = stock !== undefined ? Number(stock) : null
  const normalizedImages = normalizeImageUrls(images)
  const hasImagesPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'images')
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
  if (stockQty !== null && (!Number.isFinite(stockQty) || stockQty < 0)) {
    const err = new Error('Invalid stock')
    err.status = 400
    throw err
  }
  if (price !== null) validateMaxNumber(price, 'priceVnd', MAX_PRICE_VND)
  if (sellPrice !== null) validateMaxNumber(sellPrice, 'sellPriceVnd', MAX_PRICE_VND)
  if (stockQty !== null) validateMaxNumber(stockQty, 'stock', MAX_INVENTORY_QTY, { integer: true })

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
       Stock = COALESCE(@stock, Stock),
       Price = COALESCE(@sellPrice, Price),
       Description = COALESCE(@description, Description),
       ImageUrl = COALESCE(@imageUrl, ImageUrl),
       Status = COALESCE(@status, Status)
     WHERE ProductId = @id;`,
    {
      id: kind.id,
      name: name !== undefined ? String(name).trim() : null,
      categoryId,
      stock: stockQty !== null ? Math.trunc(stockQty) : null,
      importPrice: price,
      sellPrice,
      description: desc === undefined ? null : desc,
      imageUrl: hasImagesPayload ? (normalizedImages[0] || null) : (img === undefined ? null : img),
      status: st === undefined ? null : st,
    }
  )

  if (hasImagesPayload) {
    await replaceProductImages(kind.id, normalizedImages)
  }

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
         Quantity = COALESCE((SELECT TOP 1 Stock FROM Products WHERE ProductId = @id), Quantity),
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
  const { inventoryItemId, product, qty, referenceId, supplier, importPrice, sellPriceVnd, date, note, expiryDate } = payload || {}
  const amount = Number(qty)
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Invalid qty')
    err.status = 400
    throw err
  }
  validateMaxNumber(amount, 'qty', MAX_INVENTORY_QTY)

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

  let kind = await resolveSkuKind(itemId)
  if (!kind) {
    const err = new Error('Unknown SKU')
    err.status = 404
    throw err
  }

  if (kind.kind === 'product') {
    const variantCount = await getRetailVariantCount(kind.id)
    if (variantCount > 0) {
      const err = new Error('Retail stock-in must target a specific variant')
      err.status = 400
      throw err
    }
    const defaultVariantId = await ensureRetailVariantByName(kind.id, DEFAULT_RETAIL_VARIANT_NAME)
    kind = { kind: 'variant', id: defaultVariantId, productId: kind.id }
  }

  const when = validateNotFutureDate(date, 'date')
  const unitCost = parseMoneyVnd(importPrice)
  const sellPrice = parseMoneyVnd(sellPriceVnd)
  if (unitCost === null || !Number.isFinite(unitCost) || unitCost <= 0) {
    const err = new Error('Invalid importPrice')
    err.status = 400
    throw err
  }
  validateMaxNumber(unitCost, 'importPrice', MAX_PRICE_VND)
  const expiryRaw = expiryDate !== undefined && expiryDate !== null ? String(expiryDate).trim() : ''
  let parsedExpiry = expiryRaw ? parseOptionalDate(expiryRaw) : null
  if (expiryRaw && !parsedExpiry) {
    const err = new Error('Invalid expiryDate')
    err.status = 400
    throw err
  }
  if (!expiryRaw) {
    const base = when || new Date()
    const fallback = new Date(base)
    fallback.setFullYear(fallback.getFullYear() + 1)
    parsedExpiry = fallback
  }
  const schema = await getSchemaInfo()
  const txRef = normalizeReferenceId(referenceId || note)
  if (kind.kind === 'inventory') {
    const txId = newId()
    const lotId = newId()
    await query(
      `UPDATE InventoryItems
       SET
         Quantity = COALESCE(Quantity, 0) + @qty,
         PriceVnd = COALESCE(@unitCost, PriceVnd)
       WHERE InventoryItemId = @iid;

       INSERT INTO InventoryLots (
         LotId, InventoryItemId, ReceivedAt, ExpiryDate, UnitCost,
         InitialQty, RemainingQty, Supplier, ReferenceId, Note, CreatedAt
       )
       VALUES (
         @lotId, @iid, COALESCE(@receivedAt, GETDATE()), @expiryDate, @unitCost,
         @qty, @qty, @supplier, @referenceId, @note, COALESCE(@createdAt, SYSUTCDATETIME())
       );`,
      {
        iid: kind.id,
        lotId,
        qty: amount,
        unitCost: unitCost !== null && Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null,
        supplier: supplier || null,
        referenceId: normalizeReferenceId(referenceId),
        note: note ? String(note).slice(0, 255) : null,
        receivedAt: when,
        expiryDate: parsedExpiry,
        createdAt: when,
      }
    )

    const totalCost = amount * unitCost
    await query(
      `IF NOT EXISTS (SELECT 1 FROM InventoryTransactions WHERE TransactionId = @txId)
       BEGIN
         INSERT INTO InventoryTransactions (
           TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
           PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
           UnitCost, TotalCostVnd
         )
         VALUES (
           @txId, @itemId, 'IN', @qty, @ref, COALESCE(@createdAt, GETDATE()),
           @performedByRole, @performedById, @performedByName, @performedByEmail,
           @unitCost, @totalCost
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
        unitCost,
        totalCost: Number.isFinite(totalCost) ? totalCost : null,
      }
    )
    console.info('[stockIn] inventory lot created', {
      inventoryItemId: kind.id,
      lotId,
      qty: amount,
      unitCost,
      totalCost,
    })
  } else if (kind.kind === 'variant') {
    if (!Number.isInteger(amount)) {
      const err = new Error('Invalid qty (must be an integer for retail variants)')
      err.status = 400
      throw err
    }
    const variantShadowId = retailVariantShadowId(kind.id)
    const txId = newId()
    const lotId = newId()
    if (!schema.inventoryHasCategoryId) {
      const err = new Error('InventoryItems.CategoryId is missing')
      err.status = 400
      throw err
    }

    const variantMeta = await query(
      `SELECT TOP 1 VariantName
       FROM ProductVariants
       WHERE VariantId = @variantId`,
      { variantId: kind.id }
    )
    const variantName = String(variantMeta.recordset?.[0]?.VariantName || '').trim()
    const variantTag = variantName ? `Variant: ${variantName}` : `Variant: ${kind.id}`
    const lotNote = note ? `[${variantTag}] ${String(note).trim()}` : `[${variantTag}]`
    const txReference = referenceId || `${variantTag}${note ? ` | ${String(note).trim()}` : ''}`

    const totalCost = amount * unitCost
    await query(
      `UPDATE ProductVariants
       SET Stock = COALESCE(Stock, 0) + @qty,
         Price = COALESCE(
           @sellPrice,
           NULLIF(TRY_CONVERT(DECIMAL(19,2), Price), 0),
           (SELECT TOP 1 NULLIF(TRY_CONVERT(DECIMAL(19,2), p.Price), 0) FROM Products p WHERE p.ProductId = @productId),
           Price
         )
       WHERE VariantId = @variantId;

       UPDATE Products
       SET Stock = COALESCE(Stock, 0) + @qty
       WHERE ProductId = @productId;

       IF NOT EXISTS (SELECT 1 FROM InventoryItems WHERE InventoryItemId = @variantShadowId)
       BEGIN
         INSERT INTO InventoryItems (InventoryItemId, ProductId, CategoryId, Name, Unit, ConversionRate, Quantity, ReorderLevel, PriceVnd, ItemGroup)
         SELECT
           @variantShadowId,
           NULL,
           p.CategoryId,
           LEFT(CONCAT(p.Name, N' - ', pv.VariantName), 120),
           'sp',
           1,
           COALESCE(pv.Stock, 0),
           0,
           COALESCE(@unitCost, NULL),
             'service'
         FROM ProductVariants pv
         INNER JOIN Products p ON p.ProductId = pv.ProductId
         WHERE pv.VariantId = @variantId;
       END

       UPDATE InventoryItems
       SET
           ProductId = NULL,
         CategoryId = COALESCE((SELECT TOP 1 CategoryId FROM Products WHERE ProductId = @productId), CategoryId),
           Name = COALESCE(
             (SELECT TOP 1 LEFT(CONCAT(p.Name, N' - ', pv.VariantName), 120)
              FROM ProductVariants pv
              INNER JOIN Products p ON p.ProductId = pv.ProductId
              WHERE pv.VariantId = @variantId),
             Name
           ),
         Quantity = (SELECT COALESCE(Stock, 0) FROM ProductVariants WHERE VariantId = @variantId),
         PriceVnd = COALESCE(@unitCost, PriceVnd),
           ItemGroup = 'service'
       WHERE InventoryItemId = @variantShadowId;

       INSERT INTO InventoryLots (
         LotId, InventoryItemId, VariantId, ReceivedAt, ExpiryDate, UnitCost,
         InitialQty, RemainingQty, Supplier, ReferenceId, Note, CreatedAt
       )
       VALUES (
         @lotId, @variantShadowId, @variantId, COALESCE(@receivedAt, GETDATE()), @expiryDate, @unitCost,
         @qty, @qty, @supplier, @referenceId, @note, COALESCE(@createdAt, SYSUTCDATETIME())
       );

       INSERT INTO InventoryTransactions (
         TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
         PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
         UnitCost, TotalCostVnd
       )
       VALUES (
         @txId, @variantShadowId, 'IN', @qty, @ref, COALESCE(@createdAt, GETDATE()),
         @performedByRole, @performedById, @performedByName, @performedByEmail,
         @unitCost, @totalCost
       );`,
      {
        variantId: kind.id,
        productId: kind.productId,
        variantShadowId,
        txId,
        lotId,
        qty: Math.trunc(amount),
        ref: normalizeReferenceId(txReference || txRef),
        createdAt: when,
        receivedAt: when,
        expiryDate: parsedExpiry,
        supplier: supplier || null,
        referenceId: normalizeReferenceId(referenceId),
        note: lotNote ? String(lotNote).slice(0, 255) : null,
        performedByRole: actor?.roleKey ?? null,
        performedById: actor?.userId ?? null,
        performedByName: actor?.name ?? null,
        performedByEmail: actor?.email ?? null,
        unitCost: unitCost !== null && Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null,
        sellPrice: Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : null,
        totalCost: Number.isFinite(totalCost) ? totalCost : null,
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

     const totalCost = amount * unitCost
     const lotId = newId()
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

       INSERT INTO InventoryLots (
         LotId, InventoryItemId, ReceivedAt, ExpiryDate, UnitCost,
         InitialQty, RemainingQty, Supplier, ReferenceId, Note, CreatedAt
       )
       VALUES (
         @lotId, @shadowId, COALESCE(@receivedAt, GETDATE()), @expiryDate, @unitCost,
         @qty, @qty, @supplier, @referenceId, @note, COALESCE(@createdAt, SYSUTCDATETIME())
       );

       INSERT INTO InventoryTransactions (
         TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
         PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
         UnitCost, TotalCostVnd
       )
       VALUES (
         @txId, @shadowId, 'IN', @qty, @ref, COALESCE(@createdAt, GETDATE()),
         @performedByRole, @performedById, @performedByName, @performedByEmail,
         @unitCost, @totalCost
       );`,
      {
        itemId: kind.id,
        shadowId,
        txId,
        lotId,
        qty: Math.trunc(amount),
        ref: txRef,
        createdAt: when,
        receivedAt: when,
        expiryDate: parsedExpiry,
        supplier: supplier || null,
        referenceId: normalizeReferenceId(referenceId),
        note: note ? String(note).slice(0, 255) : null,
        performedByRole: actor?.roleKey ?? null,
        performedById: actor?.userId ?? null,
        performedByName: actor?.name ?? null,
        performedByEmail: actor?.email ?? null,
        unitCost: unitCost !== null && Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null,
        totalCost: Number.isFinite(totalCost) ? totalCost : null,
      }
    )

    if (kind.kind === 'variant' && sellPrice !== undefined) {
      await query(
        `UPDATE ProductVariants
         SET Price = COALESCE(@price, Price)
         WHERE VariantId = @variantId`,
        {
          variantId: kind.id,
          price: sellPrice,
        }
      )
    }
  }

  return { id: txRef || newId() }
}

async function stockOut(payload, { actor } = {}) {
  const { inventoryItemId, qty, date, note, variantName } = payload || {}
  const amount = Number(qty)
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Invalid qty')
    err.status = 400
    throw err
  }
  validateMaxNumber(amount, 'qty', MAX_INVENTORY_QTY)

  const itemId = inventoryItemId
  if (!itemId) {
    const err = new Error('Missing inventoryItemId')
    err.status = 400
    throw err
  }

  let kind = await resolveSkuKind(itemId)
  if (!kind) {
    const err = new Error('Unknown SKU')
    err.status = 404
    throw err
  }

  if (kind.kind === 'product') {
    const variantCount = await getRetailVariantCount(kind.id)
    if (variantCount > 0) {
      const err = new Error('Retail stock-out must target a specific variant')
      err.status = 400
      throw err
    }
    const defaultVariantId = await ensureRetailVariantByName(kind.id, DEFAULT_RETAIL_VARIANT_NAME)
    kind = { kind: 'variant', id: defaultVariantId, productId: kind.id }
  }

  const when = validateNotFutureDate(date, 'date')
  const normalizedVariantName = String(variantName || '').trim()
  if (normalizedVariantName && hasDangerousInput(normalizedVariantName)) {
    const err = new Error('Invalid variantName')
    err.status = 400
    throw err
  }

  if (kind.kind === 'inventory') {
    const pool = await getPool()
    const transaction = new sql.Transaction(pool)

    await transaction.begin()
    try {
      const lotsRes = await new sql.Request(transaction)
        .input('itemId', kind.id)
        .query(
          `SELECT LotId, RemainingQty, UnitCost, Note, ExpiryDate, ReceivedAt
           FROM InventoryLots WITH (UPDLOCK, ROWLOCK)
           WHERE InventoryItemId = @itemId
             AND RemainingQty > 0
           ORDER BY ExpiryDate ASC, ReceivedAt ASC, LotId ASC`
        )

      const targetVariant = normalizeVariantLabel(normalizedVariantName)
      const candidateLots = (lotsRes.recordset || []).filter((lot) => {
        const remainingQty = Number(lot?.RemainingQty || 0)
        if (!Number.isFinite(remainingQty) || remainingQty <= 0) return false
        if (!targetVariant) return true
        const lotVariant = normalizeVariantLabel(extractVariantFromLotNote(lot?.Note))
        return lotVariant && lotVariant === targetVariant
      })

      const totalQty = candidateLots.reduce((sum, lot) => sum + Number(lot?.RemainingQty || 0), 0)
      if (totalQty < amount) {
        const err = new Error(targetVariant ? 'Insufficient stock for selected variant' : 'Insufficient stock')
        err.status = 409
        throw err
      }

      let remaining = amount
      let totalCost = 0

      for (const lot of candidateLots) {
        if (remaining <= 0) break
        const available = Number(lot?.RemainingQty || 0)
        if (!Number.isFinite(available) || available <= 0) continue

        const usedQty = Math.min(available, remaining)
        remaining -= usedQty

        const unitCost = Number(lot?.UnitCost || 0)
        if (Number.isFinite(unitCost) && unitCost > 0) {
          totalCost += usedQty * unitCost
        }

        await new sql.Request(transaction)
          .input('lotId', lot.LotId)
          .input('qty', usedQty)
          .query(
            `UPDATE InventoryLots
             SET RemainingQty = COALESCE(RemainingQty, 0) - @qty
             WHERE LotId = @lotId`
          )
      }

      if (remaining > 0) {
        const err = new Error('Insufficient stock')
        err.status = 409
        throw err
      }

      const newQty = totalQty - amount
      await new sql.Request(transaction)
        .input('itemId', kind.id)
        .input('qty', newQty)
        .query(
          `UPDATE InventoryItems
           SET Quantity = @qty
           WHERE InventoryItemId = @itemId`
        )

      const txId = newId()
      const avgUnitCost = amount > 0 ? totalCost / amount : null
      await new sql.Request(transaction)
        .input('txId', txId)
        .input('itemId', kind.id)
        .input('qty', amount)
        .input('ref', normalizeReferenceId(note))
        .input('createdAt', when)
        .input('performedByRole', actor?.roleKey ?? null)
        .input('performedById', actor?.userId ?? null)
        .input('performedByName', actor?.name ?? null)
        .input('performedByEmail', actor?.email ?? null)
        .input('unitCost', Number.isFinite(avgUnitCost) ? avgUnitCost : null)
        .input('totalCost', Number.isFinite(totalCost) ? totalCost : null)
        .query(
          `INSERT INTO InventoryTransactions (
             TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
             PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
             UnitCost, TotalCostVnd
           )
           VALUES (
             @txId, @itemId, 'OUT', @qty, @ref, COALESCE(@createdAt, GETDATE()),
             @performedByRole, @performedById, @performedByName, @performedByEmail,
             @unitCost, @totalCost
           )`
        )

      await transaction.commit()
      console.info('[stockOut] inventory lots consumed', {
        inventoryItemId: kind.id,
        qty: amount,
        totalCost,
      })
      return { id: txId }
    } catch (err) {
      try {
        await transaction.rollback()
      } catch {
        // ignore rollback errors
      }
      throw err
    }
  }

  if (kind.kind === 'variant') {
    if (!Number.isInteger(amount)) {
      const err = new Error('Invalid qty (must be an integer for retail variants)')
      err.status = 400
      throw err
    }

    const variantShadowId = retailVariantShadowId(kind.id)
    const schema = await getSchemaInfo()
    if (!schema.inventoryHasCategoryId) {
      const err = new Error('InventoryItems.CategoryId is missing')
      err.status = 400
      throw err
    }

    const variantMeta = await query(
      `SELECT TOP 1 VariantName
       FROM ProductVariants
       WHERE VariantId = @variantId`,
      { variantId: kind.id }
    )
    const variantName = String(variantMeta.recordset?.[0]?.VariantName || '').trim()
    const variantTag = variantName ? `Variant: ${variantName}` : `Variant: ${kind.id}`
    const txReference = `${variantTag}${note ? ` | ${String(note).trim()}` : ''}`

    const pool = await getPool()
    const transaction = new sql.Transaction(pool)

    await transaction.begin()
    try {
      const currentVariantRes = await new sql.Request(transaction)
        .input('variantId', kind.id)
        .query('SELECT TOP 1 COALESCE(Stock, 0) AS Stock FROM ProductVariants WHERE VariantId = @variantId')
      const currentVariantStock = Number(currentVariantRes.recordset?.[0]?.Stock || 0)
      if (currentVariantStock < amount) {
        const err = new Error('Insufficient stock')
        err.status = 409
        throw err
      }

      const totalRes = await new sql.Request(transaction)
        .input('itemId', variantShadowId)
        .query(
          `SELECT COALESCE(SUM(RemainingQty), 0) AS TotalQty
           FROM InventoryLots
           WHERE InventoryItemId = @itemId`
        )

      const totalQty = Number(totalRes.recordset?.[0]?.TotalQty || 0)
      let totalCost = 0
      if (totalQty > 0) {
        if (totalQty < amount) {
          const err = new Error('Insufficient stock')
          err.status = 409
          throw err
        }

        const lotsRes = await new sql.Request(transaction)
          .input('itemId', variantShadowId)
          .query(
            `SELECT LotId, RemainingQty, UnitCost
             FROM InventoryLots WITH (UPDLOCK, ROWLOCK)
             WHERE InventoryItemId = @itemId
               AND RemainingQty > 0
             ORDER BY ExpiryDate ASC, ReceivedAt ASC, LotId ASC`
          )

        let remaining = amount
        for (const lot of lotsRes.recordset || []) {
          if (remaining <= 0) break
          const available = Number(lot?.RemainingQty || 0)
          if (!Number.isFinite(available) || available <= 0) continue

          const usedQty = Math.min(available, remaining)
          remaining -= usedQty

          const unitCost = Number(lot?.UnitCost || 0)
          if (Number.isFinite(unitCost) && unitCost > 0) {
            totalCost += usedQty * unitCost
          }

          await new sql.Request(transaction)
            .input('lotId', lot.LotId)
            .input('qty', usedQty)
            .query(
              `UPDATE InventoryLots
               SET RemainingQty = COALESCE(RemainingQty, 0) - @qty
               WHERE LotId = @lotId`
            )
        }

        if (remaining > 0) {
          const err = new Error('Insufficient stock')
          err.status = 409
          throw err
        }
      } else {
        const unitCostRes = await new sql.Request(transaction)
          .input('shadowId', variantShadowId)
          .query(
            `SELECT TOP 1 PriceVnd
             FROM InventoryItems
             WHERE InventoryItemId = @shadowId`
          )
        const unitCost = Number(unitCostRes.recordset?.[0]?.PriceVnd || 0)
        totalCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * amount : 0
      }

      const txId = newId()
      const avgUnitCost = amount > 0 ? totalCost / amount : null
      await new sql.Request(transaction)
        .input('variantId', kind.id)
        .input('productId', kind.productId)
        .input('variantShadowId', variantShadowId)
        .input('txId', txId)
        .input('qty', Math.trunc(amount))
        .input('createdAt', when)
        .input('ref', normalizeReferenceId(txReference))
        .input('unitCost', Number.isFinite(avgUnitCost) ? avgUnitCost : null)
        .input('totalCost', Number.isFinite(totalCost) ? totalCost : null)
        .input('performedByRole', actor?.roleKey ?? null)
        .input('performedById', actor?.userId ?? null)
        .input('performedByName', actor?.name ?? null)
        .input('performedByEmail', actor?.email ?? null)
        .query(
          `UPDATE ProductVariants
           SET Stock = COALESCE(Stock, 0) - @qty
           WHERE VariantId = @variantId;

           UPDATE Products
           SET Stock = COALESCE(Stock, 0) - @qty
           WHERE ProductId = @productId;

           UPDATE InventoryItems
           SET
               ProductId = NULL,
             CategoryId = COALESCE((SELECT TOP 1 CategoryId FROM Products WHERE ProductId = @productId), CategoryId),
             Quantity = (SELECT COALESCE(Stock, 0) FROM ProductVariants WHERE VariantId = @variantId),
               ItemGroup = 'service'
           WHERE InventoryItemId = @variantShadowId;

           INSERT INTO InventoryTransactions (
             TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
             PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
             UnitCost, TotalCostVnd
           )
           VALUES (
             @txId, @variantShadowId, 'OUT', @qty, @ref, COALESCE(@createdAt, GETDATE()),
             @performedByRole, @performedById, @performedByName, @performedByEmail,
             @unitCost, @totalCost
           );`
        )

      await transaction.commit()
      return { id: txId }
    } catch (err) {
      try {
        await transaction.rollback()
      } catch {
        // ignore rollback errors
      }
      throw err
    }
  }

  // For retail products, record stock-out in InventoryTransactions (no Orders needed).
  if (!Number.isInteger(amount)) {
    const err = new Error('Invalid qty (must be an integer for retail products)')
    err.status = 400
    throw err
  }

  const shadowId = retailShadowId(kind.id)
  const schema = await getSchemaInfo()
  if (!schema.inventoryHasCategoryId) {
    const err = new Error('InventoryItems.CategoryId is missing')
    err.status = 400
    throw err
  }

  const pool = await getPool()
  const transaction = new sql.Transaction(pool)

  await transaction.begin()
  try {
    const totalRes = await new sql.Request(transaction)
      .input('itemId', shadowId)
      .query(
        `SELECT COALESCE(SUM(RemainingQty), 0) AS TotalQty
         FROM InventoryLots
         WHERE InventoryItemId = @itemId`
      )

    const totalQty = Number(totalRes.recordset?.[0]?.TotalQty || 0)
    if (totalQty > 0) {
      if (totalQty < amount) {
        const err = new Error('Insufficient stock')
        err.status = 409
        throw err
      }

      const lotsRes = await new sql.Request(transaction)
        .input('itemId', shadowId)
        .query(
          `SELECT LotId, RemainingQty, UnitCost
           FROM InventoryLots WITH (UPDLOCK, ROWLOCK)
           WHERE InventoryItemId = @itemId
             AND RemainingQty > 0
           ORDER BY ExpiryDate ASC, ReceivedAt ASC, LotId ASC`
        )

      let remaining = amount
      let totalCost = 0

      for (const lot of lotsRes.recordset || []) {
        if (remaining <= 0) break
        const available = Number(lot?.RemainingQty || 0)
        if (!Number.isFinite(available) || available <= 0) continue

        const usedQty = Math.min(available, remaining)
        remaining -= usedQty

        const unitCost = Number(lot?.UnitCost || 0)
        if (Number.isFinite(unitCost) && unitCost > 0) {
          totalCost += usedQty * unitCost
        }

        await new sql.Request(transaction)
          .input('lotId', lot.LotId)
          .input('qty', usedQty)
          .query(
            `UPDATE InventoryLots
             SET RemainingQty = COALESCE(RemainingQty, 0) - @qty
             WHERE LotId = @lotId`
          )
      }

      if (remaining > 0) {
        const err = new Error('Insufficient stock')
        err.status = 409
        throw err
      }

      const txId = newId()
      const avgUnitCost = amount > 0 ? totalCost / amount : null
      await new sql.Request(transaction)
        .input('txId', txId)
        .input('itemId', shadowId)
        .input('qty', amount)
        .input('ref', normalizeReferenceId(note))
        .input('createdAt', when)
        .input('performedByRole', actor?.roleKey ?? null)
        .input('performedById', actor?.userId ?? null)
        .input('performedByName', actor?.name ?? null)
        .input('performedByEmail', actor?.email ?? null)
        .input('unitCost', Number.isFinite(avgUnitCost) ? avgUnitCost : null)
        .input('totalCost', Number.isFinite(totalCost) ? totalCost : null)
        .query(
          `INSERT INTO InventoryTransactions (
             TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
             PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
             UnitCost, TotalCostVnd
           )
           VALUES (
             @txId, @itemId, 'OUT', @qty, @ref, COALESCE(@createdAt, GETDATE()),
             @performedByRole, @performedById, @performedByName, @performedByEmail,
             @unitCost, @totalCost
           )`
        )

      await new sql.Request(transaction)
        .input('productId', kind.id)
        .input('qty', Math.trunc(amount))
        .query(
          `UPDATE Products
           SET Stock = COALESCE(Stock, 0) - @qty
           WHERE ProductId = @productId`
        )
    } else {
      const currentRes = await new sql.Request(transaction)
        .input('id', kind.id)
        .query('SELECT TOP 1 Stock FROM Products WHERE ProductId = @id')
      const cur = Number(currentRes.recordset?.[0]?.Stock || 0)
      if (cur < amount) {
        const err = new Error('Insufficient stock')
        err.status = 409
        throw err
      }

      const unitCostRes = await new sql.Request(transaction)
        .input('shadowId', shadowId)
        .query(
          `SELECT TOP 1 PriceVnd
           FROM InventoryItems
           WHERE InventoryItemId = @shadowId`
        )
      const unitCost = Number(unitCostRes.recordset?.[0]?.PriceVnd || 0)
      const totalCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * amount : null

      const txId = newId()
      await new sql.Request(transaction)
        .input('productId', kind.id)
        .input('shadowId', shadowId)
        .input('txId', txId)
        .input('qty', Math.trunc(amount))
        .input('createdAt', when)
        .input('ref', normalizeReferenceId(note))
        .input('unitCost', Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null)
        .input('totalCost', Number.isFinite(totalCost) ? totalCost : null)
        .input('performedByRole', actor?.roleKey ?? null)
        .input('performedById', actor?.userId ?? null)
        .input('performedByName', actor?.name ?? null)
        .input('performedByEmail', actor?.email ?? null)
        .query(
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
             PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
             UnitCost, TotalCostVnd
           )
           VALUES (
             @txId, @shadowId, 'OUT', @qty, @ref, COALESCE(@createdAt, GETDATE()),
             @performedByRole, @performedById, @performedByName, @performedByEmail,
             @unitCost, @totalCost
           );`
        )
    }

    await new sql.Request(transaction)
      .input('productId', kind.id)
      .input('shadowId', shadowId)
      .query(
        `UPDATE InventoryItems
         SET
           ProductId = COALESCE(@productId, ProductId),
           CategoryId = COALESCE((SELECT TOP 1 CategoryId FROM Products WHERE ProductId = @productId), CategoryId),
           Quantity = (SELECT COALESCE(Stock, 0) FROM Products WHERE ProductId = @productId),
           ItemGroup = 'retail'
         WHERE InventoryItemId = @shadowId;`
      )

    await transaction.commit()
  } catch (err) {
    try {
      await transaction.rollback()
    } catch {
      // ignore rollback errors
    }
    throw err
  }

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

  const schema = await getSchemaInfo()
  const pool = await getPool()
  const transaction = new sql.Transaction(pool)

  await transaction.begin()

  try {
    if (kind.kind === 'inventory') {
      if (schema.inventoryHasStatus) {
        await new sql.Request(transaction)
          .input('id', kind.id)
          .input('status', 'inactive')
          .query(
            `UPDATE InventoryItems
             SET Status = @status
             WHERE InventoryItemId = @id`
          )
      } else {
        await new sql.Request(transaction)
          .input('id', kind.id)
          .query(
            `UPDATE InventoryItems
             SET ItemGroup = 'deleted'
             WHERE InventoryItemId = @id`
          )
      }

      await transaction.commit()
      return { id: itemId, status: 'inactive' }
    }

    if (schema.productsHasStatus) {
      await new sql.Request(transaction)
        .input('id', kind.id)
        .input('status', 'inactive')
        .query(
          `UPDATE Products
           SET Status = @status
           WHERE ProductId = @id`
        )
    }

    const shadowId = retailShadowId(kind.id)
    if (schema.inventoryHasStatus) {
      await new sql.Request(transaction)
        .input('shadowId', shadowId)
        .input('status', 'inactive')
        .query(
          `UPDATE InventoryItems
           SET Status = @status
           WHERE InventoryItemId = @shadowId`
        )
    } else {
      await new sql.Request(transaction)
        .input('shadowId', shadowId)
        .query(
          `UPDATE InventoryItems
           SET ItemGroup = 'deleted'
           WHERE InventoryItemId = @shadowId`
        )
    }

    await transaction.commit()
  } catch (err) {
    try {
      await transaction.rollback()
    } catch {
      // ignore rollback errors
    }
    throw err
  }

  return { id: itemId, status: 'inactive' }
}

function normalizeRole(input) {
  return String(input || '').trim().toLowerCase()
}

function ensureOwnerOrAdminActor(actor) {
  const role = normalizeRole(actor?.roleKey)
  if (role === '1' || role === 'owner' || role === 'admin') return

  const err = new Error('Forbidden: only owner/admin can modify or delete inventory lots')
  err.status = 403
  throw err
}

async function updateLot(lotId, payload, { actor } = {}) {
  ensureOwnerOrAdminActor(actor)

  const normalizedLotId = String(lotId || '').trim()
  if (!normalizedLotId) {
    const err = new Error('Missing lotId')
    err.status = 400
    throw err
  }

  const lotRes = await query(
    `SELECT TOP 1
       l.LotId,
       l.InventoryItemId,
       l.VariantId,
      l.InitialQty,
       l.RemainingQty,
       l.UnitCost,
       l.ReceivedAt,
       l.ExpiryDate,
       l.Supplier,
       l.Note,
       i.ItemGroup,
       i.ProductId
     FROM InventoryLots l
     LEFT JOIN InventoryItems i ON i.InventoryItemId = l.InventoryItemId
     WHERE l.LotId = @lotId`,
    { lotId: normalizedLotId }
  )

  const lot = lotRes.recordset?.[0]
  if (!lot) {
    const err = new Error('Lot not found')
    err.status = 404
    throw err
  }

  const hasRemainingQty = payload && Object.prototype.hasOwnProperty.call(payload, 'remainingQty')
  const hasQty = payload && Object.prototype.hasOwnProperty.call(payload, 'qty')
  const hasPrice = payload && Object.prototype.hasOwnProperty.call(payload, 'price')
  const hasUnitCost = payload && Object.prototype.hasOwnProperty.call(payload, 'unitCost')
  const hasImportPrice = payload && Object.prototype.hasOwnProperty.call(payload, 'importPrice')
  const hasSellPrice = payload && Object.prototype.hasOwnProperty.call(payload, 'sellPriceVnd')
  const hasReceivedAt = payload && Object.prototype.hasOwnProperty.call(payload, 'receivedAt')
  const hasDate = payload && Object.prototype.hasOwnProperty.call(payload, 'date')
  const hasExpiryDate = payload && Object.prototype.hasOwnProperty.call(payload, 'expiryDate')
  const hasSupplier = payload && Object.prototype.hasOwnProperty.call(payload, 'supplier')
  const hasNote = payload && Object.prototype.hasOwnProperty.call(payload, 'note')

  const hasAnyField =
    hasRemainingQty ||
    hasQty ||
    hasPrice ||
    hasUnitCost ||
    hasImportPrice ||
    hasReceivedAt ||
    hasDate ||
    hasExpiryDate ||
    hasSupplier ||
    hasNote

  if (!hasAnyField) {
    const err = new Error('Nothing to update')
    err.status = 400
    throw err
  }

  const isRetail = String(lot?.ItemGroup || '').toLowerCase() === 'retail' || String(lot?.InventoryItemId || '').startsWith('retail_')
  const variantIdFromShadow = parseVariantIdFromRetailShadowId(lot?.InventoryItemId)
  const isRetailVariant = Boolean(variantIdFromShadow)
  const isService = !isRetail
  const initialQty = Number(lot?.InitialQty || 0)
  const oldRemaining = Number(lot?.RemainingQty || 0)
  const oldUnitCost = Number(lot?.UnitCost || 0)
  const oldReceivedAt = lot?.ReceivedAt ? new Date(lot.ReceivedAt) : null
  const oldExpiryDate = lot?.ExpiryDate ? new Date(lot.ExpiryDate) : null
  const oldSupplier = parseOptionalString(lot?.Supplier)
  const oldNote = parseOptionalString(lot?.Note)

  let nextRemaining = oldRemaining
  if (hasRemainingQty || hasQty) {
    const raw = hasRemainingQty ? payload?.remainingQty : payload?.qty
    const parsed = parseNonNegativeDecimal(raw)
    if (parsed === null) {
      const err = new Error('Invalid remainingQty')
      err.status = 400
      throw err
    }
    if (isRetail && !Number.isInteger(parsed)) {
      const err = new Error('remainingQty must be an integer for retail lots')
      err.status = 400
      throw err
    }
    validateMaxNumber(parsed, 'remainingQty', MAX_INVENTORY_QTY)
    if (Number.isFinite(initialQty) && initialQty > 0 && parsed > initialQty) {
      const err = new Error('remainingQty cannot exceed initial lot quantity')
      err.status = 400
      throw err
    }
    nextRemaining = parsed
  }

  let unitCost = null
  if (hasPrice || hasUnitCost || hasImportPrice) {
    unitCost = parseMoneyVnd(
      hasUnitCost
        ? payload?.unitCost
        : hasImportPrice
          ? payload?.importPrice
          : payload?.price
    )
    if (unitCost === null || !Number.isFinite(unitCost) || unitCost <= 0) {
      const err = new Error('Invalid unitCost')
      err.status = 400
      throw err
    }
    validateMaxNumber(unitCost, 'unitCost', MAX_PRICE_VND)
  }

  let sellPrice = null
  if (hasSellPrice) {
    sellPrice = parseMoneyVnd(payload?.sellPriceVnd)
    if (sellPrice === null || !Number.isFinite(sellPrice) || sellPrice <= 0) {
      const err = new Error('Invalid sellPriceVnd')
      err.status = 400
      throw err
    }
    validateMaxNumber(sellPrice, 'sellPriceVnd', MAX_PRICE_VND)
  }

  let receivedAt = null
  if (hasReceivedAt || hasDate) {
    receivedAt = validateNotFutureDate(hasReceivedAt ? payload?.receivedAt : payload?.date, 'receivedAt')
  }

  let expiryDate = null
  if (hasExpiryDate) {
    const rawExpiry = String(payload?.expiryDate || '').trim()
    if (rawExpiry) {
      expiryDate = parseOptionalDate(rawExpiry)
      if (!expiryDate) {
        const err = new Error('Invalid expiryDate')
        err.status = 400
        throw err
      }
    }
  }

  const supplier = hasSupplier ? parseOptionalString(payload?.supplier) : undefined
  const note = hasNote ? parseOptionalString(payload?.note) : undefined
  if (hasSupplier && supplier && supplier.length > 200) {
    const err = new Error('supplier is too long')
    err.status = 400
    throw err
  }
  if (hasSupplier && supplier && hasDangerousInput(supplier)) {
    const err = new Error('Invalid supplier')
    err.status = 400
    throw err
  }
  if (hasNote && note && note.length > 255) {
    const err = new Error('note is too long')
    err.status = 400
    throw err
  }

  const effectiveReceivedAt = (hasReceivedAt || hasDate) ? receivedAt : oldReceivedAt
  const effectiveExpiryDate = hasExpiryDate ? expiryDate : oldExpiryDate
  if (effectiveExpiryDate && effectiveReceivedAt && effectiveExpiryDate.getTime() < effectiveReceivedAt.getTime()) {
    const err = new Error('expiryDate must be greater than or equal to receivedAt')
    err.status = 400
    throw err
  }
  if (isService && hasExpiryDate && !effectiveExpiryDate) {
    const err = new Error('Supplies lots require expiryDate')
    err.status = 400
    throw err
  }

  const delta = nextRemaining - oldRemaining
  const effectiveUnitCost = hasPrice || hasUnitCost || hasImportPrice ? unitCost : oldUnitCost

  const pool = await getPool()
  const transaction = new sql.Transaction(pool)

  await transaction.begin()
  try {
    await new sql.Request(transaction)
      .input('lotId', normalizedLotId)
      .input('remainingQty', hasRemainingQty || hasQty ? nextRemaining : null)
      .input('unitCost', hasPrice || hasUnitCost || hasImportPrice ? unitCost : null)
      .input('sellPrice', hasSellPrice ? sellPrice : null)
      .input('receivedAt', hasReceivedAt || hasDate ? receivedAt : null)
      .input('expiryDate', hasExpiryDate ? expiryDate : null)
      .input('supplier', hasSupplier ? supplier : null)
      .input('note', hasNote ? (note ? String(note).slice(0, 255) : null) : null)
      .query(
        `UPDATE InventoryLots
         SET
           RemainingQty = COALESCE(@remainingQty, RemainingQty),
           UnitCost = COALESCE(@unitCost, UnitCost),
           ReceivedAt = COALESCE(@receivedAt, ReceivedAt),
           ExpiryDate = COALESCE(@expiryDate, ExpiryDate),
           Supplier = COALESCE(@supplier, Supplier),
           Note = COALESCE(@note, Note)
         WHERE LotId = @lotId`
      )

    if (hasSellPrice) {
      const variantId = String(lot?.VariantId || parseVariantIdFromRetailShadowId(lot?.InventoryItemId) || '').trim()
      if (variantId) {
        await new sql.Request(transaction)
          .input('variantId', variantId)
          .input('sellPrice', sellPrice)
          .query(
            `UPDATE ProductVariants
             SET Price = COALESCE(@sellPrice, Price)
             WHERE VariantId = @variantId`
          )
      }
    }

    if (delta !== 0) {
      await new sql.Request(transaction)
        .input('inventoryItemId', lot.InventoryItemId)
        .input('delta', delta)
        .query(
          `UPDATE InventoryItems
           SET Quantity = COALESCE(Quantity, 0) + @delta
           WHERE InventoryItemId = @inventoryItemId`
        )

      if (isRetail) {
        const productId = lot.ProductId || String(lot.InventoryItemId || '').replace(/^retail_/, '')
        if (isRetailVariant) {
          await new sql.Request(transaction)
            .input('variantId', variantIdFromShadow)
            .input('delta', delta)
            .query(
              `UPDATE ProductVariants
               SET Stock = COALESCE(Stock, 0) + @delta
               WHERE VariantId = @variantId`
            )
        }
        if (productId) {
          await new sql.Request(transaction)
            .input('productId', productId)
            .input('delta', delta)
            .query(
              `UPDATE Products
               SET Stock = COALESCE(Stock, 0) + @delta
               WHERE ProductId = @productId`
            )

          await new sql.Request(transaction)
            .input('inventoryItemId', lot.InventoryItemId)
            .input('productId', productId)
            .query(
              `UPDATE InventoryItems
               SET Quantity = (SELECT COALESCE(Stock, 0) FROM Products WHERE ProductId = @productId)
               WHERE InventoryItemId = @inventoryItemId`
            )
        }
      }
    }

    const hasMetaChange =
      (hasPrice || hasUnitCost || hasImportPrice) ||
      (hasReceivedAt || hasDate) ||
      hasExpiryDate ||
      (hasSupplier && supplier !== oldSupplier) ||
      (hasNote && note !== oldNote)

    if (delta !== 0 || hasMetaChange) {
      const txId = newId()
      await new sql.Request(transaction)
        .input('txId', txId)
        .input('itemId', lot.InventoryItemId)
        .input('qty', delta)
        .input('ref', normalizeReferenceId(`LOT_EDIT:${normalizedLotId}`))
        .input('createdAt', new Date())
        .input('performedByRole', actor?.roleKey ?? null)
        .input('performedById', actor?.userId ?? null)
        .input('performedByName', actor?.name ?? null)
        .input('performedByEmail', actor?.email ?? null)
        .input('unitCost', Number.isFinite(effectiveUnitCost) ? effectiveUnitCost : null)
        .input('totalCost', Number.isFinite(effectiveUnitCost) ? effectiveUnitCost * Math.abs(delta) : null)
        .query(
          `INSERT INTO InventoryTransactions (
             TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
             PerformedByRole, PerformedById, PerformedByName, PerformedByEmail,
             UnitCost, TotalCostVnd
           )
           VALUES (
             @txId, @itemId, 'ADJUST', @qty, @ref, COALESCE(@createdAt, GETDATE()),
             @performedByRole, @performedById, @performedByName, @performedByEmail,
             @unitCost, @totalCost
           )`
        )
    }

    await transaction.commit()
  } catch (err) {
    try {
      await transaction.rollback()
    } catch {
      // ignore rollback errors
    }
    throw err
  }

  return {
    lotId: normalizedLotId,
    inventoryItemId: lot.InventoryItemId,
    remainingQty: nextRemaining,
  }
}

async function deleteLot(lotId, { actor } = {}) {
  ensureOwnerOrAdminActor(actor)

  const normalizedLotId = String(lotId || '').trim()
  if (!normalizedLotId) {
    const err = new Error('Missing lotId')
    err.status = 400
    throw err
  }

  const lotRes = await query(
    `SELECT TOP 1
       l.LotId,
       l.InventoryItemId,
       l.RemainingQty,
       i.ItemGroup,
       i.ProductId
     FROM InventoryLots l
     LEFT JOIN InventoryItems i ON i.InventoryItemId = l.InventoryItemId
     WHERE l.LotId = @lotId`,
    { lotId: normalizedLotId }
  )

  const lot = lotRes.recordset?.[0]
  if (!lot) {
    const err = new Error('Lot not found')
    err.status = 404
    throw err
  }

  const removedRemaining = Number(lot?.RemainingQty || 0)
  const isRetail = String(lot?.ItemGroup || '').toLowerCase() === 'retail' || String(lot?.InventoryItemId || '').startsWith('retail_')
  const variantIdFromShadow = parseVariantIdFromRetailShadowId(lot?.InventoryItemId)
  const isRetailVariant = Boolean(variantIdFromShadow)

  const pool = await getPool()
  const transaction = new sql.Transaction(pool)

  await transaction.begin()
  try {
    await new sql.Request(transaction)
      .input('lotId', normalizedLotId)
      .query('DELETE FROM InventoryLots WHERE LotId = @lotId')

    if (removedRemaining > 0) {
      await new sql.Request(transaction)
        .input('inventoryItemId', lot.InventoryItemId)
        .input('delta', removedRemaining)
        .query(
          `UPDATE InventoryItems
           SET Quantity = CASE
             WHEN COALESCE(Quantity, 0) - @delta < 0 THEN 0
             ELSE COALESCE(Quantity, 0) - @delta
           END
           WHERE InventoryItemId = @inventoryItemId`
        )

      if (isRetail) {
        const productId = lot.ProductId || String(lot.InventoryItemId || '').replace(/^retail_/, '')
        if (isRetailVariant) {
          await new sql.Request(transaction)
            .input('variantId', variantIdFromShadow)
            .input('delta', removedRemaining)
            .query(
              `UPDATE ProductVariants
               SET Stock = CASE
                 WHEN COALESCE(Stock, 0) - @delta < 0 THEN 0
                 ELSE COALESCE(Stock, 0) - @delta
               END
               WHERE VariantId = @variantId`
            )
        }
        if (productId) {
          await new sql.Request(transaction)
            .input('productId', productId)
            .input('delta', removedRemaining)
            .query(
              `UPDATE Products
               SET Stock = CASE
                 WHEN COALESCE(Stock, 0) - @delta < 0 THEN 0
                 ELSE COALESCE(Stock, 0) - @delta
               END
               WHERE ProductId = @productId`
            )

          await new sql.Request(transaction)
            .input('inventoryItemId', lot.InventoryItemId)
            .input('productId', productId)
            .query(
              `UPDATE InventoryItems
               SET Quantity = (SELECT COALESCE(Stock, 0) FROM Products WHERE ProductId = @productId)
               WHERE InventoryItemId = @inventoryItemId`
            )
        }
      }
    }

    const txId = newId()
    await new sql.Request(transaction)
      .input('txId', txId)
      .input('itemId', lot.InventoryItemId)
      .input('qty', -Math.abs(removedRemaining))
      .input('ref', normalizeReferenceId(`LOT_DELETE:${normalizedLotId}`))
      .input('createdAt', new Date())
      .input('performedByRole', actor?.roleKey ?? null)
      .input('performedById', actor?.userId ?? null)
      .input('performedByName', actor?.name ?? null)
      .input('performedByEmail', actor?.email ?? null)
      .query(
        `INSERT INTO InventoryTransactions (
           TransactionId, InventoryItemId, Type, Quantity, ReferenceId, CreatedAt,
           PerformedByRole, PerformedById, PerformedByName, PerformedByEmail
         )
         VALUES (
           @txId, @itemId, 'DELETE', @qty, @ref, COALESCE(@createdAt, GETDATE()),
           @performedByRole, @performedById, @performedByName, @performedByEmail
         )`
      )

    await transaction.commit()
  } catch (err) {
    try {
      await transaction.rollback()
    } catch {
      // ignore rollback errors
    }
    throw err
  }

  return { lotId: normalizedLotId }
}

module.exports = {
  initializeInventoryService,
  getInventory,
  getInventorySnapshotExportBuffer,
  getInventoryMovementExportBuffer,
  getInventoryLowStockExportBuffer,
  fifoPreview,
  createInventoryItem,
  updateItem,
  stockIn,
  stockOut,
  deleteItem,
  updateLot,
  deleteLot,
  importInventoryFromExcel,
  getInventoryImportTemplateBuffer,
}
