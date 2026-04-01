const express = require('express');
const controller = require('../../controllers/owner/schedule.controller');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/schedule', requireAuth, controller.getSchedule);
router.post('/schedule/shifts', requireAuth, controller.postShift);
router.delete('/schedule/shifts', requireAuth, controller.deleteShift);

module.exports = router;