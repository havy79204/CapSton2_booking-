const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");

const register = async ({ username, email, password }) => {
  const existingUser = await userModel.findUserByEmail(email);
  if (existingUser) {
    throw new Error("Email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await userModel.createUser(username, email, hashedPassword);

  return { username, email };
};

const login = async ({ email, password }) => {
  const user = await userModel.findUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Wrong password");
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    "secretKey",
    { expiresIn: "1h" }
  );

  return { token };
};

module.exports = {
  register,
  login
};