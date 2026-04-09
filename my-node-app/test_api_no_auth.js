const { query } = require('./src/config/query');

async function testBackendDirectly() {
  try {
    console.log('=== TEST BACKEND SERVICE DIRECTLY ===');
    
    // Import and call the service directly
    const appointmentsService = require('./src/services/appointments.service');
    
    const data = await appointmentsService.listAppointments();
    
    console.log('🔍 Service returned data type:', typeof data);
    console.log('🔍 Service returned data length:', Array.isArray(data) ? data.length : 'not array');
    
    if (Array.isArray(data) && data.length > 0) {
      console.log('🔍 Sample service data:', data.slice(0, 2));
      console.log('🔍 Sample item fields:', Object.keys(data[0]));
      
      // Check if discount data exists
      const hasDiscountData = data.some(appt => 
        appt.discount && appt.discount > 0
      );
      console.log('💡 Service has discount data:', hasDiscountData);
      
      if (hasDiscountData) {
        const discountAppt = data.find(appt => appt.discount && appt.discount > 0);
        console.log('🎯 Sample appointment with discount:', {
          id: discountAppt.id,
          price: discountAppt.price,
          discount: discountAppt.discount,
          discountType: discountAppt.discountType,
          totalPrice: discountAppt.totalPrice
        });
      }
      
      // Show all appointments with discount info
      console.log('\n📊 ALL APPOINTMENTS WITH DISCOUNT INFO:');
      data.forEach((appt, index) => {
        console.log(`${index + 1}. ID: ${appt.id}, Price: ${appt.price}, Discount: ${appt.discount}, Type: ${appt.discountType}, Total: ${appt.totalPrice}`);
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('❌ Stack:', err.stack);
    process.exit(1);
  }
}

testBackendDirectly();
