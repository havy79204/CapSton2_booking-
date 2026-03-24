USE [NIOM&CE];
GO

SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRAN;

    DECLARE @StaffRoleKey NVARCHAR(50) = (
        SELECT TOP 1 RoleKey
        FROM dbo.Roles
        WHERE LOWER(RoleKey) = N'staff' OR LOWER(DisplayName) = N'staff' OR RoleKey = N'2'
        ORDER BY CASE WHEN LOWER(RoleKey) = N'staff' THEN 0 WHEN RoleKey = N'2' THEN 1 ELSE 2 END
    );

    IF @StaffRoleKey IS NULL
        THROW 50001, N'Không tìm thấy role staff trong bảng dbo.Roles.', 1;

    DECLARE @CategoryA NVARCHAR(50) = (
        SELECT TOP 1 CategoryId
        FROM dbo.ServiceCategories
        ORDER BY CategoryId ASC
    );

    DECLARE @CategoryB NVARCHAR(50) = (
        SELECT TOP 1 CategoryId
        FROM dbo.ServiceCategories
        ORDER BY CategoryId DESC
    );

    IF @CategoryA IS NULL
        THROW 50002, N'Không có dữ liệu trong dbo.ServiceCategories để map StaffSkills.', 1;

    DECLARE @WeekStartDate DATE = '2026-03-23';
    DECLARE @Now DATETIME2(7) = SYSDATETIME();
    DECLARE @PasswordHash NVARCHAR(255) = N'$2a$10$Acj1c3dPCtwi34Qkv5Btv.sLj.Gs2HCCHHEzMqDZGs1mq7Vg63I/2';

    DECLARE @i INT = 1;
    WHILE @i <= 30
    BEGIN
        DECLARE @No NVARCHAR(3) = RIGHT(N'000' + CAST(@i AS NVARCHAR(3)), 3);
        DECLARE @UserId NVARCHAR(50) = N'U_STAFF_SEED_' + @No;
        DECLARE @StaffId NVARCHAR(50) = N'STAFF_SEED_' + @No;
        DECLARE @ShiftId NVARCHAR(50) = N'SHIFT_SEED_' + @No;
        DECLARE @ClockInId NVARCHAR(50) = N'TL_IN_SEED_' + @No;
        DECLARE @TipLogId NVARCHAR(50) = N'TIP_SEED_' + @No;

        DECLARE @StaffName NVARCHAR(150) = N'Nhân viên seed ' + CAST(@i AS NVARCHAR(10));
        DECLARE @Email NVARCHAR(150) = N'staff.seed' + CAST(@i AS NVARCHAR(10)) + N'@demo.local';
        DECLARE @Phone NVARCHAR(20) = N'09' + RIGHT(N'00000000' + CAST(100000 + @i AS NVARCHAR(8)), 8);

        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId)
        BEGIN
            INSERT INTO dbo.Users
            (
                UserId,
                Name,
                Email,
                Phone,
                PasswordHash,
                RoleKey,
                CreatedAt,
                Status,
                AvatarUrl
            )
            VALUES
            (
                @UserId,
                @StaffName,
                @Email,
                @Phone,
                @PasswordHash,
                @StaffRoleKey,
                @Now,
                N'ACTIVE',
                NULL
            );
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.Staff WHERE StaffId = @StaffId)
        BEGIN
            INSERT INTO dbo.Staff
            (
                StaffId,
                UserId,
                HireDate,
                Status
            )
            VALUES
            (
                @StaffId,
                @UserId,
                DATEADD(DAY, -@i, CAST(@Now AS DATE)),
                N'Working'
            );
        END;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.StaffAvailability
            WHERE WeekStartDate = @WeekStartDate
              AND StaffId = @StaffId
        )
        BEGIN
            INSERT INTO dbo.StaffAvailability
            (
                WeekStartDate,
                StaffId,
                StartHour,
                EndHour,
                UpdatedAt
            )
            VALUES
            (
                @WeekStartDate,
                @StaffId,
                9,
                18,
                @Now
            );
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.StaffShifts WHERE ShiftId = @ShiftId)
        BEGIN
            INSERT INTO dbo.StaffShifts
            (
                ShiftId,
                WeekStartDate,
                SalonId,
                StaffId,
                StaffName,
                DayIndex,
                StartHour,
                DurationHours,
                Note,
                CreatedAt
            )
            VALUES
            (
                @ShiftId,
                @WeekStartDate,
                N'default',
                @StaffId,
                @StaffName,
                (@i - 1) % 7,
                9 + ((@i - 1) % 2),
                8,
                N'Seed shift',
                @Now
            );
        END;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.StaffSkills
            WHERE StaffId = @StaffId
              AND CategoryId = @CategoryA
        )
        BEGIN
            INSERT INTO dbo.StaffSkills (StaffId, CategoryId)
            VALUES (@StaffId, @CategoryA);
        END;

        IF @CategoryB IS NOT NULL
           AND @CategoryB <> @CategoryA
           AND (@i % 2 = 0)
           AND NOT EXISTS
           (
               SELECT 1
               FROM dbo.StaffSkills
               WHERE StaffId = @StaffId
                 AND CategoryId = @CategoryB
           )
        BEGIN
            INSERT INTO dbo.StaffSkills (StaffId, CategoryId)
            VALUES (@StaffId, @CategoryB);
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.TimeLogs WHERE TimeLogId = @ClockInId)
        BEGIN
            INSERT INTO dbo.TimeLogs
            (
                TimeLogId,
                StaffId,
                Type,
                [At],
                Note
            )
            VALUES
            (
                @ClockInId,
                @StaffId,
                N'CLOCK_IN',
                DATEADD(MINUTE, @i, @Now),
                N'Seed time log'
            );
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.TipLogs WHERE TipLogId = @TipLogId)
        BEGIN
            INSERT INTO dbo.TipLogs
            (
                TipLogId,
                StaffId,
                Amount,
                [At]
            )
            VALUES
            (
                @TipLogId,
                @StaffId,
                CAST(20000 + (@i * 1000) AS DECIMAL(10, 2)),
                DATEADD(DAY, -(@i % 10), @Now)
            );
        END;

        SET @i += 1;
    END;

    COMMIT;

    SELECT
        AddedUsers = COUNT(1)
    FROM dbo.Users
    WHERE UserId LIKE N'U_STAFF_SEED_%';

    SELECT
        AddedStaff = COUNT(1)
    FROM dbo.Staff
    WHERE StaffId LIKE N'STAFF_SEED_%';

    SELECT
        AddedAvailability = COUNT(1)
    FROM dbo.StaffAvailability
    WHERE StaffId LIKE N'STAFF_SEED_%';

    SELECT
        AddedShifts = COUNT(1)
    FROM dbo.StaffShifts
    WHERE ShiftId LIKE N'SHIFT_SEED_%';

    SELECT
        AddedSkills = COUNT(1)
    FROM dbo.StaffSkills
    WHERE StaffId LIKE N'STAFF_SEED_%';

    SELECT
        AddedTimeLogs = COUNT(1)
    FROM dbo.TimeLogs
    WHERE TimeLogId LIKE N'TL_IN_SEED_%';

    SELECT
        AddedTipLogs = COUNT(1)
    FROM dbo.TipLogs
    WHERE TipLogId LIKE N'TIP_SEED_%';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrState INT = ERROR_STATE();

    RAISERROR(@ErrMsg, @ErrSeverity, @ErrState);
END CATCH;
GO