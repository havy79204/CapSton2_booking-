const sql = require('mssql');
const connectDB = require('../connectDB');

const create = async (data) => {
  const { serviceId, customerName, phone, bookingDate } = data;
  const pool = await connectDB();
  const result = await pool.request()
    .input('serviceId', sql.Int, serviceId)
    .input('customerName', sql.NVarChar, customerName)
    .input('phone', sql.NVarChar, phone)
    .input('bookingDate', sql.DateTime, bookingDate)
    .query(`
      INSERT INTO Bookings (ServiceId, CustomerName, Phone, BookingDate)
      OUTPUT INSERTED.*
      VALUES (@serviceId, @customerName, @phone, @bookingDate)
    `);

  return result.recordset[0];
};

const getAll = async () => {
  const pool = await connectDB();
  const result = await pool.request().query('SELECT * FROM Bookings');
  return result.recordset;
};

const getById = async (id) => {
  const pool = await connectDB();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM Bookings WHERE Id = @id');
  return result.recordset[0];
};

module.exports = { create, getAll, getById };