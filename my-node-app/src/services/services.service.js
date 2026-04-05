const { query, newId } = require('../config/query')
const { toServiceListItem } = require('../models/service.model')
const fs = require('fs/promises')
const path = require('path')
const { notifyAllCustomersEvent } = require('./notifications.service')

const serviceSchemaState = {
  checked: false,
  servicesHasCategoryId: false,
  servicesHasImageUrl: false,
  serviceImagesTableExists: false,
  bookingServicesTableExists: false,
  bookingsTableExists: false,
  bookingsHasStatus: false,
  salonReviewsTableExists: false,
}

function getServiceUploadDir() {
  return path.join(__dirname, '..', '..', 'uploads', 'services')
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
    .filter((x) => x)
    .slice(0, 20)
}

const ACTIVE_SERVICE_WHERE = `(s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) = 'active')`
const NOT_DELETED_SERVICE_WHERE = `(s.Status IS NULL OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), s.Status)))) NOT IN ('deleted', 'delete'))`
const _tableExistsCache = new Map()
const _columnExistsCache = new Map()

function isForeignKeyConstraintError(err) {
  if (!err) return false
  const candidates = [err, err?.originalError, ...(Array.isArray(err?.precedingErrors) ? err.precedingErrors : [])]
  for (const item of candidates) {
    const msg = String(item?.message || '').toLowerCase()
    if (item?.number === 547 || msg.includes('reference constraint') || msg.includes('foreign key')) {
      return true
    }
  }
  return false
}

async function columnExists(tableName, columnName) {
  const cacheKey = `column:${tableName}:${columnName}`
  if (_columnExistsCache.has(cacheKey)) {
    return _columnExistsCache.get(cacheKey)
  }

  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @t AND COLUMN_NAME = @c`,
      { t: tableName, c: columnName }
    )
    const exists = Boolean(res.recordset?.length)
    _columnExistsCache.set(cacheKey, exists)
    return exists
  } catch {
    const exists = false
    _columnExistsCache.set(cacheKey, exists)
    return exists
  }
}

async function tableExists(tableName) {
  const cacheKey = `table:${tableName}`
  if (_tableExistsCache.has(cacheKey)) {
    return _tableExistsCache.get(cacheKey)
  }

  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = @t`,
      { t: tableName }
    )
    const exists = Boolean(res.recordset?.length)
    _tableExistsCache.set(cacheKey, exists)
    return exists
  } catch {
    const exists = false
    _tableExistsCache.set(cacheKey, exists)
    return exists
  }
}

async function ensureServiceCategorySchema() {
  if (serviceSchemaState.checked) return serviceSchemaState

  let hasCategory = await columnExists('Services', 'CategoryId')
  if (!hasCategory) {
    try {
      await query('ALTER TABLE [Services] ADD [CategoryId] NVARCHAR(50) NULL')
      hasCategory = true
    } catch {
      hasCategory = false
    }
  }

  serviceSchemaState.checked = true
  serviceSchemaState.servicesHasCategoryId = hasCategory
  serviceSchemaState.servicesHasImageUrl = await columnExists('Services', 'ImageUrl')
  serviceSchemaState.serviceImagesTableExists = await tableExists('ServiceImages')
  serviceSchemaState.bookingServicesTableExists = await tableExists('BookingServices')
  serviceSchemaState.bookingsTableExists = await tableExists('Bookings')
  serviceSchemaState.bookingsHasStatus = serviceSchemaState.bookingsTableExists
    ? await columnExists('Bookings', 'BookingStatus')
    : false
  serviceSchemaState.salonReviewsTableExists = await tableExists('SalonReviews')
  return serviceSchemaState
}

async function resolveServiceCategoryIdFromPayload(payload) {
  const rawId = payload?.categoryId ?? payload?.CategoryId
  if (rawId !== undefined && rawId !== null && String(rawId).trim()) {
    const categoryId = String(rawId).trim()
    const exists = await query('SELECT TOP 1 CategoryId FROM ServiceCategories WHERE CategoryId = @categoryId', {
      categoryId,
    })
    if (!exists.recordset?.length) {
      const err = new Error('Service category does not exist')
      err.status = 400
      throw err
    }
    return categoryId
  }

  const rawName = payload?.category ?? payload?.categoryName
  if (rawName !== undefined && rawName !== null && String(rawName).trim()) {
    const name = String(rawName).trim()
    const found = await query('SELECT TOP 1 CategoryId FROM ServiceCategories WHERE Name = @name', { name })
    if (!found.recordset?.length) {
      const err = new Error('Service category does not exist')
      err.status = 400
      throw err
    }
    return found.recordset[0].CategoryId
  }

  return null
}

async function getServiceImagesMap() {
  const schema = await ensureServiceCategorySchema()
  if (!schema.serviceImagesTableExists) return new Map()

  let res
  try {
    res = await query('SELECT ServiceId, ImageUrl FROM ServiceImages ORDER BY ImageId')
  } catch {
    return new Map()
  }

  const map = new Map()
  for (const r of res.recordset || []) {
    const sid = r.ServiceId
    const url = String(r.ImageUrl || '').trim()
    if (!sid || !url) continue
    if (!map.has(sid)) map.set(sid, [])
    map.get(sid).push(url)
  }
  return map
}

async function replaceServiceImages(serviceId, imageUrls) {
  const schema = await ensureServiceCategorySchema()
  const urls = normalizeImageUrls(imageUrls)
  const primaryImageUrl = urls[0] || null

  if (!schema.serviceImagesTableExists) {
    if (schema.servicesHasImageUrl) {
      await query('UPDATE Services SET ImageUrl = @imageUrl WHERE ServiceId = @serviceId', {
        serviceId,
        imageUrl: primaryImageUrl,
      })
    }
    return
  }

  await query('DELETE FROM ServiceImages WHERE ServiceId = @serviceId', { serviceId })

  for (const url of urls) {
    if (url.length > 500) {
      const err = new Error('ImageUrl too long')
      err.status = 413
      throw err
    }
    await query(
      `INSERT INTO ServiceImages (ImageId, ServiceId, ImageUrl)
       VALUES (@id, @serviceId, @url)`,
      { id: newId(), serviceId, url }
    )
  }

  if (schema.servicesHasImageUrl) {
    await query('UPDATE Services SET ImageUrl = @imageUrl WHERE ServiceId = @serviceId', {
      serviceId,
      imageUrl: primaryImageUrl,
    })
  }
}

async function listServicesGrouped(includeInactive = false) {
  const schema = await ensureServiceCategorySchema()
  const whereClause = includeInactive
    ? NOT_DELETED_SERVICE_WHERE
    : `${NOT_DELETED_SERVICE_WHERE} AND ${ACTIVE_SERVICE_WHERE}`
  const totalBookingsSql = schema.bookingServicesTableExists
    ? `(
          SELECT COUNT(1)
          FROM BookingServices bs
          ${schema.bookingsTableExists ? 'LEFT JOIN Bookings b ON b.BookingId = bs.BookingId' : ''}
          WHERE bs.ServiceId = s.ServiceId
          ${schema.bookingsTableExists && schema.bookingsHasStatus
            ? `AND (
              b.BookingStatus IS NULL
              OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), b.BookingStatus)))) NOT IN ('cancelled', 'cancelled')
            )`
            : ''}
        ) AS TotalBookings,`
    : 'CAST(0 AS INT) AS TotalBookings,'
  const averageRatingSql = schema.salonReviewsTableExists
    ? `(
          SELECT AVG(CAST(sr.Rating AS FLOAT))
          FROM SalonReviews sr
          WHERE sr.ServiceId = s.ServiceId
        ) AS AverageRating,`
    : 'CAST(NULL AS FLOAT) AS AverageRating,'

  const result = await query(
    `SELECT
        s.ServiceId,
        s.Name,
        s.Price,
        s.DurationMinutes,
        s.Description,
        s.Status,
        ${totalBookingsSql}
        ${averageRatingSql}
        ${schema.servicesHasImageUrl ? 's.ImageUrl,' : 'CAST(NULL AS NVARCHAR(500)) AS ImageUrl,'}
        ${schema.servicesHasCategoryId ? 's.CategoryId,' : 'CAST(NULL AS NVARCHAR(50)) AS CategoryId,'}
        ${schema.servicesHasCategoryId ? 'sc.Name' : 'CAST(NULL AS NVARCHAR(200))'} AS CategoryName
      FROM Services s
      ${schema.servicesHasCategoryId ? 'LEFT JOIN ServiceCategories sc ON sc.CategoryId = s.CategoryId' : ''}
      WHERE ${whereClause}
        ORDER BY ${schema.servicesHasCategoryId ? "COALESCE(sc.Name, N'Uncategorized')," : ''} s.Name`
  )

  const imagesMap = await getServiceImagesMap()
  const items = (result.recordset || []).map((row) => {
    const item = toServiceListItem(row)
    const firstImage = String(row.ImageUrl || '').trim()
    const fallbackImages = firstImage ? [firstImage] : []
    return { ...item, images: imagesMap.get(row.ServiceId) || fallbackImages }
  })

  const grouped = new Map()
  for (const item of items) {
    const group = String(item.category || '').trim() || 'Uncategorized'
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group).push(item)
  }

  return [...grouped.entries()].map(([group, groupItems]) => ({
    group,
    items: groupItems,
  }))
}

async function createService(payload) {
  const { name, durationMinutes, priceVnd, description, status, images } = payload || {}
  const schema = await ensureServiceCategorySchema()
  const categoryId = await resolveServiceCategoryIdFromPayload(payload)

  const id = newId()
  const price = Number(priceVnd)
  const duration = durationMinutes === undefined || durationMinutes === null ? null : Number(durationMinutes)

  const insertSql = schema.servicesHasCategoryId
    ? `INSERT INTO Services (ServiceId, Name, Price, DurationMinutes, Description, Status, CategoryId)
       VALUES (@id, @name, @price, @duration, @description, @status, @categoryId)`
    : `INSERT INTO Services (ServiceId, Name, Price, DurationMinutes, Description, Status)
       VALUES (@id, @name, @price, @duration, @description, @status)`

  await query(insertSql, {
    id,
    name,
    price: Number.isFinite(price) ? price : 0,
    duration: Number.isFinite(duration) ? duration : null,
    description: description || null,
    status: status || 'active',
    categoryId,
  })

  await replaceServiceImages(id, images)

  if (String(status || 'active').trim().toLowerCase() === 'active') {
    try {
      await notifyAllCustomersEvent({
        event: 'service_new',
        payload: {
          serviceId: id,
          serviceName: String(name || '').trim() || 'New service',
          body: `${String(name || 'A new service').trim()} is now available.`,
        },
      })
    } catch (err) {
      console.warn('[services] service_new notification failed:', err?.message || err)
    }
  }

  return { id }
}

async function getServiceById(serviceId, includeInactive = false) {
  const schema = await ensureServiceCategorySchema()
  const whereClause = includeInactive
    ? NOT_DELETED_SERVICE_WHERE
    : `${NOT_DELETED_SERVICE_WHERE} AND ${ACTIVE_SERVICE_WHERE}`
  const totalBookingsSql = schema.bookingServicesTableExists
    ? `(
          SELECT COUNT(1)
          FROM BookingServices bs
          ${schema.bookingsTableExists ? 'LEFT JOIN Bookings b ON b.BookingId = bs.BookingId' : ''}
          WHERE bs.ServiceId = s.ServiceId
          ${schema.bookingsTableExists && schema.bookingsHasStatus
            ? `AND (
              b.BookingStatus IS NULL
              OR LOWER(LTRIM(RTRIM(CONVERT(NVARCHAR(50), b.BookingStatus)))) NOT IN ('cancelled', 'cancelled')
            )`
            : ''}
        ) AS TotalBookings,`
    : 'CAST(0 AS INT) AS TotalBookings,'
  const averageRatingSql = schema.salonReviewsTableExists
    ? `(
          SELECT AVG(CAST(sr.Rating AS FLOAT))
          FROM SalonReviews sr
          WHERE sr.ServiceId = s.ServiceId
        ) AS AverageRating,`
    : 'CAST(NULL AS FLOAT) AS AverageRating,'

  const result = await query(
    `SELECT TOP 1
        s.ServiceId,
        s.Name,
        s.Price,
        s.DurationMinutes,
        s.Description,
        s.Status,
        ${totalBookingsSql}
        ${averageRatingSql}
        ${schema.servicesHasImageUrl ? 's.ImageUrl,' : 'CAST(NULL AS NVARCHAR(500)) AS ImageUrl,'}
        ${schema.servicesHasCategoryId ? 's.CategoryId,' : 'CAST(NULL AS NVARCHAR(50)) AS CategoryId,'}
        ${schema.servicesHasCategoryId ? 'sc.Name' : 'CAST(NULL AS NVARCHAR(200))'} AS CategoryName
      FROM Services s
      ${schema.servicesHasCategoryId ? 'LEFT JOIN ServiceCategories sc ON sc.CategoryId = s.CategoryId' : ''}
      WHERE s.ServiceId = @serviceId
        AND ${whereClause}`,
    { serviceId }
  )

  const row = result.recordset?.[0]
  if (!row) return null

  let images = []
  if (schema.serviceImagesTableExists) {
    const imgs = await query(
      'SELECT ImageUrl FROM ServiceImages WHERE ServiceId = @serviceId ORDER BY ImageId',
      { serviceId }
    )
    images = (imgs.recordset || []).map((r) => String(r.ImageUrl || '').trim()).filter(Boolean)
  }

  if (!images.length) {
    const fallback = String(row.ImageUrl || '').trim()
    if (fallback) images = [fallback]
  }

  return {
    id: row.ServiceId,
    categoryId: row.CategoryId || '',
    category: row.CategoryName || '',
    name: row.Name,
    priceVnd: Number(row.Price || 0),
    durationMinutes: row.DurationMinutes === null || row.DurationMinutes === undefined ? null : Number(row.DurationMinutes),
    totalBookings: Number(row.TotalBookings || 0),
    averageRating: row.AverageRating === null || row.AverageRating === undefined ? null : Number(row.AverageRating),
    description: row.Description || '',
    status: row.Status || '',
    images,
  }
}

async function updateService(serviceId, payload) {
  const { name, durationMinutes, priceVnd, description, status, images } = payload || {}
  const schema = await ensureServiceCategorySchema()
  const categoryId = await resolveServiceCategoryIdFromPayload(payload)

  const price = Number(priceVnd)
  const duration = durationMinutes === undefined || durationMinutes === null ? null : Number(durationMinutes)

  const existingRes = await query(
    `SELECT TOP 1 ServiceId, Name, Price, Status
     FROM Services
     WHERE ServiceId = @serviceId`,
    { serviceId },
  )
  const existing = existingRes.recordset?.[0]
  if (!existing) {
    const err = new Error('Service not found')
    err.status = 404
    throw err
  }

  const updateSql = schema.servicesHasCategoryId
    ? `UPDATE Services
       SET Name = @name,
           Price = @price,
           DurationMinutes = @duration,
           Description = @description,
           Status = @status,
           CategoryId = @categoryId
       WHERE ServiceId = @serviceId`
    : `UPDATE Services
       SET Name = @name,
           Price = @price,
           DurationMinutes = @duration,
           Description = @description,
           Status = @status
       WHERE ServiceId = @serviceId`

  await query(updateSql, {
    serviceId,
    name,
    price: Number.isFinite(price) ? price : 0,
    duration: Number.isFinite(duration) ? duration : null,
    description: description || null,
    status: status || null,
    categoryId,
  })

  if (images !== undefined) {
    await replaceServiceImages(serviceId, images)
  }

  const oldPrice = Number(existing.Price)
  const newPrice = Number.isFinite(price) ? price : oldPrice
  const nextStatus = String(status || existing.Status || '').trim().toLowerCase()
  const prevStatus = String(existing.Status || '').trim().toLowerCase()
  const nextName = String(name || existing.Name || '').trim() || 'Service'

  try {
    if (Number.isFinite(oldPrice) && Number.isFinite(newPrice) && newPrice < oldPrice) {
      await notifyAllCustomersEvent({
        event: 'service_discount',
        payload: {
          serviceId,
          serviceName: nextName,
          oldPrice,
          newPrice,
          body: `${nextName} is now discounted from ${oldPrice.toLocaleString('vi-VN')} to ${newPrice.toLocaleString('vi-VN')} VND.`,
        },
      })
    } else if (prevStatus !== 'active' && nextStatus === 'active') {
      await notifyAllCustomersEvent({
        event: 'service_new',
        payload: {
          serviceId,
          serviceName: nextName,
          body: `${nextName} is now available.`,
        },
      })
    }
  } catch (err) {
    console.warn('[services] service update notification failed:', err?.message || err)
  }

  return { id: serviceId }
}

async function deleteService(serviceId) {
  const exists = await query('SELECT TOP 1 ServiceId FROM Services WHERE ServiceId = @serviceId', { serviceId })
  if (!exists.recordset?.length) {
    const err = new Error('Service not found')
    err.status = 404
    throw err
  }

  await query('UPDATE Services SET Status = @status WHERE ServiceId = @serviceId', {
    serviceId,
    status: 'deleted',
  })
  return { id: serviceId }
}

async function uploadServiceImageFromDataUrl({ dataUrl } = {}) {
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

  const dir = getServiceUploadDir()
  await fs.mkdir(dir, { recursive: true })

  const fileName = `img_${newId()}.${parsed.ext}`
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, parsed.buf)

  const url = `/uploads/services/${fileName}`
  if (url.length > 500) {
    const err = new Error('Image URL too long')
    err.status = 413
    throw err
  }

  return { url }
}

async function listServiceCategories() {
  const res = await query(
    `SELECT CategoryId, Name, Description
     FROM ServiceCategories
     ORDER BY Name`
  )
  return (res.recordset || []).map((r) => ({
    id: r.CategoryId,
    name: r.Name || '',
    description: r.Description || '',
  }))
}

async function createServiceCategory(payload) {
  const name = String(payload?.name || '').trim()
  const description = String(payload?.description || '').trim()

  if (!name) {
    const err = new Error('Missing name')
    err.status = 400
    throw err
  }

  const exists = await query('SELECT TOP 1 CategoryId FROM ServiceCategories WHERE Name = @name', { name })
  if (exists.recordset?.length) {
    const err = new Error('Category already exists')
    err.status = 409
    throw err
  }

  const id = newId()
  await query(
    `INSERT INTO ServiceCategories (CategoryId, Name, Description)
     VALUES (@id, @name, @description)`,
    {
      id,
      name,
      description: description || null,
    }
  )

  return { id, name, description }
}

module.exports = {
  listServicesGrouped,
  createService,
  getServiceById,
  updateService,
  deleteService,
  uploadServiceImageFromDataUrl,
  listServiceCategories,
  createServiceCategory,
}
