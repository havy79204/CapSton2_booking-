const http = require('http');

async function testFrontendAuth() {
  try {
    console.log('=== TEST FRONTEND AUTH ISSUE ===');
    
    // Test GET appointments với auth token
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/owner/appointments',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer fake-token-for-testing'
      }
    };
    
    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.end();
    });
    
    console.log('📥 Auth test response:', response.statusCode);
    console.log('📥 Auth test body:', response.body);
    
    // Test POST với promotion code
    const bookingData = {
      customerUserId: 'fac068cea5ce219ce7b48708',
      serviceIds: ['1'],
      staffId: '3c32b037237f919d1fe4be2a',
      date: '2026-04-07',
      time: '16:00',
      notes: 'Test frontend auth',
      duration: 30,
      promotionCode: 'ttt'
    };
    
    const postData = JSON.stringify(bookingData);
    
    const postOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/owner/appointments',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Bearer fake-token-for-testing'
      }
    };
    
    const postResponse = await new Promise((resolve, reject) => {
      const req = http.request(postOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    console.log('📤 POST test response:', postResponse.statusCode);
    console.log('📤 POST test body:', postResponse.body);
    
    if (postResponse.statusCode === 401) {
      console.log('❌ FRONTEND CẦN AUTH TOKEN ĐỂ TẠO BOOKING!');
      console.log('🔧 GIẢI PHÁP: Frontend cần login hoặc bypass auth');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testFrontendAuth();
