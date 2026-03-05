const Booking = require("../models/Booking");
const Service = require("../models/Service");
const ValidationError = require("../errors/ValidationError");

const createBooking = async (data) => {
  const { serviceId } = data;
  
  // Check if service exists
  const serviceExists = await Service.exists(serviceId);
  if (!serviceExists) {
    throw new ValidationError([{ field: 'serviceId', message: `Service with ID ${serviceId} does not exist` }]);
  }
  
  return await Booking.create(data);
};

const getAll = async () => {
  return await Booking.getAll();
};

const getById = async (id) => {
  return await Booking.getById(id);
};

module.exports = { createBooking, getAll, getById };