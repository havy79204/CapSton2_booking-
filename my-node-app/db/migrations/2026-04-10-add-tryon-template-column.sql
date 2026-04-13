-- Migration: add TemplateImageUrl to TryOnRecords
IF OBJECT_ID('dbo.TryOnRecords', 'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.TryOnRecords', 'TemplateImageUrl') IS NULL
    BEGIN
        ALTER TABLE dbo.TryOnRecords ADD TemplateImageUrl NVARCHAR(400) NULL;
    END
END
