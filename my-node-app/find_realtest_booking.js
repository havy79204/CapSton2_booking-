const { query } = require('./src/config/query');

async function findRealtestBooking() {
  try {
    console.log('=== FIND REALTEST BOOKING IN BACKEND SERVICE ===');
    
    // Import and call the service directly
    const appointmentsService = require('./src/services/appointments.service');
    
    const data = await appointmentsService.listAppointments();
    
    // Find the realtest booking
    const realtestBooking = data.find(appt => appt.id === 'realtest1775493854688');
    
    if (realtestBooking) {
      console.log('🎯 FOUND REALTEST BOOKING:');
      console.log('ID:', realtestBooking.id);
      console.log('Price:', realtestBooking.price);
      console.log('Discount:', realtestBooking.discount);
      console.log('Discount Type:', realtestBooking.discountType);
      console.log('Total Price:', realtestBooking.totalPrice);
      console.log('Service:', realtestBooking.service);
      console.log('Customer:', realtestBooking.customer);
      console.log('Status:', realtestBooking.status);
      
      // Check if discount is working
      if (realtestBooking.discount > 0) {
        console.log('\n✅ DISCOUNT IS WORKING!');
        console.log(`💰 Original Price: ${realtestBooking.price}đ`);
        console.log(`🎟️ Discount: ${realtestBooking.discount}${realtestBooking.discountType === 'PERCENT' ? '%' : 'đ'}`);
        console.log(`💸 Total Price: ${realtestBooking.totalPrice}đ`);
        
        if (realtestBooking.discountType === 'PERCENT') {
          const expectedTotal = realtestBooking.price * (1 - realtestBooking.discount / 100);
          console.log(`📊 Expected Total: ${expectedTotal}đ`);
          console.log(`🔍 Calculation correct: ${Math.abs(expectedTotal - realtestBooking.totalPrice) < 1}`);
        }
      } else {
        console.log('\n❌ DISCOUNT NOT FOUND OR ZERO');
      }
    } else {
      console.log('❌ REALTEST BOOKING NOT FOUND IN SERVICE RESPONSE');
      
      // Show all booking IDs to debug
      console.log('\n📋 All booking IDs:');
      data.forEach((appt, index) => {
        if (index < 10) { // Show first 10
          console.log(`  ${index + 1}. ${appt.id}`);
        }
      });
      console.log(`... and ${data.length - 10} more`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('❌ Stack:', err.stack);
    process.exit(1);
  }
}

findRealtestBooking();
