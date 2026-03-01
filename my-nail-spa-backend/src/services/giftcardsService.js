const { z } = require('zod')
const repo = require('../repositories/giftcardsRepository')

async function getPublicBySalon(salonId) {
  return repo.findPublicBySalon(salonId)
}

async function applyTitle(body) {
  const parsed = z.object({ code: z.string().min(1), amount: z.number().nonnegative() }).parse(body)
  const row = await repo.findByCode(parsed.code)
  if (!row.recordset[0]) throw Object.assign(new Error('Gift card not found'), { status: 404 })
  // compute title or adjustments here
  return { title: row.recordset[0].Title }
}

async function createGiftCard(body) {
  const parsed = z.object({ id: z.string().optional(), salonId: z.string().optional(), title: z.string().min(1), amount: z.number().nonnegative(), description: z.string().optional(), active: z.boolean().optional() }).parse(body)
  const r = await repo.insertGiftCard({ id: parsed.id, salonId: parsed.salonId, title: parsed.title, amount: parsed.amount, description: parsed.description || null, active: parsed.active !== false })
  return r
}

async function applyGiftCardForAmount(body, user) {
  const parsed = z.object({ code: z.string().min(1), amount: z.number().nonnegative() }).parse(body)
  const r = await repo.findByCode(parsed.code)
  const row = r.recordset[0]
  if (!row || !row.Active) {
    const err = new Error('Invalid gift card')
    err.status = 400
    throw err
  }
  // Example: cap at stored amount
  const value = Math.min(Number(row.Amount || 0), parsed.amount)
  return { applied: value, remaining: Number(row.Amount || 0) - value }
}

module.exports = { getPublicBySalon, applyTitle, createGiftCard, applyGiftCardForAmount }
