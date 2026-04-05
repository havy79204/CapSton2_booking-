const express = require('express')
const controller = require('../../controllers/staff/dashboard.controller')

const router = express.Router()

router.get('/dashboard/summary', controller.getSummary)
router.get('/dashboard/reviews', controller.getReviewDetails)

module.exports = router