const { z } = require('zod')
const repo = require('../repositories/reviewsRepository')

function mapSalonReviewRow(r) {
  return {
    id: r.ReviewId,
    salonId: r.SalonId,
    userId: r.UserId || null,
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
    userId: r.UserId || null,
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

async function createSalonReview(salonId, body, user) {
  const payload = z.object({ 
    userName: z.string().min(1), 
    rating: z.number().int().min(1).max(5), 
    text: z.string().optional() 
  }).parse(body)
  
  // Reviews are not verified by default - only admins can verify them later
  const row = await repo.insertSalonReview({ 
    salonId,
    userId: user?.id || null,  // Track authenticated user if available
    userName: payload.userName, 
    rating: payload.rating, 
    text: payload.text || null, 
    verified: false  // Always false for user-created reviews
  })
  return mapSalonReviewRow(row)
}

async function listProductReviews(productId) {
  const rows = await repo.getProductReviews(productId)
  return rows.map(mapProductReviewRow)
}

async function createProductReview(productId, body, user) {
  const payload = z.object({ 
    userName: z.string().min(1), 
    rating: z.number().int().min(1).max(5), 
    text: z.string().optional() 
  }).parse(body)
  
  // Reviews are not verified by default - only admins can verify them later
  const row = await repo.insertProductReview({ 
    productId,
    userId: user?.id || null,  // Track authenticated user if available
    userName: payload.userName, 
    rating: payload.rating, 
    text: payload.text || null, 
    verified: false  // Always false for user-created reviews
  })
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
