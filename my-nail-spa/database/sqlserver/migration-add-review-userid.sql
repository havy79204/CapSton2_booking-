/*
  Migration: Add UserId to Reviews tables
  Purpose: Track which authenticated user created a review (optional - for logged-in users only)
  Date: 2026-03-05
*/

USE [NIOM&CENailSpa];
GO

-- Add UserId column to SalonReviews if it doesn't exist
IF COL_LENGTH('dbo.SalonReviews', 'UserId') IS NULL
BEGIN
  ALTER TABLE dbo.SalonReviews ADD UserId NVARCHAR(64) NULL;
  
  -- Add foreign key constraint
  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys 
    WHERE name = N'FK_SalonReviews_User' 
    AND parent_object_id = OBJECT_ID(N'dbo.SalonReviews')
  )
  BEGIN
    ALTER TABLE dbo.SalonReviews
      ADD CONSTRAINT FK_SalonReviews_User 
      FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId);
  END
  
  -- Add index for user's reviews
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = N'IX_SalonReviews_UserId_CreatedAt' 
    AND object_id = OBJECT_ID(N'dbo.SalonReviews')
  )
  BEGIN
    CREATE INDEX IX_SalonReviews_UserId_CreatedAt 
      ON dbo.SalonReviews(UserId, CreatedAt DESC);
  END
  
  PRINT 'Added UserId column to SalonReviews table';
END
ELSE
BEGIN
  PRINT 'UserId column already exists in SalonReviews table';
END
GO

-- Add UserId column to ProductReviews if it doesn't exist
IF COL_LENGTH('dbo.ProductReviews', 'UserId') IS NULL
BEGIN
  ALTER TABLE dbo.ProductReviews ADD UserId NVARCHAR(64) NULL;
  
  -- Add foreign key constraint
  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys 
    WHERE name = N'FK_ProductReviews_User' 
    AND parent_object_id = OBJECT_ID(N'dbo.ProductReviews')
  )
  BEGIN
    ALTER TABLE dbo.ProductReviews
      ADD CONSTRAINT FK_ProductReviews_User 
      FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId);
  END
  
  -- Add index for user's reviews
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = N'IX_ProductReviews_UserId_CreatedAt' 
    AND object_id = OBJECT_ID(N'dbo.ProductReviews')
  )
  BEGIN
    CREATE INDEX IX_ProductReviews_UserId_CreatedAt 
      ON dbo.ProductReviews(UserId, CreatedAt DESC);
  END
  
  PRINT 'Added UserId column to ProductReviews table';
END
ELSE
BEGIN
  PRINT 'UserId column already exists in ProductReviews table';
END
GO

PRINT 'Migration completed successfully!';
GO
