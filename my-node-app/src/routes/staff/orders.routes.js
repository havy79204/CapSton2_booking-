const express = require('express')
const controller = require('../../controllers/staff/orders.controller')

const router = express.Router()

router.get('/orders', controller.getRetailOrders)
router.get('/orders/:id', controller.getRetailOrder)
router.put('/orders/:id', controller.putRetailOrder)

module.exports = router
