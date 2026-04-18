const SENSITIVE_KEYS = new Set([
  'UserId',
  'userId',
  'CustomerUserId',
  'customerUserId',
  'SenderUserId',
  'senderUserId',
  'Password',
  'password',
  'PasswordHash',
  'passwordHash',
  'Salt',
  'salt',
  'Token',
  'token',
  'AccessToken',
  'accessToken',
  'RefreshToken',
  'refreshToken',
  'Email',
  'email',
  'Phone',
  'phone',
  'PhoneNumber',
  'phoneNumber',
  'senderId',
])

const SENSITIVE_PATTERNS = [
  /email/i,
  /phone/i,
  /password/i,
  /token/i,
  /secret/i,
  /hash/i,
  /salt/i,
]

function isSensitiveKey(key) {
  if (SENSITIVE_KEYS.has(key)) return true

  const lowered = String(key || '').toLowerCase()
  if (
    lowered === 'userid'
    || lowered === 'customeruserid'
    || lowered === 'senderid'
    || lowered === 'senderuserid'
  ) {
    return true
  }

  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))
}

function sanitizeCustomerResponse(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeCustomerResponse)
  }

  if (value && typeof value === 'object') {
    const output = {}
    for (const [key, raw] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue
      output[key] = sanitizeCustomerResponse(raw)
    }
    return output
  }

  return value
}

module.exports = {
  sanitizeCustomerResponse,
}
