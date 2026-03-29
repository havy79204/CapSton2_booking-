const fs = require('fs')
const path = require('path')

const QUOTA_FILE = path.join(__dirname, '..', '.ai_quota.json')
const FREE_LIMIT = Number(process.env.FREE_TIER_LIMIT || process.env.GEMINI_FREE_LIMIT || 1000)

function loadQuota() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return { period: currentPeriod(), count: 0, suspended: false }
    const txt = fs.readFileSync(QUOTA_FILE, 'utf8')
    return JSON.parse(txt || '{}')
  } catch (e) {
    return { period: currentPeriod(), count: 0, suspended: false }
  }
}

function saveQuota(q) {
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(q, null, 2), 'utf8')
  } catch (e) {
    // ignore
  }
}

function currentPeriod() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function getQuota() {
  const q = loadQuota()
  if (q.period !== currentPeriod()) {
    q.period = currentPeriod()
    q.count = 0
    q.suspended = false
    saveQuota(q)
  }
  return q
}

async function increment(by = 1) {
  const q = await getQuota()
  q.count = (q.count || 0) + Number(by || 1)
  if (q.count >= FREE_LIMIT) q.suspended = true
  saveQuota(q)
  return q
}

async function isSuspended() {
  const q = await getQuota()
  return Boolean(q.suspended)
}

function quotaStatusString(q) {
  return `period=${q.period} count=${q.count}/${FREE_LIMIT} suspended=${q.suspended}`
}

async function guard(fn, opts = {}) {
  // opts: {cost: 1}
  const cost = Number(opts.cost || 1)
  const q = await getQuota()
  if (q.suspended) {
    const err = new Error('AI quota suspended')
    err.code = 'QUOTA_EXCEEDED'
    err.quota = q
    throw err
  }

  const res = await fn()

  // increment only on success
  await increment(cost)
  return res
}

module.exports = {
  getQuota,
  increment,
  isSuspended,
  guard,
  quotaStatusString,
  FREE_LIMIT,
}
