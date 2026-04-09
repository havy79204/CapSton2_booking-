// Test frontend API call to check discount data
async function testFrontendAPI() {
  try {
    console.log('=== TEST FRONTEND API CALL ===');
    
    // Simulate frontend API call
    const response = await fetch('http://localhost:5000/api/owner/appointments', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Note: Frontend might need auth token
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('🌐 Frontend API Response:', data);
    
    // Check response structure
    let appointments = data;
    if (data.data) {
      appointments = data.data;
    } else if (data.appointments) {
      appointments = data.appointments;
    }
    
    console.log('📊 Processed appointments:', Array.isArray(appointments) ? `${appointments.length} items` : 'not array');
    
    if (Array.isArray(appointments)) {
      // Find the realtest booking
      const realtestBooking = appointments.find(appt => appt.id === 'realtest1775493854688');
      
      if (realtestBooking) {
        console.log('🎯 FOUND REALTEST IN FRONTEND API:');
        console.log('ID:', realtestBooking.id);
        console.log('Price:', realtestBooking.price);
        console.log('Discount:', realtestBooking.discount);
        console.log('Discount Type:', realtestBooking.discountType);
        console.log('Total Price:', realtestBooking.totalPrice);
        
        if (realtestBooking.discount > 0) {
          console.log('✅ FRONTEND API HAS DISCOUNT DATA!');
        } else {
          console.log('❌ FRONTEND API MISSING DISCOUNT DATA');
        }
      } else {
        console.log('❌ REALTEST NOT FOUND IN FRONTEND API');
        
        // Show first few appointments
        console.log('📋 First 3 appointments from frontend API:');
        appointments.slice(0, 3).forEach((appt, index) => {
          console.log(`${index + 1}. ID: ${appt.id}, Price: ${appt.price}, Discount: ${appt.discount}, Total: ${appt.totalPrice}`);
        });
      }
      
      // Check if any appointment has discount
      const hasAnyDiscount = appointments.some(appt => appt.discount && appt.discount > 0);
      console.log('💡 Any discount data in frontend API:', hasAnyDiscount);
    }
    
  } catch (error) {
    console.error('❌ Frontend API Error:', error.message);
  }
}

// Run in browser console or Node.js
if (typeof window !== 'undefined') {
  // Browser environment
  testFrontendAPI();
} else {
  // Node.js environment - need to import fetch
  console.log('Run this in browser console for accurate testing');
}
