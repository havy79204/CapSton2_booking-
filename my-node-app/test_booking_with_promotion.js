const { query } = require('./src/config/query');

async function testBookingWithPromotion() {
  try {
    console.log('=== CREATING TEST BOOKING WITH PROMOTION ===');
    
    // Get test data
    const customers = await query('SELECT TOP 1 UserId FROM Users');
    const staff = await query('SELECT TOP 1 s.StaffId, u.UserId FROM Staff s JOIN Users u ON u.UserId = s.UserId');
    const service = await query('SELECT TOP 1 ServiceId, Price FROM Services WHERE Price > 0');
    
    if (!customers.recordset?.length || !staff.recordset?.length || !service.recordset?.length) {
      throw new Error('Missing test data');
    }
    
    const customerUserId = customers.recordset[0].UserId;
    const staffId = staff.recordset[0].StaffId;
    const serviceId = service.recordset[0].ServiceId;
    const servicePrice = service.recordset[0].Price;
    
    console.log(`Customer: ${customerUserId}, Staff: ${staffId}, Service: ${serviceId} (Price: ${servicePrice})`);
    
    // Create booking
    const bookingId = 'test' + Date.now();
    const bookingTime = new Date();
    bookingTime.setHours(bookingTime.getHours() + 1);
    
    await query(`
      INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
      VALUES (@bookingId, @customerUserId, @bookingTime, 'Pending', 'Test with promotion')
    `, {
      bookingId,
      customerUserId,
      bookingTime,
    });
    
    // Insert booking service with promotion
    const promotionId = '1'; // WELCOME10 promotion
    const bookingServiceId = 'bs' + Date.now();
    
    await query(`
      INSERT INTO BookingServices (BookingServiceId, BookingId, ServiceId, StaffId, Price, PromotionId)
      VALUES (@bookingServiceId, @bookingId, @serviceId, @staffId, @price, @promotionId)
    `, {
      bookingServiceId,
      bookingId,
      serviceId,
      staffId,
      price: servicePrice,
      promotionId,
    });
    
    console.log('✅ Created booking with promotion');
    
    // Test the discount calculation query
    console.log('\n=== TESTING DISCOUNT CALCULATION ===');
    const result = await query(`
      SELECT 
        b.BookingId,
        bs.PromotionId,
        COALESCE(bs.Price, sv.Price, 0) AS Price,
        COALESCE(p.DiscountValue, 0) AS Discount,
        COALESCE(p.DiscountType, 'fixed') AS DiscountType,
        CASE 
          WHEN COALESCE(p.DiscountValue, 0) > 0 THEN
            CASE 
              WHEN UPPER(COALESCE(p.DiscountType, 'fixed')) = 'FIXED' 
                THEN COALESCE(bs.Price, sv.Price, 0) - COALESCE(p.DiscountValue, 0)
              WHEN UPPER(COALESCE(p.DiscountType, 'fixed')) = 'PERCENT'
                THEN COALESCE(bs.Price, sv.Price, 0) * (1 - COALESCE(p.DiscountValue, 0) / 100)
              ELSE COALESCE(bs.Price, sv.Price, 0)
            END
          ELSE COALESCE(bs.Price, sv.Price, 0)
        END AS TotalPrice,
        p.Code AS PromotionCode
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      WHERE b.BookingId = @bookingId
    `, { bookingId });
    
    console.log('📊 Discount calculation result:', result.recordset[0]);
    
    // Expected: Price = 300000, Discount = 10, DiscountType = PERCENT, TotalPrice = 270000
    
    console.log('\n=== CLEANING UP ===');
    await query('DELETE FROM BookingServices WHERE BookingId = @bookingId', { bookingId });
    await query('DELETE FROM Bookings WHERE BookingId = @bookingId', { bookingId });
    console.log('🧹 Cleaned up test data');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

testBookingWithPromotion();
