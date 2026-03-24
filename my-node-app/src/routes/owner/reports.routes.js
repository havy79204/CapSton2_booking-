const express = require('express')
const controller = require('../../controllers/owner/reports.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/reports', requireAuth, controller.getReports)

module.exports = router
