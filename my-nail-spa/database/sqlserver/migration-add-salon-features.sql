/*
  Migration: Add Features to SalonProfiles
  Purpose: Store salon features/highlights (like "Clean environment", "Premium products", etc.)
  Date: 2026-03-05
*/

USE [NIOM&CENailSpa];
GO

-- Add Features column to SalonProfiles if it doesn't exist
IF COL_LENGTH('dbo.SalonProfiles', 'Features') IS NULL
BEGIN
  ALTER TABLE dbo.SalonProfiles ADD Features NVARCHAR(MAX) NULL;
  PRINT 'Added Features column to SalonProfiles table';
END
ELSE
BEGIN
  PRINT 'Features column already exists in SalonProfiles table';
END
GO

-- Seed some default features for existing profiles (optional)
-- Features stored as JSON array: ["Clean environment", "Premium products", "5+ years experience"]
UPDATE dbo.SalonProfiles
SET Features = N'["Clean environment","Premium products","5+ years experience","Professional staff","Relaxing atmosphere"]'
WHERE Features IS NULL;
GO

PRINT 'Migration completed successfully!';
GO
