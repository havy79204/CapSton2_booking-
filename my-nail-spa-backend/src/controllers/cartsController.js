const cartService = require('../services/cartService')

async function getCart(req, res, next) {
  try {
    const id = String(req.params.id || '')
    const cart = await cartService.getCart(id)
    if (!cart) return res.status(404).json({ error: 'Not found' })
    const items = await cartService.getItems(id)
    res.json({ cart, items })
  } catch (err) {
    next(err)
  }
}

async function upsertCart(req, res, next) {
  try {
    const body = req.body || {}
    const cartId = body.cartId || undefined
    const id = await cartService.upsertCart(cartId || undefined, {
      userId: body.userId || null,
      customerEmail: body.customerEmail || null,
      status: body.status || null,
    })
    const cart = await cartService.getCart(id?.CartId || id?.cartId || (body.cartId || id))
    try {
      const opts = { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'Lax', secure: false, path: '/' }
      res.cookie('serverCartId', body.cartId || id, opts)
    } catch (err) {
      // ignore cookie errors
    }
    res.status(201).json({ cart })
  } catch (err) {
    next(err)
  }
}

async function getItems(req, res, next) {
  try {
    const cartId = String(req.params.id || '')
    const items = await cartService.getItems(cartId)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function addItem(req, res, next) {
  try {
    const cartId = String(req.params.id || '')
    const body = req.body || {}
    const items = await cartService.addItem(cartId, body.productId, body.qty || 1)
    res.status(201).json({ items })
  } catch (err) {
    next(err)
  }
}

async function deleteItem(req, res, next) {
  try {
    const itemId = Number(req.params.itemId)
    await cartService.removeItem(itemId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

module.exports = { getCart, upsertCart, getItems, addItem, deleteItem }
