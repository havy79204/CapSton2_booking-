const { query, newId } = require('../config/query')
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const { env } = require('../config/config')
const { getSettingsMap } = require('./settings.service')
const { upsertPaymentRecord, resolveInvoiceIdForPayment } = require('./paymentPersistence.service')
const { notifyCustomerEvent, notifyOwnerEvent, scheduleBookingReminders } = require('./notifications.service')
const { setFrontendOriginForTxnRef } = require('./vnpayFrontendReturnStore.service')

let _ordersChannelColumnPromise = null
let _reviewImageColumnPromise = null
let _cartVariantColumnPromise = null
let _orderItemVariantColumnPromise = null
let _orderItemVariantNameColumnPromise = null
const ACTIVE_SERVICE_WHERE = `(Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) = 'active')`
const REVIEW_IMAGE_COLUMN_CANDIDATES = ['ReviewImages', 'ImageUrls', 'ImagesJson', 'ImageUrl']
const ORDER_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SHIPPING: 'SHIPPING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
}

function normalizeOrderLifecycleStatus(rawStatus) {
  const value = String(rawStatus || '').trim().toLowerCase()
  if (!value) return ORDER_STATUSES.PENDING
  if (value === 'pending' || value === 'c' || value === 'awaiting') return ORDER_STATUSES.PENDING
  if (value === 'processing' || value === 'confirm' || value === 'confirmed') return ORDER_STATUSES.PROCESSING
  if (value === 'shipping' || value === 'shipped' || value === 'delivering' || value === 'in transit') return ORDER_STATUSES.SHIPPING
  if (value === 'completed' || value === 'complete' || value === 'delivered' || value === 'done' || value === 'success' || value === 'paid') return ORDER_STATUSES.COMPLETED
  if (value === 'cancelled' || value === 'cancel') return ORDER_STATUSES.CANCELLED
  return ORDER_STATUSES.PENDING
}

function canTransitionOrderStatus(from, to) {
  const fromStatus = normalizeOrderLifecycleStatus(from)
  const toStatus = normalizeOrderLifecycleStatus(to)
  const rules = {
    [ORDER_STATUSES.PENDING]: [ORDER_STATUSES.PROCESSING, ORDER_STATUSES.CANCELLED],
    [ORDER_STATUSES.PROCESSING]: [ORDER_STATUSES.SHIPPING, ORDER_STATUSES.CANCELLED],
    [ORDER_STATUSES.SHIPPING]: [ORDER_STATUSES.COMPLETED],
    [ORDER_STATUSES.COMPLETED]: [],
    [ORDER_STATUSES.CANCELLED]: [],
  }
  return (rules[fromStatus] || []).includes(toStatus)
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim()
  const m = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const base64 = m[2]
  const buf = Buffer.from(base64, 'base64')
  const ext = kind === 'jpeg' ? 'jpg' : kind
  return { buf, ext }
}

function getReviewUploadDir() {
  return path.join(__dirname, '..', '..', 'uploads', 'reviews')
}

async function saveReviewImagesFromDataUrls(imageDataUrls, options = {}) {
  const maxImages = Math.max(1, Number(options.maxImages || 3))
  const input = Array.isArray(imageDataUrls)
    ? imageDataUrls
    : imageDataUrls
      ? [imageDataUrls]
      : []

  const cleaned = input
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, maxImages)

  if (!cleaned.length) return []

  const dir = getReviewUploadDir()
  await fs.mkdir(dir, { recursive: true })

  const saved = []
  for (const dataUrl of cleaned) {
    const parsed = parseImageDataUrl(dataUrl)
    if (!parsed) continue
    if (!parsed.buf || parsed.buf.length < 1024) continue
    if (parsed.buf.length > 6 * 1024 * 1024) continue

    const fileName = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`
    const filePath = path.join(dir, fileName)
    await fs.writeFile(filePath, parsed.buf)
    saved.push(`/uploads/reviews/${fileName}`)
  }

  return saved
}

function parseReviewImagesField(rawValue) {
  if (Array.isArray(rawValue)) return rawValue.map((x) => String(x || '').trim()).filter(Boolean)
  const raw = String(rawValue || '').trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean)
  } catch (_) {
    // Ignore and fallback to CSV parsing.
  }

  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

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

function parseBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback
  const v = String(value).trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

function parseTimeToMinutes(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function getWeekdayPrefixFromDate(dateValue) {
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return null
  const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return map[d.getDay()] || null
}

function readPromotions(settingsMap) {
  if (Array.isArray(settingsMap?.Promotions)) return settingsMap.Promotions
  if (typeof settingsMap?.Promotions === 'string') {
    try {
      const parsed = JSON.parse(settingsMap.Promotions)
      return Array.isArray(parsed) ? parsed : []
    } catch (_) {
      return []
    }
  }
  return []
}

function normalizePromoCode(value) {
  return String(value || '').trim().toUpperCase()
}

function promotionUsageMarker(code) {
  return `PROMO_CODE:${normalizePromoCode(code)};`
}

function parsePositiveInt(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const x = Math.trunc(n)
  return x > 0 ? x : fallback
}

function isPromotionInDateRange(promotion, now = new Date()) {
  const start = promotion?.startDate ? new Date(promotion.startDate) : null
  const end = promotion?.endDate ? new Date(promotion.endDate) : null

  if (start && !Number.isNaN(start.getTime()) && now < start) return false
  if (end && !Number.isNaN(end.getTime())) {
    const inclusiveEnd = new Date(end)
    inclusiveEnd.setHours(23, 59, 59, 999)
    if (now > inclusiveEnd) return false
  }

  return true
}

function findActivePromotionByCode(settingsMap, rawCode) {
  const code = normalizePromoCode(rawCode)
  if (!code) return null

  const list = readPromotions(settingsMap)
  const now = new Date()

  for (const promo of list) {
    if (!promo || promo.isActive === false) continue
    if (normalizePromoCode(promo.code) !== code) continue
    if (!isPromotionInDateRange(promo, now)) continue
    return promo
  }

  return null
}

async function countPromotionUsageByUser(userId, promotionCode) {
  const marker = promotionUsageMarker(promotionCode)
  const res = await query(
    `SELECT COUNT(1) AS UsedCount
     FROM Bookings
     WHERE CustomerUserId = @userId
       AND CHARINDEX(@marker, ISNULL(Notes, '')) > 0
       AND LOWER(LTRIM(RTRIM(ISNULL(Status, 'pending')))) NOT IN ('cancel', 'cancelled')`,
    { userId, marker }
  )
  return Number(res.recordset?.[0]?.UsedCount || 0)
}

async function countPromotionUsageGlobal(promotionCode) {
  const marker = promotionUsageMarker(promotionCode)
  const res = await query(
    `SELECT COUNT(1) AS UsedCount
     FROM Bookings
     WHERE CHARINDEX(@marker, ISNULL(Notes, '')) > 0
       AND LOWER(LTRIM(RTRIM(ISNULL(Status, 'pending')))) NOT IN ('cancel', 'cancelled')`,
    { marker }
  )
  return Number(res.recordset?.[0]?.UsedCount || 0)
}

function buildBookingSettings(settingsMap, bookingDate = null) {
  const dayPrefix = bookingDate ? getWeekdayPrefixFromDate(bookingDate) : null
  const dayOpenKey = dayPrefix ? `Schedule${dayPrefix}OpenTime` : null
  const dayCloseKey = dayPrefix ? `Schedule${dayPrefix}CloseTime` : null

  const openTime = (dayOpenKey && settingsMap?.[dayOpenKey])
    || settingsMap?.ScheduleOpenTime
    || settingsMap?.SalonOpenTime
    || '08:00'
  const closeTime = (dayCloseKey && settingsMap?.[dayCloseKey])
    || settingsMap?.ScheduleCloseTime
    || settingsMap?.SalonCloseTime
    || '20:00'

  return {
    openTime: String(openTime),
    closeTime: String(closeTime),
    breakStart: String(settingsMap?.ScheduleBreakStart || '').trim() || null,
    breakEnd: String(settingsMap?.ScheduleBreakEnd || '').trim() || null,
    slotMinutes: Math.max(5, toNumber(settingsMap?.BookingSlotMinutes, 30)),
    promotionEnabled: parseBool(settingsMap?.PromotionEnabled, false),
    promotionAllowCustomerApply: parseBool(settingsMap?.PromotionAllowCustomerApply, true),
    promotionIsStackable: parseBool(settingsMap?.PromotionIsStackable, false),
    promotions: readPromotions(settingsMap),
    weekdays: {
      mon: {
        openTime: String(settingsMap?.ScheduleMonOpenTime || settingsMap?.ScheduleOpenTime || settingsMap?.SalonOpenTime || '08:00'),
        closeTime: String(settingsMap?.ScheduleMonCloseTime || settingsMap?.ScheduleCloseTime || settingsMap?.SalonCloseTime || '20:00'),
      },
      tue: {
        openTime: String(settingsMap?.ScheduleTueOpenTime || settingsMap?.ScheduleOpenTime || settingsMap?.SalonOpenTime || '08:00'),
        closeTime: String(settingsMap?.ScheduleTueCloseTime || settingsMap?.ScheduleCloseTime || settingsMap?.SalonCloseTime || '20:00'),
      },
      wed: {
        openTime: String(settingsMap?.ScheduleWedOpenTime || settingsMap?.ScheduleOpenTime || settingsMap?.SalonOpenTime || '08:00'),
        closeTime: String(settingsMap?.ScheduleWedCloseTime || settingsMap?.ScheduleCloseTime || settingsMap?.SalonCloseTime || '20:00'),
      },
      thu: {
        openTime: String(settingsMap?.ScheduleThuOpenTime || settingsMap?.ScheduleOpenTime || settingsMap?.SalonOpenTime || '08:00'),
        closeTime: String(settingsMap?.ScheduleThuCloseTime || settingsMap?.ScheduleCloseTime || settingsMap?.SalonCloseTime || '20:00'),
      },
      fri: {
        openTime: String(settingsMap?.ScheduleFriOpenTime || settingsMap?.ScheduleOpenTime || settingsMap?.SalonOpenTime || '08:00'),
        closeTime: String(settingsMap?.ScheduleFriCloseTime || settingsMap?.ScheduleCloseTime || settingsMap?.SalonCloseTime || '20:00'),
      },
      sat: {
        openTime: String(settingsMap?.ScheduleSatOpenTime || settingsMap?.ScheduleOpenTime || settingsMap?.SalonOpenTime || '08:00'),
        closeTime: String(settingsMap?.ScheduleSatCloseTime || settingsMap?.ScheduleCloseTime || settingsMap?.SalonCloseTime || '20:00'),
      },
      sun: {
        openTime: String(settingsMap?.ScheduleSunOpenTime || settingsMap?.ScheduleOpenTime || settingsMap?.SalonOpenTime || '08:00'),
        closeTime: String(settingsMap?.ScheduleSunCloseTime || settingsMap?.ScheduleCloseTime || settingsMap?.SalonCloseTime || '20:00'),
      },
    },
  }
}

function normalizePaymentMethod(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'online') return 'Online'
  if (value === 'store') return 'Store'
  return 'COD'
}

function derivePaymentStatus(orderStatus, paymentMethod) {
  const status = normalizeOrderLifecycleStatus(orderStatus)
  const method = String(paymentMethod || '').trim().toLowerCase()

  if (status === ORDER_STATUSES.CANCELLED) return 'Failed'
  if (status === ORDER_STATUSES.COMPLETED) return 'Paid'
  if (method === 'cod' || method === 'store') return 'Pay On Delivery'
  return 'Pending'
}

function isCStatus(status) {
  return normalizeOrderLifecycleStatus(status) === ORDER_STATUSES.PENDING
}

function isOrderCompletedStatus(status) {
  return normalizeOrderLifecycleStatus(status) === ORDER_STATUSES.COMPLETED
}

function calcOrderDiscountAmount(row) {
  const subtotal = Number(row?.Subtotal || 0)
  const total = Number(row?.Total || 0)
  const giftApplied = Number(row?.GiftCardApplied || 0)
  if (giftApplied > 0) return giftApplied
  const diff = subtotal - total
  return diff > 0 ? diff : 0
}

function calcPromotionDiscountAmount(subtotalInput, promotion) {
  const subtotal = Math.max(0, Number(subtotalInput || 0))
  if (subtotal <= 0 || !promotion) return 0

  const value = Number(promotion.value || 0)
  if (!Number.isFinite(value) || value <= 0) return 0

  const type = String(promotion.discountType || '').trim().toLowerCase()
  if (type === 'percentage') {
    return Math.max(0, Math.min(subtotal, (subtotal * Math.min(100, value)) / 100))
  }

  return Math.max(0, Math.min(subtotal, value))
}

function calcLegacyCartDiscountAmount(subtotalInput) {
  const subtotal = Math.max(0, Number(subtotalInput || 0))
  return subtotal >= 30 ? 5 : 0
}

async function countOrderPromotionUsageByUser(userId, promotionCode) {
  const code = normalizePromoCode(promotionCode)
  if (!code) return 0

  const res = await query(
    `SELECT COUNT(1) AS UsedCount
     FROM Orders
     WHERE UserId = @userId
       AND UPPER(LTRIM(RTRIM(ISNULL(GiftCardCode, '')))) = @code
       AND LOWER(LTRIM(RTRIM(ISNULL(Status, 'pending')))) NOT IN ('cancel', 'cancelled', 'failed')`,
    { userId, code },
  )
  return Number(res.recordset?.[0]?.UsedCount || 0)
}

async function countOrderPromotionUsageGlobal(promotionCode) {
  const code = normalizePromoCode(promotionCode)
  if (!code) return 0

  const res = await query(
    `SELECT COUNT(1) AS UsedCount
     FROM Orders
     WHERE UPPER(LTRIM(RTRIM(ISNULL(GiftCardCode, '')))) = @code
       AND LOWER(LTRIM(RTRIM(ISNULL(Status, 'pending')))) NOT IN ('cancel', 'cancelled', 'failed')`,
    { code },
  )
  return Number(res.recordset?.[0]?.UsedCount || 0)
}

async function resolvePromotionIdByCode(rawCode) {
  const code = normalizePromoCode(rawCode)
  if (!code) return null

  try {
    const hasPromotionCode = await columnExists('Promotions', 'PromotionCode')
    const hasCode = await columnExists('Promotions', 'Code')
    const hasStatus = await columnExists('Promotions', 'Status')
    const hasIsActive = await columnExists('Promotions', 'IsActive')

    const codeColumn = hasPromotionCode ? 'PromotionCode' : hasCode ? 'Code' : null
    if (!codeColumn) return null

    const activeClauses = []
    if (hasIsActive) activeClauses.push('(IsActive = 1)')
    if (hasStatus) activeClauses.push("(LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), Status)))) IN ('active','published'))")
    const activeWhere = activeClauses.length ? ` AND (${activeClauses.join(' OR ')})` : ''

    const promoRes = await query(
      `SELECT TOP 1 PromotionId
       FROM Promotions
       WHERE UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(200), ${codeColumn})))) = @code${activeWhere}`,
      { code },
    )

    const promoId = promoRes.recordset?.[0]?.PromotionId
    return promoId === undefined || promoId === null ? null : promoId
  } catch (err) {
    console.warn('[invoice] Unable to resolve PromotionId by code:', err?.message || err)
    return null
  }
}

async function upsertInvoiceSnapshot({
  userId,
  orderId = null,
  bookingId = null,
  subtotal = 0,
  discountAmount = 0,
  finalAmount = 0,
  status = 'Pending',
  promotionCode = '',
}) {
  const invoiceId = `INV-${String(orderId || bookingId || newId()).trim()}`
  const safeUserId = String(userId || '').trim() || null
  const safeOrderId = String(orderId || '').trim() || null
  const safeBookingId = String(bookingId || '').trim() || null
  const safePromo = String(promotionCode || '').trim()
  const totalAmount = Math.max(0, Number(subtotal || 0))
  const discount = Math.max(0, Math.min(totalAmount, Number(discountAmount || 0)))
  const final = Math.max(0, Number(finalAmount || 0))

  await query(
    `IF EXISTS (SELECT 1 FROM Invoices WHERE InvoiceId = @invoiceId)
     BEGIN
       UPDATE Invoices
       SET
         UserId = COALESCE(@userId, UserId),
         BookingId = COALESCE(@bookingId, BookingId),
         OrderId = COALESCE(@orderId, OrderId),
         TotalAmount = @totalAmount,
         DiscountAmount = @discountAmount,
         FinalAmount = @finalAmount,
         Status = @status
       WHERE InvoiceId = @invoiceId;
     END
     ELSE
     BEGIN
       INSERT INTO Invoices (
         InvoiceId,
         UserId,
         BookingId,
         OrderId,
         TotalAmount,
         DiscountAmount,
         FinalAmount,
         Status,
         CreatedAt
       )
       VALUES (
         @invoiceId,
         @userId,
         @bookingId,
         @orderId,
         @totalAmount,
         @discountAmount,
         @finalAmount,
         @status,
         SYSUTCDATETIME()
       );
     END;`,
    {
      invoiceId,
      userId: safeUserId,
      bookingId: safeBookingId,
      orderId: safeOrderId,
      totalAmount,
      discountAmount: discount,
      finalAmount: final,
      status: String(status || 'Pending').trim() || 'Pending',
    },
  )

  if (discount > 0 && safePromo) {
    const resolvedPromotionId = await resolvePromotionIdByCode(safePromo)
    if (resolvedPromotionId !== null) {
      await query(
        `IF EXISTS (
           SELECT 1 FROM InvoicePromotions
           WHERE InvoiceId = @invoiceId AND PromotionId = @promotionId
         )
         BEGIN
           UPDATE InvoicePromotions
           SET DiscountAmount = @discountAmount
           WHERE InvoiceId = @invoiceId AND PromotionId = @promotionId;
         END
         ELSE
         BEGIN
           INSERT INTO InvoicePromotions (Id, InvoiceId, PromotionId, DiscountAmount)
           VALUES (@id, @invoiceId, @promotionId, @discountAmount);
         END;`,
        {
          id: newId(),
          invoiceId,
          promotionId: resolvedPromotionId,
          discountAmount: discount,
        },
      )
    } else {
      console.warn(`[invoice] Skip InvoicePromotions link: PromotionId not found for code ${safePromo}`)
    }
  }

  return {
    invoiceId,
    totalAmount,
    discountAmount: discount,
    finalAmount: final,
  }
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

async function tableExists(tableName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = @tableName`,
    { tableName }
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

async function getSalonReviewImageColumn() {
  if (_reviewImageColumnPromise) return _reviewImageColumnPromise
  _reviewImageColumnPromise = (async () => {
    try {
      for (const name of REVIEW_IMAGE_COLUMN_CANDIDATES) {
        if (await columnExists('SalonReviews', name)) return name
      }

      await query(`
        IF COL_LENGTH('SalonReviews', 'ImageUrl') IS NULL
        BEGIN
          ALTER TABLE SalonReviews ADD ImageUrl NVARCHAR(MAX) NULL;
        END
      `)

      if (await columnExists('SalonReviews', 'ImageUrl')) return 'ImageUrl'
    } catch (err) {
      // Do not fail rating flow if metadata lookup is slow/unavailable.
      console.warn('[customerCommerce] Review image column lookup failed:', err?.message || err)
    }
    return null
  })()
  return _reviewImageColumnPromise
}

async function getCartVariantColumn() {
  if (_cartVariantColumnPromise) return _cartVariantColumnPromise
  _cartVariantColumnPromise = (async () => {
    if (await columnExists('CartItems', 'VariantId')) return 'VariantId'

    try {
      await query(`
        IF COL_LENGTH('CartItems', 'VariantId') IS NULL
        BEGIN
          ALTER TABLE CartItems ADD VariantId NVARCHAR(100) NULL;
        END
      `)
    } catch (err) {
      console.warn('[customerCommerce] Unable to ensure CartItems.VariantId:', err?.message || err)
    }

    return (await columnExists('CartItems', 'VariantId')) ? 'VariantId' : null
  })()
  return _cartVariantColumnPromise
}

async function getOrderItemVariantColumn() {
  if (_orderItemVariantColumnPromise) return _orderItemVariantColumnPromise
  _orderItemVariantColumnPromise = (async () => {
    if (await columnExists('OrderItems', 'VariantId')) return 'VariantId'
    return null
  })()
  return _orderItemVariantColumnPromise
}

async function getOrderItemVariantNameColumn() {
  if (_orderItemVariantNameColumnPromise) return _orderItemVariantNameColumnPromise
  _orderItemVariantNameColumnPromise = (async () => {
    if (await columnExists('OrderItems', 'VariantName')) return 'VariantName'
    return null
  })()
  return _orderItemVariantNameColumnPromise
}

async function getCartVariantOptionsByProductIds(productIds) {
  const uniqueProductIds = [...new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )]

  if (!uniqueProductIds.length) return new Map()
  if (!(await tableExists('ProductVariants'))) return new Map()

  const bind = {}
  const inParts = uniqueProductIds.map((productId, index) => {
    const key = `productId${index}`
    bind[key] = productId
    return `@${key}`
  })

  const res = await query(
    `SELECT
       pv.ProductId,
       pv.VariantId,
       pv.VariantName,
       COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) AS Stock,
       COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Price), TRY_CONVERT(DECIMAL(19,2), p.Price), 0) AS Price
     FROM ProductVariants pv
     INNER JOIN Products p ON p.ProductId = pv.ProductId
     OUTER APPLY (
       SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
       FROM InventoryLots l
       WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
     ) vlots
     WHERE pv.ProductId IN (${inParts.join(', ')})
     ORDER BY pv.ProductId, COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) DESC, pv.VariantName ASC`,
    bind
  )

  const map = new Map()
  for (const row of res.recordset || []) {
    const key = String(row.ProductId || '').trim()
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({
      VariantId: row.VariantId,
      VariantName: row.VariantName || '',
      Stock: Number(row.Stock || 0),
      PriceVnd: row.Price === null || row.Price === undefined ? null : Number(row.Price),
    })
  }

  return map
}

async function setReviewImagesByReviewId(reviewId, imageDataUrls) {
  const normalizedReviewId = String(reviewId || '').trim()
  const hasImages = Array.isArray(imageDataUrls)
    ? imageDataUrls.some((x) => String(x || '').trim())
    : Boolean(String(imageDataUrls || '').trim())

  if (!normalizedReviewId || !hasImages) return []

  const urls = await saveReviewImagesFromDataUrls(imageDataUrls, { maxImages: 3 })
  if (!urls.length) return []

  const column = await getSalonReviewImageColumn()
  if (!column) return urls

  try {
    const value = JSON.stringify(urls)
    await query(`UPDATE SalonReviews SET ${column} = @value WHERE ReviewId = @reviewId`, {
      reviewId: normalizedReviewId,
      value,
    })
  } catch (err) {
    // Keep successful rating even if image persistence fails.
    console.warn('[customerCommerce] Save review images failed:', err?.message || err)
  }

  return urls
}

function formatVnpayDate(date = new Date()) {
  const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  const yyyy = vnDate.getUTCFullYear()
  const mm = String(vnDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(vnDate.getUTCDate()).padStart(2, '0')
  const hh = String(vnDate.getUTCHours()).padStart(2, '0')
  const mi = String(vnDate.getUTCMinutes()).padStart(2, '0')
  const ss = String(vnDate.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`
}

function sortObjectByKey(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = encodeURIComponent(String(obj[key] ?? '')).replace(/%20/g, '+')
      return acc
    }, {})
}

function buildRawHashData(sortedPayload) {
  return Object.keys(sortedPayload)
    .map((key) => `${key}=${String(sortedPayload[key] ?? '')}`)
    .join('&')
}

function safeClientIp(rawIp) {
  const value = String(rawIp || '').trim()
  if (!value) return '127.0.0.1'
  if (value === '::1') return '127.0.0.1'
  if (value.startsWith('::ffff:')) return value.replace('::ffff:', '')
  return value
}

function buildVnpayPaymentUrl({ orderId, amount, txnRef, ipAddress }) {
  if (!env.vnpay?.enabled) {
    const err = new Error('VNPAY is not configured. Please set VNPAY_TMN_CODE and VNPAY_HASH_SECRET in .env')
    err.status = 500
    throw err
  }

  if (!String(env.vnpay.returnUrl || '').trim()) {
    const err = new Error('VNPAY_RETURN_URL is missing in server environment')
    err.status = 500
    throw err
  }

  const amountInt = Math.round(Number(amount || 0) * 100)
  if (!Number.isFinite(amountInt) || amountInt <= 0) {
    const err = new Error('Invalid order amount for VNPAY payment')
    err.status = 400
    throw err
  }

  const payload = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: env.vnpay.tmnCode,
    vnp_Locale: env.vnpay.locale || 'vn',
    vnp_CurrCode: env.vnpay.currency || 'VND',
    vnp_TxnRef: String(txnRef || ''),
    vnp_OrderInfo: String(orderId || ''),
    vnp_OrderType: 'other',
    vnp_Amount: String(amountInt),
    vnp_ReturnUrl: env.vnpay.returnUrl,
    vnp_IpAddr: safeClientIp(ipAddress),
    vnp_CreateDate: formatVnpayDate(new Date()),
  }

  const sorted = sortObjectByKey(payload)
  const signData = buildRawHashData(sorted)

  const signed = crypto
    .createHmac('sha512', env.vnpay.hashSecret)
    .update(signData)
    .digest('hex')

  const finalQuery = `${buildRawHashData(sorted)}&vnp_SecureHash=${signed}`
  if (String(process.env.VNPAY_DEBUG || '').trim() === '1') {
    console.log('[VNPAY DEBUG] signData:', signData)
    console.log('[VNPAY DEBUG] secureHash:', signed)
    console.log('[VNPAY DEBUG] url:', `${env.vnpay.url}?${finalQuery}`)
  }
  return `${env.vnpay.url}?${finalQuery}`
}

function buildVnpTxnRef(orderId) {
  const cleanedOrder = String(orderId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-12)
  const timePart = String(Date.now())
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `VNP${cleanedOrder}${timePart}${randomPart}`.slice(0, 34)
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

  const [userRes, defaultAddress, settingsMap] = await Promise.all([
    query(
      `SELECT TOP 1 UserId, Name, Email, Phone, AvatarUrl, RoleKey, Status
       FROM Users
       WHERE UserId = @userId`,
      { userId }
    ),
    getDefaultAddress(userId),
    getSettingsMap(),
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
    bookingSettings: buildBookingSettings(settingsMap),
  }
}

async function listAvailableStaff(serviceIdsInput = [], dateInput = '') {
  const serviceIds = Array.isArray(serviceIdsInput)
    ? [...new Set(serviceIdsInput.map((id) => String(id || '').trim()).filter(Boolean))]
    : []

  const params = {}

  const formatHourValue = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'number' && Number.isFinite(value)) {
      const hour = Math.trunc(value)
      const minute = Math.round((value - hour) * 60)
      return `${String(hour).padStart(2, '0')}:${String(Math.max(0, Math.min(59, minute))).padStart(2, '0')}`
    }

    const raw = String(value).trim()
    if (!raw) return ''

    if (/^\d{1,2}$/.test(raw)) {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0 && n <= 23) return `${String(Math.trunc(n)).padStart(2, '0')}:00`
    }

    const hhmm = raw.match(/^(\d{1,2}):(\d{2})/)
    if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`

    const dt = new Date(raw)
    if (!Number.isNaN(dt.getTime())) {
      return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`
    }

    return ''
  }

  // Handle date filtering if provided (supports both StaffAvailability and StaffShifts)
  let availabilityFilterClause = ''
  if (dateInput) {
    try {
      const { toIsoDate } = require('../utils/date')
      const dateObj = new Date(dateInput)
      if (!Number.isNaN(dateObj.getTime())) {
        params.bookingDate = toIsoDate(dateObj)

        const [hasStaffAvailability, hasAvailabilityDayIndex, hasStaffShifts, hasShiftDayIndex] = await Promise.all([
          query(`SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffAvailability'`)
            .then((x) => Boolean(x.recordset?.length))
            .catch(() => false),
          columnExists('StaffAvailability', 'DayIndex').catch(() => false),
          query(`SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffShifts'`)
            .then((x) => Boolean(x.recordset?.length))
            .catch(() => false),
          columnExists('StaffShifts', 'DayIndex').catch(() => false),
        ])

        const existsParts = []

        if (hasStaffAvailability) {
          const availabilityDateExpr = hasAvailabilityDayIndex
            ? 'DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE))'
            : 'CAST(sa.WeekStartDate AS DATE)'
          const availabilityDatePredicate = hasAvailabilityDayIndex
            ? `${availabilityDateExpr} = @bookingDate`
            : '@bookingDate BETWEEN CAST(sa.WeekStartDate AS DATE) AND DATEADD(DAY, 6, CAST(sa.WeekStartDate AS DATE))'

          existsParts.push(`EXISTS (
            SELECT 1
            FROM StaffAvailability sa
            WHERE CONVERT(NVARCHAR(100), sa.StaffId) = CONVERT(NVARCHAR(100), s.StaffId)
              AND ${availabilityDatePredicate}
          )`)
        }

        if (hasStaffShifts) {
          const shiftDateExpr = hasShiftDayIndex
            ? 'DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE))'
            : 'CAST(sa.WeekStartDate AS DATE)'

          existsParts.push(`EXISTS (
            SELECT 1
            FROM StaffShifts sa
            WHERE CONVERT(NVARCHAR(100), sa.StaffId) = CONVERT(NVARCHAR(100), s.StaffId)
              AND ${shiftDateExpr} = @bookingDate
          )`)
        }

        if (existsParts.length > 0) {
          availabilityFilterClause = ` AND (${existsParts.join(' OR ')})`
        }
      }
    } catch (_err) {
      availabilityFilterClause = ''
    }
  }
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

    if (hasServiceIdInSkills) {
      const serviceParams = serviceIds.map((serviceId, idx) => {
        const key = `serviceFilterId${idx}`
        params[key] = serviceId
        return `@${key}`
      })

      params.requiredServiceCount = serviceIds.length

      staffFilterClause = `
        AND (
          SELECT COUNT(DISTINCT ss.ServiceId)
          FROM StaffSkills ss
          WHERE ss.StaffId = s.StaffId
            AND ss.ServiceId IN (${serviceParams.join(', ')})
        ) = @requiredServiceCount
      `
    } else if (hasCategoryIdInSkills) {
      const serviceParams = serviceIds.map((serviceId, idx) => {
        const key = `serviceId${idx}`
        params[key] = serviceId
        return `@${key}`
      })

      const categoryRes = await query(
        `SELECT DISTINCT CategoryId
         FROM Services
         WHERE ServiceId IN (${serviceParams.join(', ')})
           AND ${ACTIVE_SERVICE_WHERE}
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

        params.requiredCategoryCount = categoryIds.length

        staffFilterClause = `
          AND (
            SELECT COUNT(DISTINCT ss.CategoryId)
            FROM StaffSkills ss
            WHERE ss.StaffId = s.StaffId
              AND ss.CategoryId IN (${categoryParams.join(', ')})
          ) = @requiredCategoryCount
        `
      }
    }
  }

  const sql = `SELECT
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
     ${availabilityFilterClause}
     ORDER BY u.Name, s.StaffId`

  let res
  try {
    res = await query(sql, params)
  } catch (err) {
    console.error('[listAvailableStaff] query error:', err?.message || err)
    console.error('[listAvailableStaff] SQL:', sql)
    console.error('[listAvailableStaff] params:', params)
    throw err
  }

  // If strict skill matching yields no rows, fallback to availability-only staff list.
  if ((res.recordset || []).length === 0 && staffFilterClause.trim()) {
    const fallbackSql = `SELECT
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
     ${availabilityFilterClause}
     ORDER BY u.Name, s.StaffId`

    try {
      res = await query(fallbackSql, params)
    } catch (err) {
      console.error('[listAvailableStaff] fallback query error:', err?.message || err)
    }
  }

  // If only date availability filtering caused empty result, fall back to all active staff.
  if ((res.recordset || []).length === 0 && !staffFilterClause.trim() && availabilityFilterClause.trim()) {
    const fallbackSqlNoAvailability = `SELECT
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
     ORDER BY u.Name, s.StaffId`

    try {
      res = await query(fallbackSqlNoAvailability, params)
    } catch (err) {
      console.error('[listAvailableStaff] no-availability fallback query error:', err?.message || err)
    }
  }

  const staffList = (res.recordset || [])

  // Get default booking hours for fallback
  let defaultWorkingHours = null
  try {
    const settingsMap = await getSettingsMap()
    const context = buildBookingSettings(settingsMap, dateInput)
    const openMin = parseTimeToMinutes(context.openTime)
    const closeMin = parseTimeToMinutes(context.closeTime)

    if (openMin !== null && closeMin !== null) {
      const openHour = Math.floor(openMin / 60)
      const openMins = openMin % 60
      const closeHour = Math.floor(closeMin / 60)
      const closeMins = closeMin % 60
      defaultWorkingHours = {
        startHour: `${String(openHour).padStart(2, '0')}:${String(openMins).padStart(2, '0')}`,
        endHour: `${String(closeHour).padStart(2, '0')}:${String(closeMins).padStart(2, '0')}`,
      }
    }
  } catch (_e) {
    // Keep defaultWorkingHours as null and continue.
  }

  const hasStaffAvailabilityTable = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffAvailability'`
  ).then((x) => Boolean(x.recordset?.length)).catch(() => false)
  const hasAvailabilityDayIndex = await columnExists('StaffAvailability', 'DayIndex').catch(() => false)
  const hasStaffShiftsTable = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffShifts'`
  ).then((x) => Boolean(x.recordset?.length)).catch(() => false)
  const hasShiftDayIndex = await columnExists('StaffShifts', 'DayIndex').catch(() => false)

  // Fetch booked slots and working hours for each staff member if date is provided
  const result = []
  for (const row of staffList) {
    const staff = {
      StaffId: row.StaffId,
      UserId: row.UserId || '',
      Name: row.Name || row.StaffId || 'Specialist',
      Specialty: row.Specialty || '',
      Phone: row.Phone || '',
      Email: row.Email || '',
      AvatarUrl: row.AvatarUrl || null,
      Status: row.StaffStatus || '',
      BookedSlots: [],
      WorkingHours: defaultWorkingHours,
    }

    // Get working hours and booked slots if date is provided
    if (dateInput) {
      try {
        const { toIsoDate } = require('../utils/date')
        const dateObj = new Date(dateInput)
        if (!Number.isNaN(dateObj.getTime())) {
          const dateIso = toIsoDate(dateObj)

          let shiftRow = null

          // Prefer StaffAvailability (used by owner schedule page)
          if (hasStaffAvailabilityTable) {
            const availabilityPredicate = hasAvailabilityDayIndex
              ? 'DATEADD(DAY, ISNULL(TRY_CONVERT(INT, DayIndex), 0), CAST(WeekStartDate AS DATE)) = @dateIso'
              : '@dateIso BETWEEN CAST(WeekStartDate AS DATE) AND DATEADD(DAY, 6, CAST(WeekStartDate AS DATE))'

            const availRes = await query(
              `SELECT TOP 1 StartHour, EndHour
               FROM StaffAvailability
               WHERE CONVERT(NVARCHAR(100), StaffId) = CONVERT(NVARCHAR(100), @staffId)
                 AND ${availabilityPredicate}
               ORDER BY StartHour`,
              { staffId: row.StaffId, dateIso }
            ).catch(() => ({ recordset: [] }))

            if (availRes.recordset?.length) {
              shiftRow = availRes.recordset[0]
            }
          }

          // Fallback to StaffShifts (legacy schema)
          if (!shiftRow && hasStaffShiftsTable) {
            const shiftDateExpr = hasShiftDayIndex
              ? 'DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE))'
              : 'CAST(sa.WeekStartDate AS DATE)'

            const shiftsRes = await query(
              `SELECT TOP 1 sa.StartHour, sa.EndHour, sa.DurationHours
               FROM StaffShifts sa
               WHERE CONVERT(NVARCHAR(100), sa.StaffId) = CONVERT(NVARCHAR(100), @staffId)
                 AND ${shiftDateExpr} = @dateIso
               ORDER BY sa.StartHour`,
              { staffId: row.StaffId, dateIso }
            ).catch(() => ({ recordset: [] }))

            if (shiftsRes.recordset?.length) {
              shiftRow = shiftsRes.recordset[0]
            }
          }

          if (shiftRow) {
            const startText = formatHourValue(shiftRow.StartHour)
            let endText = formatHourValue(shiftRow.EndHour)

            if (!endText && shiftRow.DurationHours !== null && shiftRow.DurationHours !== undefined) {
              const startMin = parseTimeToMinutes(startText)
              const durationHour = Number(shiftRow.DurationHours)
              if (startMin !== null && Number.isFinite(durationHour) && durationHour > 0) {
                const endMin = startMin + Math.round(durationHour * 60)
                const clampedEnd = Math.max(0, Math.min(23 * 60 + 59, endMin))
                endText = `${String(Math.floor(clampedEnd / 60)).padStart(2, '0')}:${String(clampedEnd % 60).padStart(2, '0')}`
              }
            }

            if (startText && endText) {
              staff.WorkingHours = {
                startHour: startText,
                endHour: endText,
              }
            }
          }
        }
      } catch (_e) {
        // Keep fallback working hours.
      }

      // Get booked slots
      try {
        staff.BookedSlots = await getStaffBookedSlots(row.StaffId, dateInput)
      } catch (e) {
        // If error occurs fetching booked slots, continue without them
        if (!(String(process.env.SILENT_LOGS || '').trim() === '1')) {
          console.log(`[DEBUG] Error fetching booked slots for staff ${row.StaffId}:`, e.message)
        }
      }
    }

    result.push(staff)
  }

  return result
}

async function getStaffBookedSlots(staffIdInput, dateInput) {
  const staffId = String(staffIdInput || '').trim()
  const dateStr = String(dateInput || '').trim()

  if (!staffId || !dateStr) return []

  // Parse the date to ensure it's in the correct format
  const dateObj = new Date(dateStr)
  if (Number.isNaN(dateObj.getTime())) return []

  const res = await query(
    `SELECT
        b.BookingId,
        b.BookingTime,
        ISNULL(SUM(s.DurationMinutes), 30) AS TotalDuration
     FROM Bookings b
     INNER JOIN BookingServices bs ON b.BookingId = bs.BookingId
     INNER JOIN Services s ON bs.ServiceId = s.ServiceId
     WHERE bs.StaffId = @staffId
       AND CAST(CONVERT(VARCHAR(10), b.BookingTime, 120) AS DATE) = @bookingDate
       AND b.Status NOT IN ('cancelled', 'deleted', 'cancel')
     GROUP BY b.BookingId, b.BookingTime
     ORDER BY b.BookingTime`,
    {
      staffId,
      bookingDate: dateObj,
    }
  )

  const bookedSlots = (res.recordset || []).map((row) => {
    const bookingTime = new Date(row.BookingTime)
    const startHour = String(bookingTime.getHours()).padStart(2, '0')
    const startMinute = String(bookingTime.getMinutes()).padStart(2, '0')
    const startTime = `${startHour}:${startMinute}`

    const endTime = new Date(bookingTime.getTime() + Number(row.TotalDuration || 30) * 60000)
    const endHour = String(endTime.getHours()).padStart(2, '0')
    const endMinute = String(endTime.getMinutes()).padStart(2, '0')
    const endTimeStr = `${endHour}:${endMinute}`

    return {
      startTime,
      endTime: endTimeStr,
      bookingId: row.BookingId,
    }
  })

  return bookedSlots
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
      AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, 'Pending')))) IN ('c', 'pending', 'confirmed', 'booked')
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
         AND (sv.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), sv.Status)))) = 'active')
       LEFT JOIN BookingServices bs ON bs.StaffId = s.StaffId
       LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, 'Pending')))) IN ('c', 'pending', 'confirmed', 'booked')
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
         AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, 'Pending')))) IN ('c', 'pending', 'confirmed', 'booked')
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
         AND s.ServiceId = @serviceId
         AND (s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) = 'active')`,
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
  const price = Number(row.Price || 0)
  const quantity = Number(row.Quantity || 0)
  return {
    CartItemId: row.CartItemId,
    CartId: row.CartId,
    ProductId: row.ProductId,
    VariantId: row.VariantId || null,
    VariantName: row.VariantName || null,
    Quantity: quantity,
    Name: row.Name || '',
    Description: row.Description || '',
    Price: price,
    ImageUrl: row.ImageUrl || null,
    Stock: Number(row.Stock || 0),
    CategoryId: row.CategoryId || null,
    LineTotal: price * quantity,
  }
}

async function getCart(userIdInput) {
  const userId = requireUserId(userIdInput)
  
  try {
    const cartId = await ensureCart(userId)
    const ctx = await getCustomerContext(userId)
    const cartVariantColumn = await getCartVariantColumn()
    const hasProductImages = await tableExists('ProductImages')

    const itemImageExpr = hasProductImages
      ? 'COALESCE(pimg.ImageUrl, p.ImageUrl) AS ImageUrl'
      : 'p.ImageUrl AS ImageUrl'

    const itemSelectSql = cartVariantColumn
      ? `
            ci.VariantId,
            pv.VariantName,
            COALESCE(CONCAT(p.Name, N' - ', pv.VariantName), p.Name) AS Name,
            p.Description,
        COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Price), TRY_CONVERT(DECIMAL(19,2), p.Price), 0) AS Price,
            ${itemImageExpr},
            COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0)) AS Stock,
            p.CategoryId`
      : `
            CAST(NULL AS NVARCHAR(100)) AS VariantId,
            CAST(NULL AS NVARCHAR(255)) AS VariantName,
            p.Name,
            p.Description,
            COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Price), 0) AS Price,
            ${itemImageExpr},
            COALESCE(TRY_CONVERT(DECIMAL(19,2), p.Stock), 0) AS Stock,
            p.CategoryId`

    const variantJoinSql = cartVariantColumn
      ? `
         LEFT JOIN ProductVariants pv ON pv.VariantId = ci.VariantId
         OUTER APPLY (
           SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
           FROM InventoryLots l
           WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
         ) vlots`
      : ''

    const productImageJoinSql = hasProductImages
      ? `
         OUTER APPLY (
           SELECT TOP 1 pi.ImageUrl
           FROM ProductImages pi
           WHERE pi.ProductId = ci.ProductId
           ORDER BY ISNULL(pi.SortOrder, 2147483647), pi.ImageId
         ) pimg`
      : ''

    const [itemsRes, defaultAddress] = await Promise.all([
      query(
        `SELECT
            ci.CartItemId,
            ci.CartId,
            ci.ProductId,
            ci.Quantity,
            ${itemSelectSql}
         FROM CartItems ci
         LEFT JOIN Products p ON p.ProductId = ci.ProductId
          ${variantJoinSql}
          ${productImageJoinSql}
         WHERE ci.CartId = @cartId
         ORDER BY ci.CartItemId DESC`,
        { cartId }
      ),
      getDefaultAddress(userId),
    ])

    const items = (itemsRes.recordset || []).map(mapCartItem)
    const variantOptionsByProductId = await getCartVariantOptionsByProductIds(items.map((item) => item.ProductId))
    const itemsWithVariantOptions = items.map((item) => ({
      ...item,
      VariantOptions: variantOptionsByProductId.get(String(item.ProductId || '').trim()) || [],
    }))
    const subtotal = itemsWithVariantOptions.reduce((sum, item) => sum + item.LineTotal, 0)

    return {
      CartId: cartId,
      Customer: ctx.user,
      Items: itemsWithVariantOptions,
      Summary: {
        ItemCount: itemsWithVariantOptions.length,
        QuantityCount: itemsWithVariantOptions.reduce((sum, item) => sum + item.Quantity, 0),
        Subtotal: subtotal,
      },
      DefaultAddress: defaultAddress,
    }
  } catch (err) {
    console.error('Error in getCart:', err?.message)
    throw err
  }
}

async function addCartItem(userIdInput, payload = {}) {
  const userId = requireUserId(userIdInput)
  const productId = String(payload.productId || '').trim()
  const variantId = String(payload.variantId || payload.VariantId || '').trim()
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

  const cartVariantColumn = await getCartVariantColumn()
  const isVariantSelection = Boolean(variantId)

  let stock = Number(product.Stock || 0)
  let cartItemName = product.Name || ''
  let price = Number(product.Price || 0)

  if (isVariantSelection) {
    if (!cartVariantColumn) {
      const err = new Error('Variant cart support is unavailable')
      err.status = 400
      throw err
    }

    const variantRes = await query(
      `SELECT TOP 1
         pv.VariantId,
         pv.ProductId,
         pv.VariantName,
         COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) AS Stock,
         COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Price), TRY_CONVERT(DECIMAL(19,2), p.Price), 0) AS Price
       FROM ProductVariants pv
       INNER JOIN Products p ON p.ProductId = pv.ProductId
       OUTER APPLY (
         SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
         FROM InventoryLots l
         WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
       ) vlots
       WHERE pv.ProductId = @productId
         AND pv.VariantId = @variantId`,
      { productId, variantId }
    )

    const variant = variantRes.recordset?.[0]
    if (!variant) {
      const err = new Error('Variant not found')
      err.status = 404
      throw err
    }

    stock = Number(variant.Stock || 0)
    cartItemName = `${product.Name || ''} - ${variant.VariantName || ''}`.trim()
    price = Number(variant.Price || product.Price || 0)
  }

  if (stock <= 0) {
    const err = new Error('Product is out of stock')
    err.status = 409
    throw err
  }

  const cartId = await ensureCart(userId)
  const existingParams = cartVariantColumn && isVariantSelection
    ? { cartId, productId, variantId }
    : { cartId, productId }

  const existingRes = await query(
    cartVariantColumn && isVariantSelection
      ? `SELECT TOP 1 CartItemId, Quantity
         FROM CartItems
         WHERE CartId = @cartId AND ProductId = @productId AND VariantId = @variantId
         ORDER BY CartItemId`
      : cartVariantColumn
        ? `SELECT TOP 1 CartItemId, Quantity
           FROM CartItems
           WHERE CartId = @cartId
             AND ProductId = @productId
             AND (VariantId IS NULL OR LTRIM(RTRIM(CONVERT(NVARCHAR(100), VariantId))) = '')
           ORDER BY CartItemId`
      : `SELECT TOP 1 CartItemId, Quantity
         FROM CartItems
         WHERE CartId = @cartId AND ProductId = @productId
         ORDER BY CartItemId`,
    existingParams
  )

  const existing = existingRes.recordset?.[0]
  if (existing) {
    const nextQuantity = Number(existing.Quantity || 0) + quantity
    if (nextQuantity > stock) {
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
    if (quantity > stock) {
      const err = new Error('Quantity exceeds stock')
      err.status = 409
      throw err
    }

    await query(
      cartVariantColumn && isVariantSelection
        ? `INSERT INTO CartItems (CartItemId, CartId, ProductId, VariantId, Quantity)
           VALUES (@cartItemId, @cartId, @productId, @variantId, @quantity)`
        : `INSERT INTO CartItems (CartItemId, CartId, ProductId, Quantity)
           VALUES (@cartItemId, @cartId, @productId, @quantity)`,
      {
        cartItemId: `CI-${newId()}`,
        cartId,
        productId,
        variantId: isVariantSelection ? variantId : null,
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
    `SELECT TOP 1 ci.CartItemId, ci.CartId, ci.ProductId, ci.VariantId, ci.Quantity
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

  const desiredVariantId = String(payload.variantId || payload.VariantId || '').trim()
  const requestedQuantityRaw = payload.quantity
  const requestedQuantity = requestedQuantityRaw === undefined || requestedQuantityRaw === null || String(requestedQuantityRaw).trim() === ''
    ? Number(item.Quantity || 0)
    : Math.trunc(toNumber(requestedQuantityRaw, Number(item.Quantity || 0)))

  if (requestedQuantity <= 0) {
    await query('DELETE FROM CartItems WHERE CartItemId = @cartItemId', { cartItemId })
    return getCart(userId)
  }

  const cartVariantColumn = await getCartVariantColumn()
  const hasVariantChange = Boolean(cartVariantColumn && desiredVariantId && desiredVariantId !== String(item.VariantId || '').trim())

  if (hasVariantChange) {
    const variantRes = await query(
      `SELECT TOP 1
         pv.VariantId,
         pv.VariantName,
         COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) AS Stock
       FROM ProductVariants pv
       OUTER APPLY (
         SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
         FROM InventoryLots l
         WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
       ) vlots
       WHERE pv.ProductId = @productId
         AND pv.VariantId = @variantId`,
      { productId: item.ProductId, variantId: desiredVariantId }
    )

    const targetVariant = variantRes.recordset?.[0]
    if (!targetVariant) {
      const err = new Error('Variant not found')
      err.status = 404
      throw err
    }

    const targetStock = Number(targetVariant.Stock || 0)
    const targetExistingRes = await query(
      `SELECT TOP 1 CartItemId, Quantity
       FROM CartItems
       WHERE CartId = @cartId
         AND ProductId = @productId
         AND VariantId = @variantId
         AND CartItemId <> @cartItemId`,
      { cartId: item.CartId, productId: item.ProductId, variantId: desiredVariantId, cartItemId }
    )

    const targetExisting = targetExistingRes.recordset?.[0]
    if (targetExisting) {
      const mergedQuantity = Number(targetExisting.Quantity || 0) + Number(requestedQuantity || 0)
      if (mergedQuantity > targetStock) {
        const err = new Error('Quantity exceeds stock')
        err.status = 409
        throw err
      }

      await query(
        `UPDATE CartItems
         SET Quantity = @quantity
         WHERE CartItemId = @targetCartItemId;

         DELETE FROM CartItems
         WHERE CartItemId = @cartItemId;`,
        {
          quantity: mergedQuantity,
          targetCartItemId: targetExisting.CartItemId,
          cartItemId,
        }
      )

      return getCart(userId)
    }

    if (requestedQuantity > targetStock) {
      const err = new Error('Quantity exceeds stock')
      err.status = 409
      throw err
    }

    await query(
      `UPDATE CartItems
       SET VariantId = @variantId,
           Quantity = @quantity
       WHERE CartItemId = @cartItemId`,
      { variantId: desiredVariantId, quantity: requestedQuantity, cartItemId }
    )

    return getCart(userId)
  }

  let stock = 0
  if (cartVariantColumn && item.VariantId) {
    const variantRes = await query(
      `SELECT TOP 1
         COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) AS Stock
       FROM ProductVariants pv
       OUTER APPLY (
         SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
         FROM InventoryLots l
         WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
       ) vlots
       WHERE pv.ProductId = @productId
         AND pv.VariantId = @variantId`,
      { productId: item.ProductId, variantId: item.VariantId }
    )
    stock = Number(variantRes.recordset?.[0]?.Stock || 0)
  } else {
    const stockRes = await query(
      'SELECT TOP 1 Stock FROM Products WHERE ProductId = @productId',
      { productId: item.ProductId }
    )
    stock = Number(stockRes.recordset?.[0]?.Stock || 0)
  }
  if (requestedQuantity > stock) {
    const err = new Error('Quantity exceeds stock')
    err.status = 409
    throw err
  }

  await query(
    `UPDATE CartItems
     SET Quantity = @quantity
     WHERE CartItemId = @cartItemId`,
    { quantity: requestedQuantity, cartItemId }
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

async function checkoutCart(userIdInput, payload = {}, options = {}) {
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
    let stock = 0
    if (item.VariantId) {
      const stockRes = await query(
        `SELECT TOP 1
           COALESCE(vlots.TotalQty, COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.Stock), 0), 0) AS Stock
         FROM ProductVariants pv
         OUTER APPLY (
           SELECT COALESCE(SUM(COALESCE(l.RemainingQty, 0)), 0) AS TotalQty
           FROM InventoryLots l
           WHERE l.InventoryItemId = CONCAT('retail_variant_', pv.VariantId)
         ) vlots
         WHERE pv.ProductId = @productId
           AND pv.VariantId = @variantId`,
        { productId: item.ProductId, variantId: item.VariantId }
      )
      stock = Number(stockRes.recordset?.[0]?.Stock || 0)
    } else {
      const stockRes = await query(
        'SELECT TOP 1 Stock FROM Products WHERE ProductId = @productId',
        { productId: item.ProductId }
      )
      stock = Number(stockRes.recordset?.[0]?.Stock || 0)
    }

    if (stock < item.Quantity) {
      const err = new Error(`Product ${item.Name} does not have enough stock`)
      err.status = 409
      throw err
    }
  }

  const ctx = await getCustomerContext(userId)
  const defaultAddress = ctx.defaultAddress
  const subtotal = selectedItems.reduce((sum, item) => sum + item.LineTotal, 0)

  const settingsMap = await getSettingsMap()
  const bookingSettings = buildBookingSettings(settingsMap)
  const giftCode = String(payload.giftCode || '').trim()
  let appliedPromotion = null

  if (giftCode && !bookingSettings.promotionAllowCustomerApply) {
    const err = new Error('Promotion codes are disabled for customer order')
    err.status = 400
    throw err
  }

  if (giftCode) {
    if (!bookingSettings.promotionEnabled) {
      const err = new Error('Promotions are currently disabled')
      err.status = 400
      throw err
    }

    appliedPromotion = findActivePromotionByCode(settingsMap, giftCode)
    if (!appliedPromotion) {
      const err = new Error('Invalid or expired promotion code')
      err.status = 400
      throw err
    }

    const maxUsesPerUser = parsePositiveInt(appliedPromotion.maxUsesPerUser, 0)
    if (maxUsesPerUser > 0) {
      const [bookingUsage, orderUsage] = await Promise.all([
        countPromotionUsageByUser(userId, giftCode),
        countOrderPromotionUsageByUser(userId, giftCode),
      ])
      if (bookingUsage + orderUsage >= maxUsesPerUser) {
        const err = new Error(`This promotion can only be used ${maxUsesPerUser} times per user`)
        err.status = 400
        throw err
      }
    }

    const maxUsesGlobal = parsePositiveInt(appliedPromotion.maxUses, 0)
    if (maxUsesGlobal > 0) {
      const [bookingUsage, orderUsage] = await Promise.all([
        countPromotionUsageGlobal(giftCode),
        countOrderPromotionUsageGlobal(giftCode),
      ])
      if (bookingUsage + orderUsage >= maxUsesGlobal) {
        const err = new Error('This promotion has reached its usage limit')
        err.status = 400
        throw err
      }
    }
  }

  const promotionDiscount = calcPromotionDiscountAmount(subtotal, appliedPromotion)
  const discountAmount = Math.max(0, promotionDiscount)
  const netAmount = Math.max(0, subtotal - discountAmount)
  const shippingAmount = selectedItems.length > 0 ? 3 : 0
  const total = Math.max(0, netAmount + shippingAmount)

  const paymentMethod = normalizePaymentMethod(payload.paymentMethod)
  const isOnlinePayment = String(paymentMethod || '').toLowerCase() === 'online'
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
      status: ORDER_STATUSES.PENDING,
      customerName,
      customerPhone,
      customerAddress: addressText,
      channel,
      subtotal,
      total,
      paymentMethod,
      giftCardCode: appliedPromotion ? normalizePromoCode(giftCode) : null,
      giftCardApplied: discountAmount,
    }
  )

  const orderId = String(insertOrderRes.recordset?.[0]?.OrderId || '').trim()
  if (!orderId) {
    const err = new Error('Cannot create order id')
    err.status = 500
    throw err
  }

  const invoiceSnapshot = await upsertInvoiceSnapshot({
    userId,
    orderId,
    subtotal,
    discountAmount,
    finalAmount: total,
    status: 'Pending',
    promotionCode: appliedPromotion ? normalizePromoCode(giftCode) : '',
  })

  const orderItemVariantColumn = await getOrderItemVariantColumn()
  const orderItemVariantNameColumn = await getOrderItemVariantNameColumn()

  for (const item of selectedItems) {
    const insertColumns = ['OrderItemId', 'OrderId', 'ProductId', 'Quantity', 'Price', 'ProductName']
    const insertValues = ['@orderItemId', '@orderId', '@productId', '@quantity', '@price', '@productName']

    if (orderItemVariantColumn) {
      insertColumns.push(orderItemVariantColumn)
      insertValues.push('@variantId')
    }

    if (orderItemVariantNameColumn) {
      insertColumns.push(orderItemVariantNameColumn)
      insertValues.push('@variantName')
    }

    await query(
      `INSERT INTO OrderItems (${insertColumns.join(', ')})
       VALUES (${insertValues.join(', ')})`,
      {
        orderItemId: `OI-${newId()}`,
        orderId,
        productId: item.ProductId,
        quantity: item.Quantity,
        price: item.Price,
        productName: item.Name,
        variantId: orderItemVariantColumn ? (String(item?.VariantId || '').trim() || null) : undefined,
        variantName: orderItemVariantNameColumn ? (String(item?.VariantName || '').trim() || null) : undefined,
      }
    )
  }

  if (!isOnlinePayment) {
    for (const item of selectedItems) {
      await query('DELETE FROM CartItems WHERE CartItemId = @cartItemId', { cartItemId: item.CartItemId })
    }
  }

  let paymentUrl = null
  if (isOnlinePayment) {
    const transactionCode = buildVnpTxnRef(orderId)
    setFrontendOriginForTxnRef(transactionCode, options?.frontendOrigin)

    try {
      const invoiceId = await resolveInvoiceIdForPayment({
        invoiceId: invoiceSnapshot.invoiceId,
        orderId,
        userId,
        amount: total,
      })

      await upsertPaymentRecord({
        invoiceId,
        amount: total,
        paymentMethod: 'VNPAY',
        status: 'Pending',
        transactionCode,
        paidAt: null,
      })
    } catch (err) {
      console.warn('[checkout] Unable to persist pending payment record:', err?.message || err)
    }

    paymentUrl = buildVnpayPaymentUrl({
      orderId,
      amount: total,
      txnRef: transactionCode,
      ipAddress: options?.ipAddress,
    })
  }

  try {
    if (isOnlinePayment) {
      await notifyCustomerEvent({
        userId,
        event: 'payment_pending',
        orderId,
        payload: { orderId },
      })

      await notifyOwnerEvent({
        event: 'payment_pending',
        orderId,
      })
    } else {
      await notifyCustomerEvent({
        userId,
        event: 'order_created',
        orderId,
        payload: { orderId },
      })

      await notifyOwnerEvent({
        event: 'order_new',
        orderId,
      })
    }
  } catch (err) {
    console.warn('[customerCommerce] Order notify/email failed:', err?.message || err)
  }

  const initialOrderStatus = ORDER_STATUSES.PENDING

  return {
    OrderId: orderId,
    Status: initialOrderStatus,
    PaymentMethod: paymentMethod,
    PaymentStatus: derivePaymentStatus(initialOrderStatus, paymentMethod),
    PaymentUrl: paymentUrl,
    PaymentGateway: paymentUrl ? 'VNPAY' : null,
    Summary: {
      Subtotal: subtotal,
      Shipping: shippingAmount,
      DiscountAmount: discountAmount,
      Total: total,
      ItemCount: selectedItems.length,
    },
  }
}

async function listBookings(userIdInput, limit = 20) {
  const userId = requireUserId(userIdInput)
  const reviewImageColumn = await getSalonReviewImageColumn()
  const bookingReviewImageSelectSql = reviewImageColumn ? `, sr.${reviewImageColumn} AS ReviewImagesRaw` : ', NULL AS ReviewImagesRaw'
  const serviceReviewImageSelectSql = reviewImageColumn ? `, sr.${reviewImageColumn} AS ReviewImagesRaw` : ', NULL AS ReviewImagesRaw'
  const res = await query(
    `SELECT TOP (@limit)
        b.BookingId,
        b.CustomerUserId,
        b.BookingTime,
        b.Status,
        b.Notes,
        b.CreatedAt,
        inv.TotalAmount AS InvoiceTotalAmount,
        inv.DiscountAmount AS InvoiceDiscountAmount,
        inv.FinalAmount AS InvoiceFinalAmount
     FROM Bookings b
     OUTER APPLY (
       SELECT TOP 1 i.TotalAmount, i.DiscountAmount, i.FinalAmount
       FROM Invoices i
       WHERE i.BookingId = b.BookingId
       ORDER BY i.CreatedAt DESC
     ) inv
     WHERE b.CustomerUserId = @userId
     ORDER BY b.BookingTime DESC, b.CreatedAt DESC`,
    { userId, limit: Math.min(Math.max(Number(limit) || 20, 1), 100) }
  )

  const rows = res.recordset || []
  const results = []

  for (const row of rows) {
    const bookingReviewRes = await query(
      `SELECT TOP 1 sr.ReviewId, sr.Rating, sr.Comment, sr.CreatedAt${bookingReviewImageSelectSql}
       FROM SalonReviews sr
       WHERE sr.BookingId = @bookingId
         AND sr.UserId = @userId
         AND sr.BookingServiceId IS NULL
         AND sr.ProductId IS NULL
         AND sr.OrderId IS NULL
         AND sr.Rating IS NOT NULL
       ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC`,
      { bookingId: row.BookingId, userId },
    )
    const bookingReview = bookingReviewRes.recordset?.[0] || null

    const svcRes = await query(
      `SELECT
          bs.BookingServiceId,
          bs.ServiceId,
          bs.StaffId,
          u.Name AS StaffName,
          COALESCE(bs.Price, s.Price) AS Price,
          s.Name AS ServiceName,
          s.DurationMinutes,
          s.ImageUrl,
          rv.Rating AS UserRating,
          rv.Comment AS UserReviewComment,
          rv.CreatedAt AS UserReviewAt,
          rv.ReviewImagesRaw AS UserReviewImagesRaw
       FROM BookingServices bs
       LEFT JOIN Services s ON s.ServiceId = bs.ServiceId
       LEFT JOIN Staff st ON st.StaffId = bs.StaffId
       LEFT JOIN Users u ON u.UserId = st.UserId
       OUTER APPLY (
         SELECT TOP 1 sr.Rating, sr.Comment, sr.CreatedAt${serviceReviewImageSelectSql}
         FROM SalonReviews sr
         WHERE sr.BookingId = bs.BookingId
           AND sr.BookingServiceId = bs.BookingServiceId
           AND sr.ServiceId = bs.ServiceId
           AND sr.UserId = @userId
         ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
       ) rv
       WHERE bs.BookingId = @bookingId
       ORDER BY bs.BookingServiceId`,
      { bookingId: row.BookingId, userId }
    )

    const services = (svcRes.recordset || []).map((s) => ({
      BookingServiceId: s.BookingServiceId,
      ServiceId: s.ServiceId,
      ServiceName: s.ServiceName || '',
      StaffId: s.StaffId || null,
      StaffName: s.StaffName || null,
      DurationMinutes: Number(s.DurationMinutes || 0),
      Price: Number(s.Price || 0),
      ImageUrl: s.ImageUrl || null,
      IsRated: Number(s.UserRating || 0) > 0,
      Rating: Number(s.UserRating || (bookingReview?.Rating || 0)),
      ReviewComment: s.UserReviewComment || bookingReview?.Comment || null,
      ReviewAt: s.UserReviewAt || bookingReview?.CreatedAt || null,
      ReviewImages: parseReviewImagesField(s.UserReviewImagesRaw || bookingReview?.ReviewImagesRaw),
    }))

    const subtotal = Number(row.InvoiceTotalAmount || services.reduce((sum, s) => sum + s.Price, 0))
    const discountAmount = Math.max(0, Number(row.InvoiceDiscountAmount || 0))
    const finalAmount = Number(row.InvoiceFinalAmount || Math.max(subtotal - discountAmount, 0))
    const hasBookingReview = Number(bookingReview?.Rating || 0) > 0
    const canRate = isOrderCompletedStatus(row.Status) && !hasBookingReview

    results.push({
      BookingId: row.BookingId,
      CustomerUserId: row.CustomerUserId,
      BookingTime: row.BookingTime,
      Status: row.Status || 'pending',
      Notes: row.Notes || '',
      CreatedAt: row.CreatedAt,
      Services: services,
      Subtotal: subtotal,
      DiscountAmount: discountAmount,
      TotalPrice: finalAmount,
      TotalDuration: services.reduce((sum, s) => sum + s.DurationMinutes, 0),
      IsRated: hasBookingReview,
      CanRate: canRate,
      BookingReview: hasBookingReview
        ? {
            Rating: Number(bookingReview?.Rating || 0),
            Comment: bookingReview?.Comment || null,
            CreatedAt: bookingReview?.CreatedAt || null,
            ReviewImages: parseReviewImagesField(bookingReview?.ReviewImagesRaw),
          }
        : null,
    })
  }

  return results
}

async function createBooking(userIdInput, payload = {}, options = {}) {
  const userId = requireUserId(userIdInput)
  const serviceItems = Array.isArray(payload.serviceItems) ? payload.serviceItems : []
  const preferredStaffId = String(payload.staffId || '').trim() || null
  const paymentMethod = normalizePaymentMethod(payload.paymentMethod)
  const isOnlinePayment = String(paymentMethod || '').toLowerCase() === 'online'

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

  const settingsMap = await getSettingsMap()
  const bookingSettings = buildBookingSettings(settingsMap, bookingDate || when)
  const openMinutes = parseTimeToMinutes(bookingSettings.openTime)
  const closeMinutes = parseTimeToMinutes(bookingSettings.closeTime)
  const bookingMinutes = when.getHours() * 60 + when.getMinutes()

  if (openMinutes === null || closeMinutes === null || openMinutes >= closeMinutes) {
    const err = new Error('Salon schedule is not configured correctly')
    err.status = 500
    throw err
  }

  if (bookingMinutes < openMinutes || bookingMinutes >= closeMinutes) {
    try {
      await notifyOwnerEvent({
        event: 'booking_rejected',
        payload: { reason: `Booking request outside working hours (${bookingSettings.openTime}-${bookingSettings.closeTime}).` },
      })
    } catch {}
    const err = new Error(`Booking time must be within working hours (${bookingSettings.openTime} - ${bookingSettings.closeTime})`)
    err.status = 400
    throw err
  }

  const breakStartMinutes = parseTimeToMinutes(bookingSettings.breakStart)
  const breakEndMinutes = parseTimeToMinutes(bookingSettings.breakEnd)
  if (breakStartMinutes !== null && breakEndMinutes !== null && breakStartMinutes < breakEndMinutes) {
    if (bookingMinutes >= breakStartMinutes && bookingMinutes < breakEndMinutes) {
      try {
        await notifyOwnerEvent({
          event: 'booking_rejected',
          payload: { reason: 'Booking request falls into break time window.' },
        })
      } catch {}
      const err = new Error('Selected time is within salon break time')
      err.status = 400
      throw err
    }
  }

  const slotMinutes = Math.max(5, Math.trunc(bookingSettings.slotMinutes || 30))
  if ((bookingMinutes - openMinutes) % slotMinutes !== 0) {
    try {
      await notifyOwnerEvent({
        event: 'booking_rejected',
        payload: { reason: `Booking request not aligned with ${slotMinutes}-minute slot configuration.` },
      })
    } catch {}
    const err = new Error(`Selected time is not aligned with ${slotMinutes}-minute booking slots`)
    err.status = 400
    throw err
  }

  const giftCode = String(payload.giftCode || '').trim()
  let appliedPromotion = null
  if (giftCode && !bookingSettings.promotionAllowCustomerApply) {
    const err = new Error('Promotion codes are disabled for customer booking')
    err.status = 400
    throw err
  }

  if (giftCode) {
    if (!bookingSettings.promotionEnabled) {
      const err = new Error('Promotions are currently disabled')
      err.status = 400
      throw err
    }

    appliedPromotion = findActivePromotionByCode(settingsMap, giftCode)
    if (!appliedPromotion) {
      const err = new Error('Invalid or expired promotion code')
      err.status = 400
      throw err
    }

    const maxUsesPerUser = parsePositiveInt(appliedPromotion.maxUsesPerUser, 0)
    if (maxUsesPerUser > 0) {
      const usedByUser = await countPromotionUsageByUser(userId, giftCode)
      if (usedByUser >= maxUsesPerUser) {
        const err = new Error(`This promotion can only be used ${maxUsesPerUser} times per user`)
        err.status = 400
        throw err
      }
    }

    const maxUsesGlobal = parsePositiveInt(appliedPromotion.maxUses, 0)
    if (maxUsesGlobal > 0) {
      const usedGlobal = await countPromotionUsageGlobal(giftCode)
      if (usedGlobal >= maxUsesGlobal) {
        const err = new Error('This promotion has reached its usage limit')
        err.status = 400
        throw err
      }
    }
  }

  const isReturningCustomer = await hasPreviousBookings(userId)
  const autoStaffId = !isReturningCustomer ? await getAutoAssignedStaffId() : null
  const assignedStaffIds = new Set()
  const hasStaffAvailabilityTable = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StaffAvailability'`
  ).then((x) => Boolean(x.recordset?.length)).catch(() => false)
  const hasStaffAvailabilityDayIndex = hasStaffAvailabilityTable
    ? await columnExists('StaffAvailability', 'DayIndex').catch(() => false)
    : false

  // Calculate total duration from services
  const staffServices = new Map()
  let bookingSubtotal = 0
  for (const item of normalizedItems) {
    const svcRes = await query(
      `SELECT TOP 1 ServiceId, DurationMinutes
       FROM Services
       WHERE ServiceId = @serviceId
         AND ${ACTIVE_SERVICE_WHERE}`,
      { serviceId: item.serviceId }
    )
    const svc = svcRes.recordset?.[0]
    if (svc) {
      const duration = Number(svc.DurationMinutes || 30)
      const staffId = item.staffId || null
      if (staffId) {
        staffServices.set(staffId, (staffServices.get(staffId) || 0) + duration * item.quantity)
      }
    }
  }

  // Check for booking conflicts for each staff member
  for (const [staffId, totalDuration] of staffServices.entries()) {
    if (!staffId) continue
    
    const bookingStart = when
    const bookingEnd = new Date(bookingStart.getTime() + totalDuration * 60000)
    const bookingDateStr = bookingStart.toISOString().split('T')[0]

    // Check for overlapping appointments/bookings for this staff
    const conflictRes = await query(
      `SELECT TOP 1 b.BookingId
       FROM Bookings b
       INNER JOIN BookingServices bs ON b.BookingId = bs.BookingId
       INNER JOIN Services s ON bs.ServiceId = s.ServiceId
       WHERE bs.StaffId = @staffId
         AND b.Status NOT IN ('cancelled', 'deleted', 'cancel')
         AND CAST(CONVERT(VARCHAR(10), b.BookingTime, 120) AS DATE) = @date
         AND b.BookingTime < @endTime
         AND DATEADD(MINUTE, ISNULL(s.DurationMinutes, 30), b.BookingTime) > @startTime`,
      {
        staffId,
        date: bookingDateStr,
        startTime: bookingStart,
        endTime: bookingEnd,
      }
    )

    if (conflictRes.recordset && conflictRes.recordset.length > 0) {
      try {
        await notifyOwnerEvent({
          event: 'booking_conflict',
          payload: {
            bookingTime: bookingStart.toISOString(),
            reason: 'Booking conflict detected while creating customer booking.',
          },
        })
      } catch {}

      try {
        await notifyCustomerEvent({
          userId,
          event: 'booking_rejected',
          payload: { reason: 'Your requested specialist/time slot is unavailable. Please choose another slot.' },
        })
      } catch (notifyErr) {
        console.warn('[customerCommerce] Booking rejected notify/email failed:', notifyErr?.message || notifyErr)
      }
      const err = new Error('The selected specialist is not available at this time. Please choose another time slot or specialist.')
      err.status = 409
      throw err
    }

    // Verify staff member is actually scheduled for this date
    // Prefer StaffAvailability (owner schedule UI writes here), then fallback to StaffShifts.
    let scheduledOnDate = false

    const bookingMinute = bookingStart.getHours() * 60 + bookingStart.getMinutes()

    if (hasStaffAvailabilityTable) {
      const availColsRes = await query(
        `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StaffAvailability'`
      )
      const availCols = (availColsRes.recordset || []).map((r) => ({
        name: String(r.COLUMN_NAME),
        type: String(r.DATA_TYPE).toLowerCase(),
      }))
      const availColNames = availCols.map((c) => c.name)
      const hasRequiredAvailCols = ['StaffId', 'WeekStartDate', 'StartHour', 'EndHour'].every((c) => availColNames.includes(c))

      if (hasRequiredAvailCols) {
        const startType = availCols.find((c) => c.name === 'StartHour')?.type || ''
        const endType = availCols.find((c) => c.name === 'EndHour')?.type || ''

        const startExpr = startType.startsWith('time') || startType.includes('date')
          ? `(DATEPART(hour, sa.StartHour) * 60 + DATEPART(minute, sa.StartHour))`
          : `(TRY_CONVERT(INT, sa.StartHour) * 60)`
        const endExpr = endType.startsWith('time') || endType.includes('date')
          ? `(DATEPART(hour, sa.EndHour) * 60 + DATEPART(minute, sa.EndHour))`
          : `(TRY_CONVERT(INT, sa.EndHour) * 60)`

        const availabilityDatePredicate = hasStaffAvailabilityDayIndex
          ? `DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE)) = @bookingDate`
          : `@bookingDate BETWEEN CAST(sa.WeekStartDate AS DATE) AND DATEADD(DAY, 6, CAST(sa.WeekStartDate AS DATE))`

        const availRes = await query(
          `SELECT TOP 1 sa.StaffId
           FROM StaffAvailability sa
           WHERE CONVERT(NVARCHAR(100), sa.StaffId) = CONVERT(NVARCHAR(100), @staffId)
             AND ${availabilityDatePredicate}
             AND ${startExpr} <= @bookingMinute
             AND ${endExpr} > @bookingMinute`,
          {
            staffId,
            bookingDate: bookingDateStr,
            bookingMinute,
          }
        )

        scheduledOnDate = Boolean(availRes.recordset?.length)
      }
    }

    if (!scheduledOnDate) {
      const colsRes = await query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StaffShifts'`)
      const cols = (colsRes.recordset || []).map((r) => ({ name: String(r.COLUMN_NAME), type: String(r.DATA_TYPE).toLowerCase() }))
      const colNames = cols.map((c) => c.name)
      const pickColumn = (candidates) => {
        for (const cand of candidates) if (colNames.includes(cand)) return cand
        return null
      }

      const startCol = pickColumn(['StartHour', 'StartAt', 'StartTime', 'Start'])
      const endCol = pickColumn(['EndHour', 'EndAt', 'EndTime', 'End'])
      const durationCol = pickColumn(['DurationHours', 'Duration', 'DurationMinutes', 'DurationMins'])

      if (startCol) {
        const startType = cols.find((c) => c.name === startCol)?.type || ''
        const endType = endCol ? (cols.find((c) => c.name === endCol)?.type || '') : ''
        const durationType = durationCol ? (cols.find((c) => c.name === durationCol)?.type || '') : ''

        const startExpr = startType.startsWith('time') || startType.includes('date')
          ? `DATEPART(hour, sa.[${startCol}])`
          : `TRY_CONVERT(INT, sa.[${startCol}])`
        const endExpr = endCol
          ? (endType.startsWith('time') || endType.includes('date')
              ? `DATEPART(hour, sa.[${endCol}])`
              : `TRY_CONVERT(INT, sa.[${endCol}])`)
          : null
        const durationExpr = durationCol
          ? (durationType.startsWith('time') || durationType.includes('date')
              ? `DATEPART(hour, sa.[${durationCol}])`
              : `TRY_CONVERT(INT, sa.[${durationCol}])`)
          : null

        const staffAvailSql = `SELECT TOP 1 sa.StaffId
           FROM StaffShifts sa
           WHERE CONVERT(NVARCHAR(100), sa.StaffId) = CONVERT(NVARCHAR(100), @staffId)
             AND DATEADD(DAY, ISNULL(TRY_CONVERT(INT, sa.DayIndex), 0), CAST(sa.WeekStartDate AS DATE)) = @bookingDate
             AND ${startExpr} <= @bookingHour
             AND (${startExpr}
                  + ISNULL(${durationExpr || '0'},
                      CASE
                        WHEN ${endExpr || startExpr} > ${startExpr}
                          THEN ${endExpr || startExpr} - ${startExpr}
                        ELSE 0
                      END
                    )) > @bookingHour`

        const staffAvailRes = await query(staffAvailSql, {
          staffId,
          bookingDate: bookingDateStr,
          bookingHour: bookingStart.getHours(),
        })

        scheduledOnDate = Boolean(staffAvailRes.recordset?.length)
      }
    }

    if (!scheduledOnDate) {
      const err = new Error('The selected specialist is not scheduled to work on this date.')
      err.status = 409
      throw err
    }
  }

  const bookingId = `BKG-${newId()}`
  const rawNotes = String(payload.notes || '').trim()
  const promoMarker = appliedPromotion ? promotionUsageMarker(giftCode) : ''
  const notesValue = [rawNotes, promoMarker].filter(Boolean).join('\n')

  await query(
    `INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes, CreatedAt)
     VALUES (@bookingId, @userId, @bookingTime, @status, @notes, SYSUTCDATETIME())`,
    {
      bookingId,
      userId,
      bookingTime: when,
      status: isOnlinePayment ? 'awaiting' : 'pending',
      notes: notesValue || null,
    }
  )

  for (const item of normalizedItems) {
    const svcRes = await query(
      `SELECT TOP 1 ServiceId, Price
       FROM Services
       WHERE ServiceId = @serviceId
         AND ${ACTIVE_SERVICE_WHERE}`,
      { serviceId: item.serviceId }
    )

    const svc = svcRes.recordset?.[0]
    if (!svc) {
      const err = new Error(`Service not found: ${item.serviceId}`)
      err.status = 404
      throw err
    }

    bookingSubtotal += Number(svc.Price || 0) * Number(item.quantity || 0)

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
      assignedStaffIds.add(String(resolvedStaffId))
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

  const bookingDiscount = calcPromotionDiscountAmount(bookingSubtotal, appliedPromotion)
  const bookingFinalAmount = Math.max(0, bookingSubtotal - bookingDiscount)

  const bookingInvoiceSnapshot = await upsertInvoiceSnapshot({
    userId,
    bookingId,
    subtotal: bookingSubtotal,
    discountAmount: bookingDiscount,
    finalAmount: bookingFinalAmount,
    status: 'Pending',
    promotionCode: appliedPromotion ? normalizePromoCode(giftCode) : '',
  })

  let paymentUrl = null
  if (isOnlinePayment) {
    const transactionCode = buildVnpTxnRef(bookingId)
    setFrontendOriginForTxnRef(transactionCode, options?.frontendOrigin)

    try {
      const invoiceId = await resolveInvoiceIdForPayment({
        invoiceId: bookingInvoiceSnapshot.invoiceId,
        orderId: bookingId,
        userId,
        amount: bookingFinalAmount,
      })

      await upsertPaymentRecord({
        invoiceId,
        amount: bookingFinalAmount,
        paymentMethod: 'VNPAY',
        status: 'Pending',
        transactionCode,
        paidAt: null,
      })
    } catch (err) {
      console.warn('[createBooking] Unable to persist pending payment record:', err?.message || err)
    }

    paymentUrl = buildVnpayPaymentUrl({
      orderId: bookingId,
      amount: bookingFinalAmount,
      txnRef: transactionCode,
      ipAddress: options?.ipAddress,
    })
  }

  const latest = await listBookings(userId, 1)
  try {
    if (isOnlinePayment) {
      await notifyCustomerEvent({
        userId,
        event: 'payment_pending',
        bookingId,
        payload: { bookingId },
      })

      await notifyOwnerEvent({
        event: 'payment_pending',
        bookingId,
      })
    } else {
      await notifyCustomerEvent({
        userId,
        event: 'booking_created',
        bookingId,
        payload: { bookingTime: when.toISOString() },
      })

      await scheduleBookingReminders({
        userId,
        bookingId,
        bookingTime: when.toISOString(),
      })

      const firstStaffId = [...assignedStaffIds][0]
      if (firstStaffId) {
        const staffRes = await query(
          `SELECT TOP 1 u.Name
           FROM Staff s
           LEFT JOIN Users u ON u.UserId = s.UserId
           WHERE s.StaffId = @staffId`,
          { staffId: firstStaffId },
        )
        const staffName = String(staffRes.recordset?.[0]?.Name || '').trim() || null
        await notifyCustomerEvent({
          userId,
          event: 'booking_staff_assigned',
          bookingId,
          payload: { staffName },
        })
      } else {
        await notifyOwnerEvent({
          event: 'booking_unassigned',
          bookingId,
          payload: {
            reason: 'Booking created without specialist assignment.',
          },
        })
      }

      await notifyOwnerEvent({
        event: 'booking_new',
        bookingId,
        payload: {
          bookingTime: when.toISOString(),
        },
      })
    }
  } catch (err) {
    console.warn('[customerCommerce] Booking notify/email failed:', err?.message || err)
  }

  const bookingStatus = isOnlinePayment ? 'awaiting' : 'pending'
  const latestBooking = latest[0] || { BookingId: bookingId }
  return {
    ...latestBooking,
    Subtotal: bookingSubtotal,
    DiscountAmount: bookingDiscount,
    TotalPrice: bookingFinalAmount,
    PaymentMethod: paymentMethod,
    PaymentStatus: derivePaymentStatus(bookingStatus, paymentMethod),
    PaymentUrl: paymentUrl,
    PaymentGateway: paymentUrl ? 'VNPAY' : null,
  }
}

async function listOrders(userIdInput, limit = 20) {
  const userId = requireUserId(userIdInput)
  const orderChannelColumn = await getOrdersChannelColumn()
  const orderItemVariantColumn = await getOrderItemVariantColumn()
  const orderItemVariantNameColumn = await getOrderItemVariantNameColumn()
  const orderChannelSelectSql = orderChannelColumn === 'Channel'
    ? 'o.Channel AS Cannel'
    : orderChannelColumn === 'Cannel'
      ? 'o.Cannel'
      : 'NULL AS Cannel'

  const orderItemVariantIdSelectSql = orderItemVariantColumn
    ? `, oi.${orderItemVariantColumn} AS VariantId`
    : ', CAST(NULL AS NVARCHAR(100)) AS VariantId'
  const orderItemVariantNameSelectSql = orderItemVariantColumn
    ? (orderItemVariantNameColumn
        ? `, COALESCE(oi.${orderItemVariantNameColumn}, pv.VariantName) AS VariantName`
        : ', pv.VariantName AS VariantName')
    : ', CAST(NULL AS NVARCHAR(255)) AS VariantName'
  const orderItemVariantJoinSql = orderItemVariantColumn
    ? `LEFT JOIN ProductVariants pv ON pv.VariantId = oi.${orderItemVariantColumn}`
    : ''

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
    const orderReviewRes = await query(
      `SELECT TOP 1 sr.ReviewId, sr.Rating, sr.Comment, sr.CreatedAt
       FROM SalonReviews sr
       WHERE sr.OrderId = @orderId
         AND sr.UserId = @userId
         AND sr.OrderItemId IS NULL
         AND sr.ServiceId IS NULL
         AND sr.Rating IS NOT NULL
       ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC`,
      { orderId: row.OrderId, userId }
    )
    const orderReview = orderReviewRes.recordset?.[0] || null

    const itemsRes = await query(
      `SELECT
          oi.OrderItemId,
          oi.OrderId,
          oi.ProductId,
          oi.Quantity,
          oi.Price,
          oi.ProductName,
          p.ImageUrl
          ${orderItemVariantIdSelectSql}
          ${orderItemVariantNameSelectSql},
          rv.Rating AS UserRating,
          rv.Comment AS UserReviewComment,
          rv.CreatedAt AS UserReviewAt
       FROM OrderItems oi
       LEFT JOIN Products p ON p.ProductId = oi.ProductId
       ${orderItemVariantJoinSql}
       OUTER APPLY (
         SELECT TOP 1 sr.Rating, sr.Comment, sr.CreatedAt
         FROM SalonReviews sr
         WHERE sr.OrderId = oi.OrderId
           AND sr.OrderItemId = oi.OrderItemId
           AND sr.ProductId = oi.ProductId
           AND sr.UserId = @userId
         ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
       ) rv
       WHERE oi.OrderId = @orderId
       ORDER BY oi.OrderItemId`,
      { orderId: row.OrderId, userId }
    )

    const items = (itemsRes.recordset || []).map((item) => ({
      OrderItemId: item.OrderItemId,
      OrderId: item.OrderId,
      ProductId: item.ProductId,
      ProductName: item.ProductName || '',
      VariantId: item.VariantId || null,
      VariantName: item.VariantName || null,
      Quantity: Number(item.Quantity || 0),
      Price: Number(item.Price || 0),
      ImageUrl: item.ImageUrl || null,
      LineTotal: Number(item.Quantity || 0) * Number(item.Price || 0),
      IsRated: Number(item.UserRating || 0) > 0,
      Rating: Number(item.UserRating || (orderReview?.Rating || 0)),
      ReviewComment: item.UserReviewComment || orderReview?.Comment || null,
      ReviewAt: item.UserReviewAt || orderReview?.CreatedAt || null,
    }))

    const hasOrderReview = Number(orderReview?.Rating || 0) > 0
    const isRated = hasOrderReview
    const canRate = isOrderCompletedStatus(row.Status) && !hasOrderReview

    orders.push({
      OrderId: row.OrderId,
      UserId: row.UserId,
      Status: normalizeOrderLifecycleStatus(row.Status),
      CreatedAt: row.CreatedAt,
      CustomerName: row.CustomerName || '',
      CustomerPhone: row.CustomerPhone || '',
      CustomerAddress: row.CustomerAddress || '',
      Cannel: row.Cannel || 'Online',
      Subtotal: Number(row.Subtotal || 0),
      Shipping: 0,
      DiscountAmount: calcOrderDiscountAmount(row),
      Total: Number(row.Total || 0),
      PaymentMethod: row.PaymentMethod || 'COD',
      PaymentStatus: derivePaymentStatus(normalizeOrderLifecycleStatus(row.Status), row.PaymentMethod),
      GiftCardCode: row.GiftCardCode || null,
      GiftCardApplied: Number(row.GiftCardApplied || 0),
      IsRated: isRated,
      CanRate: canRate,
      OrderReview: hasOrderReview
        ? {
            Rating: Number(orderReview?.Rating || 0),
            Comment: orderReview?.Comment || null,
            CreatedAt: orderReview?.CreatedAt || null,
          }
        : null,
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
    `SELECT TOP 1 BookingId, CustomerUserId, ISNULL(Status, 'Pending') AS Status
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
    const err = new Error(`Only pending bookings can be cancelled. Current status: ${booking.Status}`)
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

  try {
    await notifyCustomerEvent({
      userId,
      event: 'booking_cancelled',
      bookingId,
      payload: { bookingId },
    })

    await notifyOwnerEvent({
      event: 'booking_cancelled',
      bookingId,
    })
  } catch (err) {
    console.warn('[customerCommerce] Cancel booking notify/email failed:', err?.message || err)
  }

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
    `SELECT TOP 1 OrderId, ISNULL(Status, 'Pending') AS Status
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

  const currentStatus = normalizeOrderLifecycleStatus(order.Status)
  if (currentStatus !== ORDER_STATUSES.PENDING) {
    const err = new Error(`Only pending orders can be cancelled. Current status: ${currentStatus}`)
    err.status = 409
    throw err
  }

  await query(
    `UPDATE Orders
     SET Status = @status
     WHERE OrderId = @orderId AND UserId = @userId`,
    {
      orderId,
      userId,
      status: ORDER_STATUSES.CANCELLED,
    }
  )

  try {
    await notifyCustomerEvent({
      userId,
      event: 'order_cancelled',
      orderId,
      payload: { orderId },
    })

    await notifyOwnerEvent({
      event: 'order_cancelled',
      orderId,
    })
  } catch (err) {
    console.warn('[customerCommerce] Cancel order notify/email failed:', err?.message || err)
  }

  return { OrderId: orderId, Status: ORDER_STATUSES.CANCELLED }
}

async function completeOrder(userIdInput, orderIdInput) {
  const userId = requireUserId(userIdInput)
  const orderId = String(orderIdInput || '').trim()

  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  const orderRes = await query(
    `SELECT TOP 1 OrderId, ISNULL(Status, @pendingStatus) AS Status
     FROM Orders
     WHERE OrderId = @orderId AND UserId = @userId`,
    { orderId, userId, pendingStatus: ORDER_STATUSES.PENDING }
  )

  const order = orderRes.recordset?.[0]
  if (!order) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  const currentStatus = normalizeOrderLifecycleStatus(order.Status)
  if (!canTransitionOrderStatus(currentStatus, ORDER_STATUSES.COMPLETED)) {
    const err = new Error(`Order cannot be marked as completed from status: ${currentStatus}`)
    err.status = 409
    throw err
  }

  await query(
    `UPDATE Orders
     SET Status = @status
     WHERE OrderId = @orderId AND UserId = @userId`,
    {
      orderId,
      userId,
      status: ORDER_STATUSES.COMPLETED,
    }
  )

  try {
    await notifyCustomerEvent({
      userId,
      event: 'order_delivered',
      orderId,
      payload: { orderId },
    })

    await notifyOwnerEvent({
      event: 'order_delivered',
      orderId,
    })
  } catch (err) {
    console.warn('[customerCommerce] Complete order notify/email failed:', err?.message || err)
  }

  return { OrderId: orderId, Status: ORDER_STATUSES.COMPLETED }
}

async function reorderOrder(userIdInput, orderIdInput) {
  const userId = requireUserId(userIdInput)
  const orderId = String(orderIdInput || '').trim()

  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  const orderRes = await query(
    `SELECT TOP 1 OrderId
     FROM Orders
     WHERE OrderId = @orderId AND UserId = @userId`,
    { orderId, userId },
  )

  if (!orderRes.recordset?.length) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  const orderItemVariantColumn = await getOrderItemVariantColumn()
  const orderItemVariantNameColumn = await getOrderItemVariantNameColumn()
  const variantIdSelectSql = orderItemVariantColumn
    ? `, ${orderItemVariantColumn} AS VariantId`
    : ', CAST(NULL AS NVARCHAR(100)) AS VariantId'
  const variantNameSelectSql = orderItemVariantNameColumn
    ? `, ${orderItemVariantNameColumn} AS VariantName`
    : ', CAST(NULL AS NVARCHAR(255)) AS VariantName'

  const itemsRes = await query(
    `SELECT OrderItemId, ProductId, Quantity, Price, ProductName${variantIdSelectSql}${variantNameSelectSql}
     FROM OrderItems
     WHERE OrderId = @orderId
     ORDER BY OrderItemId`,
    { orderId },
  )

  const sourceItems = (itemsRes.recordset || [])
    .map((item) => ({
      orderItemId: String(item.OrderItemId || '').trim(),
      productId: String(item.ProductId || '').trim(),
      variantId: String(item.VariantId || '').trim() || null,
      variantName: String(item.VariantName || '').trim() || null,
      productName: String(item.ProductName || '').trim() || null,
      price: Number(item.Price || 0),
      quantity: Math.max(1, Math.trunc(Number(item.Quantity || 0) || 1)),
    }))
    .filter((item) => Boolean(item.productId))

  if (!sourceItems.length) {
    const err = new Error('Order has no valid items to reorder')
    err.status = 409
    throw err
  }

  const failedItems = []
  let addedCount = 0
  const variantCache = new Map()

  const normalizeText = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  const getProductVariants = async (productId) => {
    const key = String(productId || '').trim()
    if (!key) return []
    if (variantCache.has(key)) return variantCache.get(key)

    if (!(await tableExists('ProductVariants'))) {
      variantCache.set(key, [])
      return []
    }

    const res = await query(
      `SELECT VariantId, VariantName, Price
       FROM ProductVariants
       WHERE ProductId = @productId
       ORDER BY VariantName, VariantId`,
      { productId: key },
    )

    const variants = (res.recordset || []).map((row) => ({
      variantId: String(row.VariantId || '').trim(),
      variantName: String(row.VariantName || '').trim(),
      price: Number(row.Price || 0),
    })).filter((row) => Boolean(row.variantId))

    variantCache.set(key, variants)
    return variants
  }

  const pickVariantId = async (item, options = {}) => {
    const explicit = String(item?.variantId || '').trim()
    if (explicit && !options.ignoreExplicit) return explicit

    const variants = await getProductVariants(item?.productId)
    if (!variants.length) return null

    const byVariantName = normalizeText(item?.variantName)
    if (byVariantName) {
      const exact = variants.find((v) => normalizeText(v.variantName) === byVariantName)
      if (exact?.variantId) return exact.variantId
    }

    const rawProductName = String(item?.productName || '').trim()
    const suffixFromName = rawProductName.includes('-')
      ? normalizeText(rawProductName.split('-').slice(1).join('-'))
      : ''
    if (suffixFromName) {
      const exactSuffix = variants.find((v) => normalizeText(v.variantName) === suffixFromName)
      if (exactSuffix?.variantId) return exactSuffix.variantId

      const partialSuffix = variants.find((v) => suffixFromName.includes(normalizeText(v.variantName)))
      if (partialSuffix?.variantId) return partialSuffix.variantId
    }

    const itemPrice = Number(item?.price || 0)
    if (Number.isFinite(itemPrice) && itemPrice > 0) {
      const byPrice = variants.find((v) => Math.abs(Number(v.price || 0) - itemPrice) < 0.0001)
      if (byPrice?.variantId) return byPrice.variantId
    }

    return null
  }

  for (const item of sourceItems) {
    try {
      let resolvedVariantId = await pickVariantId(item)

      await addCartItem(userId, {
        productId: item.productId,
        variantId: resolvedVariantId || undefined,
        quantity: item.quantity,
      })
      addedCount += 1
    } catch (err) {
      try {
        // Retry once with a fallback variant strategy when explicit variant mapping is stale.
        const fallbackVariantId = await pickVariantId(item, { ignoreExplicit: true })
        if (fallbackVariantId && fallbackVariantId !== String(item.variantId || '').trim()) {
          await addCartItem(userId, {
            productId: item.productId,
            variantId: fallbackVariantId,
            quantity: item.quantity,
          })
          addedCount += 1
          continue
        }
      } catch (_) {
        // Keep original error for failedItems list.
      }

      failedItems.push({
        OrderItemId: item.orderItemId,
        ProductId: item.productId,
        VariantId: item.variantId,
        VariantName: item.variantName,
        Quantity: item.quantity,
        Error: err?.message || 'Unable to add this item',
      })
    }
  }

  if (!addedCount) {
    const err = new Error('Unable to reorder items from this order')
    err.status = 409
    err.details = failedItems
    throw err
  }

  const cart = await getCart(userId)
  return {
    OrderId: orderId,
    AddedItemCount: addedCount,
    FailedItemCount: failedItems.length,
    FailedItems: failedItems,
    CartSummary: {
      ItemCount: Number(cart?.Summary?.ItemCount || 0),
      QuantityCount: Number(cart?.Summary?.QuantityCount || 0),
      Subtotal: Number(cart?.Summary?.Subtotal || 0),
    },
  }
}

async function rateBooking(userIdInput, bookingIdInput, ratingInput, commentInput, imageDataUrlsInput) {
  const userId = requireUserId(userIdInput)
  const bookingId = String(bookingIdInput || '').trim()
  const rating = Number(ratingInput) || 5
  const comment = String(commentInput || '').trim()

  if (!bookingId) {
    const err = new Error('Missing bookingId')
    err.status = 400
    throw err
  }

  if (rating < 1 || rating > 5) {
    const err = new Error('Rating must be between 1 and 5')
    err.status = 400
    throw err
  }

  const bookingRes = await query(
    `SELECT TOP 1 b.BookingId, b.CustomerUserId, ISNULL(b.Status, 'Pending') AS Status
     FROM Bookings b
     WHERE b.BookingId = @bookingId AND b.CustomerUserId = @userId`,
    { bookingId, userId }
  )

  const booking = bookingRes.recordset?.[0]
  if (!booking) {
    const err = new Error('Booking not found')
    err.status = 404
    throw err
  }

  if (!isOrderCompletedStatus(booking.Status)) {
    const err = new Error(`Only completed bookings can be reviewed. Current status: ${booking.Status}`)
    err.status = 409
    throw err
  }

  const firstServiceRes = await query(
    `SELECT TOP 1 bs.BookingServiceId, bs.ServiceId
     FROM BookingServices bs
     WHERE bs.BookingId = @bookingId
     ORDER BY bs.BookingServiceId ASC`,
    { bookingId },
  )
  const firstService = firstServiceRes.recordset?.[0]
  const serviceId = String(firstService?.ServiceId || '').trim()
  if (!serviceId) {
    const err = new Error('Booking has no service to review')
    err.status = 409
    throw err
  }

  const existingRes = await query(
    `SELECT TOP 1 sr.ReviewId
     FROM SalonReviews sr
     WHERE sr.BookingId = @bookingId
       AND sr.UserId = @userId
       AND sr.BookingServiceId IS NULL
       AND sr.ProductId IS NULL
       AND sr.OrderId IS NULL
     ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC`,
    { bookingId, userId },
  )
  const existingReviewId = String(existingRes.recordset?.[0]?.ReviewId || '').trim()

  if (existingReviewId) {
    await query(
      `UPDATE SalonReviews
       SET Rating = @rating,
           Comment = @comment,
           CreatedAt = SYSUTCDATETIME()
       WHERE ReviewId = @reviewId`,
      {
        reviewId: existingReviewId,
        rating,
        comment: comment || null,
      },
    )
    const reviewImages = await setReviewImagesByReviewId(existingReviewId, imageDataUrlsInput)
    return { BookingId: bookingId, Rating: rating, Comment: comment || null, ReviewImages: reviewImages }
  } else {
    const reviewId = `BRV-${newId()}`
    await query(
      `INSERT INTO SalonReviews (ReviewId, UserId, ServiceId, Rating, Comment, CreatedAt, BookingId, BookingServiceId)
       VALUES (@reviewId, @userId, @serviceId, @rating, @comment, SYSUTCDATETIME(), @bookingId, NULL)`,
      {
        reviewId,
        userId,
        serviceId,
        bookingId,
        rating,
        comment: comment || null,
      }
    )
    const reviewImages = await setReviewImagesByReviewId(reviewId, imageDataUrlsInput)
    return { BookingId: bookingId, Rating: rating, Comment: comment || null, ReviewImages: reviewImages }
  }
}

async function rateBookingService(userIdInput, bookingIdInput, bookingServiceIdInput, ratingInput, commentInput, imageDataUrlsInput) {
  const userId = requireUserId(userIdInput)
  const bookingId = String(bookingIdInput || '').trim()
  const bookingServiceId = String(bookingServiceIdInput || '').trim()
  const rating = Number(ratingInput) || 5
  const comment = String(commentInput || '').trim()

  if (!bookingId) {
    const err = new Error('Missing bookingId')
    err.status = 400
    throw err
  }
  if (!bookingServiceId) {
    const err = new Error('Missing bookingServiceId')
    err.status = 400
    throw err
  }

  if (rating < 1 || rating > 5) {
    const err = new Error('Rating must be between 1 and 5')
    err.status = 400
    throw err
  }

  const svcRes = await query(
    `SELECT TOP 1 b.BookingId, ISNULL(b.Status, 'Pending') AS Status, bs.BookingServiceId, bs.ServiceId
     FROM Bookings b
     INNER JOIN BookingServices bs ON bs.BookingId = b.BookingId
     WHERE b.BookingId = @bookingId
       AND b.CustomerUserId = @userId
       AND bs.BookingServiceId = @bookingServiceId`,
    { bookingId, userId, bookingServiceId },
  )

  const bookingService = svcRes.recordset?.[0]
  if (!bookingService) {
    const err = new Error('Booking service not found')
    err.status = 404
    throw err
  }

  if (!isOrderCompletedStatus(bookingService.Status)) {
    const err = new Error(`Only completed bookings can be reviewed. Current status: ${bookingService.Status}`)
    err.status = 409
    throw err
  }

  const serviceId = String(bookingService.ServiceId || '').trim()
  if (!serviceId) {
    const err = new Error('Booking has no service to review')
    err.status = 409
    throw err
  }

  const existingRes = await query(
    `SELECT TOP 1 ReviewId
     FROM SalonReviews
     WHERE BookingId = @bookingId
       AND BookingServiceId = @bookingServiceId
       AND ServiceId = @serviceId
       AND UserId = @userId
     ORDER BY CreatedAt DESC, ReviewId DESC`,
    { bookingId, bookingServiceId, serviceId, userId },
  )

  const reviewId = String(existingRes.recordset?.[0]?.ReviewId || '').trim() || `BSV-${newId()}`

  if (existingRes.recordset?.[0]) {
    await query(
      `UPDATE SalonReviews
       SET Rating = @rating,
           Comment = @comment,
           CreatedAt = SYSUTCDATETIME()
       WHERE ReviewId = @reviewId`,
      { reviewId, rating, comment: comment || null },
    )
  } else {
    await query(
      `INSERT INTO SalonReviews (ReviewId, UserId, ServiceId, Rating, Comment, CreatedAt, BookingId, BookingServiceId)
       VALUES (@reviewId, @userId, @serviceId, @rating, @comment, SYSUTCDATETIME(), @bookingId, @bookingServiceId)`,
      {
        reviewId,
        userId,
        serviceId,
        rating,
        comment: comment || null,
        bookingId,
        bookingServiceId,
      }
    )
  }

  const reviewImages = await setReviewImagesByReviewId(reviewId, imageDataUrlsInput)

  return {
    BookingId: bookingId,
    BookingServiceId: bookingServiceId,
    ServiceId: serviceId,
    Rating: rating,
    Comment: comment || null,
    ReviewImages: reviewImages,
  }
}

async function rateOrder(userIdInput, orderIdInput, ratingInput, commentInput, imageDataUrlsInput) {
  const userId = requireUserId(userIdInput)
  const orderId = String(orderIdInput || '').trim()
  const rating = Number(ratingInput) || 5
  const comment = String(commentInput || '').trim()

  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }

  if (rating < 1 || rating > 5) {
    const err = new Error('Rating must be between 1 and 5')
    err.status = 400
    throw err
  }

  const orderRes = await query(
    `SELECT TOP 1 o.OrderId, o.UserId, ISNULL(o.Status, 'Pending') AS Status
     FROM Orders o
     WHERE o.OrderId = @orderId AND o.UserId = @userId`,
    { orderId, userId }
  )

  const order = orderRes.recordset?.[0]
  if (!order) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  if (!isOrderCompletedStatus(order.Status)) {
    const err = new Error(`Only completed orders can be reviewed. Current status: ${order.Status}`)
    err.status = 409
    throw err
  }

  const anyItemRes = await query(
    `SELECT TOP 1 oi.OrderItemId, oi.ProductId
     FROM OrderItems oi
     WHERE oi.OrderId = @orderId
     ORDER BY oi.OrderItemId ASC`,
    { orderId }
  )

  const firstOrderItem = anyItemRes.recordset?.[0]
  if (!firstOrderItem) {
    const err = new Error('Order has no product to review')
    err.status = 409
    throw err
  }

  const orderTargetProductId = String(firstOrderItem.ProductId || '').trim()
  if (!orderTargetProductId) {
    const err = new Error('Order has no product to review')
    err.status = 409
    throw err
  }

  const existingRes = await query(
    `SELECT TOP 1 sr.ReviewId
     FROM SalonReviews sr
     WHERE sr.OrderId = @orderId
       AND sr.UserId = @userId
       AND sr.OrderItemId IS NULL
       AND sr.ServiceId IS NULL
     ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC`,
    { orderId, userId }
  )
  const existingReviewId = String(existingRes.recordset?.[0]?.ReviewId || '').trim()

  if (existingReviewId) {
    await query(
      `UPDATE SalonReviews
       SET Rating = @rating,
           Comment = @comment,
           CreatedAt = SYSUTCDATETIME()
       WHERE ReviewId = @reviewId`,
      {
        reviewId: existingReviewId,
        rating,
        comment: comment || null,
      }
    )
    const reviewImages = await setReviewImagesByReviewId(existingReviewId, imageDataUrlsInput)
    return {
      OrderId: orderId,
      Rating: rating,
      Comment: comment || null,
      ReviewImages: reviewImages,
    }
  } else {
    const reviewId = `ORV-${newId()}`
    await query(
      `INSERT INTO SalonReviews (ReviewId, UserId, ProductId, Rating, Comment, CreatedAt, OrderId, OrderItemId)
       VALUES (@reviewId, @userId, @productId, @rating, @comment, SYSUTCDATETIME(), @orderId, NULL)`,
      {
        reviewId,
        userId,
        productId: orderTargetProductId,
        orderId,
        rating,
        comment: comment || null,
      }
    )
    const reviewImages = await setReviewImagesByReviewId(reviewId, imageDataUrlsInput)
    return {
      OrderId: orderId,
      Rating: rating,
      Comment: comment || null,
      ReviewImages: reviewImages,
    }
  }
}

async function rateOrderItem(userIdInput, orderIdInput, orderItemIdInput, ratingInput, commentInput, imageDataUrlsInput) {
  const userId = requireUserId(userIdInput)
  const orderId = String(orderIdInput || '').trim()
  const orderItemId = String(orderItemIdInput || '').trim()
  const rating = Number(ratingInput) || 5
  const comment = String(commentInput || '').trim()

  if (!orderId) {
    const err = new Error('Missing orderId')
    err.status = 400
    throw err
  }
  if (!orderItemId) {
    const err = new Error('Missing orderItemId')
    err.status = 400
    throw err
  }
  if (rating < 1 || rating > 5) {
    const err = new Error('Rating must be between 1 and 5')
    err.status = 400
    throw err
  }

  const itemRes = await query(
    `SELECT TOP 1 o.OrderId, ISNULL(o.Status, 'Pending') AS Status, oi.OrderItemId, oi.ProductId
     FROM Orders o
     INNER JOIN OrderItems oi ON oi.OrderId = o.OrderId
     WHERE o.OrderId = @orderId
       AND o.UserId = @userId
       AND oi.OrderItemId = @orderItemId`,
    { orderId, userId, orderItemId }
  )
  const item = itemRes.recordset?.[0]
  if (!item) {
    const err = new Error('Order item not found')
    err.status = 404
    throw err
  }

  if (!isOrderCompletedStatus(item.Status)) {
    const err = new Error(`Only completed orders can be reviewed. Current status: ${item.Status}`)
    err.status = 409
    throw err
  }

  const productId = String(item.ProductId || '').trim()
  if (!productId) {
    const err = new Error('Order item has no product to review')
    err.status = 409
    throw err
  }

  const existingRes = await query(
    `SELECT TOP 1 ReviewId
     FROM SalonReviews
     WHERE OrderId = @orderId
       AND OrderItemId = @orderItemId
       AND ProductId = @productId
       AND UserId = @userId
     ORDER BY CreatedAt DESC, ReviewId DESC`,
    { orderId, orderItemId, productId, userId }
  )
  const reviewId = String(existingRes.recordset?.[0]?.ReviewId || '').trim() || `PRV-${newId()}`

  if (existingRes.recordset?.[0]) {
    await query(
      `UPDATE SalonReviews
       SET Rating = @rating,
           Comment = @comment,
           CreatedAt = SYSUTCDATETIME()
       WHERE ReviewId = @reviewId`,
      { reviewId, rating, comment: comment || null }
    )
  } else {
    await query(
      `INSERT INTO SalonReviews (ReviewId, UserId, ProductId, Rating, Comment, CreatedAt, OrderId, OrderItemId)
       VALUES (@reviewId, @userId, @productId, @rating, @comment, SYSUTCDATETIME(), @orderId, @orderItemId)`,
      { reviewId, userId, productId, rating, comment: comment || null, orderId, orderItemId }
    )
  }

  const reviewImages = await setReviewImagesByReviewId(reviewId, imageDataUrlsInput)

  return {
    OrderId: orderId,
    OrderItemId: orderItemId,
    ProductId: productId,
    Rating: rating,
    Comment: comment || null,
    ReviewImages: reviewImages,
  }
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
  rateBooking,
  rateBookingService,
  rateOrder,
  rateOrderItem,
  listOrders,
  cancelBooking,
  cancelOrder,
  completeOrder,
  reorderOrder,
}
