const { getPool, sql } = require('./db')

async function query(text, bind = {}) {
  try {
    const pool = await getPool()
    const req = pool.request()
    for (const [key, value] of Object.entries(bind || {})) {
      req.input(key, value)
    }
    const result = await req.query(text)
    return result
  } catch (err) {
    console.error('Database query error:', {
      error: err?.message,
      code: err?.code,
      sqlMessage: err?.originalError?.message,
      query: text.substring(0, 100),
    })
    throw err
  }
}

function nowUtcIso() {
  return new Date().toISOString()
}

function newId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

module.exports = { query, sql, nowUtcIso, newId }
