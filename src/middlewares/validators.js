const isInteger = (v) => Number.isInteger(Number(v));
const ValidationError = require('../errors/ValidationError');

// Basic HTML escaping to reduce XSS in stored/displayed fields
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const validateService = (req, res, next) => {
  const errors = [];
  const body = req.body || {};

  const rawName = body.name ? String(body.name).trim() : '';
  if (!rawName) errors.push({ field: 'name', message: 'name is required' });
  if (rawName && rawName.length > 100) errors.push({ field: 'name', message: 'name must be 100 characters or fewer' });

  const priceRaw = body.price;
  const price = priceRaw === undefined || priceRaw === null || priceRaw === '' ? null : Number(priceRaw);
  if (price === null || Number.isNaN(price)) errors.push({ field: 'price', message: 'price is required and must be a number' });
  else if (price < 0) errors.push({ field: 'price', message: 'price must be non-negative' });
  else if (price > 1000000) errors.push({ field: 'price', message: 'price is too large' });

  const rawDescription = body.description ? String(body.description).trim() : '';
  if (rawDescription.length > 2000) errors.push({ field: 'description', message: 'description must be 2000 characters or fewer' });

  const statusRaw = body.status ? String(body.status).trim().toLowerCase() : 'active';
  const allowedStatus = ['active', 'inactive'];
  const status = allowedStatus.includes(statusRaw) ? statusRaw : 'active';

  if (errors.length) return next(new ValidationError(errors));

  // sanitize and escape text fields
  const name = escapeHtml(rawName);
  const description = escapeHtml(rawDescription);

  req.sanitizedBody = { name, price, description, status };
  next();
};

const validateBooking = (req, res, next) => {
  const errors = [];
  const body = req.body || {};

  const serviceId = body.serviceId;
  if (serviceId === undefined || serviceId === null || !isInteger(serviceId) || Number(serviceId) <= 0) errors.push({ field: 'serviceId', message: 'serviceId is required and must be a positive integer' });

  const rawCustomerName = body.customerName ? String(body.customerName).trim() : '';
  if (!rawCustomerName) errors.push({ field: 'customerName', message: 'customerName is required' });
  if (rawCustomerName && rawCustomerName.length > 200) errors.push({ field: 'customerName', message: 'customerName must be 200 characters or fewer' });

  const rawPhone = body.phone ? String(body.phone).trim() : '';
  if (rawPhone && rawPhone.length > 30) errors.push({ field: 'phone', message: 'phone must be 30 characters or fewer' });
  const phoneRegex = /^[0-9 +\-()]{7,30}$/;
  if (rawPhone && !phoneRegex.test(rawPhone)) errors.push({ field: 'phone', message: 'phone contains invalid characters' });

  let bookingDate = null;
  if (body.bookingDate) {
    const d = new Date(body.bookingDate);
    if (Number.isNaN(d.getTime())) errors.push({ field: 'bookingDate', message: 'bookingDate is invalid' });
    else bookingDate = d;
  } else {
    bookingDate = new Date();
  }

  if (errors.length) return next(new ValidationError(errors));

  const customerName = escapeHtml(rawCustomerName);
  const phone = escapeHtml(rawPhone);

  req.sanitizedBody = { serviceId: Number(serviceId), customerName, phone, bookingDate };
  next();
};

module.exports = { validateService, validateBooking };
