const { query } = require('./src/config/query.js');

async function checkPromotionsTable() {
  try {
    console.log('=== Checking Promotions table structure ===');
    
    // Check Promotions table structure
    const promoStructure = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Promotions'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('Promotions table columns:');
    console.table(promoStructure.recordset || []);
    
    // Check sample data
    const promoData = await query(`
      SELECT TOP 5 * FROM Promotions
    `);
    
    console.log('Sample Promotions data:');
    console.table(promoData.recordset || []);
    
    // Check if Promotions table exists
    const tableExists = await query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'Promotions'
    `);
    
    console.log('Promotions table exists:', tableExists.recordset?.length > 0 ? 'YES' : 'NO');
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

checkPromotionsTable();
