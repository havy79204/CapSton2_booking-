-- Add PromotionId column to BookingServices table
ALTER TABLE BookingServices 
ADD PromotionId NVARCHAR(50) NULL;

-- Add index for better performance
CREATE INDEX IX_BookingServices_PromotionId ON BookingServices(PromotionId);

-- Verify the column was added
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'BookingServices' AND COLUMN_NAME = 'PromotionId';
