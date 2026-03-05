const notificationService = require('../services/notification.service');

exports.create = async (req, res) => {
    try {
        const result = await notificationService.createNotification(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getByUser = async (req, res) => {
    try {
        const data = await notificationService.getUserNotifications(req.params.userId);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.markRead = async (req, res) => {
    try {
        await notificationService.markAsRead(req.params.id);
        res.json({ message: "Marked as read" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};