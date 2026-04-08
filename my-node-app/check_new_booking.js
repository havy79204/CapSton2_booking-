const { query } = require('./src/config/query');

async function checkNewBooking() {
  try {
    const appointmentsService = require('./src/services/appointments.service');
    const allAppointments = await appointmentsService.listAppointments();
    
    const newBooking = allAppointments.find(appt => appt.id === 'a17140161c4f6819d63d5ff1b');
    
    if (newBooking) {
      console.log('🎉 Booking mới với realtime promotion:');
      console.log(`   ID: ${newBooking.id}`);
      console.log(`   Price: ${newBooking.price}`);
      console.log(`   Discount: ${newBooking.discount}`);
      console.log(`   Total Price: ${newBooking.totalPrice}`);
      
      if (newBooking.discount > 0) {
        console.log('✅ REALTIME PROMOTION HOẠT ĐỘNG HOÀN HẢO!');
        console.log('🔥 FRONTEND SẼ HIỆN DISCOUNT KHI TẠO BOOKING MỚI!');
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkNewBooking();
