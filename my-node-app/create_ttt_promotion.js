const { query } = require('./src/config/query');

async function createTTTPromotion() {
  try {
    console.log('=== TẠO PROMOTION ttt ===');
    
    await query(`
      INSERT INTO Promotions (PromotionId, Code, DiscountType, DiscountValue, StartDate, EndDate, Status)
      VALUES ('ttt', 'ttt', 'PERCENT', 5, '2026-02-05', '2026-12-31', 'ACTIVE')
    `);
    
    console.log('✅ Đã tạo promotion ttt (5% discount)');
    
    const check = await query('SELECT * FROM Promotions WHERE Code = \'ttt\'');
    console.log('Kiểm tra:', check.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createTTTPromotion();
