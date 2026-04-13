-- Migration: create TryOnRecords table
IF OBJECT_ID('dbo.TryOnRecords', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TryOnRecords (
        TryOnId NVARCHAR(64) NOT NULL PRIMARY KEY,
        UserId NVARCHAR(64) NULL,
        SourceImageUrl NVARCHAR(400) NULL,
        ResultImageUrl NVARCHAR(400) NULL,
        DesignId NVARCHAR(64) NULL,
        Params NVARCHAR(MAX) NULL,
        CreatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
