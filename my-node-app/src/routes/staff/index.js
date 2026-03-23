const express = require('express')

const router = express.Router()

router.use(require('./notifications.routes'))

module.exports = { staffRoutes: router }
