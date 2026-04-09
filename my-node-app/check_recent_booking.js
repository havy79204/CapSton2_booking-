const { query } = require('./src/config/query');

async function checkRecentBooking() {
  try {
    console.log('=== KIỂM TRA BOOKING MỚI NHẤT ===');
    
    // 1. Check bookings mới nhất
    const recentBookings = await query(`
      SELECT TOP 5 
        b.BookingId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.PromotionId,
        bs.Price,
        p.Code AS PromotionCode,
        p.DiscountValue,
        p.DiscountType
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('📋 Recent bookings:', recentBookings.recordset);
    
    // 2. Check specifically for 285000 price (5% off 300000)
    const discountBooking = await query(`
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
      WHERE bs.Price = 300000
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('🎯 Bookings with 300k price:', discountBooking.recordset);
    
    // 3. Test backend service with this booking
    const appointmentsService = require('./src/services/appointments.service');
    const allAppointments = await appointmentsService.listAppointments();
    
    // Find booking with 285000 total price
    const targetBooking = allAppointments.find(appt => 
      appt.price === 300000 && appt.totalPrice === 285000
    );
    
    if (targetBooking) {
      console.log('✅ FOUND BOOKING WITH DISCOUNT IN BACKEND:');
      console.log('ID:', targetBooking.id);
      console.log('Price:', targetBooking.price);
      console.log('Discount:', targetBooking.discount);
      console.log('Discount Type:', targetBooking.discountType);
      console.log('Total Price:', targetBooking.totalPrice);
    } else {
      console.log('❌ NO BOOKING FOUND WITH 285000 TOTAL PRICE');
      
      // Show all appointments with discount
      const discountBookings = allAppointments.filter(appt => appt.discount && appt.discount > 0);
      console.log('📊 All discount bookings:', discountBookings.length);
      discountBookings.forEach((appt, i) => {
        console.log(`${i+1}. ID: ${appt.id}, Price: ${appt.price}, Discount: ${appt.discount}, Total: ${appt.totalPrice}`);
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkRecentBooking();
