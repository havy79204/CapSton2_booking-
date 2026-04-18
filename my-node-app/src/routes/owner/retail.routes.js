const express = require('express')
const controller = require('../../controllers/owner/retail.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/retail/meta', requireAuth, controller.getRetailMeta)
router.get('/retail/categories', requireAuth, controller.getRetailCategories)
router.post('/retail/categories', requireAuth, controller.postRetailCategory)
router.get('/retail/products', requireAuth, controller.getRetailProducts)
router.post('/retail/products', requireAuth, controller.postRetailProduct)
router.get('/retail/products/:productId', requireAuth, controller.getRetailProduct)
router.put('/retail/products/:productId', requireAuth, controller.putRetailProduct)
router.delete('/retail/products/:productId', requireAuth, controller.deleteRetailProduct)

router.get('/retail/products/:productId/variants', requireAuth, controller.getVariants)
	router.post('/retail/products/:productId/variants', requireAuth, controller.postVariant)
	router.put('/retail/variants/:variantId', requireAuth, controller.putVariant)
	router.delete('/retail/variants/:variantId', requireAuth, controller.deleteVariant)

router.get('/retail/orders', requireAuth, controller.getRetailOrders)
router.post('/retail/orders', requireAuth, controller.postRetailOrder)
router.get('/retail/orders/:orderId', requireAuth, controller.getRetailOrder)
router.put('/retail/orders/:orderId', requireAuth, controller.putRetailOrder)
router.patch('/retail/orders/:orderId/process', requireAuth, controller.patchRetailOrderProcess)
router.patch('/retail/orders/:orderId/ship', requireAuth, controller.patchRetailOrderShip)
router.patch('/retail/orders/:orderId/cancel', requireAuth, controller.patchRetailOrderCancel)
router.delete('/retail/orders/:orderId', requireAuth, controller.deleteRetailOrder)

router.post('/retail/uploads/image', requireAuth, controller.postRetailUploadImage)

module.exports = router
