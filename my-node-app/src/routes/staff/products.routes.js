const express = require('express')
const controller = require('../../controllers/staff/products.controller')

const router = express.Router()

router.get('/products', controller.getRetailProducts)
router.get('/products/meta', controller.getRetailMeta)
router.get('/products/:id', controller.getRetailProduct)

module.exports = router
