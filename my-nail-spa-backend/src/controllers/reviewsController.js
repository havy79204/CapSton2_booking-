const reviewsSvc = require('../services/reviewsService')

async function listSalonReviews(req, res, next) {
  try {
    const salonId = String(req.params.id || '')
    const items = await reviewsSvc.listSalonReviews(salonId)
    res.json({ items })
  } catch (err) { next(err) }
}

async function createSalonReview(req, res, next) {
  try {
    const salonId = String(req.params.id || '')
    const item = await reviewsSvc.createSalonReview(salonId, req.body)
    res.status(201).json({ item })
  } catch (err) { next(err) }
}

async function listProductsReviewsForSalon(req, res, next) {
  try {
    const salonId = String(req.params.id || '')
    const items = await reviewsSvc.listProductReviewsForSalon(salonId)
    res.json({ items })
  } catch (err) { next(err) }
}

async function deleteReview(req, res, next) {
  try {
    const id = String(req.params.id || '')
    const result = await reviewsSvc.deleteReview(id)
    res.json(result)
  } catch (err) { next(err) }
}

async function listProductReviews(req, res, next) {
  try {
    const productId = String(req.params.id || '')
    const items = await reviewsSvc.listProductReviews(productId)
    res.json({ items })
  } catch (err) { next(err) }
}

async function createProductReview(req, res, next) {
  try {
    const productId = String(req.params.id || '')
    const item = await reviewsSvc.createProductReview(productId, req.body)
    res.status(201).json({ item })
  } catch (err) { next(err) }
}

module.exports = {
  listSalonReviews,
  createSalonReview,
  listProductsReviewsForSalon,
  deleteReview,
  listProductReviews,
  createProductReview,
}
