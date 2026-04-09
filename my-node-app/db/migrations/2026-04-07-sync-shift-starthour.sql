/*
 Migration: Sync Shift and ShiftVN columns from StartHour
 Run this on your SQL Server database after taking a backup.

 Example run with sqlcmd:
 sqlcmd -S <server> -d <database> -U <user> -P <password> -i "my-node-app\db\migrations\2026-04-07-sync-shift-starthour.sql"

 This updates existing rows so UI and DB are consistent.
*/

SET NOCOUNT ON;
BEGIN TRANSACTION;

-- Update Shift (English) and ShiftVN (Vietnamese) based on StartHour
-- Handles StartHour values stored as time or strings like '08:00:00.0000000'
UPDATE StaffOffSchedules
SET
    Shift = CASE
        WHEN TRY_CONVERT(time, StartHour) < '12:00:00' THEN 'Morning'
        WHEN TRY_CONVERT(time, StartHour) < '16:00:00' THEN 'Afternoon'
        ELSE 'Evening'
    END,
    ShiftVN = CASE
        WHEN TRY_CONVERT(time, StartHour) < '12:00:00' THEN N'Ca Sáng'
        WHEN TRY_CONVERT(time, StartHour) < '16:00:00' THEN N'Ca Chiều'
        ELSE N'Ca Tối'
    END
WHERE StartHour IS NOT NULL AND LTRIM(RTRIM(CONVERT(varchar(50), StartHour))) <> '';

COMMIT TRANSACTION;

PRINT 'Shift and ShiftVN synchronization complete.';
