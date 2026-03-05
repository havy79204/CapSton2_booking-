const sql = require("mssql");
const connectDB = require("../connectDB");

const getAll = async () => {
  const pool = await connectDB();
  const result = await pool.request().query("SELECT * FROM Services");
  return result.recordset;
};

const getById = async (id) => {
  const pool = await connectDB();
  const result = await pool.request()
    .input("id", sql.Int, id)
    .query("SELECT * FROM Services WHERE Id = @id");
  return result.recordset[0];
};

const create = async (data) => {
  const { name, price, description, status } = data;
  const pool = await connectDB();
  const result = await pool.request()
    .input('name', sql.NVarChar, name)
    .input('price', sql.Decimal(18,2), price)
    .input('description', sql.NVarChar, description)
    .input('status', sql.NVarChar, status || 'active')
    .query(`
      INSERT INTO Services (Name, Price, Description, Status)
      OUTPUT INSERTED.*
      VALUES (@name, @price, @description, @status)
    `);

  return result.recordset[0];
};

const update = async (id, data) => {
  const { name, price, description, status } = data;
  const pool = await connectDB();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar, name)
    .input('price', sql.Decimal(18,2), price)
    .input('description', sql.NVarChar, description)
    .input('status', sql.NVarChar, status)
    .query(`
      UPDATE Services
      SET Name = @name, Price = @price, Description = @description, Status = @status
      OUTPUT INSERTED.*
      WHERE Id = @id
    `);

  return result.recordset[0];
};

const remove = async (id) => {
  const pool = await connectDB();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('DELETE FROM Services WHERE Id = @id');

  return result.rowsAffected[0] > 0;
};

const exists = async (id) => {
  const pool = await connectDB();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT 1 FROM Services WHERE Id = @id');

  return result.recordset.length > 0;
};

module.exports = { getAll, getById, create, update, remove, exists };