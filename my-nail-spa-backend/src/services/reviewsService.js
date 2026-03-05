const { z } = require('zod')
const repo = require('../repositories/reviewsRepository')

function mapSalonReviewRow(r) {
  return {
    id: r.ReviewId,
    salonId: r.SalonId,
    userName: r.UserName,
    rating: r.Rating,
    text: r.Text,
    createdAt: r.CreatedAt,
    verified: Boolean(r.Verified),
  }
}

function mapProductReviewRow(r) {
  return {
    id: r.ReviewId,
    productId: r.ProductId,
    userName: r.UserName,
    rating: r.Rating,
    text: r.Text,
    createdAt: r.CreatedAt,
    verified: Boolean(r.Verified),
  }
}

async function listSalonReviews(salonId) {
  const rows = await repo.getSalonReviews(salonId)
  return rows.map(mapSalonReviewRow)
}

async function createSalonReview(salonId, body) {
  const payload = z.object({ userName: z.string().min(1), rating: z.number().int().min(1).max(5), text: z.string().optional(), verified: z.boolean().optional() }).parse(body)
  const row = await repo.insertSalonReview({ salonId, userName: payload.userName, rating: payload.rating, text: payload.text || null, verified: payload.verified })
  return mapSalonReviewRow(row)
}

async function listProductReviews(productId) {
  const rows = await repo.getProductReviews(productId)
  return rows.map(mapProductReviewRow)
}

async function createProductReview(productId, body) {
  const payload = z.object({ userName: z.string().min(1), rating: z.number().int().min(1).max(5), text: z.string().optional(), verified: z.boolean().optional() }).parse(body)
  const row = await repo.insertProductReview({ productId, userName: payload.userName, rating: payload.rating, text: payload.text || null, verified: payload.verified })
  return mapProductReviewRow(row)
}

async function listProductReviewsForSalon(salonId) {
  const rows = await repo.getProductReviewsForSalon(salonId)
  return rows.map((r) => ({ ...mapProductReviewRow(r), productName: r.ProductName }))
}

async function deleteReview(id) {
  await repo.deleteReviewById(id)
  return { success: true }
}

module.exports = {
  listSalonReviews,
  createSalonReview,
  listProductReviews,
  createProductReview,
  listProductReviewsForSalon,
  deleteReview,
}
