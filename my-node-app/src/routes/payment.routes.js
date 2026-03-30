const express = require('express')
const { vnpayReturn, vnpayIpn } = require('../controllers/payment.controller')

const paymentRoutes = express.Router()

/**
 * GET /api/payments/vnpay-return
 * Redirect endpoint after customer completes payment on VNPAY gateway
 * Called by: VNPAY payment gateway (redirect_after_payment)
 */
paymentRoutes.get('/vnpay-return', vnpayReturn)

/**
 * POST /api/payments/vnpay-ipn
 * Async notification endpoint for payment status updates
 * Called by: VNPAY servers in background
 */
paymentRoutes.post('/vnpay-ipn', vnpayIpn)

/**
 * GET /api/payments/vnpay-ipn
 * Alternative IPN endpoint (supports both GET and POST)
 */
paymentRoutes.get('/vnpay-ipn', vnpayIpn)

module.exports = { paymentRoutes }
