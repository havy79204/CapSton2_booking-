const express = require('express')
const reviewsCtrl = require('../controllers/reviewsController')

const reviewsRoutes = express.Router()

// Salon reviews
reviewsRoutes.get('/salons/:id', reviewsCtrl.listSalonReviews)
reviewsRoutes.post('/salons/:id', reviewsCtrl.createSalonReview)
reviewsRoutes.get('/salons/:id/products', reviewsCtrl.listProductsReviewsForSalon)

// Delete review (either salon or product)
reviewsRoutes.delete('/:id', reviewsCtrl.deleteReview)

// Product reviews
reviewsRoutes.get('/products/:id', reviewsCtrl.listProductReviews)
reviewsRoutes.post('/products/:id', reviewsCtrl.createProductReview)

module.exports = { reviewsRoutes }
