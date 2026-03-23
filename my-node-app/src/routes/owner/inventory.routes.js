const express = require('express')
const controller = require('../../controllers/owner/inventory.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/inventory', controller.getInventory)
router.post('/inventory/items', requireAuth, controller.postInventoryItem)
router.put('/inventory/items/:id', requireAuth, controller.putInventoryItem)
router.delete('/inventory/items/:id', requireAuth, controller.deleteInventoryItem)
router.post('/inventory/stock', requireAuth, controller.postInventoryStockIn)
router.post('/inventory/stock-out', requireAuth, controller.postInventoryStockOut)

module.exports = router
