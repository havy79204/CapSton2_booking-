const express = require('express')
const controller = require('../../controllers/owner/inventory.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/inventory', requireAuth, controller.getInventory)
router.post('/inventory/items', requireAuth, controller.postInventoryItem)
router.put('/inventory/items/:id', requireAuth, controller.putInventoryItem)
router.delete('/inventory/items/:id', requireAuth, controller.deleteInventoryItem)
router.post('/inventory/stock', requireAuth, controller.postInventoryStockIn)
router.post('/inventory/stock-out', requireAuth, controller.postInventoryStockOut)
router.post('/inventory/fifo-preview', requireAuth, controller.postInventoryFifoPreview)
router.put('/inventory/lots/:lotId', requireAuth, controller.putInventoryLot)
router.delete('/inventory/lots/:lotId', requireAuth, controller.deleteInventoryLot)
router.get('/inventory/import-template', requireAuth, controller.getInventoryImportTemplate)
router.post('/inventory/import-excel', requireAuth, controller.postInventoryImportExcel)
router.get('/inventory/export/snapshot', requireAuth, controller.getInventorySnapshotExport)
router.get('/inventory/export/movement', requireAuth, controller.getInventoryMovementExport)
router.get('/inventory/export/low-stock', requireAuth, controller.getInventoryLowStockExport)

module.exports = router
