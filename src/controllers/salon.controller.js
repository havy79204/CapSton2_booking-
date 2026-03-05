const express = require("express");

const getSalons = async (req, res) => {
  try {
    // TODO: Implement getSalons from database
    res.json([{ id: 1, name: "Salon A" }, { id: 2, name: "Salon B" }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getSalons };
