const express = require('express');
const cors = require('cors');
const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Mock Database (trong thực tế sẽ dùng MongoDB/PostgreSQL)
let staffData = [
  { id: 1, name: 'Nguyễn Văn An', avatar: 'https://i.pravatar.cc/48?u=an', hoursThisWeek: 40 },
  { id: 2, name: 'Trần Thị Bình', avatar: 'https://i.pravatar.cc/48?u=binh', hoursThisWeek: 40 },
  { id: 3, name: 'Lê Văn Cường', avatar: 'https://i.pravatar.cc/48?u=cuong', hoursThisWeek: 40 },
  { id: 4, name: 'Phạm Thị Dung', avatar: 'https://i.pravatar.cc/48?u=dung', hoursThisWeek: 40 },
  { id: 5, name: 'Hoàng Văn Em', avatar: 'https://i.pravatar.cc/48?u=em', hoursThisWeek: 18 },
  { id: 6, name: 'Đỗ Thị Mai', avatar: 'https://i.pravatar.cc/48?u=mai', hoursThisWeek: 32 },
];

let shiftsData = [
  // Nguyễn Văn An - tất cả các ngày 9:00-17:00
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `shift-an-${i}`,
    staffId: 1,
    date: `2021-04-0${i + 5}`,
    start: '09:00',
    end: '17:00',
    type: 'normal'
  })),
  // Trần Thị Bình - tất cả các ngày 9:00-17:00
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `shift-binh-${i}`,
    staffId: 2,
    date: `2021-04-0${i + 5}`,
    start: '09:00',
    end: '17:00',
    type: 'normal'
  })),
  // Lê Văn Cường - Moving thứ 2
  {
    id: 'shift-cuong-mon',
    staffId: 3,
    date: '2021-04-05',
    start: '',
    end: '',
    type: 'moving'
  },
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `shift-cuong-${i}`,
    staffId: 3,
    date: `2021-04-0${i + 6}`,
    start: '09:00',
    end: '17:00',
    type: 'normal'
  })),
  // Phạm Thị Dung - tất cả các ngày 9:00-17:00
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `shift-dung-${i}`,
    staffId: 4,
    date: `2021-04-0${i + 5}`,
    start: '09:00',
    end: '17:00',
    type: 'normal'
  })),
  // Hoàng Văn Em
  {
    id: 'shift-em-mon',
    staffId: 5,
    date: '2021-04-05',
    start: '08:00',
    end: '14:00',
    type: 'normal'
  },
  {
    id: 'shift-em-tue',
    staffId: 5,
    date: '2021-04-06',
    start: '08:00',
    end: '14:00',
    type: 'normal'
  },
  {
    id: 'shift-em-wed',
    staffId: 5,
    date: '2021-04-07',
    start: '08:00',
    end: '14:00',
    type: 'normal'
  },
  {
    id: 'shift-em-thu',
    staffId: 5,
    date: '2021-04-08',
    start: '',
    end: '',
    type: 'vacation'
  },
  {
    id: 'shift-em-fri',
    staffId: 5,
    date: '2021-04-09',
    start: '',
    end: '',
    type: 'vacation'
  },
  // Đỗ Thị Mai
  {
    id: 'shift-mai-tue',
    staffId: 6,
    date: '2021-04-06',
    start: '',
    end: '',
    type: 'medical'
  },
  ...[0, 2, 3, 4].map(i => ({
    id: `shift-mai-${i}`,
    staffId: 6,
    date: `2021-04-0${i === 0 ? 5 : i + 5}`,
    start: '09:00',
    end: '17:00',
    type: 'normal'
  })),
];

// API Routes
app.get('/api/owner/retail/staff', (req, res) => {
  console.log('📡 GET /api/owner/retail/staff - Returning staff data');
  res.json(staffData);
});

app.get('/api/owner/retail/shifts', (req, res) => {
  console.log('📡 GET /api/owner/retail/shifts - Returning shifts data');
  res.json(shiftsData);
});

app.post('/api/owner/retail/shifts', (req, res) => {
  console.log('📡 POST /api/owner/retail/shifts - Creating new shift');
  const { staffId, date, start, end, type = 'normal' } = req.body;
  
  const newShift = {
    id: `shift-${Date.now()}`,
    staffId: parseInt(staffId),
    date,
    start,
    end,
    type
  };
  
  shiftsData.push(newShift);
  console.log('✅ Shift created:', newShift);
  res.json(newShift);
});

app.put('/api/owner/retail/shifts/:id', (req, res) => {
  console.log(`📡 PUT /api/owner/retail/shifts/${req.params.id} - Updating shift`);
  const { staffId, date, start, end, type = 'normal' } = req.body;
  
  const shiftIndex = shiftsData.findIndex(shift => shift.id === req.params.id);
  
  if (shiftIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Shift not found' });
  }
  
  shiftsData[shiftIndex] = {
    ...shiftsData[shiftIndex],
    staffId: parseInt(staffId),
    date,
    start,
    end,
    type
  };
  
  console.log('✅ Shift updated:', shiftsData[shiftIndex]);
  res.json(shiftsData[shiftIndex]);
});

app.delete('/api/owner/retail/shifts/:id', (req, res) => {
  console.log(`📡 DELETE /api/owner/retail/shifts/${req.params.id} - Deleting shift`);
  
  const shiftIndex = shiftsData.findIndex(shift => shift.id === req.params.id);
  
  if (shiftIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Shift not found' });
  }
  
  const deletedShift = shiftsData.splice(shiftIndex, 1)[0];
  console.log('✅ Shift deleted:', deletedShift);
  res.json({ ok: true, message: 'Shift deleted successfully' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Backend server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Booking System Backend API',
    endpoints: {
      'GET /api/owner/retail/staff': 'Get all staff',
      'GET /api/owner/retail/shifts': 'Get all shifts',
      'POST /api/owner/retail/shifts': 'Create new shift',
      'PUT /api/owner/retail/shifts/:id': 'Update shift',
      'DELETE /api/owner/retail/shifts/:id': 'Delete shift',
      'GET /api/health': 'Health check'
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

app.listen(port, () => {
  console.log(`🚀 Backend server running at http://localhost:${port}`);
  console.log('📋 Available endpoints:');
  console.log('  GET  /api/owner/retail/staff');
  console.log('  GET  /api/owner/retail/shifts');
  console.log('  POST /api/owner/retail/shifts');
  console.log('  PUT  /api/owner/retail/shifts/:id');
  console.log('  DELETE /api/owner/retail/shifts/:id');
  console.log('  GET  /api/health');
});
