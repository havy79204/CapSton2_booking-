const express = require('express')
const controller = require('../../controllers/staff/inventory.controller')

const router = express.Router()

router.get('/inventory', controller.getInventory)
router.get('/inventory/:id', controller.getInventoryItemById)
router.post('/inventory/stock-in', controller.postInventoryStockIn)
router.post('/inventory/stock-out', controller.postInventoryStockOut)

module.exports = router
