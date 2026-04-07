/* Create BookingReviews table if it doesn't exist
   Columns:
     BookingReviewId INT IDENTITY PRIMARY KEY
     BookingId INT NOT NULL
     Rating INT NULL
     Comment NVARCHAR(MAX) NULL
     CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()

   Run this script in the target database (use SSMS or sqlcmd).
*/

IF OBJECT_ID('dbo.BookingReviews', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BookingReviews (
        BookingReviewId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingId INT NOT NULL,
        Rating INT NULL,
        Comment NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    -- Optional: add foreign key if Bookings table exists
    IF OBJECT_ID('dbo.Bookings', 'U') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.BookingReviews
        ADD CONSTRAINT FK_BookingReviews_Bookings_BookingId
        FOREIGN KEY (BookingId) REFERENCES dbo.Bookings(BookingId);
    END
END
