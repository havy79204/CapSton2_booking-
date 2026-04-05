const express = require('express')
const controller = require('../../controllers/staff/payroll.controller')

const router = express.Router()

router.get('/payroll', controller.getPayrollOverview)

module.exports = router