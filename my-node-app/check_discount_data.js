const { query } = require('./src/config/query');

async function checkData() {
  try {
    console.log('=== CHECKING BOOKINGSERVICES TABLE ===');
    const bs = await query('SELECT TOP 5 BookingId, PromotionId, Price FROM BookingServices ORDER BY BookingId DESC');
    console.log('BookingServices:', bs.recordset);
    
    console.log('\n=== CHECKING PROMOTIONS TABLE ===');
    const promos = await query('SELECT TOP 5 PromotionId, Code, DiscountValue, DiscountType FROM Promotions');
    console.log('Promotions:', promos.recordset);
    
    console.log('\n=== CHECKING BOOKINGS WITH PROMOTIONS ===');
    const bookings = await query(`
      SELECT TOP 3 
        b.BookingId,
        b.BookingTime,
        bs.PromotionId,
        bs.Price,
        p.Code,
        p.DiscountValue,
        p.DiscountType
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      ORDER BY b.BookingId DESC
    `);
    console.log('Bookings with promotions:', bookings.recordset);
    
    console.log('\n=== TESTING DISCOUNT CALCULATION QUERY ===');
    const testQuery = await query(`
      SELECT TOP 3
        b.BookingId,
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
        END AS TotalPrice
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      ORDER BY b.BookingId DESC
    `);
    console.log('Discount calculation result:', testQuery.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkData();
