const express = require('express')
const { authRequired, requireRole, optionalAuth } = require('../middleware/auth')
const controller = require('../controllers/salonsController')

const salonsRoutes = express.Router()

salonsRoutes.get('/', controller.listSalons)
salonsRoutes.get('/profiles', controller.listProfiles)
salonsRoutes.get('/service-types', controller.listServiceTypes)
salonsRoutes.get('/:id', controller.getSalon)
salonsRoutes.get('/:id/services', optionalAuth, controller.listSalonServices)
salonsRoutes.get('/:id/services/:serviceTypeId/recipe', authRequired, requireRole('admin', 'owner'), controller.getServiceRecipe)
salonsRoutes.put('/:id/services/:serviceTypeId/recipe', authRequired, requireRole('admin', 'owner'), controller.putServiceRecipe)
salonsRoutes.get('/:id/profile', controller.getProfile)
salonsRoutes.post('/', authRequired, requireRole('admin'), controller.createSalon)
salonsRoutes.patch('/:id', authRequired, requireRole('admin'), controller.patchSalon)
salonsRoutes.delete('/:id', authRequired, requireRole('admin'), controller.deleteSalonHandler)
salonsRoutes.put('/:id/profile', authRequired, requireRole('admin', 'owner'), controller.putProfile)
salonsRoutes.post('/:id/geocode', authRequired, requireRole('admin'), controller.geocodeProfile)
salonsRoutes.post('/:id/services', authRequired, requireRole('admin', 'owner'), controller.postService)
salonsRoutes.delete('/:id/services/:serviceTypeId', authRequired, requireRole('admin', 'owner'), controller.deleteService)

module.exports = { salonsRoutes }
