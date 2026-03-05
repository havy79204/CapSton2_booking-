const { z } = require('zod')
const msgService = require('../services/messagesService')

async function listThreads(req, res, next) {
  try {
    const salonId = req.query.salonId ? String(req.query.salonId) : null
    if (!salonId) return res.status(400).json({ error: 'salonId is required' })
    const items = await msgService.listThreads(salonId)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function createThread(req, res, next) {
  try {
    const body = z
      .object({ salonId: z.string().min(1), customerId: z.string().nullable().optional(), customerName: z.string().optional(), customerEmail: z.string().optional() })
      .parse(req.body)

    const item = await msgService.createThread(body)
    res.status(201).json({ item })
  } catch (err) {
    next(err)
  }
}

async function listMessages(req, res, next) {
  try {
    const threadId = String(req.params.id || '').trim()
    const items = await msgService.listMessages(threadId)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function postMessage(req, res, next) {
  try {
    const threadId = String(req.params.id || '').trim()
    const body = z.object({ fromRole: z.string().min(1), fromName: z.string().optional(), text: z.string().min(1) }).parse(req.body)
    const item = await msgService.postMessage(threadId, body)
    res.status(201).json({ item })
  } catch (err) {
    next(err)
  }
}

module.exports = { listThreads, createThread, listMessages, postMessage }
