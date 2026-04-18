/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react'
import '../../../styles/appointments.css'
import PortalModal from '../../../components/Layout portal/PortalModal.jsx'
import { api } from '../../../lib/api.js'

export default function StaffAppointmentsPage() {
  const [appointments, setAppointments] = useState([])
  const [staffMembers, setStaffMembers] = useState([])
  const [services, setServices] = useState([])
  const [businessHours, setBusinessHours] = useState({ openingHour: 8, closingHour: 20 })

  const [open, setOpen] = useState(false)
  const [editingAppt, setEditingAppt] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [selectedServiceIds, setSelectedServiceIds] = useState([])
  const [viewMode, setViewMode] = useState('calendar')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState(null)

  const TIME_SLOT_MINUTES = 30
  const TIME_CELL_HEIGHT = 64
  const timelineStartMinutes = businessHours.openingHour * 60
  const timelineEndMinutes = businessHours.closingHour * 60
  const totalTimeSlots = Math.max(1, Math.floor((timelineEndMinutes - timelineStartMinutes) / TIME_SLOT_MINUTES) + 1)
  const timelineHeight = totalTimeSlots * TIME_CELL_HEIGHT

  const timeLabels = useMemo(() => {
    return Array.from({ length: totalTimeSlots }, (_, i) => {
      const totalMinutes = timelineStartMinutes + (i * TIME_SLOT_MINUTES)
      const h = Math.floor(totalMinutes / 60)
      const m = totalMinutes % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    })
  }, [timelineStartMinutes, totalTimeSlots])

  const parseHourFromSetting = (value, fallback) => {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return fallback
    const hour = Number(m[1])
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return fallback
    return hour
  }

  const normalizeTime = (t) => {
    if (!t) return `${String(businessHours.openingHour).padStart(2, '0')}:00`;
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

  const getStatusColor = (status) => {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'completed' || s === 'done') return '#10b981';
    if (s === 'booked') return 'rgb(99, 102, 241)';
     if (s === 'pending') return '#e8d064';
    return '#94a3b8';
  };

  const isSameDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    const date1 = new Date(d1);
    const date2 = new Date(d2);
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

  const fetchData = async () => {
    try {
      const [apptRes, staffRes, svcRes] = await Promise.all([
        api.get('/api/staff/appointments'),
        api.get('/api/staff/staff'),
        api.get('/api/staff/services'),
      ]);

      const apptData = Array.isArray(apptRes) ? apptRes : apptRes?.appointments || [];
      const staffData = Array.isArray(staffRes) ? staffRes : staffRes?.items || staffRes?.staff || [];

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
        const sIds = Array.isArray(a.serviceIds)
          ? a.serviceIds.map(String)
          : (a.serviceId ? [String(a.serviceId)] : []);

        const apptServices = flatServices.filter(s => sIds.includes(String(s.ServiceId)));
        const totalDuration = apptServices.reduce((sum, s) => sum + s.DurationMinutes, 0);
        const serviceNames = apptServices.map(s => s.Name).join(', ');

        let appointmentDate = null;
        if (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
          try {
            appointmentDate = new Date(`${a.date}T00:00:00`);
          } catch {
            // ignore malformed date strings from API
          }
        }
        
        if (!appointmentDate) {
          const bookingTimeValue = a.BookingTime || a.time || a.startTime;
          if (bookingTimeValue) {
            try {
              let dt = new Date(bookingTimeValue);
              if (!isNaN(dt.getTime())) {
                appointmentDate = dt;
              }
            } catch (e) { /* ignore */ }
          }
        }

        return {
          ...a,
          id: a.BookingId || a.id || a.AppointmentId,
          customerUserId: a.customerUserId || a.customerId,
          staffId: a.staffId || a.StaffId || a.staffID,
          customer: a.customerName || a.customer || 'Unknown Customer',
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
      setServices(flatServices);
    } catch (err) {
      console.error('FETCH ERROR:', err);
    }
  };

  useEffect(() => {
    fetchData();
    ;(async () => {
      try {
        const map = (await api.get('/api/staff/settings')) || {}
        const openingHour = parseHourFromSetting(map.ScheduleOpenTime || map.SalonOpenTime, 8)
        const closingHour = parseHourFromSetting(map.ScheduleCloseTime || map.SalonCloseTime, 20)
        const safeCloseHour = closingHour > openingHour ? closingHour : Math.min(openingHour + 1, 23)
        setBusinessHours({ openingHour, closingHour: safeCloseHour })
      } catch (err) {
        console.error(err)
      }
    })()
  }, []);

  const handleEditClick = (e, appt) => {
    e.preventDefault();
    e.stopPropagation();
    const rawStatus = String(appt?.status || '').trim().toLowerCase();
    const normalizedStatus = (rawStatus === 'delete' || rawStatus === 'deleted') ? 'cancelled' : (appt?.status || 'pending');
    setEditingAppt({ ...appt, status: normalizedStatus });
    const currentIds = Array.isArray(appt.serviceIds) ? appt.serviceIds.map(String) : [];
    setSelectedServiceIds(currentIds);
    setOpen(true);
  };

  const handleDeleteClick = async (e, appt) => {
    e.preventDefault();
    e.stopPropagation();
    setAppointmentToDelete(appt)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!appointmentToDelete) return
    try {
      const id = appointmentToDelete.id || appointmentToDelete.BookingId
      await api.put(`/api/staff/appointments/${id}`, { status: 'delete' });
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Appointment deleted successfully', title: 'Completed' } 
      }));
      await fetchData()
      setDeleteConfirmOpen(false)
      setAppointmentToDelete(null)
    } catch (err) {
      console.error('Failed to delete appointment:', err)
      alert('Failed to delete appointment!')
    }
  }

  const cancelDelete = () => {
    setDeleteConfirmOpen(false)
    setAppointmentToDelete(null)
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

    const isNewAppointment = !editingAppt;
    let hasScheduleChanged = false;
    if (editingAppt) {
      const staffChanged = String(editingAppt.staffId) !== String(staffId);
      let currentDateStr = '';
      if (editingAppt.date) {
        const d = new Date(editingAppt.date);
        currentDateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      const dateChanged = currentDateStr !== date;
      const currentTime = normalizeTime(editingAppt.time || '');
      const newTime = normalizeTime(time);
      const timeChanged = currentTime !== newTime;
      hasScheduleChanged = staffChanged || dateChanged || timeChanged;
    }

    if ((isNewAppointment || hasScheduleChanged) && isOverlap({ time, duration: totalDuration }, sameStaffAppts)) {
      alert("This staff member already has an appointment during this time!");
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
      status: (function() {
        const raw = formData.get('status');
        if (raw !== null && String(raw).trim() !== '') {
          const s = String(raw).trim();
          const lower = s.toLowerCase();
          if (lower === 'delete' || lower === 'deleted') return 'cancelled';
          return s;
        }
        return editingAppt?.status || 'pending';
      })()
    };

    try {
      const targetId = editingAppt?.id || editingAppt?.AppointmentId || editingAppt?.BookingId;
      if (editingAppt) {
        await api.put(`/api/staff/appointments/${targetId}`, payload);
        window.dispatchEvent(new CustomEvent('portal:success-modal', { 
          detail: { message: 'Appointment updated successfully', title: 'Completed' } 
        }));
      } else {
        await api.post('/api/staff/appointments', payload);
        window.dispatchEvent(new CustomEvent('portal:success-modal', { 
          detail: { message: 'Appointment created successfully', title: 'Completed' } 
        }));
      }
      setOpen(false);
      setEditingAppt(null);
      setSelectedServiceIds([]);
      await fetchData();
    } catch (err) {
      alert("Error: " + (err.response?.data?.error || "Unable to save"));
    }
  }

  const filteredAppointments = useMemo(() => 
    appointments
      .filter(appt => isSameDay(appt.date || appt.startTime || appt.BookingTime, selectedDate)),
    [appointments, selectedDate]
  );

  const listAppointments = useMemo(() => {
    if (viewMode === 'list') {
      return filteredAppointments.filter(a => selectedStaff === 'all' || String(a.staffId) === String(selectedStaff));
    }
    return filteredAppointments;
  }, [viewMode, filteredAppointments, selectedStaff]);

  const visibleStaff = useMemo(() => {
    if (selectedStaff === 'all') return staffMembers;
    return staffMembers.filter(s => String(s.id || s.UserId) === String(selectedStaff));
  }, [staffMembers, selectedStaff]);

  const monthDays = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [selectedDate]);

  const editDateDefault = (function() {
    const src = editingAppt;
    if (!src) return selectedDate.toISOString().split('T')[0];
    const tryVals = [src.date, src.BookingTime, src.startTime, src.BookingDate, src.bookingDate];
    for (const v of tryVals) {
      if (!v) continue;
      try {
        const d = new Date(v);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch {
        // ignore invalid date formats
      }
    }
    return selectedDate.toISOString().split('T')[0];
  })();

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <div className="calendar-title">
          <button className="nav-month-btn" onClick={() => { const d = new Date(selectedDate); d.setMonth(d.getMonth() - 1); setSelectedDate(d); }}>&lt;</button>
          <span style={{ margin: '0 15px', minWidth: '180px', textAlign: 'center', fontSize: '1.1rem', fontWeight: '600' }}>
            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button className="nav-month-btn" onClick={() => { const d = new Date(selectedDate); d.setMonth(d.getMonth() + 1); setSelectedDate(d); }}>&gt;</button>
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
          <button className="btn secondary" onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}>
            {viewMode === 'calendar' ? 'List View' : 'Calendar View'}
          </button>
          <button className="btn primary" onClick={() => { setEditingAppt(null); setSelectedServiceIds([]); setOpen(true); }}>
            + New Appointment
          </button>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <div className="date-strip">
          {monthDays.map((d, i) => (
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
      )}

      {viewMode === 'calendar' ? (
        <div className="calendar-container">
          <div className="time-column" style={{ marginTop: '40px' }}>
            {timeLabels.map((label) => (
              <div key={label} className="time-cell">{label}</div>
            ))}
          </div>

          <div className="staff-columns">
            {visibleStaff.map(staff => {
              const staffAppts = filteredAppointments.filter(a => {
                if (String(a.staffId) !== String(staff.id || staff.UserId)) return false;
                const start = toMinutes(a.time);
                const duration = Number(a.duration) || 30;
                const end = start + duration;
                return end > timelineStartMinutes && start < timelineEndMinutes;
              });
              const columns = layoutAppointments(staffAppts);

              return (
                <div key={staff.id || staff.UserId} className="staff-column">
                  <div className="staff-header">{staff.name || staff.Name}</div>
                  <div className="staff-body" style={{ position: 'relative', height: `${timelineHeight}px`, backgroundColor: '#fff', marginTop: '40px' }}>
                    {Array.from({ length: totalTimeSlots }, (_, i) => (
                      <div key={i} className="grid-cell" style={{ height: `${TIME_CELL_HEIGHT}px`, borderBottom: '1px solid #f0f0f0' }} />
                    ))}

                    {columns.map((col, colIndex) => col.map(appt => {
                      const dur = Number(appt.duration) || 30;
                      const rawStart = toMinutes(appt.time);
                      const rawEnd = rawStart + dur;
                      const clampedStart = Math.max(rawStart, timelineStartMinutes);
                      const clampedEnd = Math.min(rawEnd, timelineEndMinutes);
                      const clampedDuration = clampedEnd - clampedStart;
                      if (clampedDuration <= 0) return null;

                      return (
                        <div
                          key={appt.id}
                          className="appt-card"
                          style={{
                            position: 'absolute',
                            top: ((clampedStart - timelineStartMinutes) / TIME_SLOT_MINUTES) * TIME_CELL_HEIGHT,
                            left: `${(colIndex * 100) / (columns.length || 1)}%`,
                            width: `${100 / (columns.length || 1)}%`,
                            height: (clampedDuration / TIME_SLOT_MINUTES) * TIME_CELL_HEIGHT,
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
      ) : (
        <div className="list-view" style={{ marginTop: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Time</th>
                  <th style={{ padding: '8px' }}>Staff</th>
                  <th style={{ padding: '8px' }}>Service</th>
                  <th style={{ padding: '8px' }}>Customer</th>
                  <th style={{ padding: '8px' }}>Duration</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Actions</th>
                </tr>
            </thead>
            <tbody>
              {listAppointments.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '12px', color: '#6b7280' }}>No appointments found.</td>
                </tr>
              )}
              {listAppointments.map(appt => {
                const staff = staffMembers.find(s => String(s.id || s.UserId) === String(appt.staffId));
                return (
                  <tr key={appt.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.date ? new Date(appt.date).toLocaleDateString() : (appt.BookingTime ? new Date(appt.BookingTime).toLocaleDateString() : '')}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.time}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{staff?.name || staff?.Name || '—'}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.service}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.customer}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.duration}m</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle', textTransform: 'capitalize' }}>{appt.status}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                      <button type="button" className="btn secondary" style={{ marginRight: '6px' }} onClick={(e) => handleEditClick(e, appt)}>Edit</button>
                      <button type="button" className="btn danger" onClick={(e) => handleDeleteClick(e, appt)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PortalModal open={open} onClose={() => {setOpen(false); setEditingAppt(null);}} title={editingAppt ? "Edit Appointment" : "Add New Appointment"}>
        <form className="appt-form" onSubmit={handleSubmit} style={{ maxHeight: '85vh', overflowY: 'auto', paddingRight: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Customer</label>
              <select name="customerUserId" required defaultValue={editingAppt?.customerUserId || editingAppt?.customerId || ""}>
                <option value="">Select customer</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Staff</label>
              <select name="staffId" required defaultValue={editingAppt?.staffId || editingAppt?.StaffId || ""}>
                {staffMembers.map(s => <option key={s.id || s.UserId} value={s.id || s.UserId}>{s.name || s.Name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Services ({selectedServiceIds.length})</span>
              <span style={{ color: '#6366f1' }}>
                Total: {services.filter(s => selectedServiceIds.includes(String(s.ServiceId))).reduce((sum, s) => sum + s.DurationMinutes, 0)} min
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
              <input type="date" name="date" required defaultValue={editDateDefault} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Time</label>
              <input type="time" name="time" required step="60" min={`${String(businessHours.openingHour).padStart(2, '0')}:00`} max={`${String(businessHours.closingHour).padStart(2, '0')}:00`} defaultValue={editingAppt?.time || `${String(businessHours.openingHour).padStart(2, '0')}:00`} />
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select name="status" defaultValue={editingAppt?.status || "pending"}>
              <option value="pending">Pending</option>
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
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

      <PortalModal
        open={deleteConfirmOpen}
        title="Delete Appointment"
        onClose={cancelDelete}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={cancelDelete}>Cancel</button>
            <button type="button" className="portal-modalBtn portal-modalBtnPrimary" onClick={confirmDelete} style={{ backgroundColor: '#e74c3c' }}>Delete</button>
          </>
        }
      >
        <p style={{ fontSize: '15px', color: '#1f2937', marginBottom: '12px', lineHeight: '1.5', fontWeight: '500' }}>Are you sure you want to delete this appointment?</p>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0' }}><strong>Date:</strong> {String(appointmentToDelete?.date || 'N/A')} | <strong>Time:</strong> {String(appointmentToDelete?.time || 'N/A')} | <strong>Staff:</strong> {String(appointmentToDelete?.staffName || appointmentToDelete?.staff || 'N/A')}</p>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0', marginTop: '8px' }}>This action cannot be undone.</p>
      </PortalModal>
    </div>
  );
}
