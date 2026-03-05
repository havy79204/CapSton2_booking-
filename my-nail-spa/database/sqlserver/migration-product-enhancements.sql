/*
  Migration: Product Enhancements
  - Add support for product variants (colors/types)
  - Add support for multiple images
  - Add stock quantity tracking (if not using InventoryItems)
  
  Date: 2026-03-05
*/

USE [NIOM&CENailSpa];
GO

-- Add StockQty column to Products table (if not using InventoryItems with SKU)
IF COL_LENGTH('dbo.Products', 'StockQty') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD StockQty INT NULL;
  PRINT 'Added StockQty column to Products table';
END
ELSE
BEGIN
  PRINT 'StockQty column already exists in Products table';
END;
GO

-- Set default stock quantity for existing products
UPDATE dbo.Products 
SET StockQty = 100 
WHERE StockQty IS NULL AND Status <> N'deleted';
GO

-- Add default constraint for future inserts
IF OBJECT_ID(N'DF_Products_StockQty', N'D') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD CONSTRAINT DF_Products_StockQty DEFAULT (100) FOR StockQty;
  PRINT 'Added default constraint for StockQty';
END;
GO

-- Create ProductImages table for multiple images per product
IF OBJECT_ID(N'dbo.ProductImages', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductImages (
    ImageId NVARCHAR(128) NOT NULL CONSTRAINT PK_ProductImages PRIMARY KEY,
    ProductId NVARCHAR(128) NOT NULL,
    ImageUrl NVARCHAR(MAX) NOT NULL,
    DisplayOrder INT NOT NULL DEFAULT (0),
    IsPrimary BIT NOT NULL DEFAULT (0),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ProductImages_CreatedAt DEFAULT (SYSUTCDATETIME()),
    
    CONSTRAINT FK_ProductImages_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
  );

  CREATE INDEX IX_ProductImages_ProductId ON dbo.ProductImages(ProductId);
  PRINT 'Created ProductImages table';
END
ELSE
BEGIN
  PRINT 'ProductImages table already exists';
END;
GO

-- Create ProductVariants table for color/type options
IF OBJECT_ID(N'dbo.ProductVariants', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductVariants (
    VariantId NVARCHAR(128) NOT NULL CONSTRAINT PK_ProductVariants PRIMARY KEY,
    ProductId NVARCHAR(128) NOT NULL,
    VariantName NVARCHAR(100) NOT NULL,  -- e.g., "Pink", "Red", "White"
    VariantType NVARCHAR(50) NOT NULL DEFAULT (N'Color'),  -- "Color", "Size", "Type", etc.
    PriceAdjustment DECIMAL(10,2) NULL,  -- Additional price (can be negative for discount)
    StockQty INT NULL,  -- Stock specific to this variant
    ImageUrl NVARCHAR(MAX) NULL,  -- Optional variant-specific image
    DisplayOrder INT NOT NULL DEFAULT (0),
    IsAvailable BIT NOT NULL DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ProductVariants_CreatedAt DEFAULT (SYSUTCDATETIME()),
    
    CONSTRAINT FK_ProductVariants_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
  );

  CREATE INDEX IX_ProductVariants_ProductId ON dbo.ProductVariants(ProductId);
  PRINT 'Created ProductVariants table';
END
ELSE
BEGIN
  PRINT 'ProductVariants table already exists';
END;
GO

-- Add sample data for existing products (optional - comment out if not needed)
/*
-- Example: Add variants for a product
DECLARE @sampleProductId NVARCHAR(128) = (SELECT TOP 1 ProductId FROM dbo.Products WHERE Status = N'published');

IF @sampleProductId IS NOT NULL
BEGIN
  -- Insert sample images
  INSERT INTO dbo.ProductImages (ImageId, ProductId, ImageUrl, DisplayOrder, IsPrimary)
  VALUES 
    (NEWID(), @sampleProductId, (SELECT TOP 1 ImageUrl FROM dbo.Products WHERE ProductId = @sampleProductId), 0, 1);

  -- Insert sample variants
  INSERT INTO dbo.ProductVariants (VariantId, ProductId, VariantName, VariantType, DisplayOrder)
  VALUES 
    (NEWID(), @sampleProductId, N'Pink', N'Color', 0),
    (NEWID(), @sampleProductId, N'Red', N'Color', 1),
    (NEWID(), @sampleProductId, N'White', N'Color', 2);
    
  PRINT 'Added sample variants and images';
END;
*/

PRINT 'Migration completed successfully';
GO
