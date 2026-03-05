/*
  ZOTA Nail Spa - SQL Server schema

  How to run (SSMS / sqlcmd):
    - Execute this whole script.

  Notes:
    - The current app stores data in localStorage with string IDs.
    - This schema keeps IDs as NVARCHAR to match existing shapes.
    - Some collections in the FE are nested (arrays/maps); they are normalized here.
*/

SET NOCOUNT ON;
GO

IF DB_ID(N'NIOM&CENailSpa') IS NULL
BEGIN
  CREATE DATABASE [NIOM&CENailSpa];
END;
GO

USE [NIOM&CENailSpa];
GO

/* =========================
   Lookup tables
   ========================= */

IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Roles (
    RoleKey NVARCHAR(32) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    DisplayName NVARCHAR(64) NOT NULL
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleKey = N'admin')
  INSERT INTO dbo.Roles(RoleKey, DisplayName) VALUES (N'admin', N'Admin');
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleKey = N'owner')
  INSERT INTO dbo.Roles(RoleKey, DisplayName) VALUES (N'owner', N'Owner');
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleKey = N'staff')
  INSERT INTO dbo.Roles(RoleKey, DisplayName) VALUES (N'staff', N'Staff');
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleKey = N'customer')
  INSERT INTO dbo.Roles(RoleKey, DisplayName) VALUES (N'customer', N'Customer');
GO

IF OBJECT_ID(N'dbo.ServiceTypes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ServiceTypes (
    ServiceTypeId NVARCHAR(64) NOT NULL CONSTRAINT PK_ServiceTypes PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    DefaultDurationMin INT NULL,
    DefaultPrice DECIMAL(10,2) NULL
  );
END;
GO

/* Seed default service types based on src/data/mock.js */
IF NOT EXISTS (SELECT 1 FROM dbo.ServiceTypes WHERE ServiceTypeId = N'manicure')
  INSERT INTO dbo.ServiceTypes(ServiceTypeId, Name, DefaultDurationMin, DefaultPrice) VALUES (N'manicure', N'Manicure', 45, 35);
IF NOT EXISTS (SELECT 1 FROM dbo.ServiceTypes WHERE ServiceTypeId = N'pedicure')
  INSERT INTO dbo.ServiceTypes(ServiceTypeId, Name, DefaultDurationMin, DefaultPrice) VALUES (N'pedicure', N'Pedicure', 60, 45);
IF NOT EXISTS (SELECT 1 FROM dbo.ServiceTypes WHERE ServiceTypeId = N'gel')
  INSERT INTO dbo.ServiceTypes(ServiceTypeId, Name, DefaultDurationMin, DefaultPrice) VALUES (N'gel', N'Gel Nails', 60, 55);
IF NOT EXISTS (SELECT 1 FROM dbo.ServiceTypes WHERE ServiceTypeId = N'acrylic')
  INSERT INTO dbo.ServiceTypes(ServiceTypeId, Name, DefaultDurationMin, DefaultPrice) VALUES (N'acrylic', N'Acrylic Full Set', 90, 75);
IF NOT EXISTS (SELECT 1 FROM dbo.ServiceTypes WHERE ServiceTypeId = N'dip')
  INSERT INTO dbo.ServiceTypes(ServiceTypeId, Name, DefaultDurationMin, DefaultPrice) VALUES (N'dip', N'Dip Powder', 75, 65);
IF NOT EXISTS (SELECT 1 FROM dbo.ServiceTypes WHERE ServiceTypeId = N'design')
  INSERT INTO dbo.ServiceTypes(ServiceTypeId, Name, DefaultDurationMin, DefaultPrice) VALUES (N'design', N'Nail Art / Design', 30, 25);
GO

/* =========================
   Core entities
   ========================= */

IF OBJECT_ID(N'dbo.Salons', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Salons (
    SalonId NVARCHAR(64) NOT NULL CONSTRAINT PK_Salons PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Tagline NVARCHAR(300) NULL,
    Address NVARCHAR(300) NULL,
    LogoUrl NVARCHAR(MAX) NULL,
    Rating DECIMAL(3,2) NULL,
    ReviewCount INT NULL,
    HeroHint NVARCHAR(200) NULL,
    Status NVARCHAR(32) NOT NULL CONSTRAINT DF_Salons_Status DEFAULT (N'active'),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Salons_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Salons_UpdatedAt DEFAULT (SYSUTCDATETIME())
  );
END;
GO

/* Keep Salons aligned with FE fields (idempotent upgrades) */
IF COL_LENGTH('dbo.Salons', 'LogoUrl') IS NOT NULL
  ALTER TABLE dbo.Salons ALTER COLUMN LogoUrl NVARCHAR(MAX) NULL;
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Users (
    UserId NVARCHAR(64) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Email NVARCHAR(320) NOT NULL,
    Password NVARCHAR(200) NULL,
    RoleKey NVARCHAR(32) NOT NULL,
    SalonId NVARCHAR(64) NULL,
    Status NVARCHAR(32) NOT NULL CONSTRAINT DF_Users_Status DEFAULT (N'active'),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT UQ_Users_Email UNIQUE (Email),
    CONSTRAINT FK_Users_Role FOREIGN KEY (RoleKey) REFERENCES dbo.Roles(RoleKey),
    CONSTRAINT FK_Users_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId)
  );

  CREATE INDEX IX_Users_RoleKey ON dbo.Users(RoleKey);
  CREATE INDEX IX_Users_SalonId ON dbo.Users(SalonId);
END;
GO

-- Addresses table for user shipping/billing addresses
IF OBJECT_ID(N'dbo.Addresses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Addresses (
    AddressId NVARCHAR(64) NOT NULL CONSTRAINT PK_Addresses PRIMARY KEY,
    UserId NVARCHAR(64) NOT NULL,
    AddressLine1 NVARCHAR(255) NOT NULL,
    AddressLine2 NVARCHAR(255) NULL,
    City NVARCHAR(100) NOT NULL,
    State NVARCHAR(100) NULL,
    ZipCode NVARCHAR(20) NULL,
    Country NVARCHAR(100) NOT NULL CONSTRAINT DF_Addresses_Country DEFAULT (N'Vietnam'),
    IsDefault BIT NOT NULL CONSTRAINT DF_Addresses_IsDefault DEFAULT (0),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Addresses_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Addresses_UpdatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_Addresses_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
  );

  CREATE INDEX IX_Addresses_UserId ON dbo.Addresses(UserId);
  CREATE INDEX IX_Addresses_IsDefault ON dbo.Addresses(UserId, IsDefault);
END;
GO

IF OBJECT_ID(N'dbo.SalonTechnicians', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonTechnicians (
    SalonId NVARCHAR(64) NOT NULL,
    TechnicianId NVARCHAR(64) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    CONSTRAINT PK_SalonTechnicians PRIMARY KEY (SalonId, TechnicianId),
    CONSTRAINT FK_SalonTechnicians_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId)
  );
END;
GO

IF OBJECT_ID(N'dbo.SalonServices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonServices (
    SalonId NVARCHAR(64) NOT NULL,
    ServiceTypeId NVARCHAR(64) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    DurationMin INT NOT NULL,
    Price DECIMAL(10,2) NOT NULL,
    Status NVARCHAR(32) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL,
    UpdatedAt DATETIME2(0) NOT NULL,

    CONSTRAINT PK_SalonServices PRIMARY KEY (SalonId, ServiceTypeId),
    CONSTRAINT FK_SalonServices_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId),
    CONSTRAINT FK_SalonServices_ServiceType FOREIGN KEY (ServiceTypeId) REFERENCES dbo.ServiceTypes(ServiceTypeId)
  );

  CREATE INDEX IX_SalonServices_SalonId ON dbo.SalonServices(SalonId);
END;
GO

/* Defaults for SalonServices timestamps (idempotent) */
IF OBJECT_ID(N'dbo.SalonServices', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_SalonServices_CreatedAt', N'D') IS NULL
    ALTER TABLE dbo.SalonServices ADD CONSTRAINT DF_SalonServices_CreatedAt DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
  IF OBJECT_ID(N'DF_SalonServices_UpdatedAt', N'D') IS NULL
    ALTER TABLE dbo.SalonServices ADD CONSTRAINT DF_SalonServices_UpdatedAt DEFAULT (SYSUTCDATETIME()) FOR UpdatedAt;
END;
GO

IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Products (
    ProductId NVARCHAR(128) NOT NULL CONSTRAINT PK_Products PRIMARY KEY,
    SalonId NVARCHAR(64) NULL,
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Badge NVARCHAR(100) NULL,
    ImageUrl NVARCHAR(MAX) NULL,
    Price DECIMAL(10,2) NOT NULL,
    Status NVARCHAR(32) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL,
    UpdatedAt DATETIME2(0) NOT NULL,

    CONSTRAINT FK_Products_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId)
  );

  CREATE INDEX IX_Products_SalonId ON dbo.Products(SalonId);
END;
GO

/* Defaults for Products (idempotent) */
IF OBJECT_ID(N'dbo.Products', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_Products_Status', N'D') IS NULL
    ALTER TABLE dbo.Products ADD CONSTRAINT DF_Products_Status DEFAULT (N'draft') FOR Status;
  IF OBJECT_ID(N'DF_Products_CreatedAt', N'D') IS NULL
    ALTER TABLE dbo.Products ADD CONSTRAINT DF_Products_CreatedAt DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
  IF OBJECT_ID(N'DF_Products_UpdatedAt', N'D') IS NULL
    ALTER TABLE dbo.Products ADD CONSTRAINT DF_Products_UpdatedAt DEFAULT (SYSUTCDATETIME()) FOR UpdatedAt;
END;
GO

/* Keep Products aligned with FE fields (idempotent upgrades) */
IF COL_LENGTH('dbo.Products', 'ImageUrl') IS NOT NULL
  ALTER TABLE dbo.Products ALTER COLUMN ImageUrl NVARCHAR(MAX) NULL;

/* Optional SKU mapping to InventoryItems for stock sync */
IF COL_LENGTH('dbo.Products', 'SKU') IS NULL
  ALTER TABLE dbo.Products ADD SKU NVARCHAR(64) NULL;
GO

/* =========================
   Bookings
   ========================= */

IF OBJECT_ID(N'dbo.Bookings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bookings (
    BookingId NVARCHAR(64) NOT NULL CONSTRAINT PK_Bookings PRIMARY KEY,
    CreatedAt DATETIME2(0) NOT NULL,
    Status NVARCHAR(32) NOT NULL CONSTRAINT DF_Bookings_Status DEFAULT (N'Pending'),
    InventoryConsumedAt DATETIME2(0) NULL,

    SalonId NVARCHAR(64) NOT NULL,
    SalonName NVARCHAR(200) NULL,

    DateISO DATE NOT NULL,
    TimeSlot TIME(0) NULL,

    TechnicianId NVARCHAR(64) NULL,
    TechnicianName NVARCHAR(200) NULL,

    TotalPrice DECIMAL(10,2) NOT NULL CONSTRAINT DF_Bookings_TotalPrice DEFAULT (0),

    CustomerUserId NVARCHAR(64) NULL,
    CustomerName NVARCHAR(200) NOT NULL,
    CustomerPhone NVARCHAR(50) NULL,
    CustomerEmail NVARCHAR(320) NULL,

    CONSTRAINT FK_Bookings_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId),
    CONSTRAINT FK_Bookings_CustomerUser FOREIGN KEY (CustomerUserId) REFERENCES dbo.Users(UserId)
  );

  CREATE INDEX IX_Bookings_Salon_When ON dbo.Bookings(SalonId, DateISO, TimeSlot);
  CREATE INDEX IX_Bookings_Status ON dbo.Bookings(Status);
  CREATE INDEX IX_Bookings_CustomerUserId ON dbo.Bookings(CustomerUserId, DateISO DESC);
END;
GO

/* Default for Bookings.CreatedAt (idempotent) */
IF OBJECT_ID(N'dbo.Bookings', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_Bookings_CreatedAt2', N'D') IS NULL
    ALTER TABLE dbo.Bookings ADD CONSTRAINT DF_Bookings_CreatedAt2 DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
END;
GO

IF OBJECT_ID(N'dbo.BookingServices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.BookingServices (
    BookingId NVARCHAR(64) NOT NULL,
    ServiceTypeId NVARCHAR(64) NOT NULL,
    CONSTRAINT PK_BookingServices PRIMARY KEY (BookingId, ServiceTypeId),
    CONSTRAINT FK_BookingServices_Booking FOREIGN KEY (BookingId) REFERENCES dbo.Bookings(BookingId) ON DELETE CASCADE,
    CONSTRAINT FK_BookingServices_ServiceType FOREIGN KEY (ServiceTypeId) REFERENCES dbo.ServiceTypes(ServiceTypeId)
  );
END;
GO

/* =========================
   Orders
   ========================= */

IF OBJECT_ID(N'dbo.Orders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Orders (
    OrderId NVARCHAR(64) NOT NULL CONSTRAINT PK_Orders PRIMARY KEY,
    CreatedAt DATETIME2(0) NOT NULL,
    Status NVARCHAR(32) NOT NULL,
    Channel NVARCHAR(32) NULL,

    /* In the FE, salonId can be 'global' or 'mixed'. We store that as SalonKey. */
    SalonKey NVARCHAR(64) NOT NULL,
    SalonId NVARCHAR(64) NULL,

    CustomerUserId NVARCHAR(64) NULL,
    CustomerEmail NVARCHAR(320) NULL,
    CustomerName NVARCHAR(200) NULL,
    CustomerPhone NVARCHAR(50) NULL,
    CustomerAddress NVARCHAR(300) NULL,

    Subtotal DECIMAL(10,2) NOT NULL CONSTRAINT DF_Orders_Subtotal DEFAULT (0),
    Tax DECIMAL(10,2) NOT NULL CONSTRAINT DF_Orders_Tax DEFAULT (0),
    Total DECIMAL(10,2) NOT NULL CONSTRAINT DF_Orders_Total DEFAULT (0),

    PaymentMethod NVARCHAR(32) NULL,

    CONSTRAINT FK_Orders_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId),
    CONSTRAINT FK_Orders_CustomerUser FOREIGN KEY (CustomerUserId) REFERENCES dbo.Users(UserId)
  );

  CREATE INDEX IX_Orders_CustomerUserId_CreatedAt ON dbo.Orders(CustomerUserId, CreatedAt DESC);
  CREATE INDEX IX_Orders_CustomerEmail_CreatedAt ON dbo.Orders(CustomerEmail, CreatedAt DESC);
  CREATE INDEX IX_Orders_SalonKey_CreatedAt ON dbo.Orders(SalonKey, CreatedAt DESC);
END;
GO

/* Default for Orders.CreatedAt (idempotent) */
IF OBJECT_ID(N'dbo.Orders', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_Orders_CreatedAt2', N'D') IS NULL
    ALTER TABLE dbo.Orders ADD CONSTRAINT DF_Orders_CreatedAt2 DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
END;
GO

IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.OrderItems (
    OrderItemId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OrderItems PRIMARY KEY,
    OrderId NVARCHAR(64) NOT NULL,
    ProductId NVARCHAR(128) NULL,
    ProductName NVARCHAR(200) NOT NULL,
    Price DECIMAL(10,2) NOT NULL,
    Qty DECIMAL(12,3) NOT NULL,

    CONSTRAINT FK_OrderItems_Order FOREIGN KEY (OrderId) REFERENCES dbo.Orders(OrderId) ON DELETE CASCADE,
    CONSTRAINT FK_OrderItems_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId)
  );

  CREATE INDEX IX_OrderItems_OrderId ON dbo.OrderItems(OrderId);
END;
GO

/* =========================
   Payments (VNPAY)
   ========================= */

IF OBJECT_ID(N'dbo.PaymentTransactions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PaymentTransactions (
    PaymentId NVARCHAR(64) NOT NULL CONSTRAINT PK_PaymentTransactions PRIMARY KEY,
    RefType NVARCHAR(32) NULL,
    RefId NVARCHAR(64) NULL,
    OrderId NVARCHAR(64) NULL,
    BookingId NVARCHAR(64) NULL,
    Provider NVARCHAR(32) NOT NULL,
    Amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_PaymentTransactions_Amount DEFAULT (0),
    Currency NVARCHAR(8) NOT NULL CONSTRAINT DF_PaymentTransactions_Currency DEFAULT ('VND'),
    Status NVARCHAR(20) NOT NULL,

    VnpTxnRef NVARCHAR(100) NULL,
    VnpSecureHash NVARCHAR(512) NULL,
    VnpResponseCode NVARCHAR(10) NULL,
    VnpBankCode NVARCHAR(32) NULL,
    VnpCardType NVARCHAR(32) NULL,
    VnpTransactionNo NVARCHAR(64) NULL,
    VnpPayDate NVARCHAR(20) NULL,
    PaidAt DATETIME2(0) NULL,
    Message NVARCHAR(400) NULL,

    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PaymentTransactions_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PaymentTransactions_UpdatedAt DEFAULT (SYSUTCDATETIME())
  );

  CREATE INDEX IX_PaymentTransactions_OrderId ON dbo.PaymentTransactions(OrderId);
  CREATE INDEX IX_PaymentTransactions_BookingId ON dbo.PaymentTransactions(BookingId);
  CREATE INDEX IX_PaymentTransactions_Status ON dbo.PaymentTransactions(Status);
  CREATE INDEX IX_PaymentTransactions_Ref ON dbo.PaymentTransactions(RefType, RefId);

  -- normalize existing status values (legacy 'SUCCESS'/'FAILED' -> 'Success'/'Failed')
  UPDATE dbo.PaymentTransactions
  SET Status = CASE WHEN UPPER(ISNULL(Status,'')) = 'SUCCESS' THEN 'Success' WHEN UPPER(ISNULL(Status,'')) = 'FAILED' THEN 'Failed' ELSE Status END
  WHERE UPPER(ISNULL(Status,'')) IN ('SUCCESS','FAILED');

  -- ensure exactly one of OrderId / BookingId is set (add constraint only if no violating rows)
  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PaymentTransactions_OneRef')
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentTransactions WHERE (OrderId IS NULL AND BookingId IS NULL) OR (OrderId IS NOT NULL AND BookingId IS NOT NULL))
    BEGIN
      ALTER TABLE dbo.PaymentTransactions ADD CONSTRAINT CK_PaymentTransactions_OneRef CHECK ((OrderId IS NOT NULL AND BookingId IS NULL) OR (OrderId IS NULL AND BookingId IS NOT NULL));
    END
  END;

  -- migrate legacy payment booking rows (if any) into unified PaymentTransactions
  IF OBJECT_ID(N'dbo.PaymentBookingTransactions', N'U') IS NOT NULL
  BEGIN
    INSERT INTO dbo.PaymentTransactions(PaymentId, RefType, RefId, OrderId, BookingId, Provider, Amount, Currency, Status, VnpTxnRef, VnpSecureHash, VnpResponseCode, VnpBankCode, VnpCardType, VnpTransactionNo, VnpPayDate, PaidAt, Message, CreatedAt, UpdatedAt)
    SELECT PaymentId, 'booking', BookingId, NULL, BookingId, Provider, Amount, Currency, Status, VnpTxnRef, VnpSecureHash, VnpResponseCode, VnpBankCode, VnpCardType, VnpTransactionNo, VnpPayDate, PaidAt, Message, CreatedAt, UpdatedAt
    FROM dbo.PaymentBookingTransactions pb
    WHERE NOT EXISTS (SELECT 1 FROM dbo.PaymentTransactions p WHERE p.PaymentId = pb.PaymentId);

    DROP TABLE dbo.PaymentBookingTransactions;
  END;

  -- compatibility: ensure RefType/RefId columns + index exist for older schemas
  IF OBJECT_ID(N'dbo.PaymentTransactions', N'U') IS NOT NULL
  BEGIN
    IF COL_LENGTH('dbo.PaymentTransactions','RefType') IS NULL
      ALTER TABLE dbo.PaymentTransactions ADD RefType NVARCHAR(32) NULL;
    IF COL_LENGTH('dbo.PaymentTransactions','RefId') IS NULL
      ALTER TABLE dbo.PaymentTransactions ADD RefId NVARCHAR(64) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PaymentTransactions_Ref' AND object_id = OBJECT_ID(N'dbo.PaymentTransactions'))
      CREATE INDEX IX_PaymentTransactions_Ref ON dbo.PaymentTransactions(RefType, RefId);
  END;
END;
GO

/* =========================
   Messages
   ========================= */

IF OBJECT_ID(N'dbo.MessageThreads', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.MessageThreads (
    ThreadId NVARCHAR(64) NOT NULL CONSTRAINT PK_MessageThreads PRIMARY KEY,
    CreatedAt DATETIME2(0) NOT NULL,

    SalonId NVARCHAR(64) NOT NULL,

    CustomerId NVARCHAR(64) NULL,
    CustomerName NVARCHAR(200) NULL,
    CustomerEmail NVARCHAR(320) NULL,

    LastMessageAt DATETIME2(0) NULL,

    CONSTRAINT FK_MessageThreads_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId),
    CONSTRAINT FK_MessageThreads_Customer FOREIGN KEY (CustomerId) REFERENCES dbo.Users(UserId)
  );

  CREATE INDEX IX_MessageThreads_SalonId_LastMessageAt ON dbo.MessageThreads(SalonId, LastMessageAt DESC);
END;
GO

/* Default for MessageThreads.CreatedAt (idempotent) */
IF OBJECT_ID(N'dbo.MessageThreads', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_MessageThreads_CreatedAt2', N'D') IS NULL
    ALTER TABLE dbo.MessageThreads ADD CONSTRAINT DF_MessageThreads_CreatedAt2 DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
END;
GO

IF OBJECT_ID(N'dbo.Messages', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Messages (
    MessageId NVARCHAR(64) NOT NULL CONSTRAINT PK_Messages PRIMARY KEY,
    ThreadId NVARCHAR(64) NOT NULL,
    FromRole NVARCHAR(32) NOT NULL,
    FromName NVARCHAR(200) NULL,
    Text NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL,

    CONSTRAINT FK_Messages_Thread FOREIGN KEY (ThreadId) REFERENCES dbo.MessageThreads(ThreadId) ON DELETE CASCADE
  );

  CREATE INDEX IX_Messages_ThreadId_CreatedAt ON dbo.Messages(ThreadId, CreatedAt);
END;
GO

/* Default for Messages.CreatedAt (idempotent) */
IF OBJECT_ID(N'dbo.Messages', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_Messages_CreatedAt2', N'D') IS NULL
    ALTER TABLE dbo.Messages ADD CONSTRAINT DF_Messages_CreatedAt2 DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
END;
GO

/* =========================
   Inventory + Purchasing
   ========================= */

IF OBJECT_ID(N'dbo.InventoryItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.InventoryItems (
    InventoryItemId NVARCHAR(64) NOT NULL CONSTRAINT PK_InventoryItems PRIMARY KEY,

    /* In the FE, salonId can be real salonId or 'global'. We store that as SalonKey. */
    SalonKey NVARCHAR(64) NOT NULL,
    SalonId NVARCHAR(64) NULL,

    SKU NVARCHAR(64) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Type NVARCHAR(16) NOT NULL, /* 'pro' | 'retail' */
    Uom NVARCHAR(32) NOT NULL,

    QtyOnHand DECIMAL(12,3) NOT NULL CONSTRAINT DF_InventoryItems_QtyOnHand DEFAULT (0),
    Cost DECIMAL(10,2) NOT NULL CONSTRAINT DF_InventoryItems_Cost DEFAULT (0),
    SalePrice DECIMAL(10,2) NULL,
    MinStock DECIMAL(12,3) NOT NULL CONSTRAINT DF_InventoryItems_MinStock DEFAULT (0),

    CreatedAt DATETIME2(0) NOT NULL,
    UpdatedAt DATETIME2(0) NOT NULL,

    CONSTRAINT UQ_InventoryItems_SalonKey_SKU UNIQUE (SalonKey, SKU),
    CONSTRAINT FK_InventoryItems_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId)
  );

  CREATE INDEX IX_InventoryItems_SalonKey ON dbo.InventoryItems(SalonKey);
  CREATE INDEX IX_InventoryItems_SKU ON dbo.InventoryItems(SKU);
END;
GO

/* Defaults for InventoryItems timestamps (idempotent) */
IF OBJECT_ID(N'dbo.InventoryItems', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_InventoryItems_CreatedAt', N'D') IS NULL
    ALTER TABLE dbo.InventoryItems ADD CONSTRAINT DF_InventoryItems_CreatedAt DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
  IF OBJECT_ID(N'DF_InventoryItems_UpdatedAt', N'D') IS NULL
    ALTER TABLE dbo.InventoryItems ADD CONSTRAINT DF_InventoryItems_UpdatedAt DEFAULT (SYSUTCDATETIME()) FOR UpdatedAt;
END;
GO

IF OBJECT_ID(N'dbo.InventoryTransactions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.InventoryTransactions (
    InventoryTxId NVARCHAR(64) NOT NULL CONSTRAINT PK_InventoryTransactions PRIMARY KEY,
    At DATETIME2(0) NOT NULL,

    SalonKey NVARCHAR(64) NOT NULL,
    SKU NVARCHAR(64) NOT NULL,
    QtyDelta DECIMAL(12,3) NOT NULL,

    Reason NVARCHAR(64) NOT NULL,
    RefId NVARCHAR(64) NULL,
    Vendor NVARCHAR(200) NULL,
    Note NVARCHAR(500) NULL,

    PerformedByRole NVARCHAR(32) NULL,
    PerformedById NVARCHAR(64) NULL,
    PerformedByName NVARCHAR(200) NULL,
    PerformedByEmail NVARCHAR(320) NULL
  );

  CREATE INDEX IX_InventoryTransactions_SalonKey_At ON dbo.InventoryTransactions(SalonKey, At DESC);
  CREATE INDEX IX_InventoryTransactions_SKU_At ON dbo.InventoryTransactions(SKU, At DESC);
  CREATE INDEX IX_InventoryTransactions_RefId ON dbo.InventoryTransactions(RefId);
END;
GO

/* Default for InventoryTransactions.At (idempotent) */
IF OBJECT_ID(N'dbo.InventoryTransactions', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_InventoryTransactions_At', N'D') IS NULL
    ALTER TABLE dbo.InventoryTransactions ADD CONSTRAINT DF_InventoryTransactions_At DEFAULT (SYSUTCDATETIME()) FOR At;
END;
GO

/* FK for InventoryTransactions -> InventoryItems (idempotent)
   Note: uses WITH NOCHECK to avoid failing on existing orphan rows; new writes are still enforced. */
IF OBJECT_ID(N'dbo.InventoryTransactions', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.InventoryItems', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_InventoryTransactions_InventoryItems'
      AND parent_object_id = OBJECT_ID(N'dbo.InventoryTransactions')
  )
  BEGIN
    ALTER TABLE dbo.InventoryTransactions WITH NOCHECK
      ADD CONSTRAINT FK_InventoryTransactions_InventoryItems
      FOREIGN KEY (SalonKey, SKU)
      REFERENCES dbo.InventoryItems (SalonKey, SKU);
  END

  IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_InventoryTransactions_SalonKey_SKU_At'
      AND object_id = OBJECT_ID(N'dbo.InventoryTransactions')
  )
    CREATE INDEX IX_InventoryTransactions_SalonKey_SKU_At
      ON dbo.InventoryTransactions(SalonKey, SKU, At DESC);
END;
GO

IF OBJECT_ID(N'dbo.ExternalPurchaseOrders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ExternalPurchaseOrders (
    PurchaseOrderId NVARCHAR(64) NOT NULL CONSTRAINT PK_ExternalPurchaseOrders PRIMARY KEY,
    CreatedAt DATETIME2(0) NOT NULL,
    SalonKey NVARCHAR(64) NOT NULL,
    Vendor NVARCHAR(200) NOT NULL,
    Note NVARCHAR(500) NULL,
    Total DECIMAL(10,2) NOT NULL,

    PerformedByRole NVARCHAR(32) NULL,
    PerformedById NVARCHAR(64) NULL,
    PerformedByName NVARCHAR(200) NULL,
    PerformedByEmail NVARCHAR(320) NULL
  );

  CREATE INDEX IX_ExternalPurchaseOrders_SalonKey_CreatedAt ON dbo.ExternalPurchaseOrders(SalonKey, CreatedAt DESC);
END;
GO

/* Default for ExternalPurchaseOrders.CreatedAt (idempotent) */
IF OBJECT_ID(N'dbo.ExternalPurchaseOrders', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_ExternalPurchaseOrders_CreatedAt2', N'D') IS NULL
    ALTER TABLE dbo.ExternalPurchaseOrders ADD CONSTRAINT DF_ExternalPurchaseOrders_CreatedAt2 DEFAULT (SYSUTCDATETIME()) FOR CreatedAt;
END;
GO

IF OBJECT_ID(N'dbo.ExternalPurchaseOrderLines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ExternalPurchaseOrderLines (
    LineId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ExternalPurchaseOrderLines PRIMARY KEY,
    PurchaseOrderId NVARCHAR(64) NOT NULL,
    SKU NVARCHAR(64) NOT NULL,
    Qty DECIMAL(12,3) NOT NULL,
    UnitCost DECIMAL(10,2) NOT NULL,
    Uom NVARCHAR(32) NOT NULL,

    CONSTRAINT FK_ExternalPOLines_PO FOREIGN KEY (PurchaseOrderId) REFERENCES dbo.ExternalPurchaseOrders(PurchaseOrderId) ON DELETE CASCADE
  );

  CREATE INDEX IX_ExternalPurchaseOrderLines_PO ON dbo.ExternalPurchaseOrderLines(PurchaseOrderId);
END;
GO

/* Service recipe lines (BOM) used by SERVICE_CONSUMPTION. */
IF OBJECT_ID(N'dbo.ServiceRecipeLines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ServiceRecipeLines (
    ServiceTypeId NVARCHAR(64) NOT NULL,
    SKU NVARCHAR(64) NOT NULL,
    Qty DECIMAL(12,3) NOT NULL,
    Uom NVARCHAR(32) NOT NULL,
    CONSTRAINT PK_ServiceRecipeLines PRIMARY KEY (ServiceTypeId, SKU),
    CONSTRAINT FK_ServiceRecipeLines_ServiceType FOREIGN KEY (ServiceTypeId) REFERENCES dbo.ServiceTypes(ServiceTypeId)
  );
END;
GO

/* =========================
   Salon profiles
   ========================= */

IF OBJECT_ID(N'dbo.SalonProfiles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonProfiles (
    SalonId NVARCHAR(64) NOT NULL CONSTRAINT PK_SalonProfiles PRIMARY KEY,
    Name NVARCHAR(200) NULL,
    Address NVARCHAR(300) NULL,
    Phone NVARCHAR(50) NULL,
    Email NVARCHAR(320) NULL,
    Policy NVARCHAR(MAX) NULL,
    AvatarImageUrl NVARCHAR(MAX) NULL,
    CoverImageUrl NVARCHAR(MAX) NULL,
    Description NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2(0) NOT NULL,
    UpdatedAt DATETIME2(0) NOT NULL,

    CONSTRAINT FK_SalonProfiles_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId) ON DELETE CASCADE
  );
END;
GO

/* Keep SalonProfiles aligned with FE fields (idempotent upgrades) */
IF COL_LENGTH('dbo.SalonProfiles', 'Name') IS NULL
  ALTER TABLE dbo.SalonProfiles ADD Name NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.SalonProfiles', 'AvatarImageUrl') IS NOT NULL
  ALTER TABLE dbo.SalonProfiles ALTER COLUMN AvatarImageUrl NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.SalonProfiles', 'CoverImageUrl') IS NOT NULL
  ALTER TABLE dbo.SalonProfiles ALTER COLUMN CoverImageUrl NVARCHAR(MAX) NULL;
GO

IF OBJECT_ID(N'dbo.SalonProfileHours', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonProfileHours (
    SalonId NVARCHAR(64) NOT NULL,
    DayOfWeek TINYINT NOT NULL, /* 1=Mon .. 7=Sun */
    OpenTime TIME(0) NULL,
    CloseTime TIME(0) NULL,
    Closed BIT NOT NULL,

    CONSTRAINT PK_SalonProfileHours PRIMARY KEY (SalonId, DayOfWeek),
    CONSTRAINT FK_SalonProfileHours_Profile FOREIGN KEY (SalonId) REFERENCES dbo.SalonProfiles(SalonId) ON DELETE CASCADE
  );
END;
GO

IF OBJECT_ID(N'dbo.SalonDailyDeals', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonDailyDeals (
    DealId NVARCHAR(64) NOT NULL CONSTRAINT PK_SalonDailyDeals PRIMARY KEY,
    SalonId NVARCHAR(64) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    /* FE supports either legacy 'text' or newer 'priceLabel' + 'notes' */
    Text NVARCHAR(500) NULL,
    PriceLabel NVARCHAR(100) NULL,
    Notes NVARCHAR(1000) NULL,
    Active BIT NOT NULL CONSTRAINT DF_SalonDailyDeals_Active DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonDailyDeals_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonDailyDeals_UpdatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_SalonDailyDeals_Profile FOREIGN KEY (SalonId) REFERENCES dbo.SalonProfiles(SalonId) ON DELETE CASCADE
  );

  CREATE INDEX IX_SalonDailyDeals_SalonId ON dbo.SalonDailyDeals(SalonId);
END;
GO

/* Keep SalonDailyDeals aligned with FE fields (idempotent upgrades) */
IF COL_LENGTH('dbo.SalonDailyDeals', 'Text') IS NOT NULL
  ALTER TABLE dbo.SalonDailyDeals ALTER COLUMN Text NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.SalonDailyDeals', 'PriceLabel') IS NULL
  ALTER TABLE dbo.SalonDailyDeals ADD PriceLabel NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.SalonDailyDeals', 'Notes') IS NULL
  ALTER TABLE dbo.SalonDailyDeals ADD Notes NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.SalonDailyDeals', 'CreatedAt') IS NULL
  ALTER TABLE dbo.SalonDailyDeals ADD CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonDailyDeals_CreatedAt2 DEFAULT (SYSUTCDATETIME());
IF COL_LENGTH('dbo.SalonDailyDeals', 'UpdatedAt') IS NULL
  ALTER TABLE dbo.SalonDailyDeals ADD UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonDailyDeals_UpdatedAt2 DEFAULT (SYSUTCDATETIME());
GO

IF OBJECT_ID(N'dbo.SalonGiftCards', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonGiftCards (
    GiftCardId NVARCHAR(64) NOT NULL CONSTRAINT PK_SalonGiftCards PRIMARY KEY,
    SalonId NVARCHAR(64) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    Active BIT NOT NULL,
    Description NVARCHAR(500) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonGiftCards_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonGiftCards_UpdatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_SalonGiftCards_Profile FOREIGN KEY (SalonId) REFERENCES dbo.SalonProfiles(SalonId) ON DELETE CASCADE
  );

  CREATE INDEX IX_SalonGiftCards_SalonId ON dbo.SalonGiftCards(SalonId);
END;
GO

/* Keep SalonGiftCards aligned with FE fields (idempotent upgrades) */
IF COL_LENGTH('dbo.SalonGiftCards', 'Description') IS NULL
  ALTER TABLE dbo.SalonGiftCards ADD Description NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.SalonGiftCards', 'CreatedAt') IS NULL
  ALTER TABLE dbo.SalonGiftCards ADD CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonGiftCards_CreatedAt2 DEFAULT (SYSUTCDATETIME());
IF COL_LENGTH('dbo.SalonGiftCards', 'UpdatedAt') IS NULL
  ALTER TABLE dbo.SalonGiftCards ADD UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonGiftCards_UpdatedAt2 DEFAULT (SYSUTCDATETIME());
GO

IF OBJECT_ID(N'dbo.SalonPhotos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonPhotos (
    PhotoId NVARCHAR(64) NOT NULL CONSTRAINT PK_SalonPhotos PRIMARY KEY,
    SalonId NVARCHAR(64) NOT NULL,
    /* FE stores photos as { id, src, caption } where src may be a data URL */
    Url NVARCHAR(500) NULL,
    Src NVARCHAR(MAX) NULL,
    Caption NVARCHAR(300) NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_SalonPhotos_SortOrder DEFAULT (0),
    Active BIT NOT NULL CONSTRAINT DF_SalonPhotos_Active DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonPhotos_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonPhotos_UpdatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_SalonPhotos_Profile FOREIGN KEY (SalonId) REFERENCES dbo.SalonProfiles(SalonId) ON DELETE CASCADE
  );

  CREATE INDEX IX_SalonPhotos_SalonId ON dbo.SalonPhotos(SalonId);
END;
GO

/* Keep SalonPhotos aligned with FE fields (idempotent upgrades) */
IF COL_LENGTH('dbo.SalonPhotos', 'Url') IS NOT NULL
  ALTER TABLE dbo.SalonPhotos ALTER COLUMN Url NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.SalonPhotos', 'Src') IS NULL
  ALTER TABLE dbo.SalonPhotos ADD Src NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.SalonPhotos', 'Caption') IS NULL
  ALTER TABLE dbo.SalonPhotos ADD Caption NVARCHAR(300) NULL;
IF COL_LENGTH('dbo.SalonPhotos', 'CreatedAt') IS NULL
  ALTER TABLE dbo.SalonPhotos ADD CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonPhotos_CreatedAt2 DEFAULT (SYSUTCDATETIME());
IF COL_LENGTH('dbo.SalonPhotos', 'UpdatedAt') IS NULL
  ALTER TABLE dbo.SalonPhotos ADD UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SalonPhotos_UpdatedAt2 DEFAULT (SYSUTCDATETIME());
GO

/* =========================
   Staff scheduling + time
   ========================= */

IF OBJECT_ID(N'dbo.StaffAvailability', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StaffAvailability (
    WeekStartDate DATE NOT NULL,
    StaffId NVARCHAR(64) NOT NULL,
    StartHour INT NOT NULL CONSTRAINT DF_StaffAvailability_StartHour DEFAULT (9),
    EndHour INT NOT NULL CONSTRAINT DF_StaffAvailability_EndHour DEFAULT (23),
    SlotsJson NVARCHAR(MAX) NOT NULL, /* JSON array of booleans, length = 7*(EndHour-StartHour) */
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StaffAvailability_UpdatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_StaffAvailability PRIMARY KEY (WeekStartDate, StaffId),
    CONSTRAINT FK_StaffAvailability_Staff FOREIGN KEY (StaffId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
  );
END;
GO

/* Keep StaffAvailability aligned with FE defaults (idempotent upgrades) */
IF OBJECT_ID(N'dbo.StaffAvailability', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'DF_StaffAvailability_StartHour', N'D') IS NULL
    ALTER TABLE dbo.StaffAvailability ADD CONSTRAINT DF_StaffAvailability_StartHour DEFAULT (9) FOR StartHour;
  IF OBJECT_ID(N'DF_StaffAvailability_EndHour', N'D') IS NULL
    ALTER TABLE dbo.StaffAvailability ADD CONSTRAINT DF_StaffAvailability_EndHour DEFAULT (23) FOR EndHour;
END;
GO

IF OBJECT_ID(N'dbo.StaffShifts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StaffShifts (
    ShiftId NVARCHAR(64) NOT NULL CONSTRAINT PK_StaffShifts PRIMARY KEY,
    WeekStartDate DATE NOT NULL,
    SalonId NVARCHAR(64) NOT NULL,

    StaffId NVARCHAR(64) NOT NULL,
    StaffName NVARCHAR(200) NULL,

    DayIndex INT NOT NULL, /* 0..6 */
    StartHour INT NOT NULL,
    DurationHours INT NOT NULL,
    Note NVARCHAR(200) NULL,
    CreatedAt DATETIME2(0) NOT NULL,

    CONSTRAINT FK_StaffShifts_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId) ON DELETE CASCADE,
    CONSTRAINT FK_StaffShifts_Staff FOREIGN KEY (StaffId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
  );

  CREATE INDEX IX_StaffShifts_Salon_Week ON dbo.StaffShifts(SalonId, WeekStartDate);
  CREATE INDEX IX_StaffShifts_Staff_Week ON dbo.StaffShifts(StaffId, WeekStartDate);
END;
GO

IF OBJECT_ID(N'dbo.TimeLogs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TimeLogs (
    TimeLogId NVARCHAR(64) NOT NULL CONSTRAINT PK_TimeLogs PRIMARY KEY,
    StaffId NVARCHAR(64) NOT NULL,
    Type NVARCHAR(8) NOT NULL, /* 'in' | 'out' */
    At DATETIME2(0) NOT NULL,
    Note NVARCHAR(200) NULL,

    CONSTRAINT FK_TimeLogs_Staff FOREIGN KEY (StaffId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
  );

  CREATE INDEX IX_TimeLogs_Staff_At ON dbo.TimeLogs(StaffId, At DESC);
END;
GO

/* Keep TimeLogs aligned with FE fields (idempotent upgrades) */
IF COL_LENGTH('dbo.TimeLogs', 'Note') IS NULL
  ALTER TABLE dbo.TimeLogs ADD Note NVARCHAR(200) NULL;
GO

IF OBJECT_ID(N'dbo.TipLogs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TipLogs (
    TipLogId NVARCHAR(64) NOT NULL CONSTRAINT PK_TipLogs PRIMARY KEY,
    StaffId NVARCHAR(64) NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    At DATETIME2(0) NOT NULL,

    CONSTRAINT FK_TipLogs_Staff FOREIGN KEY (StaffId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
  );

  CREATE INDEX IX_TipLogs_Staff_At ON dbo.TipLogs(StaffId, At DESC);
END;
GO

/* =========================
   Optional: reviews (present in src/data/mock.js seed data)
   ========================= */

IF OBJECT_ID(N'dbo.SalonReviews', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalonReviews (
    ReviewId NVARCHAR(64) NOT NULL CONSTRAINT PK_SalonReviews PRIMARY KEY,
    SalonId NVARCHAR(64) NOT NULL,
    UserName NVARCHAR(200) NOT NULL,
    Rating INT NOT NULL,
    Text NVARCHAR(1000) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL,
    Verified BIT NOT NULL,

    CONSTRAINT FK_SalonReviews_Salon FOREIGN KEY (SalonId) REFERENCES dbo.Salons(SalonId) ON DELETE CASCADE
  );

  CREATE INDEX IX_SalonReviews_SalonId_CreatedAt ON dbo.SalonReviews(SalonId, CreatedAt DESC);
END;
GO

IF OBJECT_ID(N'dbo.ProductReviews', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductReviews (
    ReviewId NVARCHAR(64) NOT NULL CONSTRAINT PK_ProductReviews PRIMARY KEY,
    ProductId NVARCHAR(128) NOT NULL,
    UserName NVARCHAR(200) NOT NULL,
    Rating INT NOT NULL,
    Text NVARCHAR(1000) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL,
    Verified BIT NOT NULL,

    CONSTRAINT FK_ProductReviews_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
  );

  CREATE INDEX IX_ProductReviews_ProductId_CreatedAt ON dbo.ProductReviews(ProductId, CreatedAt DESC);
END;
GO

/* =========================
   Carts
   ========================= */
IF OBJECT_ID(N'dbo.Carts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Carts (
    CartId NVARCHAR(64) NOT NULL CONSTRAINT PK_Carts PRIMARY KEY,

    UserId NVARCHAR(64) NULL,
    CustomerEmail NVARCHAR(320) NULL,

    Status NVARCHAR(32) NOT NULL CONSTRAINT DF_Carts_Status DEFAULT (N'active'),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Carts_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Carts_UpdatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_Carts_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
  );

  CREATE INDEX IX_Carts_UserId_Status ON dbo.Carts(UserId, Status);
  CREATE INDEX IX_Carts_CustomerEmail_Status ON dbo.Carts(CustomerEmail, Status);
END;
GO

IF OBJECT_ID(N'dbo.CartItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CartItems (
    CartItemId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CartItems PRIMARY KEY,
    CartId NVARCHAR(64) NOT NULL,
    ProductId NVARCHAR(128) NOT NULL,
    Qty DECIMAL(12,3) NOT NULL,
    AddedAt DATETIME2(0) NOT NULL CONSTRAINT DF_CartItems_AddedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT FK_CartItems_Cart FOREIGN KEY (CartId) REFERENCES dbo.Carts(CartId) ON DELETE CASCADE,
    CONSTRAINT FK_CartItems_Product FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId)
  );

  CREATE INDEX IX_CartItems_CartId ON dbo.CartItems(CartId);
  CREATE INDEX IX_CartItems_ProductId ON dbo.CartItems(ProductId);
END;
GO

/* The FE also persists current auth state in localStorage key: 'auth'.
   In a real backend this is usually handled via tokens/sessions.
   This table is optional, but included for completeness. */
IF OBJECT_ID(N'dbo.UserSessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserSessions (
    SessionId NVARCHAR(64) NOT NULL CONSTRAINT PK_UserSessions PRIMARY KEY,
    UserId NVARCHAR(64) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_UserSessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
    ExpiresAt DATETIME2(0) NULL,
    RevokedAt DATETIME2(0) NULL,
    ClientInfo NVARCHAR(400) NULL,

    CONSTRAINT FK_UserSessions_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
  );

  CREATE INDEX IX_UserSessions_UserId_CreatedAt ON dbo.UserSessions(UserId, CreatedAt DESC);
END;
GO

/* Optional seed/state storage (the FE uses localStorage key 'seeded') */
IF OBJECT_ID(N'dbo.AppKeyValue', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AppKeyValue (
    [Key] NVARCHAR(128) NOT NULL CONSTRAINT PK_AppKeyValue PRIMARY KEY,
    [Value] NVARCHAR(MAX) NULL,
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AppKeyValue_UpdatedAt DEFAULT (SYSUTCDATETIME())
  );
END;
GO
