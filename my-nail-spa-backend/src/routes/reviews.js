const express = require('express')
const reviewsCtrl = require('../controllers/reviewsController')
const { authRequired, optionalAuth } = require('../middleware/auth')

const reviewsRoutes = express.Router()

// Salon reviews
reviewsRoutes.get('/salons/:id', reviewsCtrl.listSalonReviews)
reviewsRoutes.post('/salons/:id', optionalAuth, reviewsCtrl.createSalonReview)
reviewsRoutes.get('/salons/:id/products', reviewsCtrl.listProductsReviewsForSalon)

// Delete review (either salon or product) - require auth
reviewsRoutes.delete('/:id', authRequired, reviewsCtrl.deleteReview)

// Product reviews
reviewsRoutes.get('/products/:id', reviewsCtrl.listProductReviews)
reviewsRoutes.post('/products/:id', optionalAuth, reviewsCtrl.createProductReview)

module.exports = { reviewsRoutes }
