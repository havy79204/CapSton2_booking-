const { query } = require('./src/config/query');

async function checkTTTBooking() {
  try {
    console.log('=== KIỂM TRA BOOKING ttt ===');
    
    const appointmentsService = require('./src/services/appointments.service');
    const allAppointments = await appointmentsService.listAppointments();
    
    const tttBooking = allAppointments.find(appt => appt.id && appt.id.startsWith('ttt'));
    
    if (tttBooking) {
      console.log('✅ Backend tìm thấy booking ttt:');
      console.log(`   ID: ${tttBooking.id}`);
      console.log(`   Price: ${tttBooking.price}`);
      console.log(`   Discount: ${tttBooking.discount}`);
      console.log(`   Total Price: ${tttBooking.totalPrice}`);
      
      if (tttBooking.discount > 0) {
        console.log('🎉 BACKEND HOẠT ĐỘNG ĐÚNG!');
        console.log('🔥 FRONTEND SẼ HIỆN DISCOUNT 5%!');
      } else {
        console.log('❌ Backend không có discount!');
      }
    } else {
      console.log('❌ Backend không tìm thấy booking ttt');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkTTTBooking();
