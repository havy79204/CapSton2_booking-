const { query, newId } = require('../config/query')
const { detectRoleKey } = require('./roles.service')
const { toStaffListItem } = require('../models/staff.model')
const { getSettingsMap } = require('./settings.service')
const fs = require('fs/promises')
const path = require('path')

const STAFF_SKILL_CATEGORY_TABLES = ['ServiceCategories', 'ProductCategories', 'Categories']
const TIME_PERIODS = new Set(['all', 'day', 'week', 'month', 'year'])
const STAFF_SEARCH_MAX_KEYWORD_LENGTH = 120
const STAFF_NAME_MAX_LENGTH = 150
const STAFF_PHONE_MAX_LENGTH = 15
const STAFF_EMAIL_MAX_LENGTH = 254
const STAFF_ADDRESS_MAX_LENGTH = 400
const STAFF_NAME_REGEX = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u
const STAFF_PHONE_REGEX = /^0(3|5|7|8|9)\d{8}$/
const STAFF_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
let _staffSearchIndexesEnsured = false

// Cache cho tableExists/columnExists
const _tableExistsCache = new Map()
const _columnExistsCache = new Map()

function buildValidationError(message) {
  const err = new Error(message)
  err.status = 400
  return err
}

function normalizeText(value) {
  const cleaned = Array.from(String(value || ''))
    .filter((ch) => ch >= ' ' && ch !== '\u007F')
    .join('')
  return cleaned.replace(/\s+/g, ' ').trim()
}

function sanitizeText(value) {
  return normalizeText(value).replace(/[<>]/g, '')
}

function normalizePhone(value) {
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

function buildPhoneLookupVariants(localPhone) {
  const normalized = String(localPhone || '').trim()
  if (!normalized) return []
  if (!STAFF_PHONE_REGEX.test(normalized)) return [normalized]

  const body = normalized.slice(1)
  return [normalized, `84${body}`, `+84${body}`]
}

function isBeforeToday(date) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime() < now.getTime()
}

function normalizeCreateStaffPayload(payload = {}) {
  const name = sanitizeText(payload.name)
  const phone = normalizePhone(payload.phone)
  const email = normalizeText(payload.email).toLowerCase()
  const address = sanitizeText(payload.address)
  const statusText = normalizeText(payload.status)
  const normalizedStatus = statusText || 'Active'
  const hireDate = parseDateOnly(payload.hireDate)

  if (!name) {
    throw buildValidationError('Full name is required')
  }
  if (name.length > STAFF_NAME_MAX_LENGTH) {
    throw buildValidationError(`Full name must be at most ${STAFF_NAME_MAX_LENGTH} characters`)
  }
  if (!STAFF_NAME_REGEX.test(name)) {
    throw buildValidationError('Full name contains invalid characters')
  }

  if (!phone) {
    throw buildValidationError('Phone number is required')
  }
  if (phone.length > STAFF_PHONE_MAX_LENGTH) {
    throw buildValidationError(`Phone number must be at most ${STAFF_PHONE_MAX_LENGTH} characters`)
  }
  if (!STAFF_PHONE_REGEX.test(phone)) {
    throw buildValidationError('Phone number format is invalid')
  }

  if (!email) {
    throw buildValidationError('Email is required')
  }
  if (email.length > STAFF_EMAIL_MAX_LENGTH) {
    throw buildValidationError(`Email must be at most ${STAFF_EMAIL_MAX_LENGTH} characters`)
  }
  if (!STAFF_EMAIL_REGEX.test(email)) {
    throw buildValidationError('Email format is invalid')
  }

  if (!address) {
    throw buildValidationError('Address is required')
  }
  if (address.length > STAFF_ADDRESS_MAX_LENGTH) {
    throw buildValidationError(`Address must be at most ${STAFF_ADDRESS_MAX_LENGTH} characters`)
  }

  if (!hireDate) {
    throw buildValidationError('Hire date is invalid. Use yyyy-mm-dd')
  }
  if (isBeforeToday(hireDate)) {
    throw buildValidationError('Hire date cannot be earlier than today')
  }

  if (normalizedStatus !== 'Active' && normalizedStatus !== 'Inactive') {
    throw buildValidationError('Status must be Active or Inactive')
  }

  return {
    name,
    phone,
    email,
    address,
    hireDate,
    status: normalizedStatus,
  }
}

function getAvatarUploadDir() {
  return path.join(__dirname, '..', '..', 'uploads', 'avatars')
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

function parseDateOnly(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, monthIndex, day)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

function normalizeStaffKeyword(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length > STAFF_SEARCH_MAX_KEYWORD_LENGTH) {
    const err = new Error(`keyword is too long (max ${STAFF_SEARCH_MAX_KEYWORD_LENGTH} characters)`)
    err.status = 400
    throw err
  }
  return text
}

function normalizeStaffSort(sortBy, sortDir) {
  const rawSortBy = String(sortBy || '').trim().toLowerCase()
  const rawSortDir = String(sortDir || '').trim().toLowerCase() === 'asc' ? 'asc' : 'desc'

  if (rawSortBy.includes('_')) {
    const [field, direction] = rawSortBy.split('_')
    const dir = direction === 'asc' ? 'asc' : 'desc'
    return `${field}_${dir}`
  }

  if (rawSortBy) {
    return `${rawSortBy}_${rawSortDir}`
  }

  return 'name_asc'
}

function sortStaffItems(items, sortBy) {
  const sorted = [...items]
  sorted.sort((a, b) => {
    if (sortBy === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''), 'vi')
    if (sortBy === 'rating_desc') return Number(b.rating || 0) - Number(a.rating || 0)
    if (sortBy === 'rating_asc') return Number(a.rating || 0) - Number(b.rating || 0)
    if (sortBy === 'bookings_desc') return Number(b.totalBookings || 0) - Number(a.totalBookings || 0)
    if (sortBy === 'bookings_asc') return Number(a.totalBookings || 0) - Number(b.totalBookings || 0)
    if (sortBy === 'salary_desc') return Number(b.totalSalary || 0) - Number(a.totalSalary || 0)
    if (sortBy === 'salary_asc') return Number(a.totalSalary || 0) - Number(b.totalSalary || 0)
    if (sortBy === 'commission_desc') return Number(b.totalCommission || 0) - Number(a.totalCommission || 0)
    if (sortBy === 'commission_asc') return Number(a.totalCommission || 0) - Number(b.totalCommission || 0)
    if (sortBy === 'hours_desc') return Number(b.workingHours || 0) - Number(a.workingHours || 0)
    if (sortBy === 'hours_asc') return Number(a.workingHours || 0) - Number(b.workingHours || 0)
    return String(a.name || '').localeCompare(String(b.name || ''), 'vi')
  })
  return sorted
}

// Chạy background, không block
function ensureStaffSearchIndexesAsync() {
  if (_staffSearchIndexesEnsured) return
  _staffSearchIndexesEnsured = true

  // Chạy background không await
  setImmediate(async () => {
    try {
      await query(
        `IF NOT EXISTS (
           SELECT 1
           FROM sys.indexes
           WHERE name = 'IX_Users_Status_Name_Email_Phone'
             AND object_id = OBJECT_ID('Users')
         )
         BEGIN
           CREATE INDEX IX_Users_Status_Name_Email_Phone ON Users(Status, Name, Email, Phone)
         END;

         IF NOT EXISTS (
           SELECT 1
           FROM sys.indexes
           WHERE name = 'IX_Staff_Status_UserId'
             AND object_id = OBJECT_ID('Staff')
         )
         BEGIN
           CREATE INDEX IX_Staff_Status_UserId ON Staff(Status, UserId)
         END;

         IF OBJECT_ID('StaffSkills', 'U') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM sys.indexes
              WHERE name = 'IX_StaffSkills_StaffId_CategoryId'
                AND object_id = OBJECT_ID('StaffSkills')
            )
         BEGIN
           CREATE INDEX IX_StaffSkills_StaffId_CategoryId ON StaffSkills(StaffId, CategoryId)
         END;`
      )
      console.log('[INDEX] Staff search indexes created/verified')
    } catch (err) {
      console.error('[INDEX] Error creating staff indexes:', err.message)
    }
  })
}

async function ensureStaffSearchIndexes() {
  ensureStaffSearchIndexesAsync()
}

function buildStaffTimeRange(options = {}) {
  const periodRaw = String(options.period || 'all').trim().toLowerCase()
  const period = TIME_PERIODS.has(periodRaw) ? periodRaw : 'all'

  const today = new Date()
  const refDate = parseDateOnly(options.refDate || options.date)
  const selectedDate = refDate || new Date(today)
  selectedDate.setHours(0, 0, 0, 0)

  const refMonthText = String(options.refMonth || '').trim()
  const refMonthMatch = refMonthText.match(/^(\d{4})-(\d{2})$/)
  const refMonthYear = refMonthMatch ? Number(refMonthMatch[1]) : NaN
  const refMonthNumber = refMonthMatch ? Number(refMonthMatch[2]) : NaN

  const refYearText = String(options.refYear || '').trim()
  const refYear = /^\d{4}$/.test(refYearText) ? Number(refYearText) : NaN

  if (period === 'all') {
    return {
      period,
      selectedDate,
      startAt: null,
      endAt: null,
    }
  }

  const startAt = new Date(selectedDate)
  const endAt = new Date(selectedDate)

  if (period === 'day') {
    endAt.setDate(endAt.getDate() + 1)
  } else if (period === 'week') {
    const dayOfWeek = startAt.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    startAt.setDate(startAt.getDate() + mondayOffset)
    endAt.setTime(startAt.getTime())
    endAt.setDate(endAt.getDate() + 7)
  } else if (period === 'month') {
    if (Number.isFinite(refMonthYear) && Number.isFinite(refMonthNumber) && refMonthNumber >= 1 && refMonthNumber <= 12) {
      startAt.setFullYear(refMonthYear, refMonthNumber - 1, 1)
    } else {
      startAt.setDate(1)
    }
    startAt.setHours(0, 0, 0, 0)
    endAt.setTime(startAt.getTime())
    endAt.setMonth(endAt.getMonth() + 1)
  } else if (period === 'year') {
    if (Number.isFinite(refYear)) {
      startAt.setFullYear(refYear, 0, 1)
    } else {
      startAt.setMonth(0, 1)
    }
    startAt.setHours(0, 0, 0, 0)
    endAt.setTime(startAt.getTime())
    endAt.setFullYear(endAt.getFullYear() + 1)
  }

  return {
    period,
    selectedDate,
    startAt,
    endAt,
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
       WHERE TABLE_NAME = @tableName`,
      { tableName }
    )
    const exists = Boolean(res.recordset?.length)
    _tableExistsCache.set(cacheKey, exists)
    return exists
  } catch (err) {
    console.error(`[tableExists] Error checking table ${tableName}:`, err.message)
    const exists = false
    _tableExistsCache.set(cacheKey, exists)
    return exists
  }
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
       WHERE TABLE_NAME = @tableName
         AND COLUMN_NAME = @columnName`,
      { tableName, columnName }
    )
    const exists = Boolean(res.recordset?.length)
    _columnExistsCache.set(cacheKey, exists)
    return exists
  } catch (err) {
    console.error(`[columnExists] Error checking column ${tableName}.${columnName}:`, err.message)
    const exists = false
    _columnExistsCache.set(cacheKey, exists)
    return exists
  }
}

async function identityColumnExists(tableName, columnName) {
  try {
    const res = await query(
      `SELECT 1 AS ok
       FROM sys.columns c
       INNER JOIN sys.tables t ON t.object_id = c.object_id
       WHERE t.name = @tableName
         AND c.name = @columnName
         AND c.is_identity = 1`,
      { tableName, columnName }
    )
    return Boolean(res.recordset?.length)
  } catch (err) {
    console.error(`[identityColumnExists] Error checking identity column ${tableName}.${columnName}:`, err.message)
    return false
  }
}

async function firstExistingColumn(tableName, columnNames = []) {
  for (const columnName of columnNames) {
    if (await columnExists(tableName, columnName)) {
      return columnName
    }
  }
  return null
}

async function buildWorkingHoursAggregationSql(period) {
  const hasStaffAvailability = await tableExists('StaffAvailability')
  if (hasStaffAvailability) {
    const [hasStaffId, hasWeekStartDate, hasStartHour, hasEndHour] = await Promise.all([
      columnExists('StaffAvailability', 'StaffId'),
      columnExists('StaffAvailability', 'WeekStartDate'),
      columnExists('StaffAvailability', 'StartHour'),
      columnExists('StaffAvailability', 'EndHour'),
    ])

    if (hasStaffId && hasWeekStartDate && hasStartHour && hasEndHour) {
      const rangeCondition = period === 'all'
        ? ''
        : 'AND sa.WeekStartDate >= @rangeStartAt AND sa.WeekStartDate < @rangeEndAt'

      return `
        LEFT JOIN (
          SELECT
            sa.StaffId,
            CAST(SUM(
              CASE
                WHEN TRY_CONVERT(FLOAT, sa.EndHour) > TRY_CONVERT(FLOAT, sa.StartHour)
                  THEN TRY_CONVERT(FLOAT, sa.EndHour) - TRY_CONVERT(FLOAT, sa.StartHour)
                ELSE 0
              END
            ) AS FLOAT) AS WorkingHours
          FROM StaffAvailability sa
          WHERE sa.StaffId IS NOT NULL
            ${rangeCondition}
          GROUP BY sa.StaffId
        ) shiftAgg ON shiftAgg.StaffId = s.StaffId`
    }
  }

  const hasStaffShifts = await tableExists('StaffShifts')
  if (!hasStaffShifts) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS FLOAT) AS WorkingHours WHERE 1=0) shiftAgg ON shiftAgg.StaffId = s.StaffId'
  }

  const [hasShiftStaffId, hasShiftWeekStartDate, hasShiftDayIndex, hasShiftDurationHours, hasShiftStartHour, hasShiftEndHour] = await Promise.all([
    columnExists('StaffShifts', 'StaffId'),
    columnExists('StaffShifts', 'WeekStartDate'),
    columnExists('StaffShifts', 'DayIndex'),
    columnExists('StaffShifts', 'DurationHours'),
    columnExists('StaffShifts', 'StartHour'),
    columnExists('StaffShifts', 'EndHour'),
  ])

  if (!hasShiftStaffId || !hasShiftWeekStartDate) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS FLOAT) AS WorkingHours WHERE 1=0) shiftAgg ON shiftAgg.StaffId = s.StaffId'
  }

  if (!hasShiftDurationHours && !(hasShiftStartHour && hasShiftEndHour)) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS FLOAT) AS WorkingHours WHERE 1=0) shiftAgg ON shiftAgg.StaffId = s.StaffId'
  }

  const shiftDateExpr = hasShiftDayIndex
    ? 'DATEADD(DAY, ISNULL(TRY_CONVERT(INT, ss.DayIndex), 0), CAST(ss.WeekStartDate AS DATE))'
    : 'CAST(ss.WeekStartDate AS DATE)'

  const durationExpr = hasShiftDurationHours
    ? 'TRY_CONVERT(FLOAT, ss.DurationHours)'
    : `CASE
         WHEN TRY_CONVERT(FLOAT, ss.EndHour) > TRY_CONVERT(FLOAT, ss.StartHour)
           THEN TRY_CONVERT(FLOAT, ss.EndHour) - TRY_CONVERT(FLOAT, ss.StartHour)
         ELSE 0
       END`

  const shiftRangeCondition = period === 'all'
    ? ''
    : `AND ${shiftDateExpr} >= @rangeStartAt AND ${shiftDateExpr} < @rangeEndAt`

  return `
    LEFT JOIN (
      SELECT
        ss.StaffId,
        CAST(SUM(ISNULL(${durationExpr}, 0)) AS FLOAT) AS WorkingHours
      FROM StaffShifts ss
      WHERE ss.StaffId IS NOT NULL
        ${shiftRangeCondition}
      GROUP BY ss.StaffId
    ) shiftAgg ON shiftAgg.StaffId = s.StaffId`
}

async function buildBookingsAggregationSql(period) {
  const hasBookingServices = await tableExists('BookingServices')
  if (!hasBookingServices) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS INT) AS TotalBookings WHERE 1=0) bsAgg ON bsAgg.StaffId = s.StaffId'
  }

  const hasBookings = await tableExists('Bookings')
  const bookingDateColumn = hasBookings
    ? await firstExistingColumn('Bookings', ['BookingTime', 'StartAt', 'CreatedAt'])
    : null

  const joinBookingsSql = hasBookings
    ? 'LEFT JOIN Bookings b ON b.BookingId = bs.BookingId'
    : ''

  const bookingRangeCondition = period === 'all' || !bookingDateColumn
    ? ''
    : `AND b.${bookingDateColumn} >= @rangeStartAt AND b.${bookingDateColumn} < @rangeEndAt`

  return `
    LEFT JOIN (
      SELECT
        bs.StaffId,
        COUNT(DISTINCT bs.BookingId) AS TotalBookings
      FROM BookingServices bs
      ${joinBookingsSql}
      WHERE bs.StaffId IS NOT NULL
        ${bookingRangeCondition}
      GROUP BY bs.StaffId
    ) bsAgg ON bsAgg.StaffId = s.StaffId`
}

async function buildTipAggregationSql(period) {
  const hasTipLogs = await tableExists('TipLogs')
  if (!hasTipLogs) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS DECIMAL(18,2)) AS TotalTip WHERE 1=0) tipAgg ON tipAgg.StaffId = s.StaffId'
  }

  const tipDateColumn = await firstExistingColumn('TipLogs', ['At', 'CreatedAt', 'UpdatedAt'])
  const tipRangeCondition = period === 'all' || !tipDateColumn
    ? ''
    : `AND tl.[${tipDateColumn}] >= @rangeStartAt AND tl.[${tipDateColumn}] < @rangeEndAt`

  return `
    LEFT JOIN (
      SELECT
        tl.StaffId,
        SUM(ISNULL(tl.Amount, 0)) AS TotalTip
      FROM TipLogs tl
      WHERE tl.StaffId IS NOT NULL
        ${tipRangeCondition}
      GROUP BY tl.StaffId
    ) tipAgg ON tipAgg.StaffId = s.StaffId`
}

async function buildRatingAggregationSql(period) {
  const hasSalonReviews = await tableExists('SalonReviews')
  const hasBookingServices = await tableExists('BookingServices')
  if (!hasSalonReviews || !hasBookingServices) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS FLOAT) AS AverageRating, CAST(0 AS INT) AS RatingCount WHERE 1=0) ratingAgg ON ratingAgg.StaffId = s.StaffId'
  }

  const [hasRating, hasBookingId, hasBookingServiceId] = await Promise.all([
    columnExists('SalonReviews', 'Rating'),
    columnExists('SalonReviews', 'BookingId'),
    columnExists('SalonReviews', 'BookingServiceId'),
  ])

  if (!hasRating || (!hasBookingId && !hasBookingServiceId)) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS FLOAT) AS AverageRating, CAST(0 AS INT) AS RatingCount WHERE 1=0) ratingAgg ON ratingAgg.StaffId = s.StaffId'
  }

  const reviewDateColumn = await firstExistingColumn('SalonReviews', ['CreatedAt', 'UpdatedAt'])
  const reviewRangeCondition = period === 'all' || !reviewDateColumn
    ? ''
    : `AND sr.[${reviewDateColumn}] >= @rangeStartAt AND sr.[${reviewDateColumn}] < @rangeEndAt`

  const byServicePredicate = hasBookingServiceId
    ? 'bs1.BookingServiceId = sr.BookingServiceId'
    : '1 = 0'

  const byBookingPredicate = hasBookingId
    ? 'bs2.BookingId = sr.BookingId'
    : '1 = 0'

  return `
    LEFT JOIN (
      SELECT
        COALESCE(staffByService.StaffId, staffByBooking.StaffId) AS StaffId,
        AVG(TRY_CONVERT(FLOAT, sr.Rating)) AS AverageRating,
        COUNT(1) AS RatingCount
      FROM SalonReviews sr
      OUTER APPLY (
        SELECT TOP 1 bs1.StaffId
        FROM BookingServices bs1
        WHERE ${byServicePredicate}
          AND bs1.StaffId IS NOT NULL
      ) staffByService
      OUTER APPLY (
        SELECT TOP 1 bs2.StaffId
        FROM BookingServices bs2
        WHERE sr.BookingServiceId IS NULL
          AND ${byBookingPredicate}
          AND bs2.StaffId IS NOT NULL
        ORDER BY bs2.BookingServiceId
      ) staffByBooking
      WHERE TRY_CONVERT(FLOAT, sr.Rating) IS NOT NULL
        AND COALESCE(staffByService.StaffId, staffByBooking.StaffId) IS NOT NULL
        ${reviewRangeCondition}
      GROUP BY COALESCE(staffByService.StaffId, staffByBooking.StaffId)
    ) ratingAgg ON ratingAgg.StaffId = s.StaffId`
}

function calculateCommission(revenue, tiers = {}) {
  const tierLow = tiers.commissionTierLow !== undefined && tiers.commissionTierLow !== null ? Number(tiers.commissionTierLow) : 500000
  const rateLow = tiers.commissionRateLow !== undefined && tiers.commissionRateLow !== null ? Number(tiers.commissionRateLow) : 0.10
  const tierHigh = tiers.commissionTierHigh !== undefined && tiers.commissionTierHigh !== null ? Number(tiers.commissionTierHigh) : 2000000
  const rateHigh = tiers.commissionRateHigh !== undefined && tiers.commissionRateHigh !== null ? Number(tiers.commissionRateHigh) : 0.15

  if (revenue >= tierHigh) {
    return revenue * rateHigh
  }
  if (revenue >= tierLow && revenue < tierHigh) {
    return revenue * rateLow
  }
  return 0
}

function normalizeRate(rawRate) {
  const rate = Number(rawRate)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return rate > 1 ? rate / 100 : rate
}

function resolveCommissionRateByRevenue(revenue, settingsMap = {}) {
  const normalizedRevenue = Number(revenue)
  if (!Number.isFinite(normalizedRevenue) || normalizedRevenue <= 0) return 0

  if (Array.isArray(settingsMap.CommissionTiers) && settingsMap.CommissionTiers.length > 0) {
    const normalizedTiers = settingsMap.CommissionTiers
      .map((t) => ({
        threshold: Number(t?.threshold ?? t?.commissionTierLow ?? 0),
        rate: normalizeRate(t?.rate ?? t?.commissionRateLow ?? 0),
      }))
      .filter((t) => Number.isFinite(t.threshold) && t.threshold >= 0)
      .sort((a, b) => a.threshold - b.threshold)

    for (let i = normalizedTiers.length - 1; i >= 0; i -= 1) {
      if (normalizedRevenue >= normalizedTiers[i].threshold) {
        return normalizedTiers[i].rate
      }
    }
    return 0
  }

  if (String(settingsMap.CommissionSource || '').trim() === 'policyTable') {
    return 0
  }

  const legacyTierLow = Number(settingsMap.CommissionTierLow)
  const legacyTierHigh = Number(settingsMap.CommissionTierHigh)
  const legacyRateLow = normalizeRate(settingsMap.CommissionRateLow)
  const legacyRateHigh = normalizeRate(settingsMap.CommissionRateHigh)

  if (Number.isFinite(legacyTierHigh) && normalizedRevenue >= legacyTierHigh) return legacyRateHigh
  if (Number.isFinite(legacyTierLow) && normalizedRevenue >= legacyTierLow) return legacyRateLow
  return 0
}

async function buildCommissionAggregationSql(period) {
  const bookingDateColumn = await firstExistingColumn('Bookings', ['BookingTime', 'CreatedAt', 'UpdatedAt'])
  if (!bookingDateColumn) {
    return 'LEFT JOIN (SELECT CAST(NULL AS NVARCHAR(50)) AS StaffId, CAST(0 AS DECIMAL(18,2)) AS TotalCommissionRevenue WHERE 1=0) commAgg ON commAgg.StaffId = s.StaffId'
  }

  const commRangeCondition = period === 'all' || !bookingDateColumn
    ? ''
    : `AND b.[${bookingDateColumn}] >= @rangeStartAt AND b.[${bookingDateColumn}] < @rangeEndAt`

  return `
    LEFT JOIN (
      SELECT
        bs.StaffId,
        SUM(ISNULL(COALESCE(bs.Price, sv.Price), 0)) AS TotalCommissionRevenue
      FROM BookingServices bs
      LEFT JOIN Bookings b ON b.BookingId = bs.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      WHERE bs.StaffId IS NOT NULL
        AND LOWER(LTRIM(RTRIM(COALESCE(b.Status, '')))) IN ('completed', 'complete', 'done')
        ${commRangeCondition}
      GROUP BY bs.StaffId
    ) commAgg ON commAgg.StaffId = s.StaffId`
}

let _staffSkillSchemaCache = null

async function getStaffSkillSchema() {
  // Return cached result if available (schema doesn't change at runtime)
  if (_staffSkillSchemaCache) {
    return _staffSkillSchemaCache
  }

  try {
    const hasStaffSkills = await tableExists('StaffSkills')
    if (!hasStaffSkills) {
      _staffSkillSchemaCache = {
        enabled: false,
        hasIdStaffSkill: false,
        canWriteIdStaffSkill: false,
        categoryTable: null,
        categoryNameColumn: null,
      }
      return _staffSkillSchemaCache
    }

    const [hasStaffId, hasCategoryId, hasIdStaffSkill] = await Promise.all([
      columnExists('StaffSkills', 'StaffId'),
      columnExists('StaffSkills', 'CategoryId'),
      columnExists('StaffSkills', 'IdStaffSkill'),
    ])

    const canWriteIdStaffSkill = hasIdStaffSkill
      ? !(await identityColumnExists('StaffSkills', 'IdStaffSkill'))
      : false

    if (!hasStaffId || !hasCategoryId) {
      _staffSkillSchemaCache = {
        enabled: false,
        hasIdStaffSkill,
        canWriteIdStaffSkill,
        categoryTable: null,
        categoryNameColumn: null,
      }
      return _staffSkillSchemaCache
    }

    for (const tableName of STAFF_SKILL_CATEGORY_TABLES) {
      const hasTable = await tableExists(tableName)
      if (!hasTable) continue

      const hasCategoryIdInTable = await columnExists(tableName, 'CategoryId')
      if (!hasCategoryIdInTable) continue

      const hasName = await columnExists(tableName, 'Name')
      if (hasName) {
        _staffSkillSchemaCache = {
          enabled: true,
          hasIdStaffSkill,
          canWriteIdStaffSkill,
          categoryTable: tableName,
          categoryNameColumn: 'Name',
        }
        return _staffSkillSchemaCache
      }

      const hasCategoryName = await columnExists(tableName, 'CategoryName')
      if (hasCategoryName) {
        _staffSkillSchemaCache = {
          enabled: true,
          hasIdStaffSkill,
          canWriteIdStaffSkill,
          categoryTable: tableName,
          categoryNameColumn: 'CategoryName',
        }
        return _staffSkillSchemaCache
      }
    }

    _staffSkillSchemaCache = {
      enabled: true,
      hasIdStaffSkill,
      canWriteIdStaffSkill,
      categoryTable: null,
      categoryNameColumn: null,
    }
    return _staffSkillSchemaCache
  } catch (err) {
    console.error('[getStaffSkillSchema] Error:', err.message)
    _staffSkillSchemaCache = {
      enabled: false,
      hasIdStaffSkill: false,
      canWriteIdStaffSkill: false,
      categoryTable: null,
      categoryNameColumn: null,
    }
    return _staffSkillSchemaCache
  }
}

function normalizeCategoryIdsFromPayload(payload = {}) {
  const raw = payload.specialtyCategoryIds ?? payload.categoryIds ?? []
  const src = Array.isArray(raw) ? raw : String(raw || '').split(',')
  const seen = new Set()
  const out = []

  for (const item of src) {
    const id = String(item || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  return out
}

async function listStaffSkillCategories() {
  try {
    const schema = await getStaffSkillSchema()
    if (!schema.enabled) return []

    if (schema.categoryTable && schema.categoryNameColumn) {
      const rows = await query(
        `SELECT
            c.CategoryId,
            c.${schema.categoryNameColumn} AS Name
         FROM ${schema.categoryTable} c
         WHERE c.CategoryId IS NOT NULL
         ORDER BY c.${schema.categoryNameColumn} ASC`
      )

      return (rows.recordset || [])
        .map((row) => ({
          id: String(row.CategoryId || '').trim(),
          name: String(row.Name || '').trim(),
        }))
        .filter((row) => row.id)
    }

    const rows = await query(
      `SELECT DISTINCT
          ss.CategoryId
       FROM StaffSkills ss
       WHERE ss.CategoryId IS NOT NULL
       ORDER BY ss.CategoryId ASC`
    )

    return (rows.recordset || [])
      .map((row) => {
        const id = String(row.CategoryId || '').trim()
        return {
          id,
          name: id,
        }
      })
      .filter((row) => row.id)
  } catch (err) {
    console.error('[listStaffSkillCategories] Error:', err.message)
    return []
  }
}

async function getStaffSkillMap(staffIds, schema) {
  if (!schema.enabled || !Array.isArray(staffIds) || staffIds.length === 0) return new Map()

  const params = {}
  const placeholders = staffIds.map((staffId, idx) => {
    const key = `staffId${idx}`
    params[key] = staffId
    return `@${key}`
  })

  const joinSql = schema.categoryTable && schema.categoryNameColumn
    ? `LEFT JOIN ${schema.categoryTable} c ON c.CategoryId = ss.CategoryId`
    : ''
  const nameSelect = schema.categoryTable && schema.categoryNameColumn
    ? `c.${schema.categoryNameColumn} AS CategoryName`
    : `NULL AS CategoryName`

  const rows = await query(
    `SELECT
        ss.StaffId,
        ss.CategoryId,
        ${nameSelect}
     FROM StaffSkills ss
     ${joinSql}
     WHERE ss.StaffId IN (${placeholders.join(', ')})`,
    params
  )

  const byStaffId = new Map()
  for (const row of rows.recordset || []) {
    const staffId = String(row.StaffId || '').trim()
    const categoryId = String(row.CategoryId || '').trim()
    if (!staffId || !categoryId) continue

    if (!byStaffId.has(staffId)) byStaffId.set(staffId, [])
    const arr = byStaffId.get(staffId)

    if (arr.some((x) => x.id === categoryId)) continue

    arr.push({
      id: categoryId,
      name: String(row.CategoryName || categoryId).trim() || categoryId,
    })
  }

  return byStaffId
}

function enrichStaffItem(baseItem, skillRows = []) {
  const specialtyCategoryIds = skillRows.map((x) => x.id)
  const specialties = skillRows.map((x) => x.name).filter(Boolean)

  return {
    ...baseItem,
    specialtyCategoryIds,
    specialties,
    specialty: specialties.length ? specialties.join(', ') : baseItem.specialty,
  }
}

async function replaceStaffSkills(staffId, categoryIds, schema) {
  if (!schema.enabled) return

  await query('DELETE FROM StaffSkills WHERE StaffId = @staffId', { staffId })

  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return

  for (const categoryId of categoryIds) {
    if (schema.hasIdStaffSkill && schema.canWriteIdStaffSkill) {
      await query(
        `INSERT INTO StaffSkills (IdStaffSkill, StaffId, CategoryId)
         VALUES (@idStaffSkill, @staffId, @categoryId)`,
        {
          idStaffSkill: newId(),
          staffId,
          categoryId,
        }
      )
    } else {
      await query(
        `INSERT INTO StaffSkills (StaffId, CategoryId)
         VALUES (@staffId, @categoryId)`,
        {
          staffId,
          categoryId,
        }
      )
    }
  }
}

async function listStaff(options = {}) {
  await ensureStaffSearchIndexes()

  const { period, startAt, endAt } = buildStaffTimeRange(options)
  const keyword = normalizeStaffKeyword(options.keyword || options.q || '')
  const page = Math.max(1, Math.trunc(Number(options.page || 1) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(options.pageSize || 10) || 10)))
  const sortBy = normalizeStaffSort(options.sortBy, options.sortDir)

  const bind = period === 'all'
    ? {}
    : {
      rangeStartAt: startAt,
      rangeEndAt: endAt,
    }

  const keywordSql = keyword
    ? `AND (
         UPPER(LTRIM(RTRIM(ISNULL(u.Name, '')))) LIKE UPPER(@keyword)
         OR UPPER(LTRIM(RTRIM(ISNULL(u.Phone, '')))) LIKE UPPER(@keyword)
         OR UPPER(LTRIM(RTRIM(ISNULL(u.Email, '')))) LIKE UPPER(@keyword)
         OR UPPER(LTRIM(RTRIM(ISNULL(u.RoleKey, '')))) LIKE UPPER(@keyword)
         OR UPPER(LTRIM(RTRIM(ISNULL(r.DisplayName, '')))) LIKE UPPER(@keyword)
       )`
    : ''

  if (keyword) {
    bind.keyword = `%${keyword}%`
  }

  const skillSchema = await getStaffSkillSchema()
  const [bookingsAggSql, workingHoursAggSql, commissionAggSql, ratingAggSql, settingsMap] = await Promise.all([
    buildBookingsAggregationSql(period),
    buildWorkingHoursAggregationSql(period),
    buildCommissionAggregationSql(period),
    buildRatingAggregationSql(period),
    getSettingsMap(),
  ])

  const result = await query(
    `SELECT
        s.StaffId,
        s.Status AS StaffStatus,
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl,
        u.RoleKey,
        r.DisplayName AS RoleName,
        ISNULL(bsAgg.TotalBookings, 0) AS TotalBookings,
        ISNULL(shiftAgg.WorkingHours, 0) AS WorkingHours,
        ISNULL(ratingAgg.AverageRating, 0) AS AverageRating,
        ISNULL(ratingAgg.RatingCount, 0) AS RatingCount,
        ISNULL(commAgg.TotalCommissionRevenue, 0) AS TotalCommissionRevenue
      FROM Staff s
      LEFT JOIN Users u ON u.UserId = s.UserId
      LEFT JOIN Roles r ON r.RoleKey = u.RoleKey
      ${bookingsAggSql}
      ${workingHoursAggSql}
      ${ratingAggSql}
      ${commissionAggSql}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(s.Status, '')))) <> 'INACTIVE'
        AND UPPER(LTRIM(RTRIM(ISNULL(u.Status, '')))) <> 'INACTIVE'
        ${keywordSql}
      ORDER BY u.Name`
    ,
    bind
  )

  const baseItems = (result.recordset || []).map(toStaffListItem)
  const staffIds = baseItems.map((x) => String(x.id || '').trim()).filter(Boolean)
  const skillMap = await getStaffSkillMap(staffIds, skillSchema)
  
  // Calculate commission from completed service revenue using Booking Rules CommissionTiers.
  const itemsWithCommission = baseItems.map((item) => {
    const commissionBaseRevenue = Number(item.totalCommissionRevenue || 0)
    const appliedRate = resolveCommissionRateByRevenue(commissionBaseRevenue, settingsMap)
    const totalCommission = commissionBaseRevenue * appliedRate
    const totalSalary = (item.workingHours * 25000) + Math.round(totalCommission)
    
    return {
      ...item,
      totalCommissionRevenue: commissionBaseRevenue,
      totalCommission: Math.round(totalCommission),
      totalSalary: Math.round(totalSalary),
    }
  })
  
  const enrichedItems = itemsWithCommission.map((item) => enrichStaffItem(item, skillMap.get(String(item.id || '').trim()) || []))

  const keywordLower = keyword.toLocaleLowerCase('vi')
  const keywordFiltered = keywordLower
    ? enrichedItems.filter((item) => {
      const specialty = String(item.specialty || '').toLocaleLowerCase('vi')
      const specialties = Array.isArray(item.specialties)
        ? item.specialties.map((x) => String(x || '').toLocaleLowerCase('vi')).join(' ')
        : ''
      return specialty.includes(keywordLower) || specialties.includes(keywordLower)
        || String(item.name || '').toLocaleLowerCase('vi').includes(keywordLower)
        || String(item.phone || '').toLocaleLowerCase('vi').includes(keywordLower)
        || String(item.email || '').toLocaleLowerCase('vi').includes(keywordLower)
        || String(item.roleName || item.roleKey || '').toLocaleLowerCase('vi').includes(keywordLower)
    })
    : enrichedItems

  const sortedItems = sortStaffItems(keywordFiltered, sortBy)
  const totalRows = sortedItems.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const normalizedPage = Math.min(page, totalPages)
  const offset = (normalizedPage - 1) * pageSize
  const items = sortedItems.slice(offset, offset + pageSize)

  const totalBookings = keywordFiltered.reduce((sum, x) => sum + Number(x?.totalBookings || 0), 0)
  const totalSalary = keywordFiltered.reduce((sum, x) => sum + Number(x?.totalSalary || 0), 0)

  return {
    items,
    pagination: {
      page: normalizedPage,
      pageSize,
      totalRows,
      totalPages,
    },
    summary: {
      totalStaff: totalRows,
      totalBookings,
      totalSalary,
    },
  }
}

async function createStaff(payload) {
  const normalizedPayload = normalizeCreateStaffPayload(payload)
  const {
    name,
    phone,
    email,
    address,
    hireDate,
    status: normalizedStatus,
  } = normalizedPayload
  const categoryIds = normalizeCategoryIdsFromPayload(payload)
  const skillSchema = await getStaffSkillSchema()

  const duplicateEmail = await query(
    `SELECT TOP 1 UserId
     FROM Users
     WHERE UPPER(LTRIM(RTRIM(ISNULL(Email, '')))) = UPPER(@email)`,
    { email }
  )
  if (duplicateEmail.recordset?.length) {
    const err = new Error('Email already exists')
    err.status = 409
    throw err
  }

  const duplicatePhone = await query(
    `SELECT TOP 1 UserId
     FROM Users
     WHERE LTRIM(RTRIM(ISNULL(Phone, ''))) = @phone0
        OR LTRIM(RTRIM(ISNULL(Phone, ''))) = @phone84
        OR LTRIM(RTRIM(ISNULL(Phone, ''))) = @phonePlus84`,
    {
      phone0: buildPhoneLookupVariants(phone)[0] || phone,
      phone84: buildPhoneLookupVariants(phone)[1] || phone,
      phonePlus84: buildPhoneLookupVariants(phone)[2] || phone,
    }
  )
  if (duplicatePhone.recordset?.length) {
    const err = new Error('Phone number already exists')
    err.status = 409
    throw err
  }

  const roleKey = await detectRoleKey(['staff', 'STAFF', 'employee', 'EMPLOYEE'])
  const userId = newId()
  const staffId = newId()

  await query(
    `INSERT INTO Users (UserId, Name, Email, Phone, PasswordHash, RoleKey, Status)
     VALUES (@userId, @name, @email, @phone, NULL, @roleKey, @userStatus);
     INSERT INTO Staff (StaffId, UserId, HireDate, Status)
     VALUES (@staffId, @userId, @hireDate, @staffStatus);`,
    {
      userId,
      staffId,
      name,
      email,
      phone,
      hireDate,
      roleKey,
      userStatus: normalizedStatus,
      staffStatus: normalizedStatus,
    }
  )

  await query(
    `INSERT INTO Addresses (AddressId, UserId, FullName, PhoneNumber, AddressLine, IsDefault)
     VALUES (@addressId, @userId, @fullName, @phoneNumber, @addressLine, 1)`,
    {
      addressId: newId(),
      userId,
      fullName: name,
      phoneNumber: phone,
      addressLine: address,
    }
  )

  await replaceStaffSkills(staffId, categoryIds, skillSchema)

  return { id: staffId }
}

async function getStaffById(staffId) {
  const skillSchema = await getStaffSkillSchema()
  const result = await query(
    `SELECT TOP 1
        s.StaffId,
        s.HireDate,
        s.Status AS StaffStatus,
        u.UserId,
        u.Name,
        u.Email,
        u.Phone,
        u.AvatarUrl,
        u.RoleKey,
        r.DisplayName AS RoleName,
        addr.AddressLine AS Address
      FROM Staff s
      LEFT JOIN Users u ON u.UserId = s.UserId
      LEFT JOIN Roles r ON r.RoleKey = u.RoleKey
      OUTER APPLY (
        SELECT TOP 1 a.AddressLine
        FROM Addresses a
        WHERE a.UserId = u.UserId
        ORDER BY ISNULL(a.IsDefault, 0) DESC, a.AddressId ASC
      ) addr
      WHERE s.StaffId = @staffId`,
    { staffId }
  )

  const row = result.recordset?.[0]
  if (!row) return null

  const baseItem = toStaffListItem(row)
  const skillMap = await getStaffSkillMap([String(baseItem.id || '').trim()].filter(Boolean), skillSchema)
  return enrichStaffItem(baseItem, skillMap.get(String(baseItem.id || '').trim()) || [])
}

async function updateStaff(staffId, payload) {
  const hasName = Object.prototype.hasOwnProperty.call(payload || {}, 'name')
  const hasPhone = Object.prototype.hasOwnProperty.call(payload || {}, 'phone')
  const hasEmail = Object.prototype.hasOwnProperty.call(payload || {}, 'email')
  const hasSpecialtyCategoryIds = Object.prototype.hasOwnProperty.call(payload || {}, 'specialtyCategoryIds') || Object.prototype.hasOwnProperty.call(payload || {}, 'categoryIds')
  const hasAvatarUrl = Object.prototype.hasOwnProperty.call(payload || {}, 'avatarUrl')
  const hasAddress = Object.prototype.hasOwnProperty.call(payload || {}, 'address')
  const hasHireDate = Object.prototype.hasOwnProperty.call(payload || {}, 'hireDate')
  const hasStatus = Object.prototype.hasOwnProperty.call(payload || {}, 'status')

  const name = hasName ? sanitizeText(payload.name) : ''
  const phone = hasPhone ? normalizePhone(payload.phone) : ''
  const email = hasEmail ? normalizeText(payload.email).toLowerCase() : ''

  const avatarUrl = hasAvatarUrl ? String(payload.avatarUrl || '').trim() : null
  const address = hasAddress ? sanitizeText(payload.address) : null

  const hireDateRaw = hasHireDate ? parseDateOnly(payload.hireDate) : null
  const hireDate = hasHireDate && hireDateRaw ? hireDateRaw : null

  const status = hasStatus ? String(payload.status || '').trim() : ''
  const normalizedStatus = status || null

  if (hasName) {
    if (!name) throw buildValidationError('Full name is required')
    if (name.length > STAFF_NAME_MAX_LENGTH) {
      throw buildValidationError(`Full name must be at most ${STAFF_NAME_MAX_LENGTH} characters`)
    }
    if (!STAFF_NAME_REGEX.test(name)) {
      throw buildValidationError('Full name contains invalid characters')
    }
  }

  if (hasPhone) {
    if (!phone) throw buildValidationError('Phone number is required')
    if (phone.length > STAFF_PHONE_MAX_LENGTH) {
      throw buildValidationError(`Phone number must be at most ${STAFF_PHONE_MAX_LENGTH} characters`)
    }
    if (!STAFF_PHONE_REGEX.test(phone)) {
      throw buildValidationError('Phone number format is invalid')
    }
  }

  if (hasEmail) {
    if (!email) throw buildValidationError('Email is required')
    if (email.length > STAFF_EMAIL_MAX_LENGTH) {
      throw buildValidationError(`Email must be at most ${STAFF_EMAIL_MAX_LENGTH} characters`)
    }
    if (!STAFF_EMAIL_REGEX.test(email)) {
      throw buildValidationError('Email format is invalid')
    }
  }

  if (hasAddress) {
    if (!address) throw buildValidationError('Address is required')
    if (address.length > STAFF_ADDRESS_MAX_LENGTH) {
      throw buildValidationError(`Address must be at most ${STAFF_ADDRESS_MAX_LENGTH} characters`)
    }
  }

  if (hasHireDate) {
    if (!hireDate) throw buildValidationError('Hire date is invalid. Use yyyy-mm-dd')
  }

  if (hasStatus) {
    if (normalizedStatus !== 'Active' && normalizedStatus !== 'Inactive') {
      throw buildValidationError('Status must be Active or Inactive')
    }
  }

  const categoryIds = normalizeCategoryIdsFromPayload(payload)
  const skillSchema = await getStaffSkillSchema()

  const existing = await query(
    `SELECT TOP 1 s.StaffId, s.UserId
     FROM Staff s
     WHERE s.StaffId = @staffId`,
    { staffId }
  )
  const row = existing.recordset?.[0]
  if (!row) {
    const err = new Error('Staff not found')
    err.status = 404
    throw err
  }
  const userId = row.UserId

  if (email) {
    const emailUsed = await query(
      'SELECT TOP 1 UserId FROM Users WHERE Email = @email AND UserId <> @userId',
      { email, userId }
    )
    if (emailUsed.recordset?.length) {
      const err = new Error('Email already exists')
      err.status = 409
      throw err
    }
  }

  if (phone) {
    const phoneVariants = buildPhoneLookupVariants(phone)
    const phoneUsed = await query(
      `SELECT TOP 1 UserId
       FROM Users
       WHERE UserId <> @userId
         AND (
           LTRIM(RTRIM(ISNULL(Phone, ''))) = @phone0
           OR LTRIM(RTRIM(ISNULL(Phone, ''))) = @phone84
           OR LTRIM(RTRIM(ISNULL(Phone, ''))) = @phonePlus84
         )`,
      {
        userId,
        phone0: phoneVariants[0] || phone,
        phone84: phoneVariants[1] || phone,
        phonePlus84: phoneVariants[2] || phone,
      }
    )
    if (phoneUsed.recordset?.length) {
      const err = new Error('Phone number already exists')
      err.status = 409
      throw err
    }
  }

  await query(
    `UPDATE Users
     SET Name = CASE WHEN @setName = 1 THEN @name ELSE Name END,
       Email = CASE WHEN @setEmail = 1 THEN @email ELSE Email END,
       Phone = CASE WHEN @setPhone = 1 THEN @phone ELSE Phone END,
         AvatarUrl = CASE WHEN @setAvatarUrl = 1 THEN @avatarUrl ELSE AvatarUrl END,
         Status = CASE WHEN @setStatus = 1 THEN @userStatus ELSE Status END
     WHERE UserId = @userId;
     UPDATE Staff
     SET HireDate = CASE WHEN @setHireDate = 1 THEN @hireDate ELSE HireDate END,
         Status = CASE WHEN @setStatus = 1 THEN @staffStatus ELSE Status END
     WHERE UserId = @userId;`,
    {
      staffId,
      userId,
      name,
      email: email || null,
      phone: phone || null,
      setName: hasName ? 1 : 0,
      setEmail: hasEmail ? 1 : 0,
      setPhone: hasPhone ? 1 : 0,
      setAvatarUrl: hasAvatarUrl ? 1 : 0,
      avatarUrl,
      setHireDate: hasHireDate ? 1 : 0,
      hireDate,
      setStatus: hasStatus ? 1 : 0,
      userStatus: normalizedStatus,
      staffStatus: normalizedStatus,
    }
  )

  if (hasAddress) {
    const existingAddress = await query(
      `SELECT TOP 1 AddressId
       FROM Addresses
       WHERE UserId = @userId
       ORDER BY ISNULL(IsDefault, 0) DESC, AddressId ASC`,
      { userId }
    )

    const rowAddress = existingAddress.recordset?.[0]
    if (rowAddress?.AddressId) {
      await query(
        `UPDATE Addresses
         SET AddressLine = @addressLine,
             FullName = CASE WHEN @setName = 1 THEN COALESCE(NULLIF(@name, ''), FullName) ELSE FullName END,
             PhoneNumber = CASE WHEN @setPhone = 1 THEN @phone ELSE PhoneNumber END,
             IsDefault = 1
         WHERE AddressId = @addressId`,
        {
          addressId: rowAddress.AddressId,
          addressLine: address || null,
          name,
          phone: phone || null,
          setName: hasName ? 1 : 0,
          setPhone: hasPhone ? 1 : 0,
        }
      )
    } else {
      await query(
        `INSERT INTO Addresses (AddressId, UserId, FullName, PhoneNumber, AddressLine, IsDefault)
         SELECT @addressId,
                @userId,
                COALESCE(NULLIF(@fullName, ''), u.Name),
                COALESCE(@phoneNumber, u.Phone),
                @addressLine,
                1
         FROM Users u
         WHERE u.UserId = @userId`,
        {
          addressId: newId(),
          userId,
          fullName: name || null,
          phoneNumber: phone || null,
          addressLine: address || null,
        }
      )
    }
  }

  if (hasSpecialtyCategoryIds) {
    await replaceStaffSkills(staffId, categoryIds, skillSchema)
  }

  return { id: staffId }
}

async function deleteStaff(staffId) {
  const existing = await query(
    `SELECT TOP 1 s.StaffId, s.UserId
     FROM Staff s
     WHERE s.StaffId = @staffId`,
    { staffId }
  )
  const row = existing.recordset?.[0]
  if (!row) {
    const err = new Error('Staff not found')
    err.status = 404
    throw err
  }

  await query(
    `UPDATE Staff SET Status = @staffStatus WHERE StaffId = @staffId;
     UPDATE Users SET Status = @userStatus WHERE UserId = @userId;`,
    {
      staffId,
      userId: row.UserId,
      staffStatus: 'Inactive',
      userStatus: 'Inactive',
    }
  )

  return { id: staffId }
}

async function uploadStaffAvatarFromDataUrl(staffId, { dataUrl } = {}) {
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

  if (parsed.buf.length > 2 * 1024 * 1024) {
    const err = new Error('Avatar too large (max 2MB)')
    err.status = 413
    throw err
  }

  const existing = await query(
    `SELECT TOP 1 s.StaffId, s.UserId
     FROM Staff s
     WHERE s.StaffId = @staffId`,
    { staffId }
  )
  const row = existing.recordset?.[0]
  if (!row?.UserId) {
    const err = new Error('Staff not found')
    err.status = 404
    throw err
  }

  const dir = getAvatarUploadDir()
  await fs.mkdir(dir, { recursive: true })

  const fileName = `u${row.UserId}.${parsed.ext}`
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, parsed.buf)

  await query('UPDATE Users SET AvatarUrl = @avatarUrl WHERE UserId = @userId', {
    userId: row.UserId,
    avatarUrl: fileName,
  })

  return {
    staffId,
    avatarUrl: fileName,
  }
}

module.exports = {
  listStaff,
  listStaffSkillCategories,
  createStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  uploadStaffAvatarFromDataUrl,
}
