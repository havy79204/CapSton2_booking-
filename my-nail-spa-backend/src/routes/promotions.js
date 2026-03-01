const express = require('express')
const { authRequired, requireRole } = require('../middleware/auth')
const promotionsCtrl = require('../controllers/promotionsController')

const promotionsRoutes = express.Router()

promotionsRoutes.get('/', authRequired, requireRole('admin'), promotionsCtrl.listPromotions)
promotionsRoutes.post('/', authRequired, requireRole('admin'), promotionsCtrl.createPromotion)
promotionsRoutes.put('/:id', authRequired, requireRole('admin'), promotionsCtrl.updatePromotion)
promotionsRoutes.delete('/:id', authRequired, requireRole('admin'), promotionsCtrl.deletePromotion)

module.exports = { promotionsRoutes }
