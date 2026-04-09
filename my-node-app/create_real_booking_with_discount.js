const { query } = require('./src/config/query');

async function createRealBookingWithDiscount() {
  try {
    console.log('=== TẠO BOOKING THẬT VỚI DISCOUNT ===');
    
    // 1. Get real data
    const customers = await query('SELECT TOP 1 UserId, Name FROM Users WHERE RoleKey = \'customer\'');
    const staff = await query('SELECT TOP 1 s.StaffId, u.Name FROM Staff s JOIN Users u ON u.UserId = s.UserId WHERE u.RoleKey = \'staff\'');
    const service = await query('SELECT TOP 1 ServiceId, Name, Price FROM Services WHERE Price > 0 ORDER BY Price DESC');
    const promotion = await query('SELECT TOP 1 PromotionId, Code, DiscountValue, DiscountType FROM Promotions WHERE Status = \'ACTIVE\'');
    
    if (!customers.recordset?.length || !staff.recordset?.length || !service.recordset?.length || !promotion.recordset?.length) {
      throw new Error('Thiếu dữ liệu!');
    }
    
    const customer = customers.recordset[0];
    const staffMember = staff.recordset[0];
    const selectedService = service.recordset[0];
    const selectedPromotion = promotion.recordset[0];
    
    console.log('📋 Dữ liệu thật:');
    console.log(`   Customer: ${customer.Name} (${customer.UserId})`);
    console.log(`   Staff: ${staffMember.Name} (${staffMember.StaffId})`);
    console.log(`   Service: ${selectedService.Name} - ${selectedService.Price}đ`);
    console.log(`   Promotion: ${selectedPromotion.Code} - ${selectedPromotion.DiscountValue}${selectedPromotion.DiscountType}`);
    
    // 2. Create real booking
    const bookingId = 'real' + Date.now();
    const bookingTime = new Date();
    bookingTime.setHours(bookingTime.getHours() + 2); // 2 giờ nữa
    
    await query(`
      INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
      VALUES (@bookingId, @customerUserId, @bookingTime, 'Pending', 'Real booking with discount')
    `, {
      bookingId,
      customerUserId: customer.UserId,
      bookingTime: bookingTime,
    });
    
    // 3. Create booking service with promotion
    const bookingServiceId = 'bs' + Date.now();
    await query(`
      INSERT INTO BookingServices (BookingServiceId, BookingId, ServiceId, StaffId, Price, PromotionId)
      VALUES (@bookingServiceId, @bookingId, @serviceId, @staffId, @price, @promotionId)
    `, {
      bookingServiceId,
      bookingId,
      serviceId: selectedService.ServiceId,
      staffId: staffMember.StaffId,
      price: selectedService.Price,
      promotionId: selectedPromotion.PromotionId,
    });
    
    // 4. Calculate expected totals
    let expectedTotal = selectedService.Price;
    if (selectedPromotion.DiscountType === 'PERCENT') {
      expectedTotal = selectedService.Price * (1 - selectedPromotion.DiscountValue / 100);
    } else if (selectedPromotion.DiscountType === 'FIXED') {
      expectedTotal = selectedService.Price - selectedPromotion.DiscountValue;
    }
    
    console.log('\n✅ ĐÃ TẠO BOOKING THẬT!');
    console.log(`📋 Booking ID: ${bookingId}`);
    console.log(`⏰ Thời gian: ${bookingTime.toLocaleString('vi-VN')}`);
    console.log(`💰 Giá gốc: ${selectedService.Price}đ`);
    console.log(`🎟️ Discount: ${selectedPromotion.DiscountValue}${selectedPromotion.DiscountType}`);
    console.log(`💸 Tổng tiền: ${expectedTotal}đ`);
    
    console.log('\n🔥 CHECK FRONTEND NGAY!');
    console.log('1. Mở frontend: http://localhost:5175');
    console.log('2. Đi đến Appointments page');
    console.log('3. Tìm booking vừa tạo');
    console.log(`4. Booking ID: ${bookingId}`);
    console.log('5. Phải thấy discount hiển thị!');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  }
}

createRealBookingWithDiscount();
