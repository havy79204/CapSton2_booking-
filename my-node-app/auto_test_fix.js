const { query } = require('./src/config/query');

async function autoTestAndFix() {
  try {
    console.log('=== AUTO TEST & FIX DISCOUNT FLOW ===');
    
    // Step 1: Check if promotions exist
    console.log('\n📋 Step 1: Check promotions...');
    const promotions = await query('SELECT * FROM Promotions WHERE Status = \'ACTIVE\'');
    console.log('Available promotions:', promotions.recordset);
    
    if (!promotions.recordset.length) {
      console.log('❌ No active promotions found!');
      return;
    }
    
    // Step 2: Create test booking with promotion
    console.log('\n📝 Step 2: Create test booking with promotion...');
    const testBookingId = 'autotest' + Date.now();
    const testServiceId = '5'; // Acrylic Nail
    const testStaffId = '3c32b037237f919d1fe4be2a'; // thục anh
    const testCustomerId = '1';
    const promotionId = promotions.recordset[0].PromotionId;
    
    // Get service price
    const service = await query('SELECT Price FROM Services WHERE ServiceId = @serviceId', { serviceId: testServiceId });
    const servicePrice = service.recordset[0].Price;
    
    // Create booking
    const bookingTime = new Date();
    bookingTime.setHours(bookingTime.getHours() + 1);
    
    await query(`
      INSERT INTO Bookings (BookingId, CustomerUserId, BookingTime, Status, Notes)
      VALUES (@bookingId, @customerUserId, @bookingTime, 'Pending', 'Auto test with promotion')
    `, {
      bookingId: testBookingId,
      customerUserId: testCustomerId,
      bookingTime: bookingTime
    });
    
    // Create booking service WITH promotion
    const bookingServiceId = 'bs' + Date.now();
    await query(`
      INSERT INTO BookingServices (BookingServiceId, BookingId, ServiceId, StaffId, Price, PromotionId)
      VALUES (@bookingServiceId, @bookingId, @serviceId, @staffId, @price, @promotionId)
    `, {
      bookingServiceId,
      bookingId: testBookingId,
      serviceId: testServiceId,
      staffId: testStaffId,
      price: servicePrice,
      promotionId: promotionId
    });
    
    console.log('✅ Test booking created with promotion!');
    console.log(`   Booking ID: ${testBookingId}`);
    console.log(`   Service Price: ${servicePrice}đ`);
    console.log(`   Promotion ID: ${promotionId}`);
    
    // Step 3: Test backend service
    console.log('\n🔍 Step 3: Test backend service...');
    const appointmentsService = require('./src/services/appointments.service');
    const allAppointments = await appointmentsService.listAppointments();
    
    const testBooking = allAppointments.find(appt => appt.id === testBookingId);
    
    if (testBooking) {
      console.log('🎯 Found test booking in service response:');
      console.log(`   ID: ${testBooking.id}`);
      console.log(`   Price: ${testBooking.price}`);
      console.log(`   Discount: ${testBooking.discount}`);
      console.log(`   Discount Type: ${testBooking.discountType}`);
      console.log(`   Total Price: ${testBooking.totalPrice}`);
      
      if (testBooking.discount > 0) {
        console.log('✅ BACKEND SERVICE WORKS!');
        
        // Step 4: Test API endpoint
        console.log('\n🌐 Step 4: Test API endpoint...');
        const http = require('http');
        
        const apiData = await new Promise((resolve, reject) => {
          const req = http.get('http://localhost:5000/api/owner/appointments', (res) => {
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
        
        const apiAppointments = apiData.data || apiData;
        const apiTestBooking = apiAppointments.find(appt => appt.id === testBookingId);
        
        if (apiTestBooking && apiTestBooking.discount > 0) {
          console.log('✅ API ENDPOINT WORKS!');
          console.log('🎉 DISCOUNT FLOW IS WORKING!');
          
          // Cleanup
          await query('DELETE FROM BookingServices WHERE BookingId = @bookingId', { bookingId: testBookingId });
          await query('DELETE FROM Bookings WHERE BookingId = @bookingId', { bookingId: testBookingId });
          console.log('🧹 Cleaned up test data');
          
        } else {
          console.log('❌ API ENDPOINT ISSUE!');
          console.log('API Response:', apiTestBooking);
        }
        
      } else {
        console.log('❌ BACKEND SERVICE ISSUE!');
      }
    } else {
      console.log('❌ TEST BOOKING NOT FOUND IN SERVICE!');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
  
  process.exit(0);
}

autoTestAndFix();
