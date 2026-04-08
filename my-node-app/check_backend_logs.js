const { query } = require('./src/config/query');

async function checkBackendLogs() {
  try {
    console.log('=== KIỂM TRA BOOKING GẦN ĐÂY ===');
    
    // Check bookings created in last 10 minutes
    const recentBookings = await query(`
      SELECT TOP 10
        b.BookingId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.PromotionId,
        bs.Price,
        p.Code AS PromotionCode,
        p.DiscountValue,
        p.DiscountType,
        CASE 
          WHEN UPPER(p.DiscountType) = 'PERCENT' THEN bs.Price * (1 - p.DiscountValue / 100)
          WHEN UPPER(p.DiscountType) = 'FIXED' THEN bs.Price - p.DiscountValue
          ELSE bs.Price
        END AS CalculatedTotalPrice
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      WHERE b.BookingTime >= DATEADD(MINUTE, -30, GETDATE())
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('📋 Bookings in last 30 minutes:', recentBookings.recordset);
    
    // Check specifically for today's bookings
    const todayBookings = await query(`
      SELECT 
        b.BookingId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.PromotionId,
        bs.Price,
        p.Code AS PromotionCode,
        p.DiscountValue,
        p.DiscountType,
        CASE 
          WHEN UPPER(p.DiscountType) = 'PERCENT' THEN bs.Price * (1 - p.DiscountValue / 100)
          WHEN UPPER(p.DiscountType) = 'FIXED' THEN bs.Price - p.DiscountValue
          ELSE bs.Price
        END AS CalculatedTotalPrice
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      WHERE CAST(b.BookingTime AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('📅 Today\'s bookings:', todayBookings.recordset);
    
    // Check if any booking has promotion but frontend doesn't show it
    const appointmentsService = require('./src/services/appointments.service');
    const allAppointments = await appointmentsService.listAppointments();
    
    const todayAppts = allAppointments.filter(appt => {
      const apptDate = new Date(appt.bookingTime);
      const today = new Date();
      return apptDate.toDateString() === today.toDateString();
    });
    
    console.log('🎯 Today\'s appointments from service:');
    todayAppts.forEach((appt, i) => {
      console.log(`${i+1}. ID: ${appt.id}, Time: ${appt.time}, Price: ${appt.price}, Discount: ${appt.discount}, Total: ${appt.totalPrice}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkBackendLogs();
