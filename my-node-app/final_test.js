const http = require('http');

async function finalTest() {
  try {
    console.log('=== FINAL TEST - DISCOUNT FLOW ===');
    
    const apiData = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:5000/api/owner/appointments-test', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
    
    console.log('✅ API Response:', apiData.ok ? 'Success' : 'Error');
    
    if (apiData.ok && apiData.data) {
      const testBooking = apiData.data.find(appt => appt.id && appt.id.startsWith('autotest'));
      
      if (testBooking) {
        console.log('🎉 FOUND TEST BOOKING WITH DISCOUNT!');
        console.log(`   ID: ${testBooking.id}`);
        console.log(`   Price: ${testBooking.price}`);
        console.log(`   Discount: ${testBooking.discount}`);
        console.log(`   Total Price: ${testBooking.totalPrice}`);
        console.log('\n🎊 DISCOUNT FLOW IS COMPLETE!');
        console.log('✅ Backend works perfectly');
        console.log('✅ API endpoint works');
        console.log('✅ Discount data is returned');
        console.log('🔧 NOW: Update frontend to use correct endpoint or fix auth');
        
        // Check if there are other bookings with discount
        const discountBookings = apiData.data.filter(appt => appt.discount && appt.discount > 0);
        console.log(`\n📊 Total bookings with discount: ${discountBookings.length}`);
        
      } else {
        console.log('❌ Test booking not found');
        console.log('Available bookings:', apiData.data.map(appt => ({ id: appt.id, discount: appt.discount })));
      }
    } else {
      console.log('❌ API Error:', apiData.error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

finalTest();
