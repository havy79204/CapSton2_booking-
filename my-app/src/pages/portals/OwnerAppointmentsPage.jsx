/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react'
import '../../styles/appointments.css'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import { api } from '../../lib/api.js'

export default function OwnerAppointmentsPage() {
  const [appointments, setAppointments] = useState([])
  const [staffMembers, setStaffMembers] = useState([])
  const [customers, setCustomers] = useState([])
  const [services, setServices] = useState([])

  const [open, setOpen] = useState(false)
  const [editingAppt, setEditingAppt] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [selectedServiceIds, setSelectedServiceIds] = useState([])

  // ================= UTILS =================
  const normalizeTime = (t) => {
    if (!t) return '09:00';
    const match = String(t).match(/(\d+):(\d+)\s*(AM|PM|CH|SA)?/i);
    if (!match) return String(t);
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const modifier = match[3];
    if (modifier) {
      if ((modifier.toUpperCase() === 'PM' || modifier.toUpperCase() === 'CH') && hours < 12) hours += 12;
      if ((modifier.toUpperCase() === 'AM' || modifier.toUpperCase() === 'SA') && hours === 12) hours = 0;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const calculateTopOffset = (timeStr) => {
    const normalized = normalizeTime(timeStr);
    const [hours, minutes] = normalized.split(':').map(Number);
    return ((hours * 60 + minutes) - (9 * 60)) * 64 / 30;
  };

  const getStatusColor = (status) => {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'completed' || s === 'done') return '#10b981';
    if (s === 'booked' || s === 'pending') return '#6366f1';
    return '#94a3b8';
  };

  const isSameDay = (d1, d2) => {
    // Handle null/undefined dates
    if (!d1 || !d2) return false;
    
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    
    // Check if dates are valid
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
    
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const toMinutes = (t) => {
    const [h, m] = normalizeTime(t).split(':').map(Number);
    return h * 60 + m;
  };

  const isOverlap = (newAppt, existingAppts) => {
    const newStart = toMinutes(newAppt.time);
    const newDuration = Number(newAppt.duration) || 30;
    const newEnd = newStart + newDuration;

    return existingAppts.some(a => {
      const start = toMinutes(a.time);
      const duration = Number(a.duration) || 30;
      const end = start + duration;
      return newStart < end && newEnd > start;
    });
  };

  function layoutAppointments(list) {
    const sorted = [...list].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    const columns = [];

    sorted.forEach(appt => {
      let placed = false;
      const apptStart = toMinutes(appt.time);
      const apptDuration = Number(appt.duration) || 30;

      for (let col of columns) {
        const last = col[col.length - 1];
        const lastDuration = Number(last.duration) || 30;
        const lastEnd = toMinutes(last.time) + lastDuration;

        if (apptStart >= lastEnd) {
          col.push(appt);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([appt]);
    });
    return columns;
  }

  // ================= FETCH DATA =================
  const fetchData = async () => {
    try {
      const [apptRes, staffRes, custRes, svcRes] = await Promise.all([
        api.get('/api/owner/appointments'),
        api.get('/api/owner/staff'),
        api.get('/api/owner/customers'),
        api.get('/api/owner/services'),
      ]);

      const apptData = Array.isArray(apptRes) ? apptRes : apptRes?.appointments || [];
      const staffData = Array.isArray(staffRes) ? staffRes : staffRes?.items || staffRes?.staff || [];
      const customerData = Array.isArray(custRes) ? custRes : custRes?.customers || [];

      let flatServices = [];
      if (Array.isArray(svcRes)) {
        svcRes.forEach(section => {
          if (section.items && Array.isArray(section.items)) {
            section.items.forEach(item => {
              flatServices.push({
                ...item,
                ServiceId: item.ServiceId || item.id,
                Name: item.Name || item.name,
                DurationMinutes: Number(item.DurationMinutes || item.durationMinutes || item.duration || 30)
              });
            });
          }
        });
      }

      const mapped = apptData.map(a => {
        const customer = customerData.find(c =>
          String(c.UserId || c.userId || c.id) === String(a.customerUserId || a.customerId)
        );

        const sIds = Array.isArray(a.serviceIds)
          ? a.serviceIds.map(String)
          : (a.serviceId ? [String(a.serviceId)] : []);

        const apptServices = flatServices.filter(s => sIds.includes(String(s.ServiceId)));

        const totalDuration = apptServices.reduce((sum, s) => sum + s.DurationMinutes, 0);

        const serviceNames = apptServices.map(s => s.Name).join(', ');

<<<<<<< HEAD
        let appointmentDate = null;
        
=======
        // Extract date from various sources
        let appointmentDate = null;
        
        // Priority 1: Use date field from backend (YYYY-MM-DD format)
>>>>>>> a89d0f139e8c500b3f7a803591062abf0fc133f1
        if (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
          try {
            appointmentDate = new Date(`${a.date}T00:00:00`);
            if (!isNaN(appointmentDate.getTime())) {
              // Successfully parsed
            } else {
              appointmentDate = null;
            }
          } catch (e) {
            // continue to next attempt
          }
        }
        
<<<<<<< HEAD
=======
        // Priority 2: Parse BookingTime (could be full datetime or time-only)
>>>>>>> a89d0f139e8c500b3f7a803591062abf0fc133f1
        if (!appointmentDate) {
          const bookingTimeValue = a.BookingTime || a.time || a.startTime;
          if (bookingTimeValue) {
            try {
<<<<<<< HEAD
              let dt = new Date(bookingTimeValue);
              if (isNaN(dt.getTime())) {
                const timeMatch = String(bookingTimeValue).match(/^(\d{1,2}):(\d{2})/);
                if (timeMatch) {
=======
              // Try to parse as full datetime first
              let dt = new Date(bookingTimeValue);
              
              // If that fails, check if it's just a time format (HH:MM)
              if (isNaN(dt.getTime())) {
                // Try parsing as time-only: if it looks like HH:MM, create date for today
                const timeMatch = String(bookingTimeValue).match(/^(\d{1,2}):(\d{2})/);
                if (timeMatch) {
                  // Use today's date with the given time
>>>>>>> a89d0f139e8c500b3f7a803591062abf0fc133f1
                  dt = new Date();
                  dt.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
                }
              }
              
              if (!isNaN(dt.getTime())) {
                appointmentDate = dt;
              }
            } catch (e) {
              console.warn(`Appointment ${a.BookingId}: error parsing BookingTime`, e.message);
            }
          }
        }

        return {
          ...a,
          id: a.BookingId || a.id || a.AppointmentId,
          customer: customer?.Name || customer?.name || 'Unknown Customer',
          service: serviceNames || 'No Service',
          duration: totalDuration || 30,
          date: appointmentDate,
          time: normalizeTime(a.time || a.BookingTime || a.startTime),
          status: (a.status || a.Status || 'pending').toLowerCase(),
          serviceIds: sIds
        };
      });

      setAppointments(mapped);
      setStaffMembers(staffData);
      setCustomers(customerData);
      setServices(flatServices);
      
<<<<<<< HEAD
=======
      // Debug logging
>>>>>>> a89d0f139e8c500b3f7a803591062abf0fc133f1
      console.log('Appointments loaded:', mapped.length, 'appointments');
      console.log('Staff loaded:', staffData.length, 'staff members');
      console.log('Customers loaded:', customerData.length, 'customers');
      console.log('Services loaded:', flatServices.length, 'services');
    } catch (err) {
      console.error('FETCH ERROR:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEditClick = (e, appt) => {
    e.stopPropagation();
    setEditingAppt(appt);
    const currentIds = Array.isArray(appt.serviceIds) ? appt.serviceIds.map(String) : [];
    setSelectedServiceIds(currentIds);
    setOpen(true);
  };

  const handleDeleteClick = async (e, appt) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc muốn xóa lịch hẹn này?")) return;
    try {
      const id = appt.id || appt.BookingId;
      await api.delete(`/api/owner/appointments/${id}`);
      await fetchData();
    } catch (err) {
      alert("Xóa thất bại!");
    }
  };

  const toggleService = (id) => {
    const sid = String(id);
    setSelectedServiceIds(prev => prev.includes(sid) ? prev.filter(i => i !== sid) : [...prev, sid]);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const totalDuration = services
      .filter(s => selectedServiceIds.includes(String(s.ServiceId)))
      .reduce((sum, s) => sum + s.DurationMinutes, 0);

    const staffId = formData.get('staffId');
    const date = formData.get('date');
    const time = formData.get('time');

    const sameStaffAppts = appointments.filter(a => {
      const apptDate = new Date(a.date || a.BookingTime);
      const selected = new Date(date);
      return String(a.staffId) === String(staffId) &&
             apptDate.toDateString() === selected.toDateString() &&
             String(a.id) !== String(editingAppt?.id);
    });

    if (isOverlap({ time, duration: totalDuration }, sameStaffAppts)) {
      alert("Nhân viên này đã có lịch trong khoảng thời gian này!");
      return;
    }

    const payload = {
      customerUserId: formData.get('customerUserId'),
      serviceIds: selectedServiceIds,
      staffId,
      date,
      time: normalizeTime(time),
      notes: formData.get('notes') || "",
      duration: totalDuration,
      status: formData.get('status')
    };

    try {
      const targetId = editingAppt?.id || editingAppt?.AppointmentId || editingAppt?.BookingId;
      if (editingAppt) {
        await api.put(`/api/owner/appointments/${targetId}`, payload);
      } else {
        await api.post('/api/owner/appointments', payload);
      }
      setOpen(false);
      setEditingAppt(null);
      setSelectedServiceIds([]);
      await fetchData();
    } catch (err) {
      alert("Lỗi: " + (err.response?.data?.error || "Không thể lưu"));
    }
  }

  const filteredAppointments = useMemo(() => 
    appointments.filter(appt => isSameDay(appt.date || appt.startTime || appt.BookingTime, selectedDate)),
    [appointments, selectedDate]
  );

  const visibleStaff = useMemo(() => {
    if (selectedStaff === 'all') return staffMembers;
    return staffMembers.filter(s => String(s.id || s.UserId) === String(selectedStaff));
  }, [staffMembers, selectedStaff]);

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <div className="calendar-title">
          <button className="nav-month-btn" onClick={() => { const d = new Date(selectedDate); d.setMonth(d.getMonth() - 1); setSelectedDate(d); }}>{"<"}</button>
          <span style={{ margin: '0 15px', minWidth: '180px', textAlign: 'center', fontSize: '1.1rem', fontWeight: '600' }}>
            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button className="nav-month-btn" onClick={() => { const d = new Date(selectedDate); d.setMonth(d.getMonth() + 1); setSelectedDate(d); }}>{">"}</button>
        </div>

        <div className="calendar-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select className="staff-filter-select" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
            <option value="all">All</option>
            {staffMembers.map(s => (
              <option key={s.id || s.UserId} value={s.id || s.UserId}>
                {s.name || s.Name}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={() => { setEditingAppt(null); setSelectedServiceIds([]); setOpen(true); }}>
            + New Appointment
          </button>
        </div>
      </div>

      <div className="date-strip">
        {useMemo(() => {
          const year = selectedDate.getFullYear();
          const month = selectedDate.getMonth();
          const date = new Date(year, month, 1);
          const days = [];
          while (date.getMonth() === month) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
          }
          return days;
        }, [selectedDate.getMonth(), selectedDate.getFullYear()]).map((d, i) => (
          <div
            key={i}
            className={`date-item ${d.toDateString() === selectedDate.toDateString() ? 'active' : ''}`}
            onClick={() => setSelectedDate(d)}
          >
            <span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <strong>{d.getDate()}</strong>
          </div>
        ))}
      </div>

      <div className="calendar-container">
        <div className="time-column" style={{ marginTop: '40px' }}>
          {Array.from({ length: 25 }, (_, i) => {
            const h = 9 + Math.floor(i / 2);
            const m = i % 2 === 0 ? '00' : '30';
            return h <= 21 ? <div key={i} className="time-cell">{`${String(h).padStart(2, '0')}:${m}`}</div> : null;
          })}
        </div>

        <div className="staff-columns">
          {visibleStaff.map(staff => {
            const staffAppts = filteredAppointments.filter(a => String(a.staffId) === String(staff.id || staff.UserId));
            const columns = layoutAppointments(staffAppts);

            return (
              <div key={staff.id || staff.UserId} className="staff-column">
                <div className="staff-header">{staff.name || staff.Name}</div>
                <div className="staff-body" style={{ position: 'relative', height: '832px', backgroundColor: '#fff', marginTop: '40px' }}>
                  {Array.from({ length: 25 }, (_, i) => (
                    <div key={i} className="grid-cell" style={{ height: '64px', borderBottom: '1px solid #f0f0f0' }} />
                  ))}

                  {columns.map((col, colIndex) => col.map(appt => {
                    const dur = Number(appt.duration) || 30;
                    return (
                      <div
                        key={appt.id}
                        className="appt-card"
                        style={{
                          position: 'absolute',
                          top: calculateTopOffset(appt.time),
                          left: `${(colIndex * 100) / (columns.length || 1)}%`,
                          width: `${100 / (columns.length || 1)}%`,
                          height: (dur / 30) * 64,
                          background: getStatusColor(appt.status),
                          zIndex: 5,
                          padding: '4px 8px',
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ lineHeight: '1.2' }}>
                            <strong style={{ fontSize: '10.5px' }}>{appt.service} ({dur}m)</strong>
                            <span style={{ fontSize: '9px', display: 'block', fontWeight: 'bold', textTransform: 'capitalize' }}>• {appt.status}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button className="edit-mini-btn" onClick={(e) => handleEditClick(e, appt)}>✎</button>
                            <button className="delete-mini-btn" onClick={(e) => handleDeleteClick(e, appt)}>🗑</button>
                          </div>
                        </div>
                        <p style={{ fontSize: '11px', margin: '2px 0 0 0' }}>{appt.customer}</p>
                      </div>
                    );
                  }))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PortalModal open={open} onClose={() => {setOpen(false); setEditingAppt(null);}} title={editingAppt ? "Edit Appointment" : "Add New Appointment"}>
        <form className="appt-form" onSubmit={handleSubmit} style={{ maxHeight: '85vh', overflowY: 'auto', paddingRight: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Customer</label>
              <select name="customerUserId" required defaultValue={editingAppt?.customerUserId || ""}>
                <option value="">Select customer</option>
                {customers.map(c => <option key={c.UserId || c.id} value={c.UserId || c.id}>{c.Name || c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Staff</label>
              <select name="staffId" required defaultValue={editingAppt?.staffId || ""}>
                {staffMembers.map(s => <option key={s.id || s.UserId} value={s.id || s.UserId}>{s.name || s.Name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Services ({selectedServiceIds.length})</span>
              <span style={{ color: '#6366f1' }}>
                Total: {services.filter(s => selectedServiceIds.includes(String(s.ServiceId)))
                                .reduce((sum, s) => sum + s.DurationMinutes, 0)} min
              </span>
            </label>

            <div className="service-chip-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '140px', overflowY: 'auto' }}>
              {services.map(s => {
                const id = String(s.ServiceId);
                const active = selectedServiceIds.includes(id);
                return (
                  <div key={id} onClick={() => toggleService(id)} className={`service-chip ${active ? 'active' : ''}`}
                    style={{
                      padding: '6px 12px', borderRadius: '20px', fontSize: '12.5px', cursor: 'pointer',
                      border: `1px solid ${active ? '#6366f1' : '#cbd5e1'}`, backgroundColor: active ? '#6366f1' : '#fff',
                      color: active ? '#fff' : '#475569'
                    }}>
                    {active ? '✓ ' : ''}{s.Name} <small>({s.DurationMinutes}m)</small>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" name="date" required defaultValue={editingAppt?.date ? new Date(editingAppt.date).toISOString().split('T')[0] : selectedDate.toISOString().split('T')[0]} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Time</label>
              <input type="time" name="time" required defaultValue={editingAppt?.time || ""} />
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select name="status" defaultValue={editingAppt?.status || "pending"}>
              <option value="pending">Pending</option>
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea name="notes" rows="3" defaultValue={editingAppt?.notes || ""}></textarea>
          </div>

          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn primary">{editingAppt ? "Save Changes" : "Create Appointment"}</button>
          </div>
        </form>
      </PortalModal>
    </div>
  );
}