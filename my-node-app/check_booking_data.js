const { query } = require('./src/config/query.js');

async function checkBookingData() {
  try {
    console.log('=== Checking PromotionId column ===');
    
    // Check if PromotionId column exists
    const colCheck = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'BookingServices' AND COLUMN_NAME = 'PromotionId'
    `);
    
    console.log('PromotionId column exists:', colCheck.recordset?.length > 0 ? 'YES' : 'NO');
    if (colCheck.recordset?.length > 0) {
      console.table(colCheck.recordset);
    }
    
    // Check for any BookingServices with PromotionId
    console.log('\n=== Checking BookingServices with PromotionId ===');
    const bookingData = await query(`
      SELECT TOP 10 
        BookingServiceId, 
        BookingId, 
        ServiceId, 
        Price,
        PromotionId,
        StaffId
      FROM BookingServices
      ORDER BY BookingServiceId DESC
    `);
    
    console.table(bookingData.recordset || []);
    
    // Check specifically for recent bookings with promotion
    console.log('\n=== Recent bookings with promotion data ===');
    const recentWithPromo = await query(`
      SELECT TOP 5
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
      WHERE b.BookingTime >= DATEADD(day, -7, GETDATE())
      ORDER BY b.BookingTime DESC
    `);
    
    console.table(recentWithPromo.recordset || []);
    
    // Test the exact query used in appointments service
    console.log('\n=== Testing appointments service query ===');
    const testQuery = await query(`
      SELECT TOP 5
      b.BookingId,
      b.CustomerUserId,
      b.BookingTime,
      b.Status AS BookingStatus,
      b.Notes,
      cu.Name AS CustomerName,
      
      -- Simple: Get first service only
      COALESCE(sv.Name, 'No Service') AS FirstService,
      COALESCE(bs.ServiceId, '') AS FirstServiceId,
      COALESCE(sv.DurationMinutes, 30) AS TotalDuration,
      
      -- Price calculation (with promotions)
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
      ORDER BY b.BookingTime DESC
    `);
    
    console.table(testQuery.recordset || []);
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

checkBookingData();
