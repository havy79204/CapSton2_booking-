const { getPool, sql } = require('./db')

async function query(text, bind = {}) {
  const pool = await getPool()
  const req = pool.request()
  for (const [key, value] of Object.entries(bind || {})) {
    req.input(key, value)
  }
  const result = await req.query(text)
  return result
}

function nowUtcIso() {
  return new Date().toISOString()
}

function newId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

module.exports = { query, sql, nowUtcIso, newId }
