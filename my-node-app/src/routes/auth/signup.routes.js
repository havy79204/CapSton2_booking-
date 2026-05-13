const express = require('express')
const controller = require('../../controllers/auth/signup.controller')

const router = express.Router()

router.post('/signup', controller.postSignup)
router.post('/verify-email', controller.postVerifyEmail)
router.get('/verify-email', controller.postVerifyEmail)

module.exports = router
