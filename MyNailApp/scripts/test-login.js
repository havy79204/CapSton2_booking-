#!/usr/bin/env node
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

function loadApiBase() {
  const env = process.env.API_BASE
  if (env) return env
  try {
    const appJson = require(path.join(__dirname, '..', 'app.json'))
    if (appJson && appJson.expo && appJson.expo.extra && appJson.expo.extra.API_BASE) {
      return String(appJson.expo.extra.API_BASE)
    }
  } catch (e) {
    // ignore
  }
  return 'http://localhost:5000/api'
}

function postJson(urlString, body) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlString)
      const data = JSON.stringify(body || {})
      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }
      const client = url.protocol === 'https:' ? https : http
      const req = client.request(opts, (res) => {
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (buf += chunk))
        res.on('end', () => {
          let parsed = null
          try { parsed = JSON.parse(buf) } catch { parsed = buf }
          resolve({ status: res.statusCode, body: parsed })
        })
      })
      req.on('error', (err) => reject(err))
      req.write(data)
      req.end()
    } catch (err) { reject(err) }
  })
}

async function main() {
  const apiBase = loadApiBase()
  console.log('[test-login] Using API_BASE =', apiBase)

  try {
    const quick = await postJson(`${apiBase.replace(/\/$/, '')}/auth/quick-login`, { roleId: 3 })
    console.log('[test-login] quick-login response status:', quick.status)
    console.log('[test-login] quick-login body:', JSON.stringify(quick.body, null, 2))
  } catch (err) {
    console.error('[test-login] quick-login error:', err.message || err)
  }

  // Optionally test regular login if provided via env
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (email && password) {
    try {
      const res = await postJson(`${apiBase.replace(/\/$/, '')}/auth/login`, { email, password })
      console.log('[test-login] login response status:', res.status)
      console.log('[test-login] login body:', JSON.stringify(res.body, null, 2))
    } catch (err) {
      console.error('[test-login] login error:', err.message || err)
    }
  } else {
    console.log('[test-login] Regular login skipped (set TEST_EMAIL and TEST_PASSWORD env vars to run)')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
