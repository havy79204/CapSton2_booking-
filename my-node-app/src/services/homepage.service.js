const { query, newId } = require('../config/query')

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

/**
 * Get services list with categories
 */
async function getServices() {
  const hasServiceImages = await tableExists('ServiceImages')
  const res = await query(hasServiceImages
    ? `SELECT 
        s.[ServiceId],
        s.[Name],
        s.[Description],
        s.[Price],
        s.[DurationMinutes],
        s.[Status],
        s.[CategoryId],
        sc.[Name] AS CategoryName,
        s.[ImageUrl] AS PrimaryImageUrl,
        si.[ImageId] AS ExtraImageId,
        si.[ImageUrl] AS ExtraImageUrl
      FROM [Services] s
      LEFT JOIN [ServiceCategories] sc ON s.[CategoryId] = sc.[CategoryId]
      LEFT JOIN [ServiceImages] si ON s.ServiceId = si.ServiceId
      WHERE s.[Status] IS NULL OR LOWER(LTRIM(RTRIM(s.[Status]))) = 'active'
      ORDER BY s.[CategoryId], s.[Name], si.[ImageId]`
    : `SELECT 
        s.[ServiceId],
        s.[Name],
        s.[Description],
        s.[Price],
        s.[DurationMinutes],
        s.[Status],
        s.[CategoryId],
        sc.[Name] AS CategoryName,
        s.[ImageUrl] AS PrimaryImageUrl,
        NULL AS ExtraImageId,
        NULL AS ExtraImageUrl
      FROM [Services] s
      LEFT JOIN [ServiceCategories] sc ON s.[CategoryId] = sc.[CategoryId]
      WHERE s.[Status] IS NULL OR LOWER(LTRIM(RTRIM(s.[Status]))) = 'active'
      ORDER BY s.[CategoryId], s.[Name]`
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

    if (row.ExtraImageUrl) {
      const normalizedExtra = normalizePublicImageUrl(row.ExtraImageUrl)
      const service = byServiceId.get(key)

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
async function getProducts() {
  const hasProductImages = await tableExists('ProductImages')
  const res = await query(hasProductImages
    ? `SELECT
        p.[ProductId],
        p.[Name],
        p.[Price],
        p.[Description],
        p.[ImageUrl],
        p.[Stock],
        p.[Status],
        p.[CategoryId],
        pc.[Name] AS CategoryName,
        pi.[ImageId] AS ExtraImageId,
        pi.[ImageUrl] AS ExtraImageUrl,
        pi.[SortOrder] AS ExtraSortOrder,
        ISNULL(oq.[SoldCount], 0) AS SoldCount
      FROM [Products] p
      LEFT JOIN [ProductCategories] pc ON p.[CategoryId] = pc.[CategoryId]
      LEFT JOIN [ProductImages] pi ON p.[ProductId] = pi.[ProductId]
      LEFT JOIN (
        SELECT [ProductId], SUM([Quantity]) AS SoldCount
        FROM [OrderItems]
        GROUP BY [ProductId]
      ) oq ON p.[ProductId] = oq.[ProductId]
      ORDER BY p.[CategoryId], p.[Name], ISNULL(pi.[SortOrder], 2147483647), pi.[ImageId]`
    : `SELECT
        p.[ProductId],
        p.[Name],
        p.[Price],
        p.[Description],
        p.[ImageUrl],
        p.[Stock],
        p.[Status],
        p.[CategoryId],
        pc.[Name] AS CategoryName,
        NULL AS ExtraImageId,
        NULL AS ExtraImageUrl,
        NULL AS ExtraSortOrder,
        ISNULL(oq.[SoldCount], 0) AS SoldCount
      FROM [Products] p
      LEFT JOIN [ProductCategories] pc ON p.[CategoryId] = pc.[CategoryId]
      LEFT JOIN (
        SELECT [ProductId], SUM([Quantity]) AS SoldCount
        FROM [OrderItems]
        GROUP BY [ProductId]
      ) oq ON p.[ProductId] = oq.[ProductId]
      ORDER BY p.[CategoryId], p.[Name]`
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
        SoldCount: row.SoldCount,
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

/**
 * Get review list by service
 */
async function getServiceReviews(serviceId, limit = 50) {
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
    WHERE sr.[ServiceId] = @serviceId
    ORDER BY sr.[CreatedAt] DESC, sr.[ReviewId] DESC
  `, { serviceId, limit: Math.min(Number(limit) || 50, 100) })

  return (res.recordset || []).map((row) => ({
    ...row,
    Avatar: normalizeAvatarUrl(row.Avatar),
  }))
}

/**
 * Get rating summary by service
 */
async function getServiceRating(serviceId) {
  const res = await query(`
    SELECT
      COUNT(1) AS ReviewCount,
      AVG(CAST(sr.[Rating] AS FLOAT)) AS AverageRating
    FROM [SalonReviews] sr
    WHERE sr.[ServiceId] = @serviceId
      AND sr.[Rating] IS NOT NULL
  `, { serviceId })

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
  const rating = Number(payload.rating)
  const comment = String(payload.comment || '').trim()

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

  const review = {
    reviewId: `SRV-${newId()}`,
    userId,
    serviceId,
    productId: null,
    rating,
    comment,
  }

  await query(`
    INSERT INTO [SalonReviews] (
      [ReviewId],
      [UserId],
      [ServiceId],
      [ProductId],
      [Rating],
      [Comment],
      [CreatedAt]
    )
    VALUES (
      @reviewId,
      @userId,
      @serviceId,
      @productId,
      @rating,
      @comment,
      SYSUTCDATETIME()
    )
  `, review)

  const [ratingSummary, reviews] = await Promise.all([
    getServiceRating(serviceId),
    getServiceReviews(serviceId, 20),
  ])

  return {
    ratingSummary,
    reviews,
  }
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
    SELECT
      COUNT(1) AS ReviewCount,
      AVG(CAST([Rating] AS FLOAT)) AS AverageRating
    FROM [SalonReviews]
    WHERE [ProductId] = @productId
      AND [Rating] IS NOT NULL
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
    WHERE sr.[ProductId] = @productId
    ORDER BY sr.[CreatedAt] DESC, sr.[ReviewId] DESC
  `, { productId: normalizedProductId, limit: Math.min(Number(limit) || 50, 100) })

  return (res.recordset || []).map((row) => ({
    ...row,
    Avatar: normalizeAvatarUrl(row.Avatar),
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
  if (!normalizedProductId) {
    const err = new Error('Invalid productId')
    err.status = 400
    throw err
  }

  const rating = Number(payload.rating)
  const comment = String(payload.comment || '').trim()

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

  const review = {
    reviewId: `PRD-${newId()}`,
    userId,
    serviceId: null,
    productId: normalizedProductId,
    rating,
    comment,
  }

  await query(`
    INSERT INTO [SalonReviews] (
      [ReviewId],
      [UserId],
      [ServiceId],
      [ProductId],
      [Rating],
      [Comment],
      [CreatedAt]
    )
    VALUES (
      @reviewId,
      @userId,
      @serviceId,
      @productId,
      @rating,
      @comment,
      SYSUTCDATETIME()
    )
  `, review)

  const [ratingSummary, reviews] = await Promise.all([
    getProductRating(normalizedProductId),
    getProductReviews(normalizedProductId, 20),
  ])

  return {
    ratingSummary,
    reviews,
  }
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
  getProductCategories,
  getServiceReviews,
  getServiceRating,
  createServiceReview,
  getProductRating,
  getProductReviews,
  createProductReview,
  getTopReviews,
  getUserReviews,
  getSalonStats,
  getHomepageData
}
