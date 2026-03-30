const express = require('express')
const controller = require('../../controllers/owner/customers.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/customers', requireAuth, controller.getCustomers)
router.get('/customers/:id/bookings', requireAuth, controller.getCustomerBookings)
router.get('/customers/:id/orders', requireAuth, controller.getCustomerOrders)
router.get('/customers/:id', requireAuth, controller.getCustomerById)
router.post('/customers', requireAuth, controller.postCustomer)
router.put('/customers/:id', requireAuth, controller.putCustomer)
router.delete('/customers/:id', requireAuth, controller.deleteCustomer)

module.exports = router
