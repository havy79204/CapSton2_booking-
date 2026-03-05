const sql = require("mssql");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const connectDB = require("../connectDB");

const JWT_SECRET = "mysecretkey"; // hard code JWT
exports.register = async (data) => {
  const { username, email, password } = data;

  if (!username || !email || !password) {
    throw new Error("Missing required fields");
  }

  const pool = await connectDB();

  // Kiểm tra email tồn tại chưa
  const existingUser = await pool.request()
    .input("email", sql.NVarChar, email)
    .query("SELECT * FROM Users WHERE Email = @email");

  if (existingUser.recordset.length > 0) {
    throw new Error("Email already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert user
  await pool.request()
    .input("username", sql.NVarChar, username)
    .input("email", sql.NVarChar, email)
    .input("password", sql.NVarChar, hashedPassword)
    .query(`
      INSERT INTO Users (Username, Email, Password)
      VALUES (@username, @email, @password)
    `);

  return { username, email };
};

// ================= LOGIN =================
exports.login = async (data) => {
  const { email, password } = data;

  if (!email || !password) {
    throw new Error("Missing email or password");
  }

  const pool = await connectDB();

  const result = await pool.request()
    .input("email", sql.NVarChar, email)
    .query("SELECT * FROM Users WHERE Email = @email");

  if (result.recordset.length === 0) {
    throw new Error("User not found");
  }

  const user = result.recordset[0];

  const isMatch = await bcrypt.compare(password, user.Password);

  if (!isMatch) {
    throw new Error("Invalid password");
  }

  const token = jwt.sign(
    { id: user.Id, email: user.Email },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  return { token };
};