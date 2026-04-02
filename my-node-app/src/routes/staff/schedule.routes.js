const express = require('express')
const controller = require('../../controllers/staff/schedule.controller')

const router = express.Router()

router.get('/schedule', controller.getSchedule)
router.post('/schedule/shifts', controller.postShift)
router.delete('/schedule/shifts', controller.deleteShift)

module.exports = router
