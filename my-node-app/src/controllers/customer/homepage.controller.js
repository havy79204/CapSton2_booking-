const { asyncHandler } = require('../../utils/asyncHandler')
const homepageService = require('../../services/homepage.service')
const { sanitizeCustomerResponse } = require('./responseSanitizer')

/**
 * GET /api/homepage
 * Get all homepage data (services, products, reviews, stats, features)
 */
const getHomepage = asyncHandler(async (req, res) => {
  const opts = { ...(req.query || {}) }
  if (req.user && req.user.sub) opts.userId = String(req.user.sub)
  const data = await homepageService.getHomepageData(opts)
  res.json({ data: sanitizeCustomerResponse(data) })
})

/**
 * GET /api/homepage/services
 * Get services list
 */
const getServices = asyncHandler(async (req, res) => {
  const opts = { ...(req.query || {}) }
  if (req.user && req.user.sub) opts.userId = String(req.user.sub)
  const data = await homepageService.getServices(opts)
  res.json({ data: sanitizeCustomerResponse(data) })
})

/**
 * GET /api/homepage/service-categories
 * Get service categories list (optional query: q)
 */
const getServiceCategories = asyncHandler(async (req, res) => {
  const q = String(req.query?.q || '').trim().toLowerCase()
  const categories = await homepageService.getServiceCategories()

  const data = q
    ? categories.filter((item) => String(item?.Name || '').toLowerCase().includes(q))
    : categories

  res.json({ data: sanitizeCustomerResponse(data) })
})

/**
 * GET /api/homepage/products
 * Get products list
 */
const getProducts = asyncHandler(async (req, res) => {
  const opts = { ...(req.query || {}) }
  // include authenticated user id for personalization when available
  if (req.user && req.user.sub) opts.userId = String(req.user.sub)
  const data = await homepageService.getProducts(opts)
  res.json({ data: sanitizeCustomerResponse(data) })
})

/**
 * GET /api/homepage/products/:productId
 * Get product detail with variants
 */
const getProductDetail = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const data = await homepageService.getProductDetail(productId)
  if (!data) {
    res.status(404).json({ error: 'Product not found' })
    return
  }
  res.json({ data: sanitizeCustomerResponse(data) })
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

  res.json({ data: sanitizeCustomerResponse({ ratingSummary, reviews }) })
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
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

const deleteServiceReview = asyncHandler(async (req, res) => {
  const { serviceId, reviewId } = req.params
  const userId = String(req.user?.sub || '').trim()
  const data = await homepageService.deleteServiceReview(serviceId, reviewId, userId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

/**
 * GET /api/homepage/products/:productId/rating
 * Get rating for product
 */
const getProductRating = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const data = await homepageService.getProductRating(productId)
  res.json({ data: sanitizeCustomerResponse(data) })
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

  res.json({ data: sanitizeCustomerResponse({ ratingSummary, reviews }) })
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
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

const deleteProductReview = asyncHandler(async (req, res) => {
  const { productId, reviewId } = req.params
  const userId = String(req.user?.sub || '').trim()
  const data = await homepageService.deleteProductReview(productId, reviewId, userId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

/**
 * GET /api/homepage/reviews
 * Get reviews list
 */
const getReviews = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  const data = await homepageService.getTopReviews(limit)
  res.json({ data: sanitizeCustomerResponse(data) })
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
  res.json({ data: sanitizeCustomerResponse(data) })
})

/**
 * GET /api/homepage/stats
 * Get salon statistics
 */
const getStats = asyncHandler(async (req, res) => {
  const data = await homepageService.getSalonStats()
  res.json({ data: sanitizeCustomerResponse(data) })
})

const getSalonContact = asyncHandler(async (req, res) => {
  const raw = await homepageService.getSalonContactInfo()
  const data = {
    name: raw?.name || '',
    address: raw?.address || '',
    website: raw?.website || '',
  }
  res.json({ data })
})

/**
 * GET /api/homepage/recommendations
 * Query params: type=products|services, limit
 */
const getRecommendations = asyncHandler(async (req, res) => {
  const opts = { ...(req.query || {}) }
  if (req.user && req.user.sub) opts.userId = String(req.user.sub)
  const limit = Math.min(parseInt(req.query.limit) || 10, 100)
  opts.limit = limit

  const data = await homepageService.getRecommendations(opts)
  res.json({ data: sanitizeCustomerResponse(data) })
})

module.exports = {
  getHomepage,
  getServices,
  getServiceCategories,
  getProducts,
  getProductDetail,
  getServiceReviews,
  createServiceReview,
  deleteServiceReview,
  getProductRating,
  getProductReviews,
  createProductReview,
  deleteProductReview,
  getReviews,
  getMyReviews,
  getStats
  , getRecommendations,
  getSalonContact,
}
