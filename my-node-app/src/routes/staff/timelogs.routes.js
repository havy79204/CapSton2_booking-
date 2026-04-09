const express = require('express')
const controller = require('../../controllers/staff/timelogs.controller')
const router = express.Router()

router.post('/timelogs', controller.postTimeLog)
router.get('/timelogs/latest', controller.getLatest)
router.get('/timelogs/today', controller.getToday)
router.get('/timelogs/week', controller.getWeek)
router.get('/timelogs/month-summary', controller.getMonthSummary)

module.exports = router
