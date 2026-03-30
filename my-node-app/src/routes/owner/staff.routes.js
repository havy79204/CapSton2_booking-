const express = require('express')
const controller = require('../../controllers/owner/staff.controller')

const router = express.Router()

router.get('/staff', controller.getStaff)
router.get('/staff/skill-categories', controller.getStaffSkillCategories)
router.get('/staff/:id', controller.getStaffById)
router.post('/staff', controller.postStaff)
router.post('/staff/:id/avatar', controller.postStaffAvatar)
router.put('/staff/:id', controller.putStaff)
router.delete('/staff/:id', controller.deleteStaff)

module.exports = router
