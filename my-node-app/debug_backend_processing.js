const { query } = require('./src/config/query.js');

async function debugBackendProcessing() {
  try {
    console.log('=== DEBUG BACKEND PROCESSING ===\n');
    
    // 1. Check if createAppointment function actually processes promotionCode
    console.log('1. Checking createAppointment function...');
    
    // Read the appointments.service.js file to see if promotionCode is processed
    const fs = require('fs');
    const path = require('path');
    const serviceFile = fs.readFileSync(path.join(__dirname, 'src/services/appointments.service.js'), 'utf8');
    
    const hasPromotionCodeParam = serviceFile.includes('promotionCode');
    const hasPromotionProcessing = serviceFile.includes('SELECT PromotionId FROM Promotions');
    const hasPromotionIdInsert = serviceFile.includes('PromotionId) VALUES');
    
    console.log('✅ Has promotionCode parameter:', hasPromotionCodeParam);
    console.log('✅ Has promotion processing:', hasPromotionProcessing);
    console.log('✅ Has PromotionId insert:', hasPromotionIdInsert);
    
    // 2. Check if BookingServices table actually has PromotionId column
    console.log('\n2. Checking BookingServices table structure...');
    const structureCheck = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'BookingServices'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('BookingServices columns:');
    console.table(structureCheck.recordset || []);
    
    const hasPromotionIdColumn = structureCheck.recordset?.some(col => col.COLUMN_NAME === 'PromotionId');
    console.log('✅ BookingServices has PromotionId column:', hasPromotionIdColumn);
    
    // 3. Test the exact promotion code processing logic
    console.log('\n3. Testing promotion code lookup...');
    const testPromo = await query(`
      SELECT PromotionId, DiscountValue, DiscountType, Status 
      FROM Promotions 
      WHERE Code = @code AND Status = 'ACTIVE' 
      AND GETDATE() BETWEEN StartDate AND EndDate`,
      { code: 'WELCOME10' }
    );
    
    console.log('WELCOME10 lookup result:');
    console.table(testPromo.recordset || []);
    
    // 4. Test the exact insert statement
    console.log('\n4. Testing insert with PromotionId...');
    const testBookingId = 'TEST-' + Date.now();
    const testServiceId = '1'; // Assuming service ID 1 exists
    const testStaffId = '1'; // Assuming staff ID 1 exists
    const testPromotionId = testPromo.recordset?.[0]?.PromotionId;
    
    console.log('Test data:', {
      testBookingId,
      testServiceId,
      testStaffId,
      testPromotionId
    });
    
    if (testPromotionId) {
      try {
        await query(`
          INSERT INTO BookingServices 
           (BookingServiceId, BookingId, ServiceId, StaffId, Price, PromotionId)
           VALUES (@id, @bookingId, @serviceId, @staffId, @price, @promotionId)`,
          {
            id: 'TEST-SERVICE-' + Date.now(),
            bookingId: testBookingId,
            serviceId: testServiceId,
            staffId: testStaffId,
            price: 300000,
            promotionId: testPromotionId
          }
        );
        
        console.log('✅ Insert with PromotionId successful');
        
        // Clean up test data
        await query('DELETE FROM Bookings WHERE BookingId = @bookingId', { bookingId: testBookingId });
        console.log('✅ Test data cleaned up');
        
      } catch (err) {
        console.error('❌ Insert with PromotionId failed:', err.message);
      }
    }
    
    // 5. Check recent bookings again
    console.log('\n5. Checking recent bookings after test...');
    const recentBookings = await query(`
      SELECT TOP 3
        b.BookingId,
        b.BookingTime,
        b.Notes,
        bs.PromotionId,
        p.Code,
        p.DiscountValue,
        p.DiscountType,
        bs.Price
      FROM Bookings b
      JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('Recent bookings after test:');
    console.table(recentBookings.recordset || []);
    
  } catch (err) {
    console.error('❌ Debug error:', err.message);
    console.error('Stack:', err.stack);
  }
}

debugBackendProcessing();
