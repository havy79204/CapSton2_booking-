import { getToken } from './auth.js'

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

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
  const json = text ? JSON.parse(text) : null

  if (!res.ok) {
    const message = json?.error || json?.message || res.statusText
    if (isOwnerMutation(path, method)) {
      emitPortalToast({ type: 'error', message: message || 'Sorry, something went wrong. Please try again.' })
    }
    const err = new Error(message)
    err.status = res.status
    err.body = json
    throw err
  }

  if (isOwnerMutation(path, method)) {
    emitPortalToast({ type: 'success', message: 'Operation updated successfully.' })
  }

  if (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data')) {
    return json.data
  }

  return json
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  del: (path) => request(path, { method: 'DELETE' }),
}
