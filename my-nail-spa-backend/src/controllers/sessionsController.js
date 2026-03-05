const sessionsService = require('../services/sessionsService')

async function listUserSessions(req, res, next) {
  try {
    const userId = String(req.params.userId || '')
    const r = await sessionsService.listUserSessions(userId)
    res.json({ items: r.recordset })
  } catch (err) {
    next(err)
  }
}

async function createSession(req, res, next) {
  try {
    const r = await sessionsService.createSession(req.body)
    res.status(201).json({ item: r.recordset[0] })
  } catch (err) {
    next(err)
  }
}

async function deleteSession(req, res, next) {
  try {
    const id = String(req.params.id || '')
    await sessionsService.removeSession(id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

module.exports = { listUserSessions, createSession, deleteSession }
