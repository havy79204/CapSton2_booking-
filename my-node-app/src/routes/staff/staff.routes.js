const express = require('express')
const controller = require('../../controllers/staff/staff.controller')

const router = express.Router()

router.get('/staff', controller.getStaff)
router.get('/staff/:id', controller.getStaffById)

module.exports = router
