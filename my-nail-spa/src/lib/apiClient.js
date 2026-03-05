function getBaseUrl() {
  // Prefer Vite env, but default to dev proxy path.
  // If you configure Vite proxy, baseUrl can simply be '' and use '/api'.
  const raw = import.meta.env?.VITE_API_URL || ''
  // Guard against accidentally including '/api' in VITE_API_URL which would
  // produce double paths like '/api/api/users'. Strip the suffix while keeping
  // any host/port portion intact.
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.toLowerCase().endsWith('/api') ? trimmed.slice(0, -4) : trimmed
}

function getAuthToken() {
  try {
    const raw = localStorage.getItem('NIOM&CE:auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.token || null
  } catch {
    return null
  }
}

export async function apiFetch(path, options = {}) {
  const baseUrl = getBaseUrl()
  const url = `${baseUrl}${path}`

  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')

  const token = getAuthToken()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  // include credentials so cookies (serverCartId) are sent and accepted
  const fetchOpts = { ...options, headers, credentials: 'include' }
  const res = await fetch(url, fetchOpts)

  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const message = (data && typeof data === 'object' && data.error) ? data.error : `Request failed: ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}
