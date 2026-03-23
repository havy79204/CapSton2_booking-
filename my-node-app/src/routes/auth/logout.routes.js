const express = require('express')
const controller = require('../../controllers/auth/logout.controller')

const router = express.Router()

router.post('/logout', controller.postLogout)

module.exports = router
