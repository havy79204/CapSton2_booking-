const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { validateBooking } = require('../middlewares/validators');

router.post('/', validateBooking, bookingController.createBooking);
router.get('/', bookingController.getBookings);
router.get('/:id', bookingController.getDetail);

module.exports = router;