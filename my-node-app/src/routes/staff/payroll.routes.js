const express = require('express')
const controller = require('../../controllers/staff/payroll.controller')

const router = express.Router()

router.get('/payroll', controller.getPayrollOverview)
router.get('/payroll/debug', controller.getPayrollDebug)
router.get('/payroll/tips', controller.getTips)
router.post('/payroll/tips', controller.postTip)

module.exports = router