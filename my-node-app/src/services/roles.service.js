const { query } = require('../config/query')

async function detectRoleKey(preferredKeys) {
  try {
    const result = await query('SELECT RoleKey FROM Roles')
    const existing = new Set((result.recordset || []).map((r) => String(r.RoleKey).toLowerCase()))
    for (const k of preferredKeys || []) {
      if (existing.has(String(k).toLowerCase())) return k
    }
  } catch {
    // ignore
  }
  return null
}

module.exports = {
  detectRoleKey,
}
