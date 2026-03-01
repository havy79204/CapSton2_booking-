
const express = require('express')
const { authRequired, requireRole } = require('../middleware/auth')
const controller = require('../controllers/giftcardsController')

const giftCardsRoutes = express.Router()

giftCardsRoutes.get('/public/:salonId', controller.getPublic)
giftCardsRoutes.post('/apply-title', controller.applyTitle)
giftCardsRoutes.post('/', authRequired, requireRole('owner', 'admin'), controller.create)
giftCardsRoutes.post('/apply', authRequired, controller.apply)

module.exports = { giftCardsRoutes }
