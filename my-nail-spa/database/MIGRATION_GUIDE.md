# Database Migration Guide

## ⚠️ QUAN TRỌNG: Chạy migration script

Để hiển thị bookings và orders trong Profile Dashboard, bạn cần chạy migration script để thêm cột `CustomerUserId` vào bảng `Bookings`.

### Cách chạy migration:

#### Option 1: SQL Server Management Studio (SSMS)
1. Mở SQL Server Management Studio
2. Kết nối tới SQL Server của bạn
3. Mở file: `my-nail-spa/database/sqlserver/migration-add-customer-userid.sql`
4. Click **Execute** (hoặc nhấn F5)
5. Xem kết quả - sẽ hiển thị "Migration completed successfully!"

#### Option 2: Azure Data Studio
1. Mở Azure Data Studio
2. Kết nối tới SQL Server
3. File → Open File → chọn `migration-add-customer-userid.sql`
4. Click Run (hoặc Ctrl+Shift+E)
5. Kiểm tra kết quả

#### Option 3: Command Line (sqlcmd)
```bash
sqlcmd -S localhost -d NIOM&CENailSpa -i "my-nail-spa/database/sqlserver/migration-add-customer-userid.sql"
```

### Sau khi chạy migration:

1. **Restart backend:**
   ```bash
   cd my-nail-spa-backend
   npm run dev
   ```

2. **Refresh frontend:** 
   - Mở http://localhost:5173/profile
   - Đăng nhập lại nếu cần
   - Giờ sẽ thấy orders hiển thị!

### Kiểm tra migration đã chạy thành công:

Chạy query này trong SSMS/Azure Data Studio:
```sql
USE [NIOM&CENailSpa];
GO

-- Kiểm tra cột CustomerUserId đã tồn tại
SELECT 
    c.name as ColumnName, 
    t.name as DataType,
    c.max_length as MaxLength
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.Bookings')
  AND c.name IN ('CustomerUserId', 'CustomerEmail')
ORDER BY c.name;
```

Kết quả mong đợi:
```
ColumnName       DataType    MaxLength
CustomerEmail    nvarchar    640
CustomerUserId   nvarchar    128
```

### Test với sample data:

Nếu muốn tạo booking mẫu để test:
```sql
-- Lấy UserId của user hiện tại (thay email của bạn vào đây)
DECLARE @UserId NVARCHAR(64) = (SELECT TOP 1 UserId FROM Users WHERE Email = 'vupham.19504@gmail.com')
DECLARE @SalonId NVARCHAR(64) = (SELECT TOP 1 SalonId FROM Salons)

-- Tạo booking mẫu
INSERT INTO Bookings (
    BookingId, 
    CreatedAt, 
    Status, 
    SalonId, 
    SalonName, 
    DateISO, 
    TimeSlot, 
    TotalPrice,
    CustomerUserId,
    CustomerName, 
    CustomerEmail
)
VALUES (
    NEWID(),
    GETDATE(),
    'confirmed',
    @SalonId,
    'Test Salon',
    CAST(GETDATE() + 7 AS DATE), -- 7 days from now
    '14:00:00',
    50.00,
    @UserId,
    'Test Customer',
    'vupham.19504@gmail.com'
)

PRINT 'Sample booking created!'
```

### Tạo order mẫu:

```sql
-- Lấy IDs
DECLARE @UserId NVARCHAR(64) = (SELECT TOP 1 UserId FROM Users WHERE Email = 'vupham.19504@gmail.com')
DECLARE @ProductId NVARCHAR(64) = (SELECT TOP 1 ProductId FROM Products)
DECLARE @OrderId NVARCHAR(64) = CAST(NEWID() AS NVARCHAR(64))

-- Tạo Order
INSERT INTO Orders (
    OrderId,
    CreatedAt,
    Status,
    SalonKey,
    CustomerUserId,
    CustomerEmail,
    CustomerName,
    Subtotal,
    Tax,
    Total,
    PaymentMethod
)
VALUES (
    @OrderId,
    GETDATE(),
    'processing',
    'global',
    @UserId,
    'vupham.19504@gmail.com',
    'Test Customer',
    45.00,
    5.00,
    50.00,
    'credit_card'
)

-- Tạo Order Item
INSERT INTO OrderItems (
    OrderId,
    ProductId,
    Quantity,
    UnitPrice,
    Subtotal
)
VALUES (
    @OrderId,
    @ProductId,
    1,
    45.00,
    45.00
)

PRINT 'Sample order created!'
```

---

## 🎉 Hoàn tất!

Sau khi chạy migration và restart backend, Profile Dashboard sẽ hiển thị:
- ✅ Booking stats (Upcoming, Pending, In Progress, Completed)
- ✅ My Bookings list
- ✅ Order Tracking với product images

**Lưu ý:** Nếu database chưa có data, bạn sẽ thấy "No bookings found" và "No orders yet" - đó là bình thường!
