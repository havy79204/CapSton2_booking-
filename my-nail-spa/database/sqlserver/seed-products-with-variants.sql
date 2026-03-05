/*
  Seed sample product data with variants and images
  Run this after running migration-product-enhancements.sql
  
  Date: 2026-03-05
*/

USE [NIOM&CENailSpa];
GO

-- Check if we need to run the enhancement migration first
IF COL_LENGTH('dbo.Products', 'StockQty') IS NULL
BEGIN
  PRINT 'ERROR: Please run migration-product-enhancements.sql first!';
  RETURN;
END;
GO

-- Insert sample products if they don't exist
DECLARE @productId1 NVARCHAR(128) = N'prod-cooling-gel-001';
DECLARE @productId2 NVARCHAR(128) = N'prod-nail-polish-002';
DECLARE @productId3 NVARCHAR(128) = N'prod-cuticle-oil-003';

-- Product 1: Cooling Gel Nail Polish
IF NOT EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @productId1)
BEGIN
  INSERT INTO dbo.Products (ProductId, SalonId, Name, Description, Badge, ImageUrl, Price, StockQty, Status, CreatedAt, UpdatedAt)
  VALUES (
    @productId1,
    NULL,  -- global product
    N'Cooling Gel Nail Polish',
    N'Make your manicure a showstopper with our mesmerising Mirror Chrome Powder. This easy-to-apply, highly pigmented Chrome Powder boasts the ultimate high-shine, mirror finish for an unforgettable statement manicure.' + CHAR(13) + CHAR(10) + 
    N'Make your manicure a showstopper with our mesmerising Mirror Chrome Powder. This easy-to-apply, highly pigmented Chrome Powder boasts the ultimate high-shine, mirror finish for an unforgettable statement manicure.',
    N'By Itaewon Nail',
    N'/seed/images/hero.avif',
    14.00,
    112,
    N'published',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );
  PRINT 'Created product: Cooling Gel Nail Polish';

  -- Add images for product 1
  INSERT INTO dbo.ProductImages (ImageId, ProductId, ImageUrl, DisplayOrder, IsPrimary)
  VALUES 
    (NEWID(), @productId1, N'/seed/images/hero.avif', 0, 1),
    (NEWID(), @productId1, N'/seed/images/hero.avif', 1, 0),
    (NEWID(), @productId1, N'/seed/images/hero.avif', 2, 0);
  PRINT 'Added images for Cooling Gel Nail Polish';

  -- Add variants for product 1
  INSERT INTO dbo.ProductVariants (VariantId, ProductId, VariantName, VariantType, PriceAdjustment, StockQty, DisplayOrder, IsAvailable)
  VALUES 
    (NEWID(), @productId1, N'Pink', N'Color', 0, 45, 0, 1),
    (NEWID(), @productId1, N'Red', N'Color', 0, 38, 1, 1),
    (NEWID(), @productId1, N'White', N'Color', 0, 29, 2, 1);
  PRINT 'Added variants for Cooling Gel Nail Polish';
END
ELSE
BEGIN
  PRINT 'Product "Cooling Gel Nail Polish" already exists';
END;

-- Product 2: Premium Nail Polish Set
IF NOT EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @productId2)
BEGIN
  INSERT INTO dbo.Products (ProductId, SalonId, Name, Description, Badge, ImageUrl, Price, StockQty, Status, CreatedAt, UpdatedAt)
  VALUES (
    @productId2,
    NULL,
    N'Premium Nail Polish Set',
    N'Professional-grade nail polish collection with vibrant, long-lasting colors. Perfect for creating stunning nail art and designs.',
    N'Best Seller',
    N'/seed/images/hero.avif',
    24.99,
    85,
    N'published',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );
  PRINT 'Created product: Premium Nail Polish Set';

  -- Add images
  INSERT INTO dbo.ProductImages (ImageId, ProductId, ImageUrl, DisplayOrder, IsPrimary)
  VALUES 
    (NEWID(), @productId2, N'/seed/images/hero.avif', 0, 1),
    (NEWID(), @productId2, N'/seed/images/hero.avif', 1, 0);

  -- Add variants
  INSERT INTO dbo.ProductVariants (VariantId, ProductId, VariantName, VariantType, StockQty, DisplayOrder, IsAvailable)
  VALUES 
    (NEWID(), @productId2, N'Classic Collection', N'Set', 30, 0, 1),
    (NEWID(), @productId2, N'Pastel Collection', N'Set', 28, 1, 1),
    (NEWID(), @productId2, N'Bold Collection', N'Set', 27, 2, 1);
END;

-- Product 3: Cuticle Care Oil
IF NOT EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @productId3)
BEGIN
  INSERT INTO dbo.Products (ProductId, SalonId, Name, Description, Badge, ImageUrl, Price, StockQty, Status, CreatedAt, UpdatedAt)
  VALUES (
    @productId3,
    NULL,
    N'Nourishing Cuticle Oil',
    N'Enriched with vitamin E and natural oils to deeply nourish and protect your cuticles. Promotes healthy nail growth.',
    N'New',
    N'/seed/images/hero.avif',
    9.99,
    150,
    N'published',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );
  PRINT 'Created product: Nourishing Cuticle Oil';

  -- Add images
  INSERT INTO dbo.ProductImages (ImageId, ProductId, ImageUrl, DisplayOrder, IsPrimary)
  VALUES 
    (NEWID(), @productId3, N'/seed/images/hero.avif', 0, 1);

  -- Add variants (scents)
  INSERT INTO dbo.ProductVariants (VariantId, ProductId, VariantName, VariantType, StockQty, DisplayOrder, IsAvailable)
  VALUES 
    (NEWID(), @productId3, N'Lavender', N'Scent', 50, 0, 1),
    (NEWID(), @productId3, N'Rose', N'Scent', 55, 1, 1),
    (NEWID(), @productId3, N'Unscented', N'Scent', 45, 2, 1);
END;

PRINT 'Sample product seeding completed successfully!';
GO

-- Display summary
SELECT 
  p.Name,
  p.Price,
  p.StockQty AS TotalStock,
  COUNT(DISTINCT pi.ImageId) AS ImageCount,
  COUNT(DISTINCT pv.VariantId) AS VariantCount
FROM dbo.Products p
LEFT JOIN dbo.ProductImages pi ON p.ProductId = pi.ProductId
LEFT JOIN dbo.ProductVariants pv ON p.ProductId = pv.ProductId
WHERE p.Status = N'published'
GROUP BY p.ProductId, p.Name, p.Price, p.StockQty
ORDER BY p.CreatedAt DESC;
GO
