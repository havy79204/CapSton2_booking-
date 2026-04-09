const express = require('express')

const router = express.Router()

router.use(require('./services.routes'))
router.use(require('./customers.routes'))
router.use(require('./staff.routes'))
router.use(require('./appointments.routes'))
router.use(require('./appointments.test.routes')) // Test route without auth
router.use(require('./inventory.routes'))
router.use(require('./retail.routes'))
router.use(require('./schedule.routes'))
router.use(require('./dashboard.routes'))
router.use(require('./reports.routes'))
router.use(require('./settings.routes'))
router.use(require('./notifications.routes'))
router.use(require('./chat.routes'))

module.exports = { ownerRoutes: router }
