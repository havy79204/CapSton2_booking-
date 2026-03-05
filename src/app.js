const express = require("express");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("API running...");
});

// ✅ Import route đúng 1 lần
const salonRoutes = require("./routes/salon.routes");
const serviceRoutes = require("./routes/serviceRoutes");
const bookingRoutes = require("./routes/bookingRoutes");

// ✅ Mount routes
app.use("/api/salons", salonRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/bookings", bookingRoutes);

// error handler phải đặt cuối cùng
const { errorHandler } = require("./middlewares/errorFormatter");
app.use(errorHandler);

module.exports = app;