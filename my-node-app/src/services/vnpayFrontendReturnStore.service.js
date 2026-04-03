const STORE_TTL_MS = 2 * 60 * 60 * 1000
const pendingFrontendOrigins = new Map()

function normalizeFrontendOrigin(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''

  try {
    const u = new URL(value)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return `${u.protocol}//${u.host}`
  } catch (_err) {
    return ''
  }
}

function cleanupExpired() {
  const now = Date.now()
  for (const [key, value] of pendingFrontendOrigins.entries()) {
    if (!value || !value.expiresAt || value.expiresAt <= now) {
      pendingFrontendOrigins.delete(key)
    }
  }
}

function setFrontendOriginForTxnRef(txnRefInput, rawOrigin) {
  cleanupExpired()

  const txnRef = String(txnRefInput || '').trim()
  if (!txnRef) return

  const normalizedOrigin = normalizeFrontendOrigin(rawOrigin)
  if (!normalizedOrigin) return

  pendingFrontendOrigins.set(txnRef, {
    origin: normalizedOrigin,
    expiresAt: Date.now() + STORE_TTL_MS,
  })
}

function getFrontendOriginForTxnRef(txnRefInput) {
  cleanupExpired()

  const txnRef = String(txnRefInput || '').trim()
  if (!txnRef) return ''

  const record = pendingFrontendOrigins.get(txnRef)
  return record?.origin || ''
}

module.exports = {
  normalizeFrontendOrigin,
  setFrontendOriginForTxnRef,
  getFrontendOriginForTxnRef,
}
