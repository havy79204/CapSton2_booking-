const express = require('express')
const { authRequired, requireRole, optionalAuth } = require('../middleware/auth')
const productsCtrl = require('../controllers/productsController')
const variantsCtrl = require('../controllers/productVariantsController')

const productsRoutes = express.Router()

productsRoutes.get('/', optionalAuth, productsCtrl.listProducts)
productsRoutes.get('/bulk', productsCtrl.bulkGet)
productsRoutes.get('/:id', productsCtrl.getProduct)

productsRoutes.post('/', authRequired, requireRole('admin', 'owner'), productsCtrl.createProduct)
productsRoutes.patch('/:id', authRequired, requireRole('admin', 'owner'), productsCtrl.patchProduct)
productsRoutes.delete('/:id', authRequired, requireRole('admin', 'owner'), productsCtrl.deleteProduct)

// Product Variants routes
productsRoutes.get('/:productId/variants', variantsCtrl.listVariants)
productsRoutes.post('/:productId/variants', authRequired, requireRole('admin', 'owner'), variantsCtrl.createVariant)
productsRoutes.patch('/:productId/variants/:variantId', authRequired, requireRole('admin', 'owner'), variantsCtrl.updateVariant)
productsRoutes.delete('/:productId/variants/:variantId', authRequired, requireRole('admin', 'owner'), variantsCtrl.deleteVariant)

module.exports = { productsRoutes }
