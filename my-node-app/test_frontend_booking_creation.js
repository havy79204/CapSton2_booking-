const http = require('http');

async function testFrontendBookingCreation() {
  try {
    console.log('=== TEST FRONTEND BOOKING CREATION ===');
    
    // Test data giống frontend gửi
    const bookingData = {
      customerUserId: '1',
      serviceIds: ['5'], // Acrylic Nail (300k)
      staffId: '3c32b037237f919d1fe4be2a', // thục anh
      date: '2026-04-07',
      time: '08:00',
      notes: 'Test promotion code',
      duration: 60,
      promotionCode: 'WELCOME10' // Promotion code
    };
    
    console.log('📤 Sending booking data:', bookingData);
    
    // Gửi request đến backend giống frontend
    const postData = JSON.stringify(bookingData);
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/owner/appointments',
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
      console.log('✅ Booking created successfully:', result);
      
      // Check if booking was saved with promotion
      const { query } = require('./src/config/query');
      const checkBooking = await query(`
        SELECT 
          b.BookingId,
          b.BookingTime,
          bs.PromotionId,
          bs.Price,
          p.Code AS PromotionCode,
          p.DiscountValue,
          p.DiscountType
        FROM Bookings b
        LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
        LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
        WHERE b.BookingId = @bookingId
      `, { bookingId: result.data.id });
      
      console.log('🔍 Booking saved with promotion:', checkBooking.recordset[0]);
    } else {
      console.log('❌ Booking creation failed');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testFrontendBookingCreation();
