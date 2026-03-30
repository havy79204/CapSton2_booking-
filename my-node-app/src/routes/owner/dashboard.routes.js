const express = require('express')
const controller = require('../../controllers/owner/dashboard.controller')

const router = express.Router()

router.get('/dashboard', controller.getDashboard)

module.exports = router
