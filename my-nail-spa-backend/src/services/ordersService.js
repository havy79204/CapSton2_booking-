const { newId, query } = require('../config/query')
const repo = require('../repositories/ordersRepository')
const giftSvc = require('./giftcardService')

const { z } = require('zod')

const orderInputSchema = z.object({
  salonKey: z.string().default('mixed'),
  salonId: z.string().nullable().optional(),

  customerUserId: z.string().nullable().optional(),
  customerEmail: z.string().optional(),
  customer: z
    .object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),

  items: z
    .array(
      z.object({
        productId: z.string().nullable().optional(),
        name: z.string().min(1),
        price: z.number().nonnegative(),
        qty: z.number().positive(),
      }),
    )
    .min(1),

  totals: z.object({ subtotal: z.number().nonnegative(), tax: z.number().nonnegative(), total: z.number().nonnegative() }),
  paymentMethod: z.string().optional(),
  status: z.string().optional(),
  channel: z.string().optional(),
  giftCode: z.string().optional(),
})

function normSku(s) {
  return String(s || '').trim().replace(/\s+/g, '-').toUpperCase()
}

async function createOrderRecord(rawInput = {}, opts = {}) {
  const body = orderInputSchema.parse(rawInput)
  const options = {
    skipInventory: Boolean(opts.skipInventory),
    statusOverride: opts.statusOverride,
    paymentMethodOverride: opts.paymentMethod,
  }

  if (await repo.hasProductsSkuColumn()) {
    const requested = new Map()
    const productCache = new Map()

    for (const it of body.items) {
      const productId = String(it.productId || '').trim()
      if (!productId) continue

      let p = productCache.get(productId)
      if (!p) {
        p = await repo.getProductById(productId)
        productCache.set(productId, p)
      }
      if (!p) continue
      if (String(p.Status || '').toLowerCase() === 'deleted') {
        const err = new Error('Some products in your cart are no longer available.')
        err.status = 409
        throw err
      }

      const sku = normSku(p.SKU)
      if (!sku) continue

      const salonKey = p.SalonId ? String(p.SalonId).trim() : 'global'
      const qty = Number(it.qty || 0)
      if (!Number.isFinite(qty) || qty <= 0) continue

      const key = `${salonKey}::${sku}`
      requested.set(key, (requested.get(key) || 0) + qty)
    }

    for (const [key, qtyRequested] of requested.entries()) {
      const [salonKey, sku] = key.split('::')
      const onHand = await repo.getQtyOnHand(salonKey, sku)
      const safeOnHand = Number.isFinite(onHand) ? onHand : 0

      if (qtyRequested > safeOnHand) {
        const err = new Error(`Insufficient stock for ${sku}. Requested ${qtyRequested}, available ${Math.max(0, safeOnHand)}.`)
        err.status = 409
        err.item = { salonKey, sku, requested: qtyRequested, available: Math.max(0, safeOnHand) }
        throw err
      }
    }
  }

  const id = newId()
  const cleanEmail = String(body.customerEmail || body.customer?.email || '').trim().toLowerCase() || null

  await giftSvc.ensureGiftCardTables()
  await repo.ensureOrderGiftColumns()

  let giftApplied = 0
  let giftCode = null
  if (body.giftCode) {
    const result = await giftSvc.applyGiftCardForAmount({
      code: body.giftCode,
      amount: body.totals.total,
      commit: true,
      refType: 'order',
      refId: id,
      user: opts?.user,
    })
    giftApplied = Number(result.applied || 0)
    giftCode = body.giftCode
  }

  const safeSubtotal = Math.max(0, body.totals.subtotal - giftApplied)
  const safeTax = Math.max(0, body.totals.tax)
  const safeTotal = Math.max(0, body.totals.total - giftApplied)

  await repo.insertOrder({
    id,
    status: options.statusOverride || body.status || 'Pending',
    channel: body.channel || 'web',
    salonKey: body.salonKey || 'mixed',
    salonId: body.salonId || null,
    customerUserId: body.customerUserId || null,
    customerEmail: cleanEmail,
    customerName: body.customer?.name || null,
    customerPhone: body.customer?.phone || null,
    customerAddress: body.customer?.address || null,
    subtotal: safeSubtotal,
    tax: safeTax,
    total: safeTotal,
    paymentMethod: options.paymentMethodOverride || body.paymentMethod || null,
    giftCardCode: giftCode,
    giftCardApplied: giftApplied,
  })

  for (const it of body.items) {
    await repo.insertOrderItem(id, it)
  }

  if (!options.skipInventory) {
    await applyInventoryForOrder(id)
  }

  const row = await repo.getOrderById(id)
  const items = await repo.getOrderItems(id)

  const mappedItems = items.map((x) => ({ productId: x.ProductId, name: x.ProductName, price: Number(x.Price), qty: Number(x.Qty) }))

  return mapOrderRow(row, mappedItems)
}

function mapOrderRow(r, items) {
  return {
    id: r.OrderId,
    createdAt: r.CreatedAt,
    status: r.Status,
    channel: r.Channel,
    salonKey: r.SalonKey,
    salonId: r.SalonId,

    customerUserId: r.CustomerUserId,
    customerEmail: r.CustomerEmail,
    customer: {
      name: r.CustomerName,
      phone: r.CustomerPhone,
      email: r.CustomerEmail,
      address: r.CustomerAddress,
    },

    totals: {
      subtotal: Number(r.Subtotal),
      tax: Number(r.Tax),
      total: Number(r.Total),
    },

    paymentMethod: r.PaymentMethod,
    giftCard: r.GiftCardCode
      ? { code: r.GiftCardCode, applied: Number(r.GiftCardApplied || 0) }
      : null,
    items: items || [],
  }
}

async function applyInventoryForOrder(orderId) {
  if (!(await repo.hasProductsSkuColumn())) return

  const items = await repo.getOrderItems(orderId)

  for (const x of items) {
    const productId = String(x.ProductId || '').trim()
    if (!productId) continue

    const p = await repo.getProductById(productId)
    if (!p) continue
    if (String(p.Status || '').toLowerCase() === 'deleted') continue

    const sku = normSku(p.SKU)
    if (!sku) continue

    const salonKey = p.SalonId ? String(p.SalonId).trim() : 'global'
    const qty = Number(x.Qty || 0)
    if (!Number.isFinite(qty) || qty <= 0) continue

    await repo.ensureInventoryItem({ salonKey, salonId: salonKey === 'global' ? null : salonKey, sku, name: p.Name || x.ProductName || sku, type: 'retail', uom: 'each', salePrice: Number.isFinite(Number(x.Price)) ? Number(x.Price) : null })

    await repo.recordInventoryTx({ salonKey, sku, qtyDelta: -qty, reason: 'RETAIL_SALE', refId: orderId, note: 'Customer purchase (order)' })
  }
}

function normSku(s) {
  return String(s || '').trim().replace(/\s+/g, '-').toUpperCase()
}

async function listOrders(filters) {
  const rows = await repo.getOrders(filters)
  const items = []
  for (const r of rows) {
    const it = await repo.getOrderItems(r.OrderId)
    const mapped = it.map((x) => ({ productId: x.ProductId, name: x.ProductName, price: Number(x.Price), qty: Number(x.Qty) }))
    items.push(mapOrderRow(r, mapped))
  }
  return items
}

async function cancelOrder(id) {
  const row = await repo.getOrderById(id)
  if (!row) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  const currentStatus = String(row.Status || '').trim().toLowerCase()
  const cancellable = ['pending']
  if (!cancellable.includes(currentStatus)) {
    const err = new Error('Only pending orders can be cancelled. Please contact the salon for assistance.')
    err.status = 400
    throw err
  }

  if (await repo.hasProductsSkuColumn()) {
    const items = await repo.getOrderItems(id)
    for (const item of items) {
      const productId = String(item.ProductId || '').trim()
      if (!productId) continue
      const p = await repo.getProductById(productId)
      if (!p) continue
      const sku = normSku(p.SKU)
      if (!sku) continue
      const salonKey = p.SalonId ? String(p.SalonId).trim() : 'global'
      const qty = Number(item.Qty || 0)
      if (!Number.isFinite(qty) || qty <= 0) continue
      await repo.recordInventoryTx({ salonKey, sku, qtyDelta: qty, reason: 'ORDER_CANCELLATION', refId: id, note: 'Order cancelled - inventory returned' })
    }
  }

  await repo.updateOrderStatus(id, 'Cancelled')

  const updated = await repo.getOrderById(id)
  const items = await repo.getOrderItems(id)
  const mappedItems = items.map((x) => ({ productId: x.ProductId, name: x.ProductName, price: Number(x.Price), qty: Number(x.Qty) }))
  return { message: 'Order cancelled successfully', item: mapOrderRow(updated, mappedItems) }
}

async function updateStatus(id, status, user) {
  const row = await repo.getOrderById(id)
  if (!row) {
    const err = new Error('Order not found')
    err.status = 404
    throw err
  }

  // owner check will be handled by controller via middleware/user
  await repo.updateOrderStatus(id, status)

  if (String(status || '').toLowerCase().startsWith('paid')) {
    try {
      try { await applyInventoryForOrder(id) } catch (e) { try { await applyInventoryForOrder(id) } catch (e2) { console.error('applyInventoryForOrder failed', id, e2) } }
      const orderRow = await repo.getOrderById(id)
      const cust = orderRow || {}
      const userId = cust.CustomerUserId || null
      const email = cust.CustomerEmail || null
      if (userId || email) await repo.clearCartsByUserOrEmail(userId, email)
    } catch (e) {
      console.error('Error while post-processing Paid status for order', id, e)
    }
  }

  const updated = await repo.getOrderById(id)
  const items = await repo.getOrderItems(id)
  const mappedItems = items.map((x) => ({ productId: x.ProductId, name: x.ProductName, price: Number(x.Price), qty: Number(x.Qty) }))
  return mapOrderRow(updated, mappedItems)
}

module.exports = {
  orderInputSchema,
  createOrderRecord,
  applyInventoryForOrder,
  listOrders,
  cancelOrder,
  updateStatus,
}
