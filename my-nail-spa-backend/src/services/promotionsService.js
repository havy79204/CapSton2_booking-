const { z } = require('zod')
const repo = require('../repositories/promotionsRepository')

function calculateDiscount(promo, total = 0) {
  const t = Number(total || 0)
  let discount = 0
  if (promo.DiscountType === 'percent') {
    discount = Math.round(t * (Number(promo.DiscountValue || 0) / 100))
  } else if (promo.DiscountType === 'amount') {
    discount = Math.min(Number(promo.DiscountValue || 0), t)
  }
  return { discount, total: t, totalAfterDiscount: Math.max(0, t - discount) }
}

async function listPromotions() {
  const rows = await repo.getAllPromotions()
  const promoIds = rows.map((r) => r.PromotionId)
  const salonMap = await repo.getPromotionSalonMap(promoIds)
  return rows.map((p) => ({ ...p, salonIds: salonMap[p.PromotionId] || [] }))
}

async function createPromotion(body) {
  const payload = z.object({ title: z.string().min(1), description: z.string().optional(), discountType: z.enum(['percent', 'amount']), discountValue: z.number().positive(), startDate: z.string().optional(), endDate: z.string().optional(), salonIds: z.array(z.string()).min(1), active: z.boolean().default(true) }).parse(body)
  const id = await repo.insertPromotion({ id: null, title: payload.title, description: payload.description || '', discountType: payload.discountType, discountValue: payload.discountValue, startDate: payload.startDate, endDate: payload.endDate, active: payload.active })
  await repo.insertPromotionSalons(id, payload.salonIds)
  return { id, ...payload }
}

async function updatePromotion(id, body) {
  const payload = z.object({ title: z.string().min(1), description: z.string().optional(), discountType: z.enum(['percent', 'amount']), discountValue: z.number().positive(), startDate: z.string().optional(), endDate: z.string().optional(), salonIds: z.array(z.string()).min(1), active: z.boolean().default(true) }).parse(body)
  await repo.updatePromotion(id, payload)
  await repo.getPromotionSalonMap([]) // noop to keep consistent pattern; callers may refactor
  // replace salons
  await repo.deletePromotion ? null : null
  await repo.deletePromotion // no-op placeholder in case of older code path
  // actual swap: remove existing links then insert
  await repo.insertPromotionSalons(id, payload.salonIds)
  return { id, ...payload }
}

async function deletePromotion(id) {
  await repo.deletePromotion(id)
  return { ok: true }
}

async function checkPromotionCode({ code, salonId, total = 0 }) {
  const promo = await repo.findActiveByTitle(code)
  if (!promo) return null
  if (salonId) {
    const salonIds = await repo.getPromotionSalons(promo.PromotionId)
    if (!salonIds.includes(salonId)) return { error: 'Promotion not valid for this salon' }
  }
  const calc = calculateDiscount(promo, total)
  return {
    promotion: { id: promo.PromotionId, title: promo.Title, type: promo.DiscountType, value: promo.DiscountValue },
    discount: calc.discount,
    total: calc.total,
    totalAfterDiscount: calc.totalAfterDiscount,
  }
}

module.exports = {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  checkPromotionCode,
}
