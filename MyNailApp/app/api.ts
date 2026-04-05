import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Set `extra.API_BASE` in app.json to your backend base (including /api),
// e.g. "http://192.168.1.10:5000/api". If not set, the code will attempt
// to auto-derive your machine IP from Expo debugger host (development). If
// that fails, it will fall back to localhost.

// Try reading extras from Expo Constants first; if not available (web/dev),
// fall back to reading app.json directly so `extra.API_BASE` works reliably.
let extras = (Constants.expoConfig && Constants.expoConfig.extra) || (Constants.manifest && Constants.manifest.extra) || {}
if (!extras || !extras.API_BASE) {
  try {
    // require app.json at bundle time — works in web and dev
    // @ts-ignore
    const appJson = require('../app.json')
    if (appJson && appJson.expo && appJson.expo.extra) extras = appJson.expo.extra
  } catch {
    // ignore
  }
}

function deriveIpFromDebuggerHost() {
  const debuggerHost = (Constants.manifest && Constants.manifest.debuggerHost) || ''
  if (!debuggerHost) return null
  const parts = String(debuggerHost).split(':')
  return parts[0] || null
}

const autoBase = (() => {
  if (extras.API_BASE) return String(extras.API_BASE)
  const ip = deriveIpFromDebuggerHost()
  // If running in browser, prefer the page hostname as a fallback
  const isWeb = typeof window !== 'undefined' && typeof navigator !== 'undefined'
  if (!ip && isWeb && window.location && window.location.hostname) {
    const host = window.location.hostname
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:5000/api`
    }
  }
  if (ip) return `http://${ip}:5000/api`
  return 'http://localhost:5000/api'
})()

export const API_BASE = String(autoBase)

async function request(path: string, opts: any = {}): Promise<any> {
  const url = String(path).startsWith('http') ? String(path) : `${API_BASE}${String(path).startsWith('/') ? '' : '/'}${path}`
  const token = await AsyncStorage.getItem('@mynailapp:token')
  const defaultHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) defaultHeaders.Authorization = `Bearer ${token}`

  const mergedOpts = { ...(opts || {}), headers: { ...defaultHeaders, ...(((opts || {}).headers) || {}) } }

  const res = await fetch(url, mergedOpts)

  const text = await res.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }

  if (!res.ok) {
    // If unauthorized, clear local auth and trigger redirect to login (best-effort)
    if (res.status === 401) {
      try {
        await AsyncStorage.removeItem('@mynailapp:token')
        await AsyncStorage.removeItem('@mynailapp:user')
      } catch {}
      try {
        // call global navigator set in layout
        // @ts-ignore
        globalThis.navigateToLogin && globalThis.navigateToLogin()
      } catch {}
    }

    const err = new Error((body && (body.message || body.error || body.msg)) || `Request failed ${res.status}`)
    // @ts-ignore
    err.status = res.status
    // @ts-ignore
    err.body = body
    throw err
  }

  return body
}

export function post(path: string, body?: any) {
  return request(path, { method: 'POST', body: JSON.stringify(body) })
}

export function get(path: string) {
  return request(path, { method: 'GET' })
}

export function put(path: string, body?: any) {
  return request(path, { method: 'PUT', body: JSON.stringify(body) })
}

export function del(path: string) {
  return request(path, { method: 'DELETE' })
}

export default { post, get, put, del, API_BASE }
