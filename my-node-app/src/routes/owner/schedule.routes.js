const express = require('express')
const controller = require('../../controllers/owner/schedule.controller')

const router = express.Router()

router.get('/schedule', controller.getSchedule)
router.post('/schedule/shifts', controller.postShift)

module.exports = router
