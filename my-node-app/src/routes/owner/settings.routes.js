const express = require('express')
const controller = require('../../controllers/owner/settings.controller')

const router = express.Router()

router.get('/settings', controller.getSettings)
router.put('/settings', controller.putSettings)

module.exports = router
