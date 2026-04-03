const express = require('express')
const controller = require('../../controllers/staff/services.controller')

const router = express.Router()

router.get('/services', controller.getServices)
router.get('/services/categories', controller.getServiceCategories)
router.get('/services/:id', controller.getServiceById)

module.exports = router
