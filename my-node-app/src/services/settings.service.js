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
      { k: key, v: value === undefined || value === null ? null : String(value) }
    )
  }
}

module.exports = {
  getSettingsMap,
  updateSettingsMap,
}
