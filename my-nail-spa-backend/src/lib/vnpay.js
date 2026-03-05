const crypto = require('crypto')

function formatVnpTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${y}${m}${d}${hh}${mm}${ss}`
}

function toSortedParams(obj = {}) {
  const sorted = {}
  Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .sort()
    .forEach((k) => {
      sorted[k] = encodeURIComponent(String(obj[k])).replace(/%20/g, '+')
    })
  return sorted
}

function stringifyParams(params = {}) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

function signParams(params = {}, secret) {
  const sorted = toSortedParams(params)
  const signData = stringifyParams(sorted)
  const hmac = crypto.createHmac('sha512', secret)
  return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')
}

function buildVnpayPaymentUrl({
  amount,
  orderId,
  paymentId,
  ipAddr,
  bankCode,
  locale = 'vn',
  currency = 'VND',
  tmnCode,
  hashSecret,
  vnpUrl,
  returnUrl,
  orderInfo,
} = {}) {
  const now = new Date()
  const createDate = formatVnpTimestamp(now)
  const vnpTxnRef = paymentId || orderId

  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: locale || 'vn',
    vnp_CurrCode: currency || 'VND',
    vnp_TxnRef: vnpTxnRef,
    vnp_OrderInfo: orderInfo || `Pay order ${orderId}`,
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(amount * 100),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '0.0.0.0',
    vnp_CreateDate: createDate,
  }

  if (bankCode) params.vnp_BankCode = bankCode

  const secureHash = signParams(params, hashSecret)
  const sorted = toSortedParams(params)
  sorted.vnp_SecureHash = secureHash

  const query = stringifyParams(sorted)
  const url = `${vnpUrl}?${query}`
  return { url, params, secureHash }
}

function verifyVnpaySignature(queryParams = {}, hashSecret) {
  const params = { ...queryParams }
  const receivedHash = params.vnp_SecureHash
  delete params.vnp_SecureHash
  delete params.vnp_SecureHashType

  const expectedHash = signParams(params, hashSecret)
  const isValid = String(receivedHash || '').toLowerCase() === String(expectedHash).toLowerCase()
  return { isValid, expectedHash, receivedHash }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim()
  }
  return (req.connection && req.connection.remoteAddress) || req.socket?.remoteAddress || req.ip || ''
}

module.exports = {
  buildVnpayPaymentUrl,
  verifyVnpaySignature,
  formatVnpTimestamp,
  getClientIp,
}
