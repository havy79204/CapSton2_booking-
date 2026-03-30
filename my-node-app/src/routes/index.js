const express = require('express')

const { authRoutes } = require('./auth')
const { ownerRoutes } = require('./owner')
const { staffRoutes } = require('./staff')
const { customerRoutes } = require('./customer')
const { homepageRoutes } = require('./customer/homepage.routes')
const { paymentRoutes } = require('./payment.routes')

const routes = express.Router()

routes.get('/', (req, res) => {
  res.json({ ok: true, message: 'API is running' })
})

routes.use('/payments', paymentRoutes)
routes.use('/homepage', homepageRoutes)
routes.use('/auth', authRoutes)
routes.use('/owner', ownerRoutes)
routes.use('/staff', staffRoutes)
routes.use('/customer', customerRoutes)
module.exports = { routes }
