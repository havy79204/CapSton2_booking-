const { query } = require('./src/config/query');

async function fixRealBookingDiscount() {
  try {
    console.log('=== FIX DỮ LIỆU THẬT CÓ DISCOUNT ===');
    
    // 1. Tìm booking thật của bạn: 7/4/2026 10:00 thục anh Basic Manicure Pham Vu
    const realBookings = await query(`
      SELECT TOP 5 
        b.BookingId,
        b.BookingTime,
        b.Status,
        b.Notes,
        bs.BookingServiceId,
        bs.ServiceId,
        bs.StaffId,
        bs.Price,
        bs.PromotionId,
        u.Name AS CustomerName,
        s_user.Name AS StaffName,
        svc.Name AS ServiceName
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Users u ON u.UserId = b.CustomerUserId
      LEFT JOIN Staff s ON s.StaffId = bs.StaffId
      LEFT JOIN Users s_user ON s_user.UserId = s.UserId
      LEFT JOIN Services svc ON svc.ServiceId = bs.ServiceId
      WHERE CAST(b.BookingTime AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY b.BookingTime DESC
    `);
    
    console.log('📋 Bookings hôm nay:', realBookings.recordset);
    
    // 2. Tìm promotion ttt
    const promotion = await query('SELECT * FROM Promotions WHERE Code = \'ttt\'');
    if (!promotion.recordset.length) {
      throw new Error('Không tìm thấy promotion ttt!');
    }
    
    const tttPromotion = promotion.recordset[0];
    console.log('🎟️ Promotion ttt:', tttPromotion);
    
    // 3. Cập nhật booking thật thêm PromotionId
    if (realBookings.recordset.length > 0) {
      const targetBooking = realBookings.recordset[0]; // Lấy booking mới nhất
      console.log('🎯 Cập nhật booking:', targetBooking.BookingId);
      
      await query(`
        UPDATE BookingServices 
        SET PromotionId = @promotionId 
        WHERE BookingId = @bookingId
      `, {
        promotionId: tttPromotion.PromotionId,
        bookingId: targetBooking.BookingId
      });
      
      console.log('✅ Đã cập nhật PromotionId cho booking thật!');
      
      // 4. Kiểm tra lại
      const checkService = await query(`
        SELECT 
          bs.PromotionId,
          p.Code AS PromotionCode,
          p.DiscountValue,
          p.DiscountType,
          bs.Price
        FROM BookingServices bs
        LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
        WHERE bs.BookingId = @bookingId
      `, { bookingId: targetBooking.BookingId });
      
      console.log('🔍 Kiểm tra lại:', checkService.recordset[0]);
      
      // 5. Test backend service
      const appointmentsService = require('./src/services/appointments.service');
      const allAppointments = await appointmentsService.listAppointments();
      
      const updatedBooking = allAppointments.find(appt => appt.id === targetBooking.BookingId);
      
      if (updatedBooking) {
        console.log('🎉 Backend service result:');
        console.log(`   ID: ${updatedBooking.id}`);
        console.log(`   Price: ${updatedBooking.price}`);
        console.log(`   Discount: ${updatedBooking.discount}`);
        console.log(`   Total Price: ${updatedBooking.totalPrice}`);
        
        if (updatedBooking.discount > 0) {
          console.log('✅ DỮ LIỆU THẬT ĐÃ CÓ DISCOUNT!');
          console.log('🔥 FRONTEND SẼ HIỆN DISCOUNT!');
        } else {
          console.log('❌ Backend vẫn không có discount!');
        }
      }
      
    } else {
      console.log('❌ Không tìm thấy booking nào hôm nay!');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  }
}

fixRealBookingDiscount();
