const { query } = require('./src/config/query.js');

async function checkDatabaseStructure() {
  try {
    console.log('=== DATABASE STRUCTURE CHECK ===\n');
    
    // 1. Check BookingServices table
    console.log('1. BOOKINGSERVICES TABLE:');
    const bookingServices = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'BookingServices'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(bookingServices.recordset || []);
    
    // 2. Check Bookings table
    console.log('\n2. BOOKINGS TABLE:');
    const bookings = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Bookings'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(bookings.recordset || []);
    
    // 3. Check Promotions table
    console.log('\n3. PROMOTIONS TABLE:');
    const promotions = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Promotions'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(promotions.recordset || []);
    
    // 4. Check sample data - recent bookings
    console.log('\n4. RECENT BOOKINGS (TOP 5):');
    const recentBookings = await query(`
      SELECT TOP 5
        b.BookingId,
        b.CustomerUserId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.BookingServiceId,
        bs.ServiceId,
        bs.StaffId,
        bs.Price,
        bs.PromotionId,
        sv.Name as ServiceName,
        cu.Name as CustomerName
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      ORDER BY b.BookingTime DESC
    `);
    console.table(recentBookings.recordset || []);
    
    // 5. Check promotions with bookings
    console.log('\n5. PROMOTIONS WITH BOOKINGS:');
    const promoBookings = await query(`
      SELECT TOP 5
        b.BookingId,
        b.BookingTime,
        bs.PromotionId,
        p.Code,
        p.DiscountValue,
        p.DiscountType,
        p.Status as PromoStatus,
        bs.Price
      FROM Bookings b
      JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      WHERE bs.PromotionId IS NOT NULL
      ORDER BY b.BookingTime DESC
    `);
    console.table(promoBookings.recordset || []);
    
    // 6. Count bookings with promotions
    console.log('\n6. COUNTS:');
    const counts = await query(`
      SELECT 
        COUNT(*) as TotalBookings,
        COUNT(CASE WHEN bs.PromotionId IS NOT NULL THEN 1 END) as BookingsWithPromotion,
        COUNT(CASE WHEN bs.PromotionId IS NULL THEN 1 END) as BookingsWithoutPromotion
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
    `);
    console.table(counts.recordset || []);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

checkDatabaseStructure();
