const { query } = require('./src/config/query');
const svc = require('./src/services/notifications.service');

async function main() {
  const dbRows = (await query(
    "SELECT TOP (20) NotificationId, UserId, Title, Content, IsRead, CreatedAt, UpdatedAt, Type, Channel, Body, BookingId, OrderId, ScheduledAt, SentAt, EmailSentAt FROM Notifications ORDER BY COALESCE(CreatedAt, UpdatedAt) DESC, NotificationId DESC"
  )).recordset || [];

  const sampleUserId = String(dbRows.find(r => r.UserId)?.UserId || 'dev-1');

  const customer = await svc.listCustomerNotifications({ userId: sampleUserId, limit: 50, type: 'all' });
  const owner = await svc.listOwnerNotifications({ userId: sampleUserId, limit: 50 });

  const out = {
    sampleUserId,
    dbRows,
    customer,
    owner,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
