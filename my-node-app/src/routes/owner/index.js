const express = require('express')

const router = express.Router()

// Removed owner-specific routes: dashboard, customers, settings, staff, reports, services
router.use(require('./appointments.routes'))
router.use(require('./inventory.routes'))
router.use(require('./retail.routes'))
router.use(require('./schedule.routes'))
router.use(require('./notifications.routes'))
router.use(require('./chat.routes'))

module.exports = { ownerRoutes: router }
