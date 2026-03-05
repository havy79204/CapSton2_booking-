# Product Enhancement Migration Guide

This guide explains how to set up the enhanced product features including variants, multiple images, and stock tracking.

## Overview

The enhancement adds support for:
- ✅ **Product Variants** - Different colors/types for each product
- ✅ **Multiple Images** - Product image galleries
- ✅ **Stock Tracking** - Inventory management per product/variant

## Database Changes

### New Tables
1. **ProductImages** - Stores multiple images per product
2. **ProductVariants** - Stores product variants (colors, types, sizes, etc.)

### Updated Tables
1. **Products** - Added `StockQty` column

## How to Apply Changes

### Step 1: Run the Migration

Execute the migration SQL file in SQL Server Management Studio (SSMS) or using sqlcmd:

```sql
-- In SSMS, open and execute:
database/sqlserver/migration-product-enhancements.sql
```

Or via command line:
```bash
sqlcmd -S localhost -d "NIOM&CENailSpa" -i database/sqlserver/migration-product-enhancements.sql
```

### Step 2: Seed Sample Data (Optional)

To add sample products with variants and images:

```sql
-- In SSMS, open and execute:
database/sqlserver/seed-products-with-variants.sql
```

Or via command line:
```bash
sqlcmd -S localhost -d "NIOM&CENailSpa" -i database/sqlserver/seed-products-with-variants.sql
```

### Step 3: Restart Backend Server

After running the migration, restart your backend server to use the new features:

```bash
cd my-nail-spa-backend
npm run dev
```

## API Changes

### GET /api/products/:id

Now returns additional fields:

```json
{
  "item": {
    "id": "prod-001",
    "name": "Cooling Gel Nail Polish",
    "price": 14.00,
    "stockQty": 112,
    "image": "/seed/images/hero.avif",
    
    "images": [
      {
        "id": "img-001",
        "url": "/seed/images/hero.avif",
        "displayOrder": 0,
        "isPrimary": true
      }
    ],
    
    "variants": [
      {
        "id": "var-001",
        "name": "Pink",
        "type": "Color",
        "priceAdjustment": 0,
        "stockQty": 45,
        "displayOrder": 0
      },
      {
        "id": "var-002",
        "name": "Red",
        "type": "Color",
        "priceAdjustment": 0,
        "stockQty": 38,
        "displayOrder": 1
      }
    ]
  }
}
```

## Frontend Changes

The ProductDetailPage now supports:
- ✅ Image gallery with thumbnails
- ✅ Variant selector (Pink/Red/White)
- ✅ Stock quantity display per variant
- ✅ Wishlist/favorite button

## Rollback (if needed)

If you need to rollback the changes:

```sql
USE [NIOM&CENailSpa];
GO

-- Drop new tables
DROP TABLE IF EXISTS dbo.ProductVariants;
DROP TABLE IF EXISTS dbo.ProductImages;

-- Remove StockQty column (optional)
ALTER TABLE dbo.Products DROP CONSTRAINT IF EXISTS DF_Products_StockQty;
ALTER TABLE dbo.Products DROP COLUMN IF EXISTS StockQty;
GO
```

## Troubleshooting

### Issue: "Table already exists" error
**Solution**: The migration is idempotent. It checks if tables exist before creating them. You can safely re-run it.

### Issue: Backend returns old product format
**Solution**: Make sure you've restarted the backend server after running the migration.

### Issue: No variants showing on frontend
**Solution**: 
1. Check if sample data was seeded: `SELECT * FROM dbo.ProductVariants`
2. Verify API response includes `variants` array
3. Clear browser cache and reload

## Additional Notes

- The `StockQty` column in Products table serves as a fallback when variants don't have individual stock quantities
- Default stock quantity for new products is set to 100
- Images are ordered by `DisplayOrder` and `IsPrimary` flag
- Variants can have price adjustments (positive or negative)
- All foreign keys use CASCADE DELETE for data integrity

## Need Help?

If you encounter any issues, check:
1. SQL Server connection is working
2. Database name is correct: `NIOM&CENailSpa`
3. User has sufficient permissions
4. Backend logs for any errors
