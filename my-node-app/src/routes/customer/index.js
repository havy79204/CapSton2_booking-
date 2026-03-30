const express = require('express')

const router = express.Router()

router.use(require('./notifications.routes'))
router.use(require('./commerce.routes'))
router.use(require('./chat.routes'))
router.use(require('./aiChat.routes'))

module.exports = { customerRoutes: router }
