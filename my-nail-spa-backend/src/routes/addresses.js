const express = require('express')
const addressesController = require('../controllers/addressesController')
const { authRequired } = require('../middleware/auth')

const addressesRoutes = express.Router()

// All address routes require authentication
addressesRoutes.use(authRequired)

addressesRoutes.get('/', addressesController.listAddresses)
addressesRoutes.post('/', addressesController.createAddress)
addressesRoutes.get('/:id', addressesController.getAddress)
addressesRoutes.patch('/:id', addressesController.updateAddress)
addressesRoutes.delete('/:id', addressesController.deleteAddress)
addressesRoutes.post('/:id/set-default', addressesController.setDefaultAddress)

module.exports = { addressesRoutes }
