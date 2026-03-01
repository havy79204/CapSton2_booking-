const promotionsSvc = require('../services/promotionsService')

async function listPromotions(req, res, next) {
  try {
    const items = await promotionsSvc.listPromotions()
    res.json({ items })
  } catch (err) { next(err) }
}

async function createPromotion(req, res, next) {
  try {
    const item = await promotionsSvc.createPromotion(req.body)
    res.status(201).json({ item })
  } catch (err) { next(err) }
}

async function updatePromotion(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const item = await promotionsSvc.updatePromotion(id, req.body)
    res.json({ item })
  } catch (err) { next(err) }
}

async function deletePromotion(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const result = await promotionsSvc.deletePromotion(id)
    res.json(result)
  } catch (err) { next(err) }
}

async function checkPromotion(req, res, next) {
  try {
    const body = req.body || {}
    const result = await promotionsSvc.checkPromotionCode({ code: body.code, salonId: body.salonId, total: body.total })
    if (!result) return res.status(404).json({ error: 'Promotion not found or expired' })
    if (result.error) return res.status(400).json({ error: result.error })
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  checkPromotion,
}
