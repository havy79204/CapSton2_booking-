const map = new Map()

function now() { return Date.now() }

function get(key) {
  const e = map.get(key)
  if (!e) return undefined
  if (e.expiresAt && e.expiresAt < now()) {
    map.delete(key)
    return undefined
  }
  return e.value
}

function set(key, value, ttlMs = 300000) {
  const expiresAt = ttlMs > 0 ? now() + ttlMs : null
  map.set(key, { value, expiresAt })
}

async function getOrSet(key, ttlSeconds, factory) {
  const v = get(key)
  if (typeof v !== 'undefined') return v
  const val = await factory()
  set(key, val, (Number(ttlSeconds) || 300) * 1000)
  return val
}

function del(key) { map.delete(key) }

function clear() { map.clear() }

module.exports = { get, set, getOrSet, del, clear }
