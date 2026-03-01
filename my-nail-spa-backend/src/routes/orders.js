const express = require('express')
const { z } = require('zod')

const { authRequired, requireRole } = require('../middleware/auth')
const controller = require('../controllers/ordersController')
const svc = require('../services/ordersService')

const ordersRoutes = express.Router()

ordersRoutes.get('/', controller.listOrders)
ordersRoutes.post('/', controller.createOrder)

ordersRoutes.delete('/:id', controller.deleteOrder)

ordersRoutes.patch('/:id/status', authRequired, requireRole('owner', 'admin'), controller.patchStatus)

module.exports = { ordersRoutes, createOrderRecord: svc.createOrderRecord, orderInputSchema: svc.orderInputSchema, applyInventoryForOrder: svc.applyInventoryForOrder }
