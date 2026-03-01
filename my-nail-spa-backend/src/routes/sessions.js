const express = require('express')
const controller = require('../controllers/sessionsController')

const sessionsRoutes = express.Router()

sessionsRoutes.get('/user/:userId', controller.listUserSessions)
sessionsRoutes.post('/', controller.createSession)
sessionsRoutes.delete('/:id', controller.deleteSession)

module.exports = { sessionsRoutes }
