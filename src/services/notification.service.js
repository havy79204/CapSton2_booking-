const sql = require('mssql');
const { poolPromise } = require('../config/db');

async function createNotification(data) {
    try {
        const pool = await poolPromise;

        await pool.request()
            .input('UserId', sql.UniqueIdentifier, data.UserId)
            .input('BookingId', sql.UniqueIdentifier, data.BookingId)
            .input('OrderId', sql.UniqueIdentifier, data.OrderId)
            .input('Title', sql.NVarChar, data.Title)
            .input('Body', sql.NVarChar, data.Body)
            .input('Type', sql.NVarChar, data.Type)
            .input('Channel', sql.NVarChar, data.Channel)
            .input('IsRead', sql.Bit, false)
            .query(`
                INSERT INTO Notifications
                (UserId, BookingId, OrderId, Title, Body, Type, Channel, IsRead, CreatedAt)
                VALUES
                (@UserId, @BookingId, @OrderId, @Title, @Body, @Type, @Channel, @IsRead, GETDATE())
            `);

        return { success: true };

    } catch (err) {
        console.error("Create Notification Error:", err);
        throw err;
    }
}

async function getUserNotifications(userId) {
    const pool = await poolPromise;

    const result = await pool.request()
        .input('UserId', sql.UniqueIdentifier, userId)
        .query(`
            SELECT *
            FROM Notifications
            WHERE UserId = @UserId
            ORDER BY CreatedAt DESC
        `);

    return result.recordset;
}

async function markAsRead(notificationId) {
    const pool = await poolPromise;

    await pool.request()
        .input('NotificationId', sql.UniqueIdentifier, notificationId)
        .query(`
            UPDATE Notifications
            SET IsRead = 1
            WHERE NotificationId = @NotificationId
        `);
}

module.exports = {
    createNotification,
    getUserNotifications,
    markAsRead
};