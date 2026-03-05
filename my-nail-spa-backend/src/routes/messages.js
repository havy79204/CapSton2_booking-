const express = require('express')
const messagesController = require('../controllers/messagesController')

const messagesRoutes = express.Router()

messagesRoutes.get('/threads', messagesController.listThreads)
messagesRoutes.post('/threads', messagesController.createThread)
messagesRoutes.get('/threads/:id/messages', messagesController.listMessages)
messagesRoutes.post('/threads/:id/messages', messagesController.postMessage)

module.exports = { messagesRoutes }
