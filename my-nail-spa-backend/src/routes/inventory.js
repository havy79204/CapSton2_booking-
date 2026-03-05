const express = require('express')
const { authRequired, requireRole } = require('../middleware/auth')
const inventoryController = require('../controllers/inventoryController')

const inventoryRoutes = express.Router()

inventoryRoutes.get('/items', authRequired, requireRole('admin', 'owner', 'staff'), inventoryController.listItems)
inventoryRoutes.post('/items', authRequired, requireRole('admin', 'owner'), inventoryController.postItem)
inventoryRoutes.get('/transactions', authRequired, requireRole('admin', 'owner', 'staff'), inventoryController.listTransactions)
inventoryRoutes.post('/transactions', authRequired, requireRole('admin', 'owner'), inventoryController.postTransaction)
inventoryRoutes.post('/external-pos', authRequired, requireRole('admin', 'owner'), inventoryController.postExternalPO)

module.exports = { inventoryRoutes }
