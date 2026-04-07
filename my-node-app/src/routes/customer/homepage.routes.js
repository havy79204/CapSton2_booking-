const express = require('express')
const { requireAuth } = require('../../middleware/auth')
const {
  getHomepage,
  getServices,
  getProducts,
  getRecommendations,
  getServiceReviews,
  createServiceReview,
  deleteServiceReview,
  getProductRating,
  getProductReviews,
  createProductReview,
  deleteProductReview,
  getReviews,
  getMyReviews,
  getStats,
  getSalonContact,
} = require('../../controllers/customer/homepage.controller')

const router = express.Router()

/**
 * Public routes - no authentication required
 */

// GET /api/homepage - Get all homepage data
router.get('/', getHomepage)

// GET /api/homepage/services - Get services list
router.get('/services', getServices)

// GET /api/homepage/products - Get products list
router.get('/products', getProducts)

// GET /api/homepage/recommendations - Get personalized recommendations
router.get('/recommendations', getRecommendations)

// GET /api/homepage/services/:serviceId/reviews - Get rating + reviews by service
router.get('/services/:serviceId/reviews', getServiceReviews)

// POST /api/homepage/services/:serviceId/reviews - Create service review
router.post('/services/:serviceId/reviews', requireAuth, createServiceReview)
router.delete('/services/:serviceId/reviews/:reviewId', requireAuth, deleteServiceReview)

// GET /api/homepage/products/:productId/rating - Get product rating
router.get('/products/:productId/rating', getProductRating)

// GET /api/homepage/products/:productId/reviews - Get rating + reviews by product
router.get('/products/:productId/reviews', getProductReviews)

// POST /api/homepage/products/:productId/reviews - Create product review
router.post('/products/:productId/reviews', requireAuth, createProductReview)
router.delete('/products/:productId/reviews/:reviewId', requireAuth, deleteProductReview)

// GET /api/homepage/reviews - Get reviews list
router.get('/reviews', getReviews)

// GET /api/homepage/reviews/me - Get current user reviews
router.get('/reviews/me', requireAuth, getMyReviews)

// GET /api/homepage/stats - Get salon statistics
router.get('/stats', getStats)

// GET /api/homepage/contact - Get salon contact info from settings
router.get('/contact', getSalonContact)

module.exports = { homepageRoutes: router }
