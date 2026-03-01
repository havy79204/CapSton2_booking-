const express = require('express')
const { authRequired, requireRole } = require('../middleware/auth')
const controller = require('../controllers/usersController')

const usersRoutes = express.Router()

usersRoutes.get('/', authRequired, requireRole('admin', 'owner'), controller.listUsers)
usersRoutes.get('/:id', authRequired, requireRole('admin', 'owner'), controller.getUser)
usersRoutes.post('/', authRequired, requireRole('admin', 'owner'), controller.createUserHandler)
usersRoutes.patch('/:id', authRequired, requireRole('admin', 'owner'), controller.patchUserHandler)
usersRoutes.delete('/:id', authRequired, requireRole('admin'), controller.deleteUserHandler)

module.exports = { usersRoutes }
