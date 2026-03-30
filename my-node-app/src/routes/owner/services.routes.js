const express = require('express')
const controller = require('../../controllers/owner/services.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/services', requireAuth, controller.getServices)
router.get('/services/categories', requireAuth, controller.getServiceCategories)
router.post('/services/categories', requireAuth, controller.postServiceCategory)
router.get('/services/:id', requireAuth, controller.getServiceById)
router.post('/services', requireAuth, controller.postService)
router.put('/services/:id', requireAuth, controller.putService)
router.delete('/services/:id', requireAuth, controller.deleteService)

router.post('/services/uploads/image', requireAuth, controller.postServiceUploadImage)

module.exports = router
