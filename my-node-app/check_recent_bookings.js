const { query } = require('./src/config/query.js');

async function checkRecentBookings() {
  try {
    console.log('=== CHECKING ALL RECENT BOOKINGS ===\n');
    
    // Get all recent bookings (last 10)
    const recentBookings = await query(`
      SELECT TOP 10
        b.BookingId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.BookingServiceId,
        bs.ServiceId,
        bs.StaffId,
        bs.Price,
        bs.PromotionId,
        p.Code,
        p.DiscountValue,
        p.DiscountType,
        p.Status as PromoStatus,
        sv.Name as ServiceName,
        cu.Name as CustomerName
      FROM Bookings b
      JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('All recent bookings (last 10):');
    console.table(recentBookings.recordset || []);
    
    // Check bookings with promotion
    const promoBookings = await query(`
      SELECT TOP 5
        b.BookingId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.PromotionId,
        p.Code,
        p.DiscountValue,
        p.DiscountType,
        bs.Price,
        sv.Name as ServiceName,
        cu.Name as CustomerName
      FROM Bookings b
      JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      WHERE bs.PromotionId IS NOT NULL
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('\nBookings with PromotionId:');
    console.table(promoBookings.recordset || []);
    
    // Check today's bookings
    const todayBookings = await query(`
      SELECT TOP 5
        b.BookingId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.PromotionId,
        p.Code,
        p.DiscountValue,
        p.DiscountType,
        bs.Price,
        sv.Name as ServiceName,
        cu.Name as CustomerName
      FROM Bookings b
      JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      WHERE CAST(b.BookingTime AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('\nToday\'s bookings:');
    console.table(todayBookings.recordset || []);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

checkRecentBookings();
