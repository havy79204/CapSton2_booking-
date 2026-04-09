const http = require('http');

async function testRealtimePost() {
  try {
    console.log('=== TEST REALTIME POST PROMOTION ===');
    
    // Test data giống frontend gửi
    const bookingData = {
      customerUserId: 'fac068cea5ce219ce7b48708', // Pham Vu
      serviceIds: ['1'], // Basic Manicure (150k)
      staffId: '3c32b037237f919d1fe4be2a', // thục anh
      date: '2026-04-07',
      time: '14:00', // Thời gian khác để tránh conflict
      notes: 'Test realtime promotion',
      duration: 30,
      promotionCode: 'ttt' // Promotion code realtime
    };
    
    console.log('📤 Sending booking data:', bookingData);
    
    // Gửi request đến backend POST endpoint
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
      
      // Check backend logs để xem promotion được xử lý
      console.log('\n🔍 KIỂM TRA BACKEND LOGS:');
      console.log('Bạn sẽ thấy logs:');
      console.log('[DEBUG CONTROLLER] Extracted request data: { ..., promotionCode: "ttt" }');
      console.log('[DEBUG] Processing promotion code: ttt');
      console.log('[DEBUG] Found valid promotion: { PromotionId: "ttt", ... }');
      
    } else {
      console.log('❌ Booking creation failed');
      console.log('Response:', response.body);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testRealtimePost();
