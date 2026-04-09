const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = new sqlite3.Database('./booking.db', (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    // Create tables and insert data
    initializeDatabase();
  }
});

// Initialize database with schema and data
function initializeDatabase() {
  // Read SQL file
  const fs = require('fs');
  const sqlFile = path.join(__dirname, 'database-setup.sql');
  
  if (fs.existsSync(sqlFile)) {
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Split SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    // Execute each statement
    statements.forEach((statement, index) => {
      if (statement.trim()) {
        db.run(statement, (err) => {
          if (err && !err.message.includes('already exists')) {
            console.error(`❌ SQL Error at statement ${index}:`, err.message);
          }
        });
      }
    });
    
    console.log('📊 Database initialized with schema and data');
  }
}

// API Routes - Lấy data từ database thật
app.get('/api/owner/retail/staff', (req, res) => {
  console.log('📡 GET /api/owner/retail/staff - Querying database...');
  
  const query = `
    SELECT id, name, avatar, hours_this_week as hoursThisWeek 
    FROM staff 
    ORDER BY id
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Database query error:', err.message);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    
    console.log(`✅ Retrieved ${rows.length} staff records from database`);
    res.json(rows);
  });
});

app.get('/api/owner/retail/shifts', (req, res) => {
  console.log('📡 GET /api/owner/retail/shifts - Querying database...');
  
  const query = `
    SELECT id, staff_id as staffId, date, 
           start_time as start, end_time as end, type
    FROM shifts 
    ORDER BY staff_id, date
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Database query error:', err.message);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    
    console.log(`✅ Retrieved ${rows.length} shift records from database`);
    res.json(rows);
  });
});

// Attendance report mock endpoint (aggregates last 30 days)
app.get('/api/owner/attendance-report', (req, res) => {
  console.log('📡 GET /api/owner/attendance-report - Aggregating attendance from SQLite...');
  const query = `
    SELECT
      sh.staff_id AS StaffId,
      COALESCE(st.name, '') AS StaffName,
      COUNT(1) AS TotalShifts,
      SUM(CASE WHEN LOWER(COALESCE(sh.type,'')) = 'present' THEN 1 ELSE 0 END) AS Present,
      SUM(CASE WHEN LOWER(COALESCE(sh.type,'')) = 'late' THEN 1 ELSE 0 END) AS Late,
      SUM(CASE WHEN LOWER(COALESCE(sh.type,'')) IN ('absent','leave','off') THEN 1 ELSE 0 END) AS Absent,
      SUM(COALESCE((strftime('%s', sh.date || ' ' || sh.end_time) - strftime('%s', sh.date || ' ' || sh.start_time))/3600.0,0)) AS TotalHours
    FROM shifts sh
    LEFT JOIN staff st ON st.id = sh.staff_id
    WHERE date(sh.date) >= date('now','-29 day')
    GROUP BY sh.staff_id, st.name
    ORDER BY st.name
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Attendance aggregation error:', err.message);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    // Ensure numeric values are proper JS numbers
    const normalized = (rows || []).map(r => ({
      StaffId: r.StaffId,
      StaffName: r.StaffName,
      TotalShifts: Number(r.TotalShifts || 0),
      Present: Number(r.Present || 0),
      Late: Number(r.Late || 0),
      Absent: Number(r.Absent || 0),
      TotalHours: Math.round((Number(r.TotalHours || 0)) * 10) / 10
    }));
    res.json({ ok: true, data: normalized });
  });
});

app.post('/api/owner/retail/shifts', (req, res) => {
  console.log('📡 POST /api/owner/retail/shifts - Creating new shift in database...');
  
  const { staffId, date, start, end, type = 'normal' } = req.body;
  const shiftId = `shift-${Date.now()}`;
  
  const query = `
    INSERT INTO shifts (id, staff_id, date, start_time, end_time, type)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [shiftId, staffId, date, start, end, type], function(err) {
    if (err) {
      console.error('❌ Database insert error:', err.message);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    
    console.log('✅ Shift created in database with ID:', shiftId);
    
    // Return the created shift
    const selectQuery = `
      SELECT id, staff_id as staffId, date, 
             start_time as start, end_time as end, type
      FROM shifts WHERE id = ?
    `;
    
    db.get(selectQuery, [shiftId], (err, row) => {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      res.json(row);
    });
  });
});

app.put('/api/owner/retail/shifts/:id', (req, res) => {
  console.log(`📡 PUT /api/owner/retail/shifts/${req.params.id} - Updating shift in database...`);
  
  const { staffId, date, start, end, type = 'normal' } = req.body;
  
  const query = `
    UPDATE shifts 
    SET staff_id = ?, date = ?, start_time = ?, end_time = ?, type = ?
    WHERE id = ?
  `;
  
  db.run(query, [staffId, date, start, end, type, req.params.id], function(err) {
    if (err) {
      console.error('❌ Database update error:', err.message);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ ok: false, error: 'Shift not found' });
    }
    
    console.log('✅ Shift updated in database');
    
    // Return the updated shift
    const selectQuery = `
      SELECT id, staff_id as staffId, date, 
             start_time as start, end_time as end, type
      FROM shifts WHERE id = ?
    `;
    
    db.get(selectQuery, [req.params.id], (err, row) => {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      res.json(row);
    });
  });
});

app.delete('/api/owner/retail/shifts/:id', (req, res) => {
  console.log(`📡 DELETE /api/owner/retail/shifts/${req.params.id} - Deleting shift from database...`);
  
  const query = 'DELETE FROM shifts WHERE id = ?';
  
  db.run(query, [req.params.id], function(err) {
    if (err) {
      console.error('❌ Database delete error:', err.message);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ ok: false, error: 'Shift not found' });
    }
    
    console.log('✅ Shift deleted from database');
    res.json({ ok: true, message: 'Shift deleted successfully' });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  db.get('SELECT COUNT(*) as staff_count FROM staff', [], (err, row) => {
    if (err) {
      return res.json({ ok: false, error: 'Database error' });
    }
    res.json({ 
      ok: true, 
      message: 'Backend server with SQLite database is running',
      staff_count: row.staff_count
    });
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Booking System Backend API with SQLite Database',
    database: 'SQLite',
    endpoints: {
      'GET /api/owner/retail/staff': 'Get all staff from database',
      'GET /api/owner/retail/shifts': 'Get all shifts from database',
      'POST /api/owner/retail/shifts': 'Create new shift in database',
      'PUT /api/owner/retail/shifts/:id': 'Update shift in database',
      'DELETE /api/owner/retail/shifts/:id': 'Delete shift from database',
      'GET /api/health': 'Health check with database status'
    }
  });
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Backend server with SQLite database running at http://localhost:${port}`);
  console.log('📋 Available endpoints:');
  console.log('  GET  /api/owner/retail/staff (from SQLite database)');
  console.log('  GET  /api/owner/retail/shifts (from SQLite database)');
  console.log('  POST /api/owner/retail/shifts (to SQLite database)');
  console.log('  PUT  /api/owner/retail/shifts/:id (in SQLite database)');
  console.log('  DELETE /api/owner/retail/shifts/:id (from SQLite database)');
  console.log('  GET  /api/health (database status)');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Closing database connection...');
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed');
    }
    process.exit(0);
  });
});
