const { query } = require('./src/config/query');

async function checkDatabaseVsBackend() {
  try {
    console.log('=== KIỂM TRA DATABASE VÀ BACKEND ===');
    
    // 1. Check booking test vừa tạo
    const testBooking = await query('SELECT * FROM Bookings WHERE BookingId LIKE \'realtest%\' ORDER BY BookingTime DESC');
    console.log('📋 Test bookings:', testBooking.recordset);
    
    // 2. Check BookingServices với PromotionId
    const bookingServices = await query('SELECT TOP 5 BookingId, PromotionId, Price FROM BookingServices WHERE PromotionId IS NOT NULL ORDER BY BookingId DESC');
    console.log('🎟️ BookingServices with PromotionId:', bookingServices.recordset);
    
    // 3. Check promotions available
    const promotions = await query('SELECT * FROM Promotions');
    console.log('💰 Available promotions:', promotions.recordset);
    
    // 4. Test query từ appointments.service.js
    console.log('\n=== TEST QUERY TỪ BACKEND ===');
    const backendQuery = await query(`
      SELECT TOP 5
        b.BookingId,
        b.BookingTime,
        COALESCE(bs.Price, sv.Price, 0) AS Price,
        COALESCE(p.DiscountValue, 0) AS Discount,
        COALESCE(p.DiscountType, 'fixed') AS DiscountType,
        CASE 
          WHEN COALESCE(p.DiscountValue, 0) > 0 THEN
            CASE 
              WHEN UPPER(COALESCE(p.DiscountType, 'fixed')) = 'FIXED' 
                THEN COALESCE(bs.Price, sv.Price, 0) - COALESCE(p.DiscountValue, 0)
              WHEN UPPER(COALESCE(p.DiscountType, 'fixed')) = 'PERCENT'
                THEN COALESCE(bs.Price, sv.Price, 0) * (1 - COALESCE(p.DiscountValue, 0) / 100)
              ELSE COALESCE(bs.Price, sv.Price, 0)
            END
          ELSE COALESCE(bs.Price, sv.Price, 0)
        END AS TotalPrice,
        p.Code AS PromotionCode
      FROM Bookings b
      LEFT JOIN BookingServices bs ON bs.BookingId = b.BookingId
      LEFT JOIN Services sv ON sv.ServiceId = bs.ServiceId
      LEFT JOIN Promotions p ON p.PromotionId = bs.PromotionId
      ORDER BY b.BookingTime DESC
    `);
    console.log('🔍 Backend query result:', backendQuery.recordset);
    
    // 5. Test API endpoint trực tiếp
    console.log('\n=== TEST API ENDPOINT ===');
    try {
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
      
      console.log('🌐 API Response:', typeof apiData, Array.isArray(apiData) ? `array with ${apiData.length} items` : 'not an array');
      console.log('🌐 Raw API Response keys:', apiData ? Object.keys(apiData) : 'null');
      console.log('🌐 Raw API Response sample:', JSON.stringify(apiData, null, 2).substring(0, 500) + '...');
      
      // Handle different response formats
      let appointmentsData = apiData;
      if (apiData && apiData.data) {
        appointmentsData = apiData.data;
      } else if (apiData && apiData.appointments) {
        appointmentsData = apiData.appointments;
      } else if (apiData && apiData.ok && apiData.data) {
        appointmentsData = apiData.data;
      }
      
      console.log('🌐 Processed appointments data:', Array.isArray(appointmentsData) ? `array with ${appointmentsData.length} items` : 'not an array');
      
      if (Array.isArray(appointmentsData) && appointmentsData.length > 0) {
        console.log('🌐 API Response sample:', appointmentsData.slice(0, 2));
        
        // Check if discount data exists in API response
        const hasDiscountData = appointmentsData.some(appt => 
          appt.discount && appt.discount > 0
        );
        console.log('💡 API has discount data:', hasDiscountData);
        
        if (hasDiscountData) {
          const discountAppt = appointmentsData.find(appt => appt.discount && appt.discount > 0);
          console.log('🎯 Sample appointment with discount:', {
            id: discountAppt.id,
            price: discountAppt.price,
            discount: discountAppt.discount,
            discountType: discountAppt.discountType,
            totalPrice: discountAppt.totalPrice
          });
        }
      } else {
        console.log('❌ No appointment data found in API response');
      }
    } catch (apiErr) {
      console.error('❌ API Error:', apiErr.message);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkDatabaseVsBackend();
