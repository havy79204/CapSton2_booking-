const express = require('express')
const promotionsCtrl = require('../controllers/promotionsController')

const promotionsPublicRoutes = express.Router()

promotionsPublicRoutes.post('/check', promotionsCtrl.checkPromotion)

module.exports = { promotionsPublicRoutes }
