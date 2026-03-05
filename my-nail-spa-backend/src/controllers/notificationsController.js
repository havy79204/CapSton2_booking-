const { sql, getPool } = require("../config/db");
exports.getSettings = async (req, res) => {
  res.json({ enableNotifications: true, enableEmail: false })
}

exports.putSettings = async (req, res) => {
  res.json({ message: "Settings updated" })
}

exports.patchMarkRead = async (req, res) => {
  res.json({ message: "Marked as read" })
}

exports.listNotifications = async (req, res) => {
  try {
    const pool = await getPool();
    // Lấy userId từ req.user, có thể là id hoặc UserId tuỳ theo middleware
    const userId = req.user.UserId || req.user.id;
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }
    const result = await pool.request()
      .input("UserId", sql.NVarChar(64), userId)
      .query(`
        SELECT 
          NotificationId,
          Title,
          Body,
          Type,
          Channel,
          IsRead,
          CreatedAt
        FROM Notifications
        WHERE UserId = @UserId
          AND Channel = 'in-app'
        ORDER BY CreatedAt DESC
      `);
    res.set("Cache-Control", "no-store");
    res.json(result.recordset);
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
