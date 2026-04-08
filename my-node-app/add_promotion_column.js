const { query } = require('./src/config/query.js');

async function addPromotionColumn() {
  try {
    console.log('=== Adding PromotionId column to BookingServices ===');
    
    // Add PromotionId column
    await query(`
      ALTER TABLE BookingServices 
      ADD PromotionId NVARCHAR(50) NULL
    `);
    
    console.log('✅ PromotionId column added successfully');
    
    // Add index for performance
    await query(`
      CREATE INDEX IX_BookingServices_PromotionId ON BookingServices(PromotionId)
    `);
    
    console.log('✅ Index created successfully');
    
    // Verify column was added
    const verify = await query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'BookingServices' AND COLUMN_NAME = 'PromotionId'
    `);
    
    console.log('=== Verification ===');
    console.table(verify.recordset || []);
    
    console.log('🎉 PromotionId column setup completed!');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

addPromotionColumn();
