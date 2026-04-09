const { query } = require('./src/config/query.js');

async function checkLatestBooking() {
  try {
    console.log('=== CHECKING LATEST BOOKING DATA ===\n');
    
    // Get the most recent booking
    const latestBooking = await query(`
      SELECT TOP 1
        b.BookingId,
        b.BookingTime,
        b.Status,
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
    
    console.log('Latest booking raw data:');
    console.table(latestBooking.recordset || []);
    
    // Test the exact query from listAppointments
    console.log('\nTesting listAppointments query for latest booking...');
    const listQuery = await query(`
      SELECT TOP 1
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
    
    console.log('listAppointments query result:');
    console.table(listQuery.recordset || []);
    
    // Simulate frontend mapping
    if (listQuery.recordset && listQuery.recordset.length > 0) {
      const row = listQuery.recordset[0];
      const frontendData = {
        price: Number(row.Price || 0),
        discount: Number(row.Discount || 0),
        discountType: row.DiscountType || 'fixed',
        totalPrice: Number(row.TotalPrice || 0)
      };
      
      console.log('\nFrontend mapped data:');
      console.table([frontendData]);
      
      // Check the frontend display logic
      const discountDisplay = frontendData.discount && frontendData.discount > 0 ? 
        (frontendData.discountType === 'percentage' ? `${frontendData.discount}%` : `${frontendData.discount.toLocaleString()}đ`) : '—';
      
      console.log('\nFrontend discount display logic:');
      console.log(`discount: ${frontendData.discount}`);
      console.log(`discount > 0: ${frontendData.discount > 0}`);
      console.log(`discountDisplay: "${discountDisplay}"`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

checkLatestBooking();
