const express = require("express");
const router = express.Router();
const sql = require("mssql");
const config = require("../config/db");

// GET reviews theo salon
router.get("/:salonId", async (req, res) => {
  try {
    await sql.connect(config);
    const result = await sql.query`
      SELECT * FROM SalonReviews
      WHERE SalonId = ${req.params.salonId}
      ORDER BY CreatedAt DESC
    `;
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST thêm review
router.post("/", async (req, res) => {
  try {
    const { SalonId, UserName, Rating, Text } = req.body;

    await sql.connect(config);

    await sql.query`
      INSERT INTO SalonReviews (SalonId, UserName, Rating, Text, CreatedAt, Verified)
      VALUES (${SalonId}, ${UserName}, ${Rating}, ${Text}, GETDATE(), 1)
    `;

    res.json({ message: "Review added successfully" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;