const { z } = require('zod')
const svc = require('../services/notificationsService')

async function getSettings(req, res, next) {
  try {
    const settings = await svc.getUserSettings(req.user?.id)
    res.json({ settings })
  } catch (err) { next(err) }
}

async function putSettings(req, res, next) {
  try {
    const body = z.object({ enableNotifications: z.boolean(), enableEmail: z.boolean() }).parse(req.body)
    const settings = await svc.upsertSettings(req.user?.id, body)
    res.json({ settings })
  } catch (err) { next(err) }
}

async function listNotifications(req, res, next) {
  try {
    const items = await svc.listNotifications(req.user?.id)
    res.json({ items })
  } catch (err) { next(err) }
}

async function postNotification(req, res, next) {
  try {
    const body = req.body || {}
    const id = await svc.createNotification(body)
    res.status(201).json({ id })
  } catch (err) { next(err) }
}

async function patchMarkRead(req, res, next) {
  try {
    const parsed = z.object({ ids: z.array(z.string()).min(1) }).safeParse(req.body)
    const ids = parsed.success ? parsed.data.ids : (req.body && req.body.ids) || []
    await svc.markRead(Array.isArray(ids) ? ids : [])
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = {
  getSettings,
  putSettings,
  listNotifications,
  postNotification,
  patchMarkRead,
  // compatibility
  markRead: patchMarkRead,
}
