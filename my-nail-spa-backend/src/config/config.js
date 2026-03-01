const dotenv = require('dotenv')
const crypto = require('crypto')
const path = require('path')

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

function required(name) {
  const value = process.env[name]
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function asBool(value, defaultValue) {
  if (value === undefined) return defaultValue
  const v = String(value).trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return defaultValue
}

function asInt(value, defaultValue) {
  if (value === undefined) return defaultValue
  const n = Number(value)
  return Number.isFinite(n) ? n : defaultValue
}

function parseDbServer(input) {
  const raw = String(input || '').trim()
  if (!raw) return { server: '', instanceName: undefined }
  if (raw.includes('\\')) {
    const [server, instanceName] = raw.split('\\')
    return { server: server || '', instanceName: instanceName || undefined }
  }
  return { server: raw, instanceName: undefined }
}

const parsedServer = parseDbServer(process.env.DB_SERVER)

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: asInt(process.env.PORT, 5000),

  web: {
    frontendUrl: process.env.FRONTEND_URL ? String(process.env.FRONTEND_URL).trim() : '',
  },

  db: {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  encrypt: process.env.DB_ENCRYPT === 'true', // Trả về true (boolean) nếu là chuỗi 'true'
  trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
  tlsMinVersion: process.env.DB_TLS_MIN_VERSION ? String(process.env.DB_TLS_MIN_VERSION).trim() : '',
  tlsCiphers: process.env.DB_TLS_CIPHERS ? String(process.env.DB_TLS_CIPHERS).trim() : ''
},

  auth: {
    jwtSecret:
      process.env.JWT_SECRET ||
      (String(process.env.NODE_ENV || 'development').toLowerCase() === 'production'
        ? required('JWT_SECRET')
        : (() => {
            console.warn(
              'Warning: JWT_SECRET is not set. Using a temporary dev secret (sessions will reset on restart).',
            )
            return crypto.randomBytes(32).toString('hex')
          })()),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  smtp: {
    host: process.env.SMTP_HOST ? String(process.env.SMTP_HOST).trim() : process.env.SMTP_HOST,
    port: asInt(process.env.SMTP_PORT, 465),
    secure: asBool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER ? String(process.env.SMTP_USER).trim() : process.env.SMTP_USER,
    pass: process.env.SMTP_PASS ? String(process.env.SMTP_PASS).replace(/\s+/g, '') : process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'no-reply@example.com',
  },

  vnpay: {
    enabled: Boolean(process.env.VNPAY_TMN_CODE && process.env.VNPAY_HASH_SECRET),
    tmnCode: process.env.VNPAY_TMN_CODE ? String(process.env.VNPAY_TMN_CODE).trim() : '',
    hashSecret: process.env.VNPAY_HASH_SECRET ? String(process.env.VNPAY_HASH_SECRET).trim() : '',
    url: process.env.VNPAY_URL ? String(process.env.VNPAY_URL).trim() : 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    api: process.env.VNPAY_API ? String(process.env.VNPAY_API).trim() : 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    returnUrl: process.env.VNPAY_RETURN_URL ? String(process.env.VNPAY_RETURN_URL).trim() : '',
    frontendReturnUrl: process.env.VNPAY_FRONTEND_RETURN_URL ? String(process.env.VNPAY_FRONTEND_RETURN_URL).trim() : '',
    locale: process.env.VNPAY_LOCALE ? String(process.env.VNPAY_LOCALE).trim() : 'vn',
    currency: process.env.VNPAY_CURRENCY ? String(process.env.VNPAY_CURRENCY).trim() : 'VND',
  },
}

module.exports = { env }
