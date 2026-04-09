const http = require('http');

async function testRealtimePromotion() {
  try {
    console.log('=== TEST REALTIME PROMOTION CODE ===');
    
    // Test data giống frontend gửi
    const bookingData = {
      customerUserId: 'fac068cea5ce219ce7b48708', // Pham Vu
      serviceIds: ['1'], // Basic Manicure (150k)
      staffId: '3c32b037237f919d1fe4be2a', // thục anh
      date: '2026-04-07',
      time: '10:00',
      notes: 'Test realtime promotion',
      duration: 30,
      promotionCode: 'ttt' // Promotion code realtime
    };
    
    console.log('📤 Sending booking data:', bookingData);
    
    // Gửi request đến backend
    const postData = JSON.stringify(bookingData);
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/owner/appointments-test', // Dùng test endpoint không auth
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    console.log('📥 Response status:', response.statusCode);
    console.log('📥 Response body:', response.body);
    
    if (response.statusCode === 201) {
      const result = JSON.parse(response.body);
      console.log('✅ Booking created with promotion!');
      console.log('🎯 Result:', result);
      
      // Check if discount was applied
      if (result.data && result.data.totalPrice < 150000) {
        console.log('🎉 DISCOUNT APPLIED SUCCESSFULLY!');
        console.log(`💰 Original: 150.000đ`);
        console.log(`💸 Total: ${result.data.totalPrice}đ`);
        console.log(`🎟️ Discount: ${150000 - result.data.totalPrice}đ`);
      } else {
        console.log('❌ Discount not applied');
      }
    } else {
      console.log('❌ Booking creation failed');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testRealtimePromotion();
