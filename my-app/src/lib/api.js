import { getToken } from './auth.js'

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

// Enable API debug logs only when explicitly requested.
const API_DEBUG = String(import.meta.env.VITE_API_DEBUG || '').toLowerCase() === 'true'

function normalizeBaseUrl(base) {
  return String(base || '').replace(/\/+$/, '')
}

const API_BASE_URL = normalizeBaseUrl(RAW_BASE)

export function resolveApiImageUrl(rawPath) {
  if (rawPath === undefined || rawPath === null) return ''

  const value = String(rawPath).trim()
  if (!value) return ''

  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) {
    return value
  }

  const normalized = value.replace(/\\/g, '/')
  const publicMarker = '/my-app/public/'
  const publicMarkerIndex = normalized.toLowerCase().indexOf(publicMarker)

  if (publicMarkerIndex >= 0) {
    const relative = normalized.slice(publicMarkerIndex + publicMarker.length).replace(/^\/+/, '')
    return `/${relative}`
  }

  if (normalized.startsWith('/uploads/') || normalized.startsWith('uploads/')) {
    const path = normalized.startsWith('/') ? normalized : `/${normalized}`
    return `${API_BASE_URL}${path}`
  }

  if (/\.(png|jpe?g|webp|gif)$/i.test(normalized) && !normalized.includes('/')) {
    return `${API_BASE_URL}/uploads/avatars/${normalized}`
  }

  if (normalized.startsWith('/')) {
    return normalized
  }

  return `/${normalized}`
}

function buildUrl(path) {
  const p = String(path || '')
  if (!p) return API_BASE_URL
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  return `${API_BASE_URL}${p.startsWith('/') ? '' : '/'}${p}`
}

function isOwnerMutation(path, method) {
  const m = String(method || '').toUpperCase()
  if (m !== 'POST' && m !== 'PUT' && m !== 'DELETE') return false
  const p = String(path || '')
  if (!p.includes('/api/owner/')) return false
  if (p.includes('/api/owner/chat/')) return false
  return true
}

function emitPortalToast({ type, message, timeoutMs }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('portal:toast', {
      detail: {
        type,
        message,
        timeoutMs,
      },
    })
  )
}

export function showPortalToast({ type = 'success', message = '', timeoutMs }) {
  emitPortalToast({ type, message, timeoutMs })
}

async function request(path, options) {
  const method = String(options?.method || 'GET').toUpperCase()
  const token = getToken()
  const url = buildUrl(path)

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  })

  const text = await res.text()
  let json = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }

  if (!res.ok) {
    const fallbackText = text ? String(text).trim() : ''
    const message = json?.error || json?.message || fallbackText || res.statusText
    // If unauthorized, notify the app so it can decide how to handle re-authentication.
    if (res.status === 401) {
      try {
        emitPortalToast({ type: 'error', message: json?.message || 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', timeoutMs: 4000 })
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('portal:auth-required', { detail: { path, status: 401, message: json?.message || null } }))
        }
      } catch (e) {
        void e;
      }
    }
    if (isOwnerMutation(path, method)) {
      emitPortalToast({ type: 'error', message: message || 'Sorry, something went wrong. Please try again.' })
    }
    const err = new Error(message)
    err.status = res.status
    err.body = json
    err.raw = text
    throw err
  }

  if (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data')) {
    if (API_DEBUG) console.log('[DEBUG API] Extracted `data` from response:', path)
    return json.data
  }
  if (API_DEBUG) console.log('[DEBUG API] Returned raw response:', path)
  return json
}

export const api = {
  get: (path, options = {}) => request(path, { method: 'GET', ...(options || {}) }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  // Cho phép DELETE nhận body tương tự POST/PUT
  delete: (path, body) => request(path, { 
    method: 'DELETE', 
    body: body ? JSON.stringify(body) : undefined 
  }),
  del: (path, body) => request(path, { 
    method: 'DELETE', 
    body: body ? JSON.stringify(body) : undefined 
  }),
}
