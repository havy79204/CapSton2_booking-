const express = require('express')
const { authRequired, requireRole, optionalAuth } = require('../middleware/auth')
const productsCtrl = require('../controllers/productsController')

const productsRoutes = express.Router()

productsRoutes.get('/', optionalAuth, productsCtrl.listProducts)
productsRoutes.get('/bulk', productsCtrl.bulkGet)
productsRoutes.get('/:id', productsCtrl.getProduct)

productsRoutes.post('/', authRequired, requireRole('admin', 'owner'), productsCtrl.createProduct)
productsRoutes.patch('/:id', authRequired, requireRole('admin', 'owner'), productsCtrl.patchProduct)
productsRoutes.delete('/:id', authRequired, requireRole('admin', 'owner'), productsCtrl.deleteProduct)

module.exports = { productsRoutes }
