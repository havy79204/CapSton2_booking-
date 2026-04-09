// PASTE THIS CODE INTO BROWSER CONSOLE
(async function testFrontendDiscount() {
  console.log('🧪 TESTING FRONTEND DISCOUNT...');
  
  try {
    // Test API call
    const response = await fetch('/api/owner/appointments');
    const data = await response.json();
    
    console.log('📡 API Response:', data);
    
    // Get appointments array
    let appointments = data.data || data.appointments || data;
    console.log('📊 Appointments count:', appointments.length);
    
    // Find realtest booking
    const realtest = appointments.find(appt => appt.id === 'realtest1775493854688');
    
    if (realtest) {
      console.log('🎯 FOUND REALTEST BOOKING:');
      console.log('  ID:', realtest.id);
      console.log('  Price:', realtest.price);
      console.log('  Discount:', realtest.discount);
      console.log('  Discount Type:', realtest.discountType);
      console.log('  Total Price:', realtest.totalPrice);
      
      if (realtest.discount > 0) {
        console.log('✅ DISCOUNT DATA EXISTS IN FRONTEND!');
        alert('✅ Discount found: ' + realtest.discount + realtest.discountType + ' off!');
      } else {
        console.log('❌ DISCOUNT DATA IS ZERO');
        alert('❌ Discount is zero in frontend');
      }
    } else {
      console.log('❌ REALTEST BOOKING NOT FOUND');
      
      // Check any discount data
      const anyDiscount = appointments.some(appt => appt.discount && appt.discount > 0);
      console.log('💡 Any discount data found:', anyDiscount);
      
      if (anyDiscount) {
        const discountAppt = appointments.find(appt => appt.discount && appt.discount > 0);
        console.log('🎯 Found appointment with discount:', discountAppt);
        alert('Found discount: ' + discountAppt.discount + discountAppt.discountType);
      } else {
        console.log('❌ NO DISCOUNT DATA FOUND IN ANY APPOINTMENTS');
        alert('❌ No discount data found in frontend API');
      }
    }
    
    // Show first 3 appointments for debugging
    console.log('📋 First 3 appointments:');
    appointments.slice(0, 3).forEach((appt, i) => {
      console.log(`${i+1}. ID: ${appt.id}, Price: ${appt.price}, Discount: ${appt.discount}, Total: ${appt.totalPrice}`);
    });
    
  } catch (error) {
    console.error('❌ ERROR:', error);
    alert('Error: ' + error.message);
  }
})();
