-- Database Schema for Booking System
-- Tạo database và tables thật

-- Staff table
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    avatar VARCHAR(500),
    hours_this_week INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shifts table  
CREATE TABLE IF NOT EXISTS shifts (
    id VARCHAR(50) PRIMARY KEY,
    staff_id INTEGER NOT NULL,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    type VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

-- Insert sample data (trong thực tế sẽ có admin panel để nhập)
INSERT OR REPLACE INTO staff (id, name, avatar, hours_this_week) VALUES
(1, 'Nguyễn Văn An', 'https://i.pravatar.cc/48?u=an', 40),
(2, 'Trần Thị Bình', 'https://i.pravatar.cc/48?u=binh', 40),
(3, 'Lê Văn Cường', 'https://i.pravatar.cc/48?u=cuong', 40),
(4, 'Phạm Thị Dung', 'https://i.pravatar.cc/48?u=dung', 40),
(5, 'Hoàng Văn Em', 'https://i.pravatar.cc/48?u=em', 18),
(6, 'Đỗ Thị Mai', 'https://i.pravatar.cc/48?u=mai', 32);

-- Insert sample shifts
INSERT OR REPLACE INTO shifts (id, staff_id, date, start_time, end_time, type) VALUES
-- Nguyễn Văn An - Full week
('shift-an-0', 1, '2021-04-05', '09:00', '17:00', 'normal'),
('shift-an-1', 1, '2021-04-06', '09:00', '17:00', 'normal'),
('shift-an-2', 1, '2021-04-07', '09:00', '17:00', 'normal'),
('shift-an-3', 1, '2021-04-08', '09:00', '17:00', 'normal'),
('shift-an-4', 1, '2021-04-09', '09:00', '17:00', 'normal'),

-- Trần Thị Bình - Full week
('shift-binh-0', 2, '2021-04-05', '09:00', '17:00', 'normal'),
('shift-binh-1', 2, '2021-04-06', '09:00', '17:00', 'normal'),
('shift-binh-2', 2, '2021-04-07', '09:00', '17:00', 'normal'),
('shift-binh-3', 2, '2021-04-08', '09:00', '17:00', 'normal'),
('shift-binh-4', 2, '2021-04-09', '09:00', '17:00', 'normal'),

-- Lê Văn Cường - Moving Monday
('shift-cuong-mon', 3, '2021-04-05', NULL, NULL, 'moving'),
('shift-cuong-0', 3, '2021-04-06', '09:00', '17:00', 'normal'),
('shift-cuong-1', 3, '2021-04-07', '09:00', '17:00', 'normal'),
('shift-cuong-2', 3, '2021-04-08', '09:00', '17:00', 'normal'),
('shift-cuong-3', 3, '2021-04-09', '09:00', '17:00', 'normal'),

-- Phạm Thị Dung - Full week
('shift-dung-0', 4, '2021-04-05', '09:00', '17:00', 'normal'),
('shift-dung-1', 4, '2021-04-06', '09:00', '17:00', 'normal'),
('shift-dung-2', 4, '2021-04-07', '09:00', '17:00', 'normal'),
('shift-dung-3', 4, '2021-04-08', '09:00', '17:00', 'normal'),
('shift-dung-4', 4, '2021-04-09', '09:00', '17:00', 'normal'),

-- Hoàng Văn Em - Part time + vacation
('shift-em-mon', 5, '2021-04-05', '08:00', '14:00', 'normal'),
('shift-em-tue', 5, '2021-04-06', '08:00', '14:00', 'normal'),
('shift-em-wed', 5, '2021-04-07', '08:00', '14:00', 'normal'),
('shift-em-thu', 5, '2021-04-08', NULL, NULL, 'vacation'),
('shift-em-fri', 5, '2021-04-09', NULL, NULL, 'vacation'),

-- Đỗ Thị Mai - Medical Tuesday
('shift-mai-tue', 6, '2021-04-06', NULL, NULL, 'medical'),
('shift-mai-0', 6, '2021-04-05', '09:00', '17:00', 'normal'),
('shift-mai-2', 6, '2021-04-07', '09:00', '17:00', 'normal'),
('shift-mai-3', 6, '2021-04-08', '09:00', '17:00', 'normal'),
('shift-mai-4', 6, '2021-04-09', '09:00', '17:00', 'normal');
