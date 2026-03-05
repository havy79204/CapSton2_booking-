const express = require('express');
const router = express.Router();
const controller = require('../controllers/notification.controller');

router.post('/', controller.create);
router.get('/user/:userId', controller.getByUser);
router.put('/:id/read', controller.markRead);

module.exports = router;