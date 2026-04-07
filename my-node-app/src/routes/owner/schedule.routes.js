const express = require('express');
const controller = require('../../controllers/owner/schedule.controller');
const { requireAuth, requireOwner } = require('../../middleware/auth');

const router = express.Router();

router.get('/schedule', requireAuth, controller.getSchedule);
router.post('/schedule/shifts', requireAuth, controller.postShift);
router.delete('/schedule/shifts', requireAuth, controller.deleteShift);

// Approve or reject leave requests (owner only)
router.post('/schedule/shifts/approve', requireOwner, controller.approveShift);
router.post('/schedule/shifts/reject', requireOwner, controller.rejectShift);

module.exports = router;