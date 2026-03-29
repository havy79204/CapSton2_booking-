const { query } = require('../config/query')

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

async function getSettingsMap() {
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
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    if (map[key] === undefined || map[key] === null) {
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

  return map
}

async function updateSettingsMap(updates) {
  for (const [key, value] of Object.entries(updates || {})) {
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
}

module.exports = {
  getSettingsMap,
  updateSettingsMap,
}
