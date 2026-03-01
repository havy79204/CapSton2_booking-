const service = require('../services/giftcardsService')

async function getPublic(req, res, next) {
  try {
    const salonId = String(req.params.salonId || '').trim()
    const r = await service.getPublicBySalon(salonId)
    res.json({ items: r.recordset })
  } catch (err) {
    next(err)
  }
}

async function applyTitle(req, res, next) {
  try {
    const r = await service.applyTitle(req.body)
    res.json(r)
  } catch (err) {
    next(err)
  }
}

async function create(req, res, next) {
  try {
    const r = await service.createGiftCard(req.body)
    res.status(201).json({ item: r.recordset[0] })
  } catch (err) {
    next(err)
  }
}

async function apply(req, res, next) {
  try {
    const r = await service.applyGiftCardForAmount(req.body, req.user)
    res.json(r)
  } catch (err) {
    next(err)
  }
}

module.exports = { getPublic, applyTitle, create, apply }
