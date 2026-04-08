const { query } = require('./src/config/query.js');

async function testBookingFlow() {
  try {
    console.log('=== TESTING BOOKING FLOW ===\n');
    
    // 1. Check if backend is running and can connect
    console.log('1. Testing database connection...');
    const testConn = await query('SELECT GETDATE() as CurrentTime');
    console.log('✅ Database connected:', testConn.recordset?.[0]?.CurrentTime);
    
    // 2. Check PromotionId column exists
    console.log('\n2. Checking PromotionId column...');
    const promoColCheck = await query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'BookingServices' AND COLUMN_NAME = 'PromotionId'
    `);
    console.log('✅ PromotionId column exists:', promoColCheck.recordset?.length > 0 ? 'YES' : 'NO');
    
    // 3. Check available promotions
    console.log('\n3. Checking available promotions...');
    const promos = await query(`
      SELECT PromotionId, Code, DiscountValue, DiscountType, Status, StartDate, EndDate
      FROM Promotions 
      WHERE Status = 'ACTIVE'
      ORDER BY PromotionId
    `);
    console.log('Available promotions:');
    console.table(promos.recordset || []);
    
    // 4. Test promotion code lookup
    console.log('\n4. Testing promotion code lookup...');
    const testPromo = await query(`
      SELECT PromotionId, DiscountValue, DiscountType, Status 
      FROM Promotions 
      WHERE Code = @code AND Status = 'ACTIVE' 
      AND GETDATE() BETWEEN StartDate AND EndDate`,
      { code: 'WELCOME10' }
    );
    console.log('WELCOME10 promotion lookup result:');
    console.table(testPromo.recordset || []);
    
    // 5. Check recent bookings with PromotionId
    console.log('\n5. Checking recent bookings with PromotionId...');
    const recentBookings = await query(`
      SELECT TOP 5
        b.BookingId,
        b.BookingTime,
        b.Status,
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
    console.log('Recent bookings with promotion data:');
    console.table(recentBookings.recordset || []);
    
    // 6. Test the exact query used in listAppointments
    console.log('\n6. Testing listAppointments query...');
    const listQuery = await query(`
      SELECT TOP 3
      b.BookingId,
      b.CustomerUserId,
      b.BookingTime,
      b.Status AS BookingStatus,
      b.Notes,
      cu.Name AS CustomerName,
      
      COALESCE(sv.Name, 'No Service') AS FirstService,
      COALESCE(bs.ServiceId, '') AS FirstServiceId,
      COALESCE(sv.DurationMinutes, 30) AS TotalDuration,
      
      COALESCE(bs.Price, sv.Price, 0) AS Price,
      COALESCE(p.DiscountValue, 0) AS Discount,
      COALESCE(p.DiscountType, 'fixed') AS DiscountType,
      CASE 
        WHEN COALESCE(p.DiscountValue, 0) > 0 THEN
          CASE 
            WHEN COALESCE(p.DiscountType, 'fixed') = 'fixed' 
              THEN COALESCE(bs.Price, sv.Price, 0) - COALESCE(p.DiscountValue, 0)
            WHEN COALESCE(p.DiscountType, 'fixed') = 'percentage'
              THEN COALESCE(bs.Price, sv.Price, 0) * (1 - COALESCE(p.DiscountValue, 0) / 100)
            ELSE COALESCE(bs.Price, sv.Price, 0)
          END
        ELSE COALESCE(bs.Price, sv.Price, 0)
      END AS TotalPrice,
      
      st.StaffId AS StaffIdResolved,
      su.Name AS StaffName

      FROM Bookings b
      LEFT JOIN Users cu ON cu.UserId = b.CustomerUserId
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Staff st ON st.StaffId = bs.StaffId
      LEFT JOIN Users su ON su.UserId = st.UserId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      ORDER BY b.BookingTime DESC`
    );
    
    console.log('listAppointments query results:');
    console.table(listQuery.recordset || []);
    
    // 7. Check if frontend is receiving the right data
    console.log('\n7. Simulating frontend data processing...');
    const sampleData = (listQuery.recordset || []).map(row => ({
      price: Number(row.Price || 0),
      discount: Number(row.Discount || 0),
      discountType: row.DiscountType || 'fixed',
      totalPrice: Number(row.TotalPrice || 0)
    }));
    
    console.log('Frontend data format:');
    console.table(sampleData);
    
    console.log('\n=== TEST COMPLETE ===');
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error('Stack:', err.stack);
  }
}

testBookingFlow();
