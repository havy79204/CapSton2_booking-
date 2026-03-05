const express = require('express')
const authController = require('../controllers/authController')
const { authRequired } = require('../middleware/auth')

const authRoutes = express.Router()

authRoutes.post('/signup', authController.signup)
authRoutes.post('/login', authController.login)
authRoutes.get('/verify-email', authController.verifyEmail)
authRoutes.get('/me', authRequired, authController.me)
authRoutes.patch('/me', authRequired, authController.patchMe)
authRoutes.post('/change-password', authRequired, authController.changePassword)
authRoutes.post('/forgot-password', authController.forgotPassword)
authRoutes.post('/resend-verification', authController.resendVerification)
authRoutes.post('/reset-password', authController.resetPassword)

module.exports = { authRoutes }
