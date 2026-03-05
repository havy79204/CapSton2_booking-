const express = require('express')
const { z } = require('zod')

const controller = require('../controllers/paymentsController')
const svc = require('../services/paymentsService')

const paymentsRoutes = express.Router()

paymentsRoutes.post('/vnpay', controller.postVnpay)
paymentsRoutes.post('/vnpay/booking', controller.postVnpayBooking)
paymentsRoutes.get('/vnpay/return', controller.getVnpayReturn)
paymentsRoutes.get('/vnpay/ipn', controller.getVnpayIpn)

module.exports = { paymentsRoutes, initVnpayForOrder: svc.initVnpayForOrder, initVnpayForBooking: svc.initVnpayForBooking, finalizeVnpayPayment: svc.finalizeVnpayPayment, ensureVnpayConfigured: svc.ensureVnpayConfigured }


module.exports = { paymentsRoutes }
