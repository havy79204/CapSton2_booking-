/* AI Chatbox schema for NIOM&CE
   Run on your SQL Server database used by the app */

-- 1. ChatSessions
CREATE TABLE ChatSessions (
    SessionId INT IDENTITY(1,1) PRIMARY KEY,
    UserId NVARCHAR(50) NULL,
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- 2. AIChatMessages
CREATE TABLE AIChatMessages (
    MessageId INT IDENTITY(1,1) PRIMARY KEY,
    SessionId INT NOT NULL,
    Sender NVARCHAR(10),
    Content NVARCHAR(MAX),
    MessageType NVARCHAR(20),
    CreatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_AIChatMessages_Session FOREIGN KEY (SessionId) REFERENCES ChatSessions(SessionId) ON DELETE CASCADE
);

-- 3. AIChatImages
CREATE TABLE AIChatImages (
    ImageId INT IDENTITY(1,1) PRIMARY KEY,
    MessageId INT NOT NULL,
    ImageUrl NVARCHAR(500),
    CreatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_AIChatImages_Message FOREIGN KEY (MessageId) REFERENCES AIChatMessages(MessageId) ON DELETE CASCADE
);

-- 4. AIResults
CREATE TABLE AIResults (
    ResultId INT IDENTITY(1,1) PRIMARY KEY,
    MessageId INT NOT NULL,
    NailStyle NVARCHAR(255),
    ColorTone NVARCHAR(255),
    NailCondition NVARCHAR(255),
    Description NVARCHAR(MAX),
    CreatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_AIResults_Message FOREIGN KEY (MessageId) REFERENCES AIChatMessages(MessageId) ON DELETE CASCADE
);

-- 5. AISuggestions
CREATE TABLE AISuggestions (
    SuggestionId INT IDENTITY(1,1) PRIMARY KEY,
    ResultId INT NOT NULL,
    Type NVARCHAR(20),
    RefId INT NULL,
    Name NVARCHAR(255),
    Description NVARCHAR(MAX),
    Score FLOAT,
    CreatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_AISuggestions_Result FOREIGN KEY (ResultId) REFERENCES AIResults(ResultId) ON DELETE CASCADE
);

CREATE INDEX IX_ChatSessions_UserId ON ChatSessions(UserId);
CREATE INDEX IX_AIChatMessages_SessionId ON AIChatMessages(SessionId);
CREATE INDEX IX_AIResults_MessageId ON AIResults(MessageId);
CREATE INDEX IX_AISuggestions_ResultId ON AISuggestions(ResultId);
