const sql = require("mssql");
const { poolPromise } = require("../config/connectDB");

exports.getServicesBySalon = async (salonId) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input("salonId", sql.VarChar, salonId)
    .query(`
      SELECT ServiceId, Name, Price, DurationMinutes
      FROM SalonServices
      WHERE SalonId = @salonId
    `);

  return result.recordset;
};

exports.checkSalonExists = async (salonId) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("salonId", sql.VarChar, salonId)
    .query("SELECT SalonId FROM Salons WHERE SalonId = @salonId");

  return result.recordset.length > 0;
};

exports.checkServiceExists = async (serviceId) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input("serviceId", sql.Int, serviceId)
    .query("SELECT ServiceId FROM SalonServices WHERE ServiceId = @serviceId");

  return result.recordset.length > 0;
};