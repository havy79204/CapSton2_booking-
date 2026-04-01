const express = require('express')
const controller = require('../../controllers/owner/settings.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/settings', requireAuth, controller.getSettings)
router.put('/settings', requireAuth, controller.putSettings)

module.exports = router
