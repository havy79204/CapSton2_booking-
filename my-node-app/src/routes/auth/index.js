const express = require('express')

const router = express.Router()

router.use(require('./login.routes'))
router.use(require('./signup.routes'))
router.use(require('./me.routes'))
router.use(require('./logout.routes'))
router.use(require('./dev.routes'))
router.use(require('./forgotPassword.routes'))

module.exports = { authRoutes: router }