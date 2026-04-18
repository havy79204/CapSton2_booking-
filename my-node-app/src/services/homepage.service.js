const { query, newId } = require('../config/query')
const fs = require('fs/promises')
const path = require('path')

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

let _reviewImageColumnPromise = null
const REVIEW_IMAGE_COLUMN_CANDIDATES = ['ReviewImages', 'ImageUrls', 'ImagesJson', 'ImageUrl']

async function ensureSalonReviewImageColumn() {
  try {
    await query(`
      IF COL_LENGTH('SalonReviews', 'ImageUrl') IS NULL
      BEGIN
        ALTER TABLE SalonReviews ADD ImageUrl NVARCHAR(MAX) NULL;
      END
    `)
    return 'ImageUrl'
  } catch (err) {
    console.warn('[homepage] Unable to auto-create SalonReviews.ImageUrl:', err?.message || err)
    return null
  }
}

async function getSalonReviewImageColumn() {
  if (!_reviewImageColumnPromise) {
    _reviewImageColumnPromise = (async () => {
      for (const col of REVIEW_IMAGE_COLUMN_CANDIDATES) {
        try {
          const res = await query(
            `SELECT TOP 1 1 AS ok
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_NAME = 'SalonReviews' AND COLUMN_NAME = @columnName`,
            { columnName: col },
          )
          if (res.recordset?.length) return col
        } catch (_err) {
          // Ignore and try next candidate.
        }
      }
      return ensureSalonReviewImageColumn()
    })()
  }
  return _reviewImageColumnPromise
}

async function setReviewImagesByReviewId(reviewIdInput, imageDataUrlsInput) {
  const reviewId = String(reviewIdInput || '').trim()
  if (!reviewId) return []

  const imageColumn = await getSalonReviewImageColumn()
  const hasIncomingImages = Array.isArray(imageDataUrlsInput)
    ? imageDataUrlsInput.some((x) => String(x || '').trim())
    : Boolean(String(imageDataUrlsInput || '').trim())

  if (!hasIncomingImages) {
    if (!imageColumn) return []
    const currentRes = await query(
      `SELECT TOP 1 ${imageColumn} AS ReviewImagesRaw
       FROM SalonReviews
       WHERE ReviewId = @reviewId`,
      { reviewId },
    )
    return parseReviewImagesField(currentRes.recordset?.[0]?.ReviewImagesRaw)
  }

  const saved = await saveReviewImagesFromDataUrls(imageDataUrlsInput, { maxImages: 3 })
  if (!imageColumn) return saved

  await query(
    `UPDATE SalonReviews
     SET ${imageColumn} = @imagePayload
     WHERE ReviewId = @reviewId`,
    {
      reviewId,
      imagePayload: saved.length ? JSON.stringify(saved) : null,
    },
  )

  return saved
}

function normalizePublicImageUrl(rawUrl) {
  if (!rawUrl) return null

  const value = String(rawUrl).trim()
  if (!value) return null

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  const unixPath = value.replace(/\\/g, '/')
  const publicMarker = '/my-app/public/'
  const publicMarkerIndex = unixPath.toLowerCase().indexOf(publicMarker)

  if (publicMarkerIndex >= 0) {
    const relative = unixPath.slice(publicMarkerIndex + publicMarker.length)
    return `/${relative.replace(/^\/+/, '')}`
  }

  if (unixPath.startsWith('/')) {
    return unixPath
  }

  return `/${unixPath}`
}

function normalizeAvatarUrl(rawUrl) {
  if (!rawUrl) return null

  const value = String(rawUrl).trim()
  if (!value) return null

  if (/^https?:\/\//i.test(value)) return value

  const unixPath = value.replace(/\\/g, '/')
  if (unixPath.startsWith('/uploads/')) return unixPath
  if (unixPath.startsWith('uploads/')) return `/${unixPath}`
  if (/\.(png|jpe?g|webp|gif)$/i.test(unixPath) && !unixPath.includes('/')) {
    return `/uploads/avatars/${unixPath}`
  }

  return normalizePublicImageUrl(unixPath)
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

async function columnExists(tableName, columnName) {
  const res = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName`,
    { tableName, columnName }
  )
  return Boolean(res.recordset?.length)
}

async function getSalonContactInfo() {
  const settingsRes = await query(
    `SELECT SettingKey, SettingValue
     FROM SystemSettings
     WHERE SettingKey IN ('SalonName', 'SalonPhone', 'SalonEmail', 'SalonAddress', 'SalonWebsite')`,
  ).catch(() => ({ recordset: [] }))

  const settingsMap = {}
  for (const row of settingsRes.recordset || []) {
    settingsMap[String(row.SettingKey || '').trim()] = String(row.SettingValue || '').trim()
  }

  const fallbackUser = await query(
    `SELECT TOP 1 Name, Email, Phone
     FROM Users
     WHERE LOWER(LTRIM(RTRIM(ISNULL(RoleKey, '')))) IN ('owner', 'admin', '1')
     ORDER BY CreatedAt DESC`,
  ).catch(() => ({ recordset: [] }))

  const owner = fallbackUser.recordset?.[0] || {}

  return {
    name: settingsMap.SalonName || String(owner.Name || '').trim() || 'NIOM&CE',
    phone: settingsMap.SalonPhone || String(owner.Phone || '').trim() || '',
    email: settingsMap.SalonEmail || String(owner.Email || '').trim() || '',
    address: settingsMap.SalonAddress || '',
    website: settingsMap.SalonWebsite || '',
  }
}

/**
 * Get services list with categories
 */
async function getServices(opts = {}) {
  const rawCategoryId = opts?.categoryId ?? opts?.CategoryId ?? opts?.category ?? null
  const categoryId = rawCategoryId === undefined || rawCategoryId === null || String(rawCategoryId).trim() === '' || String(rawCategoryId).toLowerCase() === 'all'
    ? null
    : String(rawCategoryId).trim()

  const sortBy = String(opts?.sortBy || '').trim().toLowerCase()
  const sortOrder = String(opts?.sortOrder || '').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  const orderClause = sortBy === 'price'
    ? `TRY_CONVERT(DECIMAL(19,2), s.[Price]) ${sortOrder}, s.[Name] ASC`
    : 's.[CategoryId], s.[Name]'

  const hasServiceImages = await tableExists('ServiceImages')
  const params = {}
  const whereClauses = [
    "(s.[Status] IS NULL OR LOWER(LTRIM(RTRIM(s.[Status]))) = 'active')"
  ]

  if (categoryId !== null) {
    whereClauses.push('CAST(s.[CategoryId] AS NVARCHAR(100)) = @categoryId')
    params.categoryId = categoryId
  }

  const res = await query(`SELECT 
      s.[ServiceId],
      s.[Name],
      s.[Description],
      s.[Price],
      s.[DurationMinutes],
      s.[Status],
      s.[CategoryId],
      sc.[Name] AS CategoryName,
      s.[ImageUrl] AS PrimaryImageUrl
    FROM [Services] s
    LEFT JOIN [ServiceCategories] sc ON s.[CategoryId] = sc.[CategoryId]
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${orderClause}`,
    params,
    { timeoutMs: 30000 }
  )

  const rows = res.recordset || []
  const byServiceId = new Map()

  for (const row of rows) {
    const key = String(row.ServiceId)

    if (!byServiceId.has(key)) {
      const imageUrl = normalizePublicImageUrl(row.PrimaryImageUrl)
      const images = []
      if (imageUrl) images.push(imageUrl)

      byServiceId.set(key, {
        ServiceId: row.ServiceId,
        Name: row.Name,
        Description: row.Description,
        Price: row.Price,
        DurationMinutes: row.DurationMinutes,
        Status: row.Status,
        CategoryId: row.CategoryId,
        CategoryName: row.CategoryName,
        ImageUrl: imageUrl,
        Images: images
      })
    }

  }

  if (hasServiceImages && byServiceId.size) {
    const imageRowsRes = await query(`
      SELECT si.[ServiceId], si.[ImageId], si.[ImageUrl]
      FROM [ServiceImages] si
      INNER JOIN [Services] s ON s.[ServiceId] = si.[ServiceId]
      WHERE s.[Status] IS NULL OR LOWER(LTRIM(RTRIM(s.[Status]))) = 'active'
      ORDER BY si.[ServiceId], si.[ImageId]
    `, {}, { timeoutMs: 30000 })

    for (const imgRow of imageRowsRes.recordset || []) {
      const key = String(imgRow.ServiceId)
      const service = byServiceId.get(key)
      if (!service) continue

      const normalizedExtra = normalizePublicImageUrl(imgRow.ImageUrl)
      if (normalizedExtra && !service.Images.includes(normalizedExtra)) {
        service.Images.push(normalizedExtra)
      }
    }
  }

  return Array.from(byServiceId.values()).map(service => ({
    ...service,
    ImageUrl: service.ImageUrl || service.Images[0] || null
  }))
}

/**
 * Get service categories list
 */
async function getServiceCategories() {
  const res = await query(`
    SELECT 
      [CategoryId],
      [Name],
      [Description]
    FROM [ServiceCategories]
    ORDER BY [Name]
  `)
  return res.recordset || []
}

/**
 * Get products list with categories
 */
async function getProducts(opts = {}) {
  const rawCategoryId = opts?.categoryId ?? opts?.CategoryId ?? opts?.category ?? null
  const categoryId = rawCategoryId === undefined || rawCategoryId === null || String(rawCategoryId).trim() === '' || String(rawCategoryId).toLowerCase() === 'all'
    ? null
    : String(rawCategoryId).trim()

  const sortBy = String(opts?.sortBy || '').trim().toLowerCase()
  const sortOrder = String(opts?.sortOrder || '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const hasProductImages = await tableExists('ProductImages')
  const hasProductsCreatedAt = await columnExists('Products', 'CreatedAt')
  const hasProductVariants = await tableExists('ProductVariants')

  const newestExpr = hasProductsCreatedAt
    ? 'COALESCE(p.[CreatedAt], GETDATE())'
    : 'p.[ProductId]'

  const productStockExpr = hasProductVariants
    ? `CASE
         WHEN EXISTS (SELECT 1 FROM [ProductVariants] pvCheck WHERE pvCheck.[ProductId] = p.[ProductId])
           THEN COALESCE((
             SELECT SUM(COALESCE(vlots.[TotalQty], TRY_CONVERT(DECIMAL(19,2), pv.[Stock]), 0))
             FROM [ProductVariants] pv
             OUTER APPLY (
               SELECT SUM(TRY_CONVERT(DECIMAL(19,2), l.[RemainingQty])) AS TotalQty
               FROM [InventoryLots] l
               WHERE l.[InventoryItemId] = CONCAT('retail_variant_', pv.[VariantId])
             ) vlots
             WHERE pv.[ProductId] = p.[ProductId]
           ), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.[Stock]), 0))
         ELSE COALESCE((
             SELECT SUM(COALESCE(l.[RemainingQty], 0))
             FROM [InventoryLots] l
             WHERE l.[InventoryItemId] = CONCAT('retail_', p.[ProductId])
           ), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.[Stock]), 0))
       END`
    : `COALESCE((
         SELECT SUM(COALESCE(l.[RemainingQty], 0))
         FROM [InventoryLots] l
         WHERE l.[InventoryItemId] = CONCAT('retail_', p.[ProductId])
       ), COALESCE(TRY_CONVERT(DECIMAL(19,2), p.[Stock]), 0))`

  let orderByClause = `p.[CategoryId] ASC, p.[Name] ASC`
  if (sortBy === 'price') {
    orderByClause = `TRY_CONVERT(DECIMAL(19,2), p.[Price]) ${sortOrder}, p.[Name] ASC`
  } else if (sortBy === 'best_selling') {
    orderByClause = `ISNULL(sales.SoldCount, 0) DESC, p.[Name] ASC`
  } else if (sortBy === 'newest') {
    orderByClause = `${newestExpr} DESC, p.[Name] ASC`
  }

  const params = {}
  const whereClauses = [
    "(p.[Status] IS NULL OR LOWER(LTRIM(RTRIM(p.[Status]))) = 'active')"
  ]
  if (categoryId !== null) {
    whereClauses.push('CAST(p.[CategoryId] AS NVARCHAR(100)) = @categoryId')
    params.categoryId = categoryId
  }

  const res = await query(hasProductImages
    ? `SELECT
        p.[ProductId],
        p.[Name],
        p.[Price],
        p.[Description],
        p.[ImageUrl],
        ${productStockExpr} AS Stock,
        p.[Status],
        p.[CategoryId],
        pc.[Name] AS CategoryName,
        ISNULL(rating.[AverageRating], 0) AS AverageRating,
        ISNULL(rating.[ReviewCount], 0) AS ReviewCount,
        ISNULL(sales.[SoldCount], 0) AS SoldCount,
        pi.[ImageId] AS ExtraImageId,
        pi.[ImageUrl] AS ExtraImageUrl,
        pi.[SortOrder] AS ExtraSortOrder
      FROM [Products] p
      LEFT JOIN [ProductCategories] pc ON p.[CategoryId] = pc.[CategoryId]
      LEFT JOIN (
        SELECT
          sr.[ProductId],
          COUNT(1) AS ReviewCount,
          AVG(CAST(sr.[Rating] AS FLOAT)) AS AverageRating
        FROM [SalonReviews] sr
        WHERE sr.[ProductId] IS NOT NULL AND sr.[Rating] IS NOT NULL
        GROUP BY sr.[ProductId]
      ) rating ON rating.[ProductId] = p.[ProductId]
      LEFT JOIN (
        SELECT
          oi.[ProductId],
          SUM(COALESCE(oi.[Quantity], 0)) AS SoldCount
        FROM [OrderItems] oi
        LEFT JOIN [Orders] o ON o.[OrderId] = oi.[OrderId]
        WHERE o.[OrderId] IS NULL
          OR LOWER(LTRIM(RTRIM(ISNULL(o.[Status], '')))) IN ('completed', 'delivered', 'confirmed', 'done')
        GROUP BY oi.[ProductId]
      ) sales ON sales.[ProductId] = p.[ProductId]
      LEFT JOIN [ProductImages] pi ON p.[ProductId] = pi.[ProductId]
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ${orderByClause}, ISNULL(pi.[SortOrder], 2147483647), pi.[ImageId]`
    : `SELECT
        p.[ProductId],
        p.[Name],
        p.[Price],
        p.[Description],
        p.[ImageUrl],
        ${productStockExpr} AS Stock,
        p.[Status],
        p.[CategoryId],
        pc.[Name] AS CategoryName,
        ISNULL(rating.[AverageRating], 0) AS AverageRating,
        ISNULL(rating.[ReviewCount], 0) AS ReviewCount,
        ISNULL(sales.[SoldCount], 0) AS SoldCount,
        NULL AS ExtraImageId,
        NULL AS ExtraImageUrl
        FROM [Products] p
        LEFT JOIN [ProductCategories] pc ON p.[CategoryId] = pc.[CategoryId]
        LEFT JOIN (
          SELECT
            sr.[ProductId],
            COUNT(1) AS ReviewCount,
            AVG(CAST(sr.[Rating] AS FLOAT)) AS AverageRating
          FROM [SalonReviews] sr
          WHERE sr.[ProductId] IS NOT NULL AND sr.[Rating] IS NOT NULL
          GROUP BY sr.[ProductId]
        ) rating ON rating.[ProductId] = p.[ProductId]
        LEFT JOIN (
          SELECT
            oi.[ProductId],
            SUM(COALESCE(oi.[Quantity], 0)) AS SoldCount
          FROM [OrderItems] oi
          LEFT JOIN [Orders] o ON o.[OrderId] = oi.[OrderId]
          WHERE o.[OrderId] IS NULL
            OR LOWER(LTRIM(RTRIM(ISNULL(o.[Status], '')))) IN ('completed', 'delivered', 'confirmed', 'done')
          GROUP BY oi.[ProductId]
        ) sales ON sales.[ProductId] = p.[ProductId]
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY ${orderByClause}`,
    params
  )

  const rows = res.recordset || []
  const byProductId = new Map()

  for (const row of rows) {
    const key = String(row.ProductId)
    if (!byProductId.has(key)) {
      const imageUrl = normalizePublicImageUrl(row.ImageUrl)
      const images = []
      if (imageUrl) images.push(imageUrl)

      byProductId.set(key, {
        ProductId: row.ProductId,
        Name: row.Name,
        Price: row.Price,
        Description: row.Description,
        ImageUrl: imageUrl,
        Stock: row.Stock,
        Status: row.Status,
        CategoryId: row.CategoryId,
        CategoryName: row.CategoryName,
        AverageRating: Math.round(Number(row.AverageRating || 0) * 10) / 10,
        ReviewCount: Number(row.ReviewCount || 0),
        SoldCount: Number(row.SoldCount || 0),
        Images: images
      })
    }

    if (row.ExtraImageUrl) {
      const normalizedExtra = normalizePublicImageUrl(row.ExtraImageUrl)
      const product = byProductId.get(key)

      if (normalizedExtra && !product.Images.includes(normalizedExtra)) {
        product.Images.push(normalizedExtra)
      }
    }
  }

  return Array.from(byProductId.values()).map(product => ({
    ...product,
    ImageUrl: product.ImageUrl || product.Images[0] || null
  }))
}

async function getProductVariants(productId) {
  const normalizedProductId = String(productId || '').trim()
  if (!normalizedProductId) return []

  const hasProductVariants = await tableExists('ProductVariants')
  if (!hasProductVariants) return []

  const res = await query(
    `SELECT
       pv.[VariantId],
       pv.[ProductId],
       pv.[VariantName],
       COALESCE(vlots.[TotalQty], COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.[Stock]), 0), 0) AS Stock,
       COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.[Price]), 0) AS PriceVnd,
       COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.[Price]), 0) AS SellPriceVnd
     FROM [ProductVariants] pv
     INNER JOIN [Products] p ON p.[ProductId] = pv.[ProductId]
     OUTER APPLY (
       SELECT COALESCE(SUM(COALESCE(l.[RemainingQty], 0)), 0) AS TotalQty
       FROM [InventoryLots] l
       WHERE l.[InventoryItemId] = CONCAT('retail_variant_', pv.[VariantId])
     ) vlots
     WHERE pv.[ProductId] = @productId
     ORDER BY COALESCE(vlots.[TotalQty], COALESCE(TRY_CONVERT(DECIMAL(19,2), pv.[Stock]), 0), 0) DESC, pv.[VariantName] ASC`,
    { productId: normalizedProductId },
    { timeoutMs: 30000 }
  )

  return (res.recordset || []).map((row) => ({
    VariantId: row.VariantId,
    ProductId: row.ProductId,
    VariantName: row.VariantName || '',
    Stock: Number(row.Stock || 0),
    PriceVnd: row.PriceVnd === null || row.PriceVnd === undefined ? null : Number(row.PriceVnd),
    SellPriceVnd: row.SellPriceVnd === null || row.SellPriceVnd === undefined ? null : Number(row.SellPriceVnd),
  }))
}

async function getProductDetail(productId) {
  const normalizedProductId = String(productId || '').trim()
  if (!normalizedProductId) {
    const err = new Error('Invalid productId')
    err.status = 400
    throw err
  }

  const products = await getProducts()
  const product = products.find((item) => String(item?.ProductId || '').trim() === normalizedProductId)
  if (!product) return null

  const variants = await getProductVariants(normalizedProductId)

  return {
    ...product,
    Variants: variants,
    ProductVariants: variants,
  }
}

/**
 * Get review list by service
 */
async function getServiceReviews(serviceId, limit = 50) {
  const reviewImageColumn = await getSalonReviewImageColumn()
  const reviewImageSelectSql = reviewImageColumn ? `, sr.${reviewImageColumn} AS ReviewImagesRaw` : ', NULL AS ReviewImagesRaw'

  const res = await query(`
    ;WITH ItemEffective AS (
      SELECT
        COALESCE(pr.ReviewId, br.ReviewId) AS ReviewId,
        COALESCE(pr.UserId, br.UserId) AS UserId,
        bs.ServiceId,
        bs.BookingId,
        bs.BookingServiceId,
        COALESCE(pr.Rating, br.Rating) AS Rating,
        COALESCE(pr.Comment, br.Comment) AS Comment,
        COALESCE(pr.CreatedAt, br.CreatedAt) AS CreatedAt,
        COALESCE(pr.ReviewImagesRaw, br.ReviewImagesRaw) AS ReviewImagesRaw,
        CASE WHEN pr.ReviewId IS NOT NULL THEN 'service' ELSE 'booking' END AS ReviewType
      FROM [BookingServices] bs
      OUTER APPLY (
        SELECT TOP 1 sr.ReviewId, sr.UserId, sr.Rating, sr.Comment, sr.CreatedAt${reviewImageSelectSql}
        FROM [SalonReviews] sr
        WHERE sr.ServiceId = bs.ServiceId
          AND sr.BookingServiceId = bs.BookingServiceId
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) pr
      OUTER APPLY (
        SELECT TOP 1 sr.ReviewId, sr.UserId, sr.Rating, sr.Comment, sr.CreatedAt${reviewImageSelectSql}
        FROM [SalonReviews] sr
        WHERE sr.BookingId = bs.BookingId
          AND sr.BookingServiceId IS NULL
          AND sr.ProductId IS NULL
          AND sr.OrderId IS NULL
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) br
      WHERE bs.ServiceId = @serviceId
        AND COALESCE(pr.Rating, br.Rating) IS NOT NULL
    ),
    StandaloneServiceReview AS (
      SELECT
        sr.ReviewId,
        sr.UserId,
        sr.ServiceId,
        sr.BookingId,
        sr.BookingServiceId,
        sr.Rating,
        sr.Comment,
        sr.CreatedAt${reviewImageSelectSql},
        CAST('service' AS NVARCHAR(20)) AS ReviewType
      FROM [SalonReviews] sr
      WHERE sr.ServiceId = @serviceId
        AND sr.BookingId IS NULL
        AND sr.BookingServiceId IS NULL
        AND sr.Rating IS NOT NULL
    ),
    Combined AS (
      SELECT * FROM ItemEffective
      UNION ALL
      SELECT * FROM StandaloneServiceReview
    )
    SELECT TOP (@limit)
      c.ReviewId,
      c.UserId,
      c.ServiceId,
      NULL AS ProductId,
      c.BookingId,
      c.BookingServiceId,
      c.Rating,
      c.Comment,
      c.CreatedAt,
      c.ReviewImagesRaw,
      c.ReviewType,
      COALESCE(u.[Name], N'Unknown User') AS CustomerName,
      u.[AvatarUrl] AS Avatar
    FROM Combined c
    LEFT JOIN [Users] u ON c.[UserId] = u.[UserId]
    ORDER BY c.[CreatedAt] DESC, c.[ReviewId] DESC
  `, { serviceId, limit: Math.min(Number(limit) || 50, 100) }, { timeoutMs: 45000 })

  return (res.recordset || []).map((row) => ({
    ...row,
    Avatar: normalizeAvatarUrl(row.Avatar),
    ReviewImages: parseReviewImagesField(row.ReviewImagesRaw),
  }))
}

/**
 * Get rating summary by service
 */
async function getServiceRating(serviceId) {
  const res = await query(`
    ;WITH ItemEffective AS (
      SELECT COALESCE(pr.Rating, br.Rating) AS Rating
      FROM [BookingServices] bs
      OUTER APPLY (
        SELECT TOP 1 sr.Rating
        FROM [SalonReviews] sr
        WHERE sr.ServiceId = bs.ServiceId
          AND sr.BookingServiceId = bs.BookingServiceId
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) pr
      OUTER APPLY (
        SELECT TOP 1 sr.Rating
        FROM [SalonReviews] sr
        WHERE sr.BookingId = bs.BookingId
          AND sr.BookingServiceId IS NULL
          AND sr.ProductId IS NULL
          AND sr.OrderId IS NULL
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) br
      WHERE bs.ServiceId = @serviceId
    ),
    StandaloneServiceReview AS (
      SELECT sr.Rating
      FROM [SalonReviews] sr
      WHERE sr.ServiceId = @serviceId
        AND sr.BookingId IS NULL
        AND sr.BookingServiceId IS NULL
        AND sr.Rating IS NOT NULL
    ),
    Effective AS (
      SELECT Rating FROM ItemEffective WHERE Rating IS NOT NULL
      UNION ALL
      SELECT Rating FROM StandaloneServiceReview
    )
    SELECT
      COUNT(1) AS ReviewCount,
      AVG(CAST(Rating AS FLOAT)) AS AverageRating
    FROM Effective
  `, { serviceId }, { timeoutMs: 30000 })

  const row = res.recordset?.[0] || {}
  return {
    ServiceId: serviceId,
    ReviewCount: Number(row.ReviewCount || 0),
    AverageRating: Math.round(Number(row.AverageRating || 0) * 10) / 10,
  }
}

/**
 * Create review for service
 */
async function createServiceReview(serviceId, payload = {}) {
  const userId = String(payload.userId || '').trim()
  const normalizedServiceId = String(serviceId || '').trim()
  const reviewIdInput = String(payload.reviewId || '').trim()
  const rating = Number(payload.rating)
  const comment = String(payload.comment || '').trim()
  const imageDataUrls = payload.images || payload.imageDataUrls || payload.reviewImages
  const bookingIdRaw = String(payload.bookingId || '').trim()
  const bookingServiceIdRaw = String(payload.bookingServiceId || '').trim()

  if (!userId) {
    const err = new Error('Missing userId')
    err.status = 401
    throw err
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const err = new Error('Rating must be an integer from 1 to 5')
    err.status = 400
    throw err
  }

  if (!comment) {
    const err = new Error('Comment is required')
    err.status = 400
    throw err
  }

  if (!normalizedServiceId) {
    const err = new Error('Invalid serviceId')
    err.status = 400
    throw err
  }

  if (reviewIdInput) {
    const ownedRes = await query(
      `SELECT TOP 1 ReviewId, ServiceId, BookingId
       FROM SalonReviews
       WHERE ReviewId = @reviewId
         AND UserId = @userId`,
      { reviewId: reviewIdInput, userId },
    )
    const owned = ownedRes.recordset?.[0]
    if (!owned) {
      const err = new Error('Review not found or permission denied')
      err.status = 404
      throw err
    }

    const rowServiceId = String(owned.ServiceId || '').trim()
    let canEdit = rowServiceId === normalizedServiceId

    if (!canEdit && !rowServiceId && owned.BookingId) {
      const belongsRes = await query(
        `SELECT TOP 1 1 AS ok
         FROM BookingServices
         WHERE BookingId = @bookingId
           AND ServiceId = @serviceId`,
        { bookingId: owned.BookingId, serviceId: normalizedServiceId },
      )
      canEdit = Boolean(belongsRes.recordset?.[0])
    }

    if (!canEdit) {
      const err = new Error('Review does not belong to this service')
      err.status = 400
      throw err
    }

    await query(
      `UPDATE SalonReviews
       SET Rating = @rating,
           Comment = @comment,
           CreatedAt = SYSUTCDATETIME()
       WHERE ReviewId = @reviewId`,
      {
        reviewId: reviewIdInput,
        rating,
        comment,
      },
    )

    await setReviewImagesByReviewId(reviewIdInput, imageDataUrls)

    const [ratingSummary, reviews] = await Promise.all([
      getServiceRating(normalizedServiceId),
      getServiceReviews(normalizedServiceId, 20),
    ])

    return { ratingSummary, reviews }
  }

  let bookingId = bookingIdRaw || null
  let bookingServiceId = bookingServiceIdRaw || null

  // Only customers who have completed this service booking can rate it.
  const completedBookingRes = await query(`
    SELECT TOP 1 bs.BookingId, bs.BookingServiceId
    FROM [Bookings] b
    INNER JOIN [BookingServices] bs ON bs.BookingId = b.BookingId
    WHERE b.CustomerUserId = @userId
      AND bs.ServiceId = @serviceId
      AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'confirmed', 'done', 'complete')
      AND (@bookingId IS NULL OR bs.BookingId = @bookingId)
      AND (@bookingServiceId IS NULL OR bs.BookingServiceId = @bookingServiceId)
    ORDER BY ISNULL(b.BookingTime, b.CreatedAt) DESC, bs.BookingServiceId DESC
  `, {
    userId,
    serviceId: normalizedServiceId,
    bookingId,
    bookingServiceId,
  })

  const completedBooking = completedBookingRes.recordset?.[0]
  if (!completedBooking) {
    const err = new Error('You can only review a service after completing a booking for it')
    err.status = 403
    throw err
  }

  bookingId = String(completedBooking.BookingId || '').trim() || bookingId
  bookingServiceId = String(completedBooking.BookingServiceId || '').trim() || bookingServiceId

  if (bookingId || bookingServiceId) {
    const svcRes = await query(`
      SELECT TOP 1 bs.BookingId, bs.BookingServiceId
      FROM [Bookings] b
      INNER JOIN [BookingServices] bs ON bs.BookingId = b.BookingId
      WHERE b.CustomerUserId = @userId
        AND bs.ServiceId = @serviceId
        AND LOWER(LTRIM(RTRIM(ISNULL(b.Status, '')))) IN ('completed', 'confirmed', 'done', 'complete')
        AND (@bookingId IS NULL OR bs.BookingId = @bookingId)
        AND (@bookingServiceId IS NULL OR bs.BookingServiceId = @bookingServiceId)
      ORDER BY bs.BookingServiceId ASC
    `, {
      userId,
      serviceId,
      bookingId,
      bookingServiceId,
    })

    const row = svcRes.recordset?.[0]
    if (!row) {
      const err = new Error('Booking service not found for this user')
      err.status = 404
      throw err
    }

    bookingId = String(row.BookingId || '').trim() || null
    bookingServiceId = String(row.BookingServiceId || '').trim() || null
  }

  const existingRes = await query(`
    SELECT TOP 1 ReviewId
    FROM [SalonReviews]
    WHERE UserId = @userId
      AND ServiceId = @serviceId
      AND ((@bookingServiceId IS NULL AND BookingServiceId IS NULL) OR BookingServiceId = @bookingServiceId)
      AND ((@bookingId IS NULL AND BookingId IS NULL) OR BookingId = @bookingId)
    ORDER BY CreatedAt DESC, ReviewId DESC
  `, {
    userId,
    serviceId,
    bookingId,
    bookingServiceId,
  })

  const existingId = String(existingRes.recordset?.[0]?.ReviewId || '').trim()

  const reviewId = existingId || `SRV-${newId()}`

  if (existingId) {
    await query(`
      UPDATE [SalonReviews]
      SET [Rating] = @rating,
          [Comment] = @comment,
          [CreatedAt] = SYSUTCDATETIME()
      WHERE [ReviewId] = @reviewId
    `, {
      reviewId,
      rating,
      comment,
    })
  } else {
    await query(`
      INSERT INTO [SalonReviews] (
        [ReviewId],
        [UserId],
        [ServiceId],
        [ProductId],
        [Rating],
        [Comment],
        [CreatedAt],
        [BookingId],
        [BookingServiceId]
      )
      VALUES (
        @reviewId,
        @userId,
        @serviceId,
        NULL,
        @rating,
        @comment,
        SYSUTCDATETIME(),
        @bookingId,
        @bookingServiceId
      )
    `, {
      reviewId,
      userId,
      serviceId,
      rating,
      comment,
      bookingId,
      bookingServiceId,
    })
  }

  await setReviewImagesByReviewId(reviewId, imageDataUrls)

  const [ratingSummary, reviews] = await Promise.all([
    getServiceRating(serviceId),
    getServiceReviews(serviceId, 20),
  ])

  return {
    ratingSummary,
    reviews,
  }
}

async function deleteServiceReview(serviceId, reviewId, userIdInput) {
  const sid = String(serviceId || '').trim()
  const rid = String(reviewId || '').trim()
  const userId = String(userIdInput || '').trim()

  if (!sid || !rid) {
    const err = new Error('Missing serviceId or reviewId')
    err.status = 400
    throw err
  }
  if (!userId) {
    const err = new Error('Not authenticated')
    err.status = 401
    throw err
  }

  const ownedRes = await query(
    `SELECT TOP 1 ReviewId, ServiceId, BookingId
     FROM SalonReviews
     WHERE ReviewId = @reviewId
       AND UserId = @userId`,
    { reviewId: rid, userId },
  )

  const owned = ownedRes.recordset?.[0]
  if (!owned) {
    const err = new Error('Review not found or permission denied')
    err.status = 404
    throw err
  }

  const rowServiceId = String(owned.ServiceId || '').trim()
  let canDelete = rowServiceId === sid

  if (!canDelete && !rowServiceId && owned.BookingId) {
    const belongsRes = await query(
      `SELECT TOP 1 1 AS ok
       FROM BookingServices
       WHERE BookingId = @bookingId
         AND ServiceId = @serviceId`,
      { bookingId: owned.BookingId, serviceId: sid },
    )
    canDelete = Boolean(belongsRes.recordset?.[0])
  }

  if (!canDelete) {
    const err = new Error('Review not found or permission denied')
    err.status = 404
    throw err
  }

  await query(`DELETE FROM SalonReviews WHERE ReviewId = @reviewId`, { reviewId: rid })

  const [ratingSummary, reviews] = await Promise.all([
    getServiceRating(sid),
    getServiceReviews(sid, 20),
  ])

  return { ratingSummary, reviews }
}

/**
 * Get rating for product (using existing aggregated SalonReviews)
 */
async function getProductRating(productId) {
  const normalizedProductId = String(productId || '').trim()
  if (!normalizedProductId) {
    const err = new Error('Invalid productId')
    err.status = 400
    throw err
  }

  const res = await query(`
    ;WITH ItemEffective AS (
      SELECT
        COALESCE(pr.Rating, orr.Rating) AS Rating
      FROM [OrderItems] oi
      OUTER APPLY (
        SELECT TOP 1 sr.Rating
        FROM [SalonReviews] sr
        WHERE sr.ProductId = oi.ProductId
          AND sr.OrderItemId = oi.OrderItemId
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) pr
      OUTER APPLY (
        SELECT TOP 1 sr.Rating
        FROM [SalonReviews] sr
        WHERE sr.OrderId = oi.OrderId
          AND sr.OrderItemId IS NULL
          AND sr.ServiceId IS NULL
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) orr
      WHERE oi.ProductId = @productId
    ),
    StandaloneProductReview AS (
      SELECT sr.Rating
      FROM [SalonReviews] sr
      WHERE sr.ProductId = @productId
        AND sr.OrderItemId IS NULL
        AND sr.OrderId IS NULL
        AND sr.Rating IS NOT NULL
    ),
    Effective AS (
      SELECT Rating FROM ItemEffective WHERE Rating IS NOT NULL
      UNION ALL
      SELECT Rating FROM StandaloneProductReview
    )
    SELECT
      COUNT(1) AS ReviewCount,
      AVG(CAST(Rating AS FLOAT)) AS AverageRating
    FROM Effective
  `, { productId: normalizedProductId })

  const row = res.recordset?.[0] || {}
  return {
    ProductId: normalizedProductId,
    ReviewCount: Number(row.ReviewCount || 0),
    AverageRating: Math.round(Number(row.AverageRating || 0) * 10) / 10,
  }
}

/**
 * Get review list by product
 */
async function getProductReviews(productId, limit = 50) {
  const normalizedProductId = String(productId || '').trim()
  if (!normalizedProductId) {
    const err = new Error('Invalid productId')
    err.status = 400
    throw err
  }

  const reviewImageColumn = await getSalonReviewImageColumn()
  const reviewImageSelectSql = reviewImageColumn ? `, sr.${reviewImageColumn} AS ReviewImagesRaw` : ', NULL AS ReviewImagesRaw'

  const res = await query(`
    ;WITH ItemEffective AS (
      SELECT
        COALESCE(pr.ReviewId, orr.ReviewId) AS ReviewId,
        COALESCE(pr.UserId, orr.UserId) AS UserId,
        oi.ProductId,
        oi.OrderId,
        oi.OrderItemId,
        COALESCE(pr.Rating, orr.Rating) AS Rating,
        COALESCE(pr.Comment, orr.Comment) AS Comment,
        COALESCE(pr.CreatedAt, orr.CreatedAt) AS CreatedAt,
        COALESCE(pr.ReviewImagesRaw, orr.ReviewImagesRaw) AS ReviewImagesRaw,
        CASE WHEN pr.ReviewId IS NOT NULL THEN 'product' ELSE 'order' END AS ReviewType
      FROM [OrderItems] oi
      OUTER APPLY (
        SELECT TOP 1 sr.ReviewId, sr.UserId, sr.Rating, sr.Comment, sr.CreatedAt${reviewImageSelectSql}
        FROM [SalonReviews] sr
        WHERE sr.ProductId = oi.ProductId
          AND sr.OrderItemId = oi.OrderItemId
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) pr
      OUTER APPLY (
        SELECT TOP 1 sr.ReviewId, sr.UserId, sr.Rating, sr.Comment, sr.CreatedAt${reviewImageSelectSql}
        FROM [SalonReviews] sr
        WHERE sr.OrderId = oi.OrderId
          AND sr.OrderItemId IS NULL
          AND sr.ServiceId IS NULL
          AND sr.Rating IS NOT NULL
        ORDER BY sr.CreatedAt DESC, sr.ReviewId DESC
      ) orr
      WHERE oi.ProductId = @productId
        AND COALESCE(pr.Rating, orr.Rating) IS NOT NULL
    ),
    StandaloneProductReview AS (
      SELECT
        sr.ReviewId,
        sr.UserId,
        sr.ProductId,
        sr.OrderId,
        sr.OrderItemId,
        sr.Rating,
        sr.Comment,
        sr.CreatedAt${reviewImageSelectSql},
        CAST('product' AS NVARCHAR(20)) AS ReviewType
      FROM [SalonReviews] sr
      WHERE sr.ProductId = @productId
        AND sr.OrderItemId IS NULL
        AND sr.OrderId IS NULL
        AND sr.Rating IS NOT NULL
    ),
    Combined AS (
      SELECT * FROM ItemEffective
      UNION ALL
      SELECT * FROM StandaloneProductReview
    )
    SELECT TOP (@limit)
      c.ReviewId,
      c.UserId,
      NULL AS ServiceId,
      c.ProductId,
      c.OrderId,
      c.OrderItemId,
      c.Rating,
      c.Comment,
      c.CreatedAt,
      c.ReviewImagesRaw,
      c.ReviewType,
      COALESCE(u.[Name], N'Unknown User') AS CustomerName,
      u.[AvatarUrl] AS Avatar
    FROM Combined c
    LEFT JOIN [Users] u ON c.UserId = u.[UserId]
    ORDER BY c.CreatedAt DESC, c.ReviewId DESC
  `, { productId: normalizedProductId, limit: Math.min(Number(limit) || 50, 100) })

  return (res.recordset || []).map((row) => ({
    ...row,
    Avatar: normalizeAvatarUrl(row.Avatar),
    ReviewImages: parseReviewImagesField(row.ReviewImagesRaw),
  }))
}

/**
 * Get review list for one user
 */
async function getUserReviews(userId, limit = 200) {
  const uid = String(userId || '').trim()
  if (!uid) {
    const err = new Error('Invalid userId')
    err.status = 400
    throw err
  }

  const res = await query(`
    SELECT TOP (@limit)
      sr.[ReviewId],
      sr.[UserId],
      sr.[ServiceId],
      sr.[ProductId],
      sr.[Rating],
      sr.[Comment],
      sr.[CreatedAt],
      COALESCE(u.[Name], N'Unknown User') AS CustomerName,
      u.[AvatarUrl] AS Avatar
    FROM [SalonReviews] sr
    LEFT JOIN [Users] u ON sr.[UserId] = u.[UserId]
    WHERE sr.[UserId] = @userId
    ORDER BY sr.[CreatedAt] DESC, sr.[ReviewId] DESC
  `, { userId: uid, limit: Math.min(Number(limit) || 200, 200) })

  return (res.recordset || []).map((row) => ({
    ...row,
    Avatar: normalizeAvatarUrl(row.Avatar),
  }))
}

/**
 * Create review for product
 */
async function createProductReview(productId, payload = {}) {
  const userId = String(payload.userId || '').trim()
  const normalizedProductId = String(productId || '').trim()
  const reviewIdInput = String(payload.reviewId || '').trim()
  if (!normalizedProductId) {
    const err = new Error('Invalid productId')
    err.status = 400
    throw err
  }

  const rating = Number(payload.rating)
  const comment = String(payload.comment || '').trim()
  const imageDataUrls = payload.images || payload.imageDataUrls || payload.reviewImages
  const orderIdRaw = String(payload.orderId || '').trim()
  const orderItemIdRaw = String(payload.orderItemId || '').trim()

  if (!userId) {
    const err = new Error('Missing userId')
    err.status = 401
    throw err
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const err = new Error('Rating must be an integer from 1 to 5')
    err.status = 400
    throw err
  }

  if (!comment) {
    const err = new Error('Comment is required')
    err.status = 400
    throw err
  }

  if (reviewIdInput) {
    const ownedRes = await query(
      `SELECT TOP 1 ReviewId, ProductId, OrderId
       FROM SalonReviews
       WHERE ReviewId = @reviewId
         AND UserId = @userId`,
      { reviewId: reviewIdInput, userId },
    )
    const owned = ownedRes.recordset?.[0]
    if (!owned) {
      const err = new Error('Review not found or permission denied')
      err.status = 404
      throw err
    }

    const rowProductId = String(owned.ProductId || '').trim()
    let canEdit = rowProductId === normalizedProductId

    if (!canEdit && !rowProductId && owned.OrderId) {
      const belongsRes = await query(
        `SELECT TOP 1 1 AS ok
         FROM OrderItems
         WHERE OrderId = @orderId
           AND ProductId = @productId`,
        { orderId: owned.OrderId, productId: normalizedProductId },
      )
      canEdit = Boolean(belongsRes.recordset?.[0])
    }

    if (!canEdit) {
      const err = new Error('Review does not belong to this product')
      err.status = 400
      throw err
    }

    await query(
      `UPDATE SalonReviews
       SET Rating = @rating,
           Comment = @comment,
           CreatedAt = SYSUTCDATETIME()
       WHERE ReviewId = @reviewId`,
      {
        reviewId: reviewIdInput,
        rating,
        comment,
      },
    )

    await setReviewImagesByReviewId(reviewIdInput, imageDataUrls)

    const [ratingSummary, reviews] = await Promise.all([
      getProductRating(normalizedProductId),
      getProductReviews(normalizedProductId, 20),
    ])

    return { ratingSummary, reviews }
  }

  let orderId = orderIdRaw || null
  let orderItemId = orderItemIdRaw || null

  // Only customers who completed/delivered an order containing this product can rate it.
  const completedOrderRes = await query(`
    SELECT TOP 1 oi.OrderId, oi.OrderItemId
    FROM [Orders] o
    INNER JOIN [OrderItems] oi ON oi.OrderId = o.OrderId
    WHERE o.UserId = @userId
      AND oi.ProductId = @productId
      AND LOWER(LTRIM(RTRIM(ISNULL(o.Status, '')))) IN ('completed', 'delivered', 'done', 'complete')
      AND (@orderId IS NULL OR oi.OrderId = @orderId)
      AND (@orderItemId IS NULL OR oi.OrderItemId = @orderItemId)
    ORDER BY oi.OrderItemId DESC
  `, {
    userId,
    productId: normalizedProductId,
    orderId,
    orderItemId,
  })

  const completedOrder = completedOrderRes.recordset?.[0]
  if (!completedOrder) {
    const err = new Error('You can only review a product after completing an order for it')
    err.status = 403
    throw err
  }

  orderId = String(completedOrder.OrderId || '').trim() || orderId
  orderItemId = String(completedOrder.OrderItemId || '').trim() || orderItemId

  if (orderId || orderItemId) {
    const itemRes = await query(`
      SELECT TOP 1 oi.OrderId, oi.OrderItemId
      FROM [Orders] o
      INNER JOIN [OrderItems] oi ON oi.OrderId = o.OrderId
      WHERE o.UserId = @userId
        AND oi.ProductId = @productId
        AND LOWER(LTRIM(RTRIM(ISNULL(o.Status, '')))) IN ('completed', 'delivered', 'done', 'complete')
        AND (@orderId IS NULL OR oi.OrderId = @orderId)
        AND (@orderItemId IS NULL OR oi.OrderItemId = @orderItemId)
      ORDER BY oi.OrderItemId ASC
    `, {
      userId,
      productId: normalizedProductId,
      orderId,
      orderItemId,
    })

    const row = itemRes.recordset?.[0]
    if (!row) {
      const err = new Error('Order product not found for this user')
      err.status = 404
      throw err
    }

    orderId = String(row.OrderId || '').trim() || null
    orderItemId = String(row.OrderItemId || '').trim() || null
  }

  const existingRes = await query(`
    SELECT TOP 1 ReviewId
    FROM [SalonReviews]
    WHERE UserId = @userId
      AND ProductId = @productId
      AND ((@orderItemId IS NULL AND OrderItemId IS NULL) OR OrderItemId = @orderItemId)
      AND ((@orderId IS NULL AND OrderId IS NULL) OR OrderId = @orderId)
    ORDER BY CreatedAt DESC, ReviewId DESC
  `, {
    userId,
    productId: normalizedProductId,
    orderId,
    orderItemId,
  })

  const existingId = String(existingRes.recordset?.[0]?.ReviewId || '').trim()
  const reviewId = existingId || `PRD-${newId()}`
  if (existingId) {
    await query(`
      UPDATE [SalonReviews]
      SET [Rating] = @rating,
          [Comment] = @comment,
          [CreatedAt] = SYSUTCDATETIME()
      WHERE [ReviewId] = @reviewId
    `, {
      reviewId,
      rating,
      comment,
    })
  } else {
    await query(`
      INSERT INTO [SalonReviews] (
        [ReviewId],
        [UserId],
        [ServiceId],
        [ProductId],
        [Rating],
        [Comment],
        [CreatedAt],
        [OrderId],
        [OrderItemId]
      )
      VALUES (
        @reviewId,
        @userId,
        NULL,
        @productId,
        @rating,
        @comment,
        SYSUTCDATETIME(),
        @orderId,
        @orderItemId
      )
    `, {
      reviewId,
      userId,
      productId: normalizedProductId,
      rating,
      comment,
      orderId,
      orderItemId,
    })
  }

  await setReviewImagesByReviewId(reviewId, imageDataUrls)

  const [ratingSummary, reviews] = await Promise.all([
    getProductRating(normalizedProductId),
    getProductReviews(normalizedProductId, 20),
  ])

  return {
    ratingSummary,
    reviews,
  }
}

async function deleteProductReview(productId, reviewId, userIdInput) {
  const pid = String(productId || '').trim()
  const rid = String(reviewId || '').trim()
  const userId = String(userIdInput || '').trim()

  if (!pid || !rid) {
    const err = new Error('Missing productId or reviewId')
    err.status = 400
    throw err
  }
  if (!userId) {
    const err = new Error('Not authenticated')
    err.status = 401
    throw err
  }

  const ownedRes = await query(
    `SELECT TOP 1 ReviewId, ProductId, OrderId
     FROM SalonReviews
     WHERE ReviewId = @reviewId
       AND UserId = @userId`,
    { reviewId: rid, userId },
  )

  const owned = ownedRes.recordset?.[0]
  if (!owned) {
    const err = new Error('Review not found or permission denied')
    err.status = 404
    throw err
  }

  const rowProductId = String(owned.ProductId || '').trim()
  let canDelete = rowProductId === pid

  if (!canDelete && !rowProductId && owned.OrderId) {
    const belongsRes = await query(
      `SELECT TOP 1 1 AS ok
       FROM OrderItems
       WHERE OrderId = @orderId
         AND ProductId = @productId`,
      { orderId: owned.OrderId, productId: pid },
    )
    canDelete = Boolean(belongsRes.recordset?.[0])
  }

  if (!canDelete) {
    const err = new Error('Review not found or permission denied')
    err.status = 404
    throw err
  }

  await query(`DELETE FROM SalonReviews WHERE ReviewId = @reviewId`, { reviewId: rid })

  const [ratingSummary, reviews] = await Promise.all([
    getProductRating(pid),
    getProductReviews(pid, 20),
  ])

  return { ratingSummary, reviews }
}

/**
 * Get product categories list
 */
async function getProductCategories() {
  const res = await query(`
    SELECT 
      [CategoryId],
      [Name],
      [Description]
    FROM [ProductCategories]
    ORDER BY [Name]
  `)
  return res.recordset || []
}

/**
 * Get reviews list (top reviews)
 */
async function getTopReviews(limit = 10) {
  const res = await query(`
    SELECT TOP (@limit)
      sr.[ReviewId],
      sr.[UserId],
      COALESCE(u.[Name], N'Unknown User') AS CustomerName,
      u.[AvatarUrl] AS Avatar,
      sr.[Rating],
      sr.[Comment],
      s.[Name] AS ServiceName,
      sr.[CreatedAt]
    FROM [SalonReviews] sr
    LEFT JOIN [Users] u ON sr.[UserId] = u.[UserId]
    LEFT JOIN [Services] s ON sr.[ServiceId] = s.[ServiceId]
    ORDER BY sr.[Rating] DESC, sr.[CreatedAt] DESC
  `, { limit })
  return (res.recordset || []).map((row) => ({
    ...row,
    Avatar: normalizeAvatarUrl(row.Avatar),
  }))
}

/**
 * Get salon statistics (total orders, bookings, average rating, happy customers)
 */
async function getSalonStats() {
  const [
    ordersRes,
    bookingsRes,
    ratingRes,
    customersRes
  ] = await Promise.all([
    query(`
      SELECT COUNT(1) AS TotalOrders
      FROM [Orders]
      WHERE [Status] IN ('Completed', 'Delivered')
    `).catch(() => ({ recordset: [{ TotalOrders: 0 }] })),
    
    query(`
      SELECT COUNT(1) AS TotalBookings
      FROM [Bookings]
      WHERE [Status] IN ('Completed', 'Confirmed')
    `).catch(() => ({ recordset: [{ TotalBookings: 0 }] })),
    
    query(`
      SELECT AVG(CAST([Rating] AS FLOAT)) AS AverageRating
      FROM [SalonReviews]
      WHERE [Rating] IS NOT NULL
    `).catch(() => ({ recordset: [{ AverageRating: 0 }] })),
    
    query(`
      SELECT COUNT(DISTINCT [UserId]) AS HappyCustomers
      FROM [SalonReviews]
      WHERE [Rating] >= 4
    `).catch(() => ({ recordset: [{ HappyCustomers: 0 }] }))
  ])

  return {
    TotalOrders: Number(ordersRes.recordset?.[0]?.TotalOrders || 0),
    TotalBookings: Number(bookingsRes.recordset?.[0]?.TotalBookings || 0),
    AverageRating: Math.round((Number(ratingRes.recordset?.[0]?.AverageRating || 0)) * 10) / 10,
    HappyCustomers: Number(customersRes.recordset?.[0]?.HappyCustomers || 0)
  }
}

/**
 * Get all homepage data
 */
async function getHomepageData() {
  const [
    services,
    serviceCategories,
    products,
    productCategories,
    reviews,
    stats
  ] = await Promise.all([
    getServices(),
    getServiceCategories(),
    getProducts(),
    getProductCategories(),
    getTopReviews(11),
    getSalonStats()
  ])

  return {
    services,
    serviceCategories,
    products,
    productCategories,
    reviews,
    stats,
    features: [
      {
        id: 1,
        title: 'Quality Guaranteed',
        description: 'Carefully selected from leading beauty brands',
        iconKey: 'shield'
      },
      {
        id: 2,
        title: 'Professional Consultation',
        description: 'Expert team with product knowledge, 24/7 customer support',
        iconKey: 'headset'
      },
      {
        id: 3,
        title: 'Diverse Payment',
        description: 'Absolute security, COD support, online payment',
        iconKey: 'card'
      },
      {
        id: 4,
        title: 'Flexible Returns',
        description: 'Easy return support within 7 days',
        iconKey: 'sync'
      }
    ]
  }
}

module.exports = {
  getServices,
  getServiceCategories,
  getProducts,
  getProductDetail,
  getProductCategories,
  getServiceReviews,
  getServiceRating,
  createServiceReview,
  deleteServiceReview,
  getProductRating,
  getProductReviews,
  createProductReview,
  deleteProductReview,
  getTopReviews,
  getUserReviews,
  getSalonContactInfo,
  getSalonStats,
  getHomepageData
}
