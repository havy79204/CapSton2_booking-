const express = require('express')
const controller = require('../../controllers/auth/quickLogin.controller')

const router = express.Router()

router.post('/quick-login', controller.postQuickLogin)

module.exports = router
