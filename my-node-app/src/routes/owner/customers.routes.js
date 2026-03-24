const express = require('express')
const controller = require('../../controllers/owner/customers.controller')

const router = express.Router()

router.get('/customers', controller.getCustomers)
router.get('/customers/:id', controller.getCustomerById)
router.post('/customers', controller.postCustomer)
router.put('/customers/:id', controller.putCustomer)
router.delete('/customers/:id', controller.deleteCustomer)

module.exports = router
