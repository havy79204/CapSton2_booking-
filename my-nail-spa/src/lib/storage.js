const prefix = 'NIOM&CE:'

export const NIOMCE_STORAGE_EVENT = 'niom-ce:storage'

function emitChange(key) {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(NIOMCE_STORAGE_EVENT, { detail: { key } }))
  } catch {
    // no-op
  }
}

export function onNIOMCEStorageChange(handler) {
  try {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener(NIOMCE_STORAGE_EVENT, handler)
    return () => window.removeEventListener(NIOMCE_STORAGE_EVENT, handler)
  } catch {
    return () => {}
  }
}

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(prefix + key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveJson(key, value) {
  localStorage.setItem(prefix + key, JSON.stringify(value))
  emitChange(key)
}
