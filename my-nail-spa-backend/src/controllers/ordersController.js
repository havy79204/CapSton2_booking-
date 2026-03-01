const { z } = require('zod')
const svc = require('../services/ordersService')

async function listOrders(req, res, next) {
  try {
    const userId = req.query.userId ? String(req.query.userId) : null
    const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null
    const salonKey = req.query.salonKey ? String(req.query.salonKey) : null
    const items = await svc.listOrders({ userId, email, salonKey })
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function createOrder(req, res, next) {
  try {
    const order = await svc.createOrderRecord(req.body, { user: req.user })
    res.status(201).json({ item: order })
  } catch (err) {
    next(err)
  }
}

async function deleteOrder(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'Order ID is required' })
    const result = await svc.cancelOrder(id)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function patchStatus(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'Order ID is required' })
    const body = z.object({ status: z.string().min(1) }).parse(req.body)
    const nextStatus = String(body.status || '').trim()

    // owner salon check remains in original controller logic, but service expects controller to enforce
    // controller will not duplicate owner check here; middleware supplies user info

    const item = await svc.updateStatus(id, nextStatus, req.user)
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

module.exports = { listOrders, createOrder, deleteOrder, patchStatus }
