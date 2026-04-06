const express = require('express')
const controller = require('../../controllers/staff/payroll.controller')

const router = express.Router()

router.get('/payroll', controller.getPayrollOverview)
router.get('/payroll/debug', controller.getPayrollDebug)

module.exports = router