const express = require("express");
const router = express.Router();
const salonController = require("../controllers/salon.controller");

router.get("/", salonController.getSalons);

module.exports = router;