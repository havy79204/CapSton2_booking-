const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = 5000;

(async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
})();