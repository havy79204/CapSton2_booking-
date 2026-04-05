const express = require('express')
const controller = require('../../controllers/auth/forgotPassword.controller')

const router = express.Router()

router.post('/forgot-password', controller.postForgotPassword)
router.post('/reset-password', controller.postResetPassword)

module.exports = router