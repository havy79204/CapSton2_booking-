const { query } = require('./src/config/query.js');

async function debugBooking() {
  try {
    console.log('=== Debug recent booking with promotion ===');
    
    // Find the most recent booking
    const recentBooking = await query(`
      SELECT TOP 1
        b.BookingId,
        b.BookingTime,
        b.Status,
        bs.BookingServiceId,
        bs.ServiceId,
        bs.Price,
        bs.PromotionId,
        p.PromotionCode,
        p.DiscountValue,
        p.DiscountType
      FROM Bookings b
      JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('Most recent booking:');
    console.table(recentBooking.recordset || []);
    
    // Check if there are any bookings with PromotionId
    const bookingsWithPromo = await query(`
      SELECT COUNT(*) as count
      FROM BookingServices
      WHERE PromotionId IS NOT NULL
    `);
    
    console.log('Bookings with PromotionId:', bookingsWithPromo.recordset?.[0]?.count || 0);
    
    // Check recent bookings in last hour
    const recentHour = await query(`
      SELECT 
        b.BookingId,
        b.BookingTime,
        b.Status,
        bs.BookingServiceId,
        bs.ServiceId,
        bs.Price,
        bs.PromotionId,
        p.PromotionCode,
        p.DiscountValue,
        p.DiscountType
      FROM Bookings b
      JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      WHERE b.BookingTime >= DATEADD(hour, -1, GETDATE())
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('Bookings in last hour:');
    console.table(recentHour.recordset || []);
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

debugBooking();
