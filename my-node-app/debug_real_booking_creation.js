const { query } = require('./src/config/query');

async function debugRealBookingCreation() {
  try {
    console.log('=== DEBUG REAL BOOKING CREATION ===');
    
    // 1. Tạo booking mới với promotion code qua service
    const appointmentsService = require('./src/services/appointments.service');
    
    const bookingData = {
      customerUserId: 'fac068cea5ce219ce7b48708', // Pham Vu
      serviceIds: ['1'], // Basic Manicure (150k)
      staffId: '3c32b037237f919d1fe4be2a', // thục anh
      date: '2026-04-07',
      time: '15:00', // Time mới
      notes: 'Debug realtime promotion',
      duration: 30,
      promotionCode: 'ttt' // PROMOTION CODE REALTIME
    };
    
    console.log('📤 Creating booking with data:', bookingData);
    
    // 2. Gọi service trực tiếp
    const result = await appointmentsService.createAppointment(bookingData);
    console.log('✅ Service result:', result);
    
    // 3. Kiểm tra database ngay sau khi tạo
    if (result && result.id) {
      console.log('\n🔍 KIỂM TRA DATABASE NGAY LẬP TỨC:');
      
      const bookingService = await query(`
        SELECT 
          bs.BookingServiceId,
          bs.BookingId,
          bs.ServiceId,
          bs.StaffId,
          bs.Price,
          bs.PromotionId,
          p.Code AS PromotionCode,
          p.DiscountValue,
          p.DiscountType
        FROM BookingServices bs
        LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
        WHERE bs.BookingId = @bookingId
      `, { bookingId: result.id });
      
      console.log('📋 BookingService record:', bookingService.recordset[0]);
      
      // 4. Kiểm tra lại via listAppointments
      console.log('\n🔍 KIỂM TRA VIA LISTAPPOINTMENTS:');
      const allAppointments = await appointmentsService.listAppointments();
      const newBooking = allAppointments.find(appt => appt.id === result.id);
      
      if (newBooking) {
        console.log('🎯 Appointment in list:');
        console.log(`   ID: ${newBooking.id}`);
        console.log(`   Price: ${newBooking.price}`);
        console.log(`   Discount: ${newBooking.discount}`);
        console.log(`   Discount Type: ${newBooking.discountType}`);
        console.log(`   Total Price: ${newBooking.totalPrice}`);
        
        if (newBooking.discount > 0) {
          console.log('✅ REALTIME PROMOTION HOẠT ĐỘNG!');
        } else {
          console.log('❌ PROMOTION KHÔNG ĐƯỢC ÁP DỤNG!');
          console.log('🔧 VẤN ĐỀ: Backend không xử lý promotion code đúng!');
        }
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

debugRealBookingCreation();
