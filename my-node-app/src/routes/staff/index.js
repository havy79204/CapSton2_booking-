const express = require('express')
const { requireStaff } = require('../../middleware/auth')

const router = express.Router()

// Apply requireStaff middleware to all staff routes
router.use(requireStaff)

router.use(require('./notifications.routes'))
router.use(require('./dashboard.routes'))
router.use(require('./schedule.routes'))
router.use(require('./appointments.routes'))
router.use(require('./services.routes'))
router.use(require('./products.routes'))
router.use(require('./orders.routes'))
router.use(require('./inventory.routes'))
router.use(require('./payroll.routes'))
router.use(require('./staff.routes'))
router.use(require('./chat.routes'))

module.exports = { staffRoutes: router }