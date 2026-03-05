const sql = require("mssql");
const connectDB = require("../connectDB");
const createUser = async (username, email, password) => {
  const pool = await connectDB(); 

  await pool.request()
    .input("username", sql.NVarChar, username)
    .input("email", sql.NVarChar, email)
    .input("password", sql.NVarChar, password)
    .query(`
      INSERT INTO Users (Username, Email, Password)
      VALUES (@username, @email, @password)
    `);
};
const findUserByEmail = async (email) => {
  const pool = await connectDB(); 

  const result = await pool.request()
    .input("email", sql.NVarChar, email)
    .query(`
      SELECT * FROM Users WHERE Email = @email
    `);

  return result.recordset[0];
};

module.exports = {
  createUser,
  findUserByEmail
};