const { query } = require('../config/query')

const NOTIFY_STATE_KEYS = ['NotifyNewAppt', 'NotifyLowStock', 'NotifyNewReview', 'NotifyDailyReport']

function normalizeCommissionRate(rawRate) {
  const rate = Number(rawRate)
  if (!Number.isFinite(rate) || rate < 0) return 0
  return rate > 1 ? rate / 100 : rate
}

function normalizeCommissionTiersInput(rawTiers) {
  const src = Array.isArray(rawTiers) ? rawTiers : []
  const normalized = src
    .map((t) => ({
      threshold: Number(t?.threshold),
      rate: normalizeCommissionRate(t?.rate),
    }))
    .filter((t) => Number.isFinite(t.threshold) && t.threshold >= 0)
    .sort((a, b) => a.threshold - b.threshold)

  const dedupByThreshold = new Map()
  for (const tier of normalized) {
    dedupByThreshold.set(String(tier.threshold), tier)
  }

  return [...dedupByThreshold.values()].sort((a, b) => a.threshold - b.threshold)
}

async function commissionVersioningTablesReady() {
  const result = await query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME IN ('CommissionPolicies', 'CommissionTiers')`
  )
  const names = new Set((result.recordset || []).map((r) => String(r.TABLE_NAME || '').trim()))
  return names.has('CommissionPolicies') && names.has('CommissionTiers')
}

async function getActiveCommissionPolicySnapshot() {
  const policyRes = await query(
    `SELECT TOP 1
        Id,
        EffectiveFrom,
        EffectiveTo,
        CreatedAt,
        CreatedBy,
        Notes,
        IsActive
     FROM CommissionPolicies
     WHERE IsActive = 1 AND EffectiveTo IS NULL
     ORDER BY EffectiveFrom DESC, Id DESC`
  )

  const policy = policyRes.recordset?.[0]
  if (!policy) {
    return {
      policy: null,
      tiers: [],
    }
  }

  const tiersRes = await query(
    `SELECT Id, PolicyId, MinRevenue, Rate, CreatedAt
     FROM CommissionTiers
     WHERE PolicyId = @policyId
     ORDER BY MinRevenue ASC, Id ASC`,
    { policyId: policy.Id }
  )

  const tiers = (tiersRes.recordset || []).map((row) => ({
    threshold: Number(row.MinRevenue || 0),
    rate: normalizeCommissionRate(row.Rate),
  }))

  return {
    policy,
    tiers,
  }
}

async function createCommissionPolicyVersionFromTiers(rawTiers, { userId } = {}) {
  const tiers = normalizeCommissionTiersInput(rawTiers)
  if (tiers.length === 0) return false

  const now = new Date()
  const createdByNumber = Number(userId)
  const createdBy = Number.isFinite(createdByNumber) ? createdByNumber : null

  const currentPolicyRes = await query(
    `SELECT TOP 1 Id
     FROM CommissionPolicies
     WHERE IsActive = 1 AND EffectiveTo IS NULL
     ORDER BY EffectiveFrom DESC, Id DESC`
  )
  const currentPolicyId = currentPolicyRes.recordset?.[0]?.Id

  if (currentPolicyId) {
    await query(
      `UPDATE CommissionPolicies
       SET EffectiveTo = @now,
           IsActive = 0
       WHERE Id = @policyId`,
      { now, policyId: currentPolicyId }
    )
  }

  const insertPolicyRes = await query(
    `INSERT INTO CommissionPolicies (EffectiveFrom, EffectiveTo, CreatedAt, CreatedBy, Notes, IsActive)
     VALUES (@now, NULL, SYSUTCDATETIME(), @createdBy, @notes, 1);
     SELECT CAST(SCOPE_IDENTITY() AS INT) AS NewPolicyId;`,
    {
      now,
      createdBy,
      notes: 'Updated from Booking Rules settings',
    }
  )

  const newPolicyId = insertPolicyRes.recordset?.[0]?.NewPolicyId
  if (!newPolicyId) return false

  const valuesSql = tiers.map((_, idx) => `(@policyId, @minRevenue${idx}, @rate${idx})`).join(', ')
  const params = { policyId: newPolicyId }
  tiers.forEach((tier, idx) => {
    params[`minRevenue${idx}`] = tier.threshold
    params[`rate${idx}`] = tier.rate
  })

  await query(
    `INSERT INTO CommissionTiers (PolicyId, MinRevenue, Rate)
     VALUES ${valuesSql};`,
    params
  )

  return true
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const s = String(value).trim().toLowerCase()
  if (!s) return fallback
  return ['true', '1', 'yes', 'y', 'on'].includes(s)
}

function toBit(value, fallback = 0) {
  return parseBool(value, Boolean(fallback)) ? 1 : 0
}

async function notificationSettingsTableExists() {
  const result = await query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'NotificationSettings'`,
  )
  return Boolean(result?.recordset?.length)
}

async function getNotificationSettingsByUserId(userId) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return null

  const hasTable = await notificationSettingsTableExists()
  if (!hasTable) return null

  const result = await query(
    `SELECT TOP 1
        UserId,
        EnableNotifications,
        EnableEmail,
        CreatedAt,
        UpdatedAt
     FROM NotificationSettings
     WHERE UserId = @userId
     ORDER BY UpdatedAt DESC, CreatedAt DESC`,
    { userId: safeUserId },
  )

  return result?.recordset?.[0] || null
}

async function upsertNotificationSettingsByUserId({ userId, enableNotifications, enableEmail }) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return

  const hasTable = await notificationSettingsTableExists()
  if (!hasTable) return

  await query(
    `MERGE NotificationSettings AS t
     USING (
       SELECT
         @userId AS UserId,
         @enableNotifications AS EnableNotifications,
         @enableEmail AS EnableEmail
     ) AS s
     ON t.UserId = s.UserId
     WHEN MATCHED THEN
       UPDATE SET
         EnableNotifications = s.EnableNotifications,
         EnableEmail = s.EnableEmail,
         UpdatedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN
       INSERT (UserId, EnableNotifications, EnableEmail, CreatedAt, UpdatedAt)
       VALUES (s.UserId, s.EnableNotifications, s.EnableEmail, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    {
      userId: safeUserId,
      enableNotifications: toBit(enableNotifications, 1),
      enableEmail: toBit(enableEmail, 1),
    },
  )
}

function splitName(fullName) {
  const raw = String(fullName || '').trim()
  if (!raw) return { firstName: '', lastName: '' }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  const firstName = parts[parts.length - 1]
  const lastName = parts.slice(0, -1).join(' ')
  return { firstName, lastName }
}

async function getLatestActiveAdminUser() {
  const result = await query(
    `SELECT TOP 1 UserId, Name, Email, Phone
     FROM Users
     WHERE RoleKey = 1 AND Status = 'ACTIVE'
     ORDER BY CreatedAt DESC`,
  )
  return result?.recordset?.[0] || null
}

async function getSettingsMap({ userId } = {}) {
  const result = await query('SELECT SettingKey, SettingValue FROM SystemSettings')
  const map = {}
  for (const r of result.recordset || []) {
    map[r.SettingKey] = r.SettingValue
  }

  const defaultSettings = {
    SalonOpenTime: '08:00',
    SalonCloseTime: '20:00',
    ScheduleOpenTime: '08:00',
    ScheduleCloseTime: '20:00',
    ScheduleBreakStart: '12:00',
    ScheduleBreakEnd: '13:00',
    ScheduleMonOpenTime: '08:00',
    ScheduleMonCloseTime: '20:00',
    ScheduleTueOpenTime: '08:00',
    ScheduleTueCloseTime: '20:00',
    ScheduleWedOpenTime: '08:00',
    ScheduleWedCloseTime: '20:00',
    ScheduleThuOpenTime: '08:00',
    ScheduleThuCloseTime: '20:00',
    ScheduleFriOpenTime: '08:00',
    ScheduleFriCloseTime: '20:00',
    ScheduleSatOpenTime: '08:00',
    ScheduleSatCloseTime: '20:00',
    ScheduleSunOpenTime: '08:00',
    ScheduleSunCloseTime: '20:00',
    BookingSlotMinutes: '30',
    BookingAdvanceWindowDays: '30',
    BookingCancelHours: '4',
    BookingMaxPerDay: '8',
    BookingRequireDeposit: 'false',
    BookingDepositPercent: '0',
    BookingAllowWalkIn: 'true',
    PromotionEnabled: 'false',
    PromotionIsStackable: 'false',
    PromotionAllowCustomerApply: 'true',
    PromotionTitle: '',
    PromotionCode: '',
    PromotionDiscountPct: '0',
    PromotionStart: '',
    PromotionEnd: '',
    Promotions: '[]',
    CommissionTierLow: '500000',
    CommissionRateLow: '0.10',
    CommissionTierHigh: '2000000',
    CommissionRateHigh: '0.15',
    CommissionTiers: '[]',
    NotifyNewAppt: 'true',
    NotifyLowStock: 'true',
    NotifyNewReview: 'true',
    NotifyDailyReport: 'false',
    NotifyEmail: 'true',
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    if (map[key] === undefined) {
      map[key] = value
    }
  }

  // Fallback for Settings UI: if Owner/Salon contact fields are missing in SystemSettings,
  // derive them from the latest active admin user (RoleKey=1).
  const needsOwner =
    map.OwnerFirstName === undefined ||
    map.OwnerLastName === undefined ||
    map.OwnerEmail === undefined ||
    map.OwnerPhone === undefined

  const needsSalonContact = map.SalonPhone === undefined || map.SalonEmail === undefined

  if (needsOwner || needsSalonContact) {
    const admin = await getLatestActiveAdminUser()
    if (admin) {
      const { firstName, lastName } = splitName(admin.Name)

      if (map.OwnerFirstName === undefined) map.OwnerFirstName = firstName
      if (map.OwnerLastName === undefined) map.OwnerLastName = lastName
      if (map.OwnerEmail === undefined) map.OwnerEmail = admin.Email || ''
      if (map.OwnerPhone === undefined) map.OwnerPhone = admin.Phone || ''

      // Sensible defaults for salon contact in dev/testing.
      if (map.SalonEmail === undefined) map.SalonEmail = admin.Email || ''
      if (map.SalonPhone === undefined) map.SalonPhone = admin.Phone || ''
    }
  }

  if (!map.ScheduleOpenTime) map.ScheduleOpenTime = map.SalonOpenTime || '08:00'
  if (!map.ScheduleCloseTime) map.ScheduleCloseTime = map.SalonCloseTime || '20:00'

  if (typeof map.Promotions === 'string') {
    try {
      const parsed = JSON.parse(map.Promotions)
      map.Promotions = Array.isArray(parsed) ? parsed : []
    } catch (_) {
      map.Promotions = []
    }
  } else if (!Array.isArray(map.Promotions)) {
    map.Promotions = []
  }

  if (typeof map.CommissionTiers === 'string') {
    try {
      const parsed = JSON.parse(map.CommissionTiers)
      map.CommissionTiers = Array.isArray(parsed) ? parsed : []
    } catch (_) {
      map.CommissionTiers = []
    }
  } else if (!Array.isArray(map.CommissionTiers)) {
    map.CommissionTiers = []
  }

  // Commission source priority:
  // 1) CommissionPolicies + CommissionTiers tables (versioned source of truth)
  // 2) Legacy SystemSettings keys (fallback only when versioning tables are absent)
  try {
    const hasCommissionVersioningTables = await commissionVersioningTablesReady()
    if (hasCommissionVersioningTables) {
      const snapshot = await getActiveCommissionPolicySnapshot()
      map.CommissionSource = 'policyTable'
      map.CommissionPolicyId = snapshot.policy?.Id ?? null
      map.CommissionTiers = snapshot.tiers

      if (snapshot.tiers.length > 0) {
        map.CommissionTierLow = snapshot.tiers[0].threshold
        map.CommissionRateLow = snapshot.tiers[0].rate
        map.CommissionTierHigh = snapshot.tiers.length > 1 ? snapshot.tiers[1].threshold : null
        map.CommissionRateHigh = snapshot.tiers.length > 1 ? snapshot.tiers[1].rate : null
      } else {
        map.CommissionTierLow = null
        map.CommissionRateLow = null
        map.CommissionTierHigh = null
        map.CommissionRateHigh = null
      }
    } else {
      map.CommissionSource = 'settings'
    }
  } catch (err) {
    console.error('[settings.service] Commission versioning source error:', err.message)
    map.CommissionSource = 'settings'
  }

  const notificationSettings = await getNotificationSettingsByUserId(userId)
  if (notificationSettings) {
    const enableNotifications = parseBool(notificationSettings.EnableNotifications, true)
    const enableEmail = parseBool(notificationSettings.EnableEmail, true)

    map.NotifyEmail = String(enableEmail)

    if (!enableNotifications) {
      for (const key of NOTIFY_STATE_KEYS) {
        map[key] = 'false'
      }
    }
  }

  return map
}

async function updateSettingsMap(updates, { userId } = {}) {
  const safeUpdates = updates && typeof updates === 'object' ? updates : {}

  const shouldHandleCommissionViaPolicyTable = Object.prototype.hasOwnProperty.call(safeUpdates, 'CommissionTiers')
  if (shouldHandleCommissionViaPolicyTable) {
    try {
      const hasCommissionVersioningTables = await commissionVersioningTablesReady()
      if (hasCommissionVersioningTables) {
        await createCommissionPolicyVersionFromTiers(safeUpdates.CommissionTiers, { userId })
      }
    } catch (err) {
      console.error('[settings.service] Failed to persist CommissionTiers to policy tables:', err.message)
    }
  }

  const sanitizedUpdates = { ...safeUpdates }
  if (shouldHandleCommissionViaPolicyTable) {
    delete sanitizedUpdates.CommissionTiers
    delete sanitizedUpdates.CommissionTierLow
    delete sanitizedUpdates.CommissionRateLow
    delete sanitizedUpdates.CommissionTierHigh
    delete sanitizedUpdates.CommissionRateHigh
  }

  for (const [key, value] of Object.entries(sanitizedUpdates || {})) {
    await query(
      `MERGE SystemSettings AS t
       USING (SELECT @k AS SettingKey, @v AS SettingValue) AS s
       ON t.SettingKey = s.SettingKey
       WHEN MATCHED THEN UPDATE SET SettingValue = s.SettingValue
       WHEN NOT MATCHED THEN INSERT (SettingKey, SettingValue) VALUES (s.SettingKey, s.SettingValue);`,
      {
        k: key,
        v:
          value === undefined || value === null
            ? null
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value),
      }
    )
  }

  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return

  const touchedNotificationSettings =
    Object.prototype.hasOwnProperty.call(safeUpdates, 'NotifyEmail') ||
    NOTIFY_STATE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(safeUpdates, key))

  if (!touchedNotificationSettings) return

  const keysToRead = ['NotifyEmail', ...NOTIFY_STATE_KEYS]
  const dbSettingsRes = await query(
    `SELECT SettingKey, SettingValue
     FROM SystemSettings
     WHERE SettingKey IN ('NotifyEmail', 'NotifyNewAppt', 'NotifyLowStock', 'NotifyNewReview', 'NotifyDailyReport')`,
  )
  const dbSettings = {}
  for (const row of dbSettingsRes.recordset || []) {
    dbSettings[row.SettingKey] = row.SettingValue
  }

  const effective = {}
  for (const key of keysToRead) {
    if (Object.prototype.hasOwnProperty.call(safeUpdates, key)) {
      effective[key] = safeUpdates[key]
    } else {
      effective[key] = dbSettings[key]
    }
  }

  const enableNotifications = NOTIFY_STATE_KEYS.some((key) => parseBool(effective[key], false))
  const enableEmail = parseBool(effective.NotifyEmail, true)

  await upsertNotificationSettingsByUserId({
    userId: safeUserId,
    enableNotifications,
    enableEmail,
  })
}

module.exports = {
  getSettingsMap,
  updateSettingsMap,
}
