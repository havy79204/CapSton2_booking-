const express = require('express')

const router = express.Router()

router.use(require('./quickLogin.routes'))
router.use(require('./me.routes'))
router.use(require('./logout.routes'))

module.exports = { authRoutes: router }
