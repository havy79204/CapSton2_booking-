const { z } = require('zod')
const service = require('../services/timeService')

function assertCanAccessStaff(req, staffId) {
  const role = req.user?.role
  if (role === 'admin') return
  if (String(req.user?.id || '') !== String(staffId || '')) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
}

async function getLogs(req, res, next) {
  try {
    const staffId = req.query.staffId ? String(req.query.staffId).trim() : String(req.user.id)
    assertCanAccessStaff(req, staffId)
    const limit = Number(req.query.limit || 5000)
    const items = await service.listTimeLogs(staffId, limit)
    res.json({ items })
  } catch (err) { next(err) }
}

async function postLog(req, res, next) {
  try {
    const body = z
      .object({ staffId: z.string().optional(), type: z.enum(['in', 'out']), at: z.string().optional(), note: z.string().optional() })
      .parse(req.body)

    const staffId = body.staffId ? String(body.staffId).trim() : String(req.user.id)
    assertCanAccessStaff(req, staffId)

    const at = body.at ? new Date(body.at) : new Date()
    if (Number.isNaN(at.getTime())) return res.status(400).json({ error: 'Invalid at' })

    const created = await service.createTimeLog({ staffId, type: body.type, at: at.toISOString(), note: body.note || null })
    res.status(201).json({ item: created })
  } catch (err) { next(err) }
}

async function getTips(req, res, next) {
  try {
    const staffId = req.query.staffId ? String(req.query.staffId).trim() : String(req.user.id)
    assertCanAccessStaff(req, staffId)
    const items = await service.listTipLogs(staffId)
    res.json({ items })
  } catch (err) { next(err) }
}

async function postTip(req, res, next) {
  try {
    const body = z.object({ staffId: z.string().optional(), amount: z.number().positive(), at: z.string().optional() }).parse(req.body)
    const staffId = body.staffId ? String(body.staffId).trim() : String(req.user.id)
    assertCanAccessStaff(req, staffId)
    const at = body.at ? new Date(body.at) : new Date()
    if (Number.isNaN(at.getTime())) return res.status(400).json({ error: 'Invalid at' })
    const created = await service.createTipLog({ staffId, amount: body.amount, at: at.toISOString() })
    res.status(201).json({ item: created })
  } catch (err) { next(err) }
}

module.exports = { getLogs, postLog, getTips, postTip }
