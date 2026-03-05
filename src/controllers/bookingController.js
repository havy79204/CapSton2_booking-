const bookingService = require("../services/bookingService");

const createBooking = async (req, res) => {
  try {
    const payload = req.sanitizedBody || req.body;
    const booking = await bookingService.createBooking(payload);
    res.status(201).json({ message: "Đặt dịch vụ thành công", booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getBookings = async (req, res) => {
  try {
    const data = await bookingService.getAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDetail = async (req, res) => {
  try {
    const data = await bookingService.getById(req.params.id);
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createBooking, getBookings, getDetail };