const express = require('express')
const controller = require('../../controllers/owner/staff.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

// Specific routes must come BEFORE dynamic routes
router.get('/staff/skill-categories', requireAuth, controller.getStaffSkillCategories)

// Dynamic and post routes
router.get('/staff', requireAuth, controller.getStaff)
router.post('/staff', requireAuth, controller.postStaff)
router.get('/staff/:id', requireAuth, controller.getStaffById)
router.post('/staff/:id/avatar', requireAuth, controller.postStaffAvatar)
router.put('/staff/:id', requireAuth, controller.putStaff)
router.delete('/staff/:id', requireAuth, controller.deleteStaff)

module.exports = router
