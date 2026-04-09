-- Create StaffSkills table for service-staff assignment
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='StaffSkills' AND xtype='U')
BEGIN
    CREATE TABLE StaffSkills (
        StaffSkillId NVARCHAR(50) PRIMARY KEY,
        StaffId NVARCHAR(50) NOT NULL,
        ServiceId NVARCHAR(50) NULL,
        CategoryId NVARCHAR(50) NULL,
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME DEFAULT GETDATE(),
        
        CONSTRAINT FK_StaffSkills_Staff FOREIGN KEY (StaffId) REFERENCES Staff(StaffId),
        CONSTRAINT FK_StaffSkills_Service FOREIGN KEY (ServiceId) REFERENCES Services(ServiceId),
        CONSTRAINT FK_StaffSkills_Category FOREIGN KEY (CategoryId) REFERENCES ServiceCategories(CategoryId)
    )
    
    -- Create indexes
    CREATE INDEX IX_StaffSkills_StaffId ON StaffSkills(StaffId)
    CREATE INDEX IX_StaffSkills_ServiceId ON StaffSkills(ServiceId)
    CREATE INDEX IX_StaffSkills_CategoryId ON StaffSkills(CategoryId)
    
    PRINT 'StaffSkills table created successfully'
END
ELSE
BEGIN
    PRINT 'StaffSkills table already exists'
END

-- Check if ServiceId column exists, if not add it
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'StaffSkills' AND COLUMN_NAME = 'ServiceId'
)
BEGIN
    ALTER TABLE StaffSkills ADD ServiceId NVARCHAR(50) NULL
    PRINT 'ServiceId column added to StaffSkills'
END

-- Check if CategoryId column exists, if not add it
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'StaffSkills' AND COLUMN_NAME = 'CategoryId'
)
BEGIN
    ALTER TABLE StaffSkills ADD CategoryId NVARCHAR(50) NULL
    PRINT 'CategoryId column added to StaffSkills'
END

-- Sample data insertion (optional)
IF NOT EXISTS (SELECT 1 FROM StaffSkills)
BEGIN
    -- Add sample staff skills based on existing staff and services
    INSERT INTO StaffSkills (StaffSkillId, StaffId, ServiceId, CategoryId)
    SELECT 
        'SK-' + REPLACE(NEWID(), '-', ''),
        s.StaffId,
        sv.ServiceId,
        sv.CategoryId
    FROM Staff s
    CROSS JOIN Services sv
    WHERE s.Status != 'inactive' 
    AND sv.Status = 'ACTIVE'
    AND sv.CategoryId IS NOT NULL
    TOP 10 -- Limit to 10 sample records
    
    PRINT 'Sample staff skills data inserted'
END
