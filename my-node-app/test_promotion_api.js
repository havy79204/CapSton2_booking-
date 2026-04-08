const { query } = require('./src/config/query.js');

async function testPromotionAPI() {
  try {
    console.log('=== TESTING PROMOTION API ===\n');
    
    // Test the exact promotion code processing that createAppointment uses
    console.log('1. Testing promotion code lookup...');
    const promoResult = await query(
      `SELECT PromotionId, DiscountValue, DiscountType, Status 
       FROM Promotions 
       WHERE Code = @code AND Status = 'ACTIVE' 
       AND GETDATE() BETWEEN StartDate AND EndDate`,
      { code: 'WELCOME10' }
    );
    
    console.log('WELCOME10 lookup result:');
    console.table(promoResult.recordset || []);
    
    if (promoResult.recordset?.length > 0) {
      const promotion = promoResult.recordset[0];
      console.log('✅ Found valid promotion:', promotion);
      
      // Test the insert statement
      console.log('\n2. Testing insert with PromotionId...');
      const testBookingId = 'TEST-' + Date.now();
      
      try {
        await query(`
          INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
           VALUES (@bookingId, @customerUserId, @bookingTime, @status, @notes)`,
          {
            bookingId: testBookingId,
            customerUserId: 'fac068cea5ce219ce7b48708', // Test customer
            bookingTime: new Date(),
            status: 'pending',
            notes: 'Test booking with promotion'
          }
        );
        
        console.log('✅ Booking inserted');
        
        await query(`
          INSERT INTO BookingServices 
           (BookingServiceId, BookingId, ServiceId, StaffId, Price, PromotionId)
           VALUES (@id, @bookingId, @serviceId, @staffId, @price, @promotionId)`,
          {
            id: 'TEST-SERVICE-' + Date.now(),
            bookingId: testBookingId,
            serviceId: '5', // Acrylic Nail
            staffId: '3c32b037237f919d1fe4be2a', // thục anh
            price: 300000,
            promotionId: promotion.PromotionId
          }
        );
        
        console.log('✅ BookingService with PromotionId inserted');
        
        // Check the result
        const checkResult = await query(`
          SELECT 
            b.BookingId,
            b.Notes,
            bs.PromotionId,
            p.Code,
            p.DiscountValue,
            p.DiscountType,
            bs.Price
          FROM Bookings b
          JOIN BookingServices bs ON bs.BookingId = b.BookingId
          LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
          WHERE b.BookingId = @bookingId
        `, { bookingId: testBookingId });
        
        console.log('Test booking result:');
        console.table(checkResult.recordset || []);
        
        // Clean up
        await query('DELETE FROM BookingServices WHERE BookingId = @bookingId', { bookingId: testBookingId });
        await query('DELETE FROM Bookings WHERE BookingId = @bookingId', { bookingId: testBookingId });
        console.log('✅ Test data cleaned up');
        
      } catch (err) {
        console.error('❌ Insert test failed:', err.message);
      }
    } else {
      console.log('❌ No valid promotion found for WELCOME10');
    }
    
  } catch (err) {
    console.error('❌ Test error:', err.message);
    console.error('Stack:', err.stack);
  }
}

testPromotionAPI();
