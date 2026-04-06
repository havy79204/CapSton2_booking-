import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
let extras: any = {}
try {
  // require app.json at bundle time — works in web and dev
  // @ts-ignore
  const appJson = require('../app.json')
  if (appJson && appJson.expo && appJson.expo.extra) extras = appJson.expo.extra
} catch {
  // ignore
}

// If on-disk app.json didn't provide extras, fall back to Expo runtime manifest
if ((!extras || !extras.API_BASE) && (Constants.expoConfig || Constants.manifest)) {
  extras = (Constants.expoConfig && Constants.expoConfig.extra) || (Constants.manifest && Constants.manifest.extra) || extras || {}
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

// DEBUG: show resolved API config at runtime to help diagnose which source is used
try {
  const dbgHost = (Constants.manifest && Constants.manifest.debuggerHost) || ''
  // eslint-disable-next-line no-console
  console.log('[apiClient] extras:', extras, 'debuggerHost:', dbgHost, 'resolved API_BASE:', API_BASE)
} catch (e) {
  // ignore
}

async function request(path: string, opts: any = {}): Promise<any> {
  const url = String(path).startsWith('http') ? String(path) : `${API_BASE}${String(path).startsWith('/') ? '' : '/'}${path}`
  const token = await AsyncStorage.getItem('@mynailapp:token')
  const defaultHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) defaultHeaders.Authorization = `Bearer ${token}`

  const mergedOpts = { ...(opts || {}), headers: { ...defaultHeaders, ...(((opts || {}).headers) || {}) } }

  const res = await fetch(url, mergedOpts)

  if (res.status === 304) {
    return { notModified: true }
  }

  const text = await res.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }

  if (!res.ok) {
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
