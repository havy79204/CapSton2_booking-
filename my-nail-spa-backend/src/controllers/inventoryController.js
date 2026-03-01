const { z } = require('zod')
const inventoryService = require('../services/inventoryService')

function assertSalonScope(req, salonKey) {
  const role = req.user?.role
  if (role === 'admin') return
  const mySalonId = String(req.user?.salonId || '').trim()
  if (!mySalonId) throw Object.assign(new Error('Missing salon scope'), { status: 403 })
  if (String(salonKey || '').trim() !== mySalonId && String(salonKey || '').trim() !== 'global') {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
}

async function listItems(req, res, next) {
  try {
    const salonKey = req.query.salonKey ? String(req.query.salonKey).trim() : null
    if (salonKey) assertSalonScope(req, salonKey)
    const items = await inventoryService.getItems(salonKey)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function postItem(req, res, next) {
  try {
    const body = z
      .object({
        salonId: z.string().min(1),
        sku: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(['pro', 'retail']),
        uom: z.string().min(1),
        cost: z.number().nonnegative().default(0),
        salePrice: z.number().nonnegative().nullable().optional(),
        minStock: z.number().nonnegative().default(0),
      })
      .parse(req.body)

    const salonKey = String(body.salonId).trim()
    assertSalonScope(req, salonKey)

    const sku = String(body.sku).trim().replace(/\s+/g, '-').toUpperCase()

    const saved = await inventoryService.upsertItem({
      salonKey,
      salonId: salonKey === 'global' ? null : salonKey,
      sku,
      name: body.name.trim(),
      type: body.type,
      uom: body.uom.trim(),
      cost: body.cost,
      salePrice: body.salePrice ?? null,
      minStock: body.minStock,
    })

    res.json({ item: saved })
  } catch (err) {
    next(err)
  }
}

async function listTransactions(req, res, next) {
  try {
    const salonKey = req.query.salonKey ? String(req.query.salonKey).trim() : null
    const limit = Math.max(1, Math.min(5000, Number(req.query.limit || 300)))
    if (salonKey) assertSalonScope(req, salonKey)
    const items = await inventoryService.getTransactions(salonKey, limit)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function postTransaction(req, res, next) {
  try {
    const body = z
      .object({
        salonId: z.string().min(1),
        sku: z.string().min(1),
        qtyDelta: z.number(),
        reason: z.string().min(1),
        refId: z.string().optional(),
        vendor: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(req.body)

    const salonKey = String(body.salonId).trim()
    assertSalonScope(req, salonKey)

    const sku = String(body.sku).trim().replace(/\s+/g, '-').toUpperCase()
    const qtyDelta = Number(body.qtyDelta)
    if (!Number.isFinite(qtyDelta) || qtyDelta === 0) return res.status(400).json({ error: 'qtyDelta must be non-zero' })

    // ensure item exists
    const item = await inventoryService.getItems(salonKey)
    const found = item.find((i) => i.sku === sku)
    if (!found) return res.status(404).json({ error: 'Inventory item not found' })

    const tx = await inventoryService.addTransaction(
      { salonId: salonKey, sku, qtyDelta: qtyDelta, reason: String(body.reason).trim(), refId: body.refId, vendor: body.vendor, note: body.note },
      req.user,
    )

    res.status(201).json({ item: tx })
  } catch (err) {
    next(err)
  }
}

async function postExternalPO(req, res, next) {
  try {
    const body = z
      .object({
        salonId: z.string().min(1),
        vendor: z.string().min(1),
        note: z.string().optional(),
        lines: z
          .array(
            z.object({ sku: z.string().min(1), qty: z.number().positive(), unitCost: z.number().nonnegative(), uom: z.string().min(1) }),
          )
          .min(1),
      })
      .parse(req.body)

    const salonKey = String(body.salonId).trim()
    assertSalonScope(req, salonKey)

    const po = await inventoryService.createExternalPO(body, req.user)
    res.status(201).json({ item: po })
  } catch (err) {
    next(err)
  }
}

module.exports = { listItems, postItem, listTransactions, postTransaction, postExternalPO }
