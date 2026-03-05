-- Migration: Add CustomerUserId and CustomerEmail to Bookings table
-- Run this if you already have the database created

USE [NIOM&CENailSpa];
GO

-- Add CustomerUserId column if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Bookings') AND name = 'CustomerUserId')
BEGIN
  ALTER TABLE dbo.Bookings
  ADD CustomerUserId NVARCHAR(64) NULL;
  
  PRINT 'Added CustomerUserId column to Bookings table';
END
ELSE
BEGIN
  PRINT 'CustomerUserId column already exists';
END
GO

-- Add CustomerEmail column if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Bookings') AND name = 'CustomerEmail')
BEGIN
  ALTER TABLE dbo.Bookings
  ADD CustomerEmail NVARCHAR(320) NULL;
  
  PRINT 'Added CustomerEmail column to Bookings table';
END
ELSE
BEGIN
  PRINT 'CustomerEmail column already exists';
END
GO

-- Add foreign key constraint for CustomerUserId if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Bookings_CustomerUser')
BEGIN
  ALTER TABLE dbo.Bookings
  ADD CONSTRAINT FK_Bookings_CustomerUser 
  FOREIGN KEY (CustomerUserId) REFERENCES dbo.Users(UserId);
  
  PRINT 'Added foreign key constraint FK_Bookings_CustomerUser';
END
ELSE
BEGIN
  PRINT 'Foreign key constraint already exists';
END
GO

-- Add index for better query performance
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bookings_CustomerUserId' AND object_id = OBJECT_ID('dbo.Bookings'))
BEGIN
  CREATE INDEX IX_Bookings_CustomerUserId 
  ON dbo.Bookings(CustomerUserId, DateISO DESC);
  
  PRINT 'Added index IX_Bookings_CustomerUserId';
END
ELSE
BEGIN
  PRINT 'Index already exists';
END
GO

PRINT 'Migration completed successfully!';
