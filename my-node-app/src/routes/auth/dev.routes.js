const express = require('express')
const controller = require('../../controllers/auth/dev.controller')

const router = express.Router()

router.post('/dev/set-password', controller.postSetPassword)

module.exports = router