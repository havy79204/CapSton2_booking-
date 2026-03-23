const { asyncHandler } = require('../../utils/asyncHandler')
const homepageService = require('../../services/homepage.service')

/**
 * GET /api/homepage
 * Get all homepage data (services, products, reviews, stats, features)
 */
const getHomepage = asyncHandler(async (req, res) => {
  const data = await homepageService.getHomepageData()
  res.json({ ok: true, data })
})

/**
 * GET /api/homepage/services
 * Get services list
 */
const getServices = asyncHandler(async (req, res) => {
  const data = await homepageService.getServices()
  res.json({ ok: true, data })
})

/**
 * GET /api/homepage/products
 * Get products list
 */
const getProducts = asyncHandler(async (req, res) => {
  const data = await homepageService.getProducts()
  res.json({ ok: true, data })
})

/**
 * GET /api/homepage/services/:serviceId/reviews
 * Get reviews by service
 */
const getServiceReviews = asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)

  const [ratingSummary, reviews] = await Promise.all([
    homepageService.getServiceRating(serviceId),
    homepageService.getServiceReviews(serviceId, limit),
  ])

  res.json({ ok: true, data: { ratingSummary, reviews } })
})

/**
 * POST /api/homepage/services/:serviceId/reviews
 * Create review for service
 */
const createServiceReview = asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const userId = String(req.user?.sub || '').trim()
  const data = await homepageService.createServiceReview(serviceId, {
    ...(req.body || {}),
    userId,
  })
  res.status(201).json({ ok: true, data })
})

/**
 * GET /api/homepage/products/:productId/rating
 * Get rating for product
 */
const getProductRating = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const data = await homepageService.getProductRating(productId)
  res.json({ ok: true, data })
})

/**
 * GET /api/homepage/products/:productId/reviews
 * Get reviews by product
 */
const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)

  const [ratingSummary, reviews] = await Promise.all([
    homepageService.getProductRating(productId),
    homepageService.getProductReviews(productId, limit),
  ])

  res.json({ ok: true, data: { ratingSummary, reviews } })
})

/**
 * POST /api/homepage/products/:productId/reviews
 * Create review for product
 */
const createProductReview = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const userId = String(req.user?.sub || '').trim()
  const data = await homepageService.createProductReview(productId, {
    ...(req.body || {}),
    userId,
  })
  res.status(201).json({ ok: true, data })
})

/**
 * GET /api/homepage/reviews
 * Get reviews list
 */
const getReviews = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  const data = await homepageService.getTopReviews(limit)
  res.json({ ok: true, data })
})

/**
 * GET /api/homepage/reviews/me
 * Get current user review list
 */
const getMyReviews = asyncHandler(async (req, res) => {
  const userId = String(req.user?.sub || '').trim()
  if (!userId) {
    const err = new Error('Not authenticated')
    err.status = 401
    throw err
  }
  const data = await homepageService.getUserReviews(userId, Math.min(parseInt(req.query.limit) || 200, 200))
  res.json({ ok: true, data })
})

/**
 * GET /api/homepage/stats
 * Get salon statistics
 */
const getStats = asyncHandler(async (req, res) => {
  const data = await homepageService.getSalonStats()
  res.json({ ok: true, data })
})

module.exports = {
  getHomepage,
  getServices,
  getProducts,
  getServiceReviews,
  createServiceReview,
  getProductRating,
  getProductReviews,
  createProductReview,
  getReviews,
  getMyReviews,
  getStats
}
