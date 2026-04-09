const express = require('express')
const controller = require('../../controllers/owner/attendance.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/attendance-report', requireAuth, controller.getAttendanceReport)
router.get('/attendance-report/:staffId/details', requireAuth, controller.getAttendanceStaffDetail)

module.exports = router
