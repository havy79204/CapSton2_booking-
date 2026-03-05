-- ===================================================
-- Create Addresses Table
-- ===================================================
USE [NIOM&CENailSpa]
GO

-- Drop table if exists (for fresh start)
IF OBJECT_ID(N'dbo.Addresses', N'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.Addresses
END
GO

-- Create Addresses table
CREATE TABLE dbo.Addresses (
  AddressId NVARCHAR(64) NOT NULL CONSTRAINT PK_Addresses PRIMARY KEY,
  UserId NVARCHAR(64) NOT NULL,
  
  -- Contact Info
  FullName NVARCHAR(200) NOT NULL,
  PhoneNumber NVARCHAR(50) NOT NULL,
  
  -- Address Info
  AddressLine NVARCHAR(500) NOT NULL,
  City NVARCHAR(100) NULL,
  Country NVARCHAR(100) NOT NULL CONSTRAINT DF_Addresses_Country DEFAULT (N'Vietnam'),
  
  -- Default flag
  IsDefault BIT NOT NULL CONSTRAINT DF_Addresses_IsDefault DEFAULT (0),

  -- Foreign key to Users
  CONSTRAINT FK_Addresses_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
)
GO

-- Create indexes for performance
CREATE INDEX IX_Addresses_UserId ON dbo.Addresses(UserId)
GO

CREATE INDEX IX_Addresses_IsDefault ON dbo.Addresses(UserId, IsDefault)
GO

PRINT 'Addresses table created successfully!'
GO

-- Insert sample data for testing (optional)
-- DECLARE @TestUserId NVARCHAR(64) = (SELECT TOP 1 UserId FROM dbo.Users WHERE Email = 'vupham.19504@gmail.com')

-- IF @TestUserId IS NOT NULL
-- BEGIN
--   INSERT INTO dbo.Addresses (AddressId, UserId, FullName, PhoneNumber, AddressLine, City, Country, IsDefault)
--   VALUES 
--     (NEWID(), @TestUserId, N'Ngô Nguyễn Thủy Linh', '+84786756561', N'K19/10 Hà Huy Tập 1', N'Đà Nẵng', N'Vietnam', 1)
  
--   PRINT 'Sample address inserted!'
-- END
-- GO
