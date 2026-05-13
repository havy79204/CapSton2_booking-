const TOKEN_KEY = 'cap2_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token) {
  try {
    if (!token) {
      localStorage.removeItem(TOKEN_KEY)
      return
    }
    localStorage.setItem(TOKEN_KEY, String(token))
  } catch {
    // ignore
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = typeof atob === 'function' ? atob(padded) : ''
    return JSON.parse(json)
  } catch {
    return null
  }
}

function normalizeRoleKey(value) {
  if (value === undefined || value === null) return NaN

  const num = Number(value)
  if (Number.isFinite(num)) {
    const asInt = Math.trunc(num)
    if ([1, 2, 3].includes(asInt)) return asInt
  }

  const text = String(value).trim().toLowerCase()
  if (text === '1' || text === 'admin' || text === 'owner') return 1
  if (text === '2' || text === 'staff') return 2
  if (text === '3' || text === 'customer') return 3

  return NaN
}

export function getRoleKeyFromToken(token = '') {
  const payload = decodeJwtPayload(token)
  if (!payload) return NaN
  return normalizeRoleKey(payload.roleKey || payload.role || payload.RoleKey || payload.Role)
}
