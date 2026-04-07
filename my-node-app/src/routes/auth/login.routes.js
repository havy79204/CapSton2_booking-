const express = require('express')
const controller = require('../../controllers/auth/login.controller')

const router = express.Router()

router.post('/login', controller.postLogin)

module.exports = router
