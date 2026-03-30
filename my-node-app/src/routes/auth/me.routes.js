const express = require('express')

const controller = require('../../controllers/auth/me.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/me', requireAuth, controller.getMe)
router.put('/me', requireAuth, controller.putMe)
router.post('/me/avatar', requireAuth, controller.postAvatar)
router.put('/me/password', requireAuth, controller.putPassword)

module.exports = router
