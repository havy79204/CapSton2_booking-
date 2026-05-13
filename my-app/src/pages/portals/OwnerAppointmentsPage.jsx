/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import '../../styles/appointments.css'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import ConfirmDeleteModal from '../../components/Layout portal/ConfirmDeleteModal.jsx'
import { api } from '../../lib/api.js'

function parseDateFromSearch(search) {
  const params = new URLSearchParams(String(search || ''))
  const raw = String(params.get('date') || '').trim()
  if (!raw) return null

  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null

  const year = Number(m[1])
  const monthIndex = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(year, monthIndex, day)

  if (Number.isNaN(d.getTime())) return null
  if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) return null
  return d
}

function parseBookingIdFromSearch(search) {
  const params = new URLSearchParams(String(search || ''))
  const raw = String(params.get('bookingId') || '').trim()
  return raw || ''
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase()
}

function appointmentMatchesIdentity(appt, target) {
  const normalizedTarget = normalizeIdentity(target)
  if (!normalizedTarget) return false

  const candidates = [
    appt?.id,
    appt?.BookingId,
    appt?.bookingId,
    appt?.bookingCode,
    appt?.BookingCode,
    appt?.code,
    appt?.Code,
  ]

  return candidates.some((value) => normalizeIdentity(value) === normalizedTarget)
}

function toDateKey(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isReasonableDeepLinkDate(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue)
  if (Number.isNaN(d.getTime())) return false
  const year = d.getFullYear()
  const currentYear = new Date().getFullYear()
  return year >= 2020 && year <= currentYear + 2
}

export default function OwnerAppointmentsPage() {
  const location = useLocation()
  const [highlightBookingId, setHighlightBookingId] = useState(() => parseBookingIdFromSearch(location.search))
  const [didAutoOpenFromNotification, setDidAutoOpenFromNotification] = useState(false)
  const [appointments, setAppointments] = useState([])
  const [staffMembers, setStaffMembers] = useState([])
  const [customers, setCustomers] = useState([])
  const [services, setServices] = useState([])
  const [businessHours, setBusinessHours] = useState({ openingHour: 8, closingHour: 20 })

  const [open, setOpen] = useState(false)
  const [editingAppt, setEditingAppt] = useState(null)
  const [customerMode, setCustomerMode] = useState('existing')
  const [walkInCustomerName, setWalkInCustomerName] = useState('')
  const [walkInCustomerPhone, setWalkInCustomerPhone] = useState('')
  const [modalStaffId, setModalStaffId] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => parseDateFromSearch(location.search) || new Date())
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [selectedServiceIds, setSelectedServiceIds] = useState([])
  const [viewMode, setViewMode] = useState('calendar')
  const [listStatusFilter, setListStatusFilter] = useState('all')
  const [listQueueFilter, setListQueueFilter] = useState('all')
  const [listSortMode, setListSortMode] = useState('all')
  const [listPage, setListPage] = useState(1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState(null)
  const [deletingAppointmentId, setDeletingAppointmentId] = useState(null)
  const [promotionCode, setPromotionCode] = useState('')
  const LIST_PAGE_SIZE = 8

  const setSelectedDateIfChanged = (nextDate) => {
    if (!nextDate) return
    setSelectedDate((prev) => {
      const prevKey = toDateKey(prev)
      const nextKey = toDateKey(nextDate)
      if (!nextKey || prevKey === nextKey) return prev
      return nextDate
    })
  }

  const TIME_SLOT_MINUTES = 30
  const TIME_CELL_HEIGHT = 64
  const timelineStartMinutes = businessHours.openingHour * 60
  const timelineEndMinutes = businessHours.closingHour * 60
  const totalTimeSlots = Math.max(1, Math.floor((timelineEndMinutes - timelineStartMinutes) / TIME_SLOT_MINUTES) + 1)
  const timelineHeight = totalTimeSlots * TIME_CELL_HEIGHT
  const selectedMonthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`

  const timeLabels = useMemo(() => {
    return Array.from({ length: totalTimeSlots }, (_, i) => {
      const totalMinutes = timelineStartMinutes + (i * TIME_SLOT_MINUTES)
      const h = Math.floor(totalMinutes / 60)
      const m = totalMinutes % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    })
  }, [timelineStartMinutes, totalTimeSlots])

  // ================= UTILS =================
  const parseHourFromSetting = (value, fallback) => {
    const raw = String(value || '').trim()
    if (!raw) return fallback

    // Prefer raw clock extraction to avoid timezone conversions (08:00 -> 09:00).
    const isoTime = raw.match(/T(\d{1,2}):(\d{2})(?::\d{2})?/i)
    if (isoTime) {
      const hour = Number(isoTime[1])
      const minute = Number(isoTime[2])
      if (Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return hour
      }
    }

    const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|SA|CH)?$/i)
    if (m) {
      let hour = Number(m[1])
      const minute = Number(m[2])
      const marker = String(m[3] || '').toUpperCase()
      if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return fallback
      if ((marker === 'PM' || marker === 'CH') && hour < 12) hour += 12
      if ((marker === 'AM' || marker === 'SA') && hour === 12) hour = 0
      if (hour < 0 || hour > 23) return fallback
      return hour
    }

    return fallback
  }

  const getWeekdayPrefixFromDate = (date) => {
    const d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return null
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] || null
  }

  const normalizeTime = (t) => {
    const fallback = `${String(businessHours.openingHour).padStart(2, '0')}:00`;
    const raw = String(t || '').trim();
    if (!raw) return fallback;

    // Accept explicit time formats like HH:mm, HH:mm:ss, 9:00 PM
    const plainTime = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|CH|SA)?$/i);
    if (plainTime) {
      let hours = parseInt(plainTime[1], 10);
      const minutes = parseInt(plainTime[2], 10);
      const modifier = String(plainTime[3] || '').toUpperCase();

      if (modifier) {
        if ((modifier === 'PM' || modifier === 'CH') && hours < 12) hours += 12;
        if ((modifier === 'AM' || modifier === 'SA') && hours === 12) hours = 0;
      }

      if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
      return fallback;
    }

    // Accept ISO datetime and similar formats by parsing Date safely.
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
    }

    return fallback;
  };

  const getStatusColor = (status) => {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'completed' || s === 'done') return '#10b981';
    if (s === 'booked' || s === 'confirmed') return 'rgb(99, 102, 241)';
     if (s === 'pending') return '#e8d064';
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

  const toSafeDate = (value) => {
    const d = value ? new Date(value) : null
    if (!d || Number.isNaN(d.getTime())) return null
    return d
  }

  const getQueueReferenceDate = (appt) => {
    return (
      toSafeDate(appt?.createdAt) ||
      toSafeDate(appt?.CreatedAt) ||
      toSafeDate(appt?.bookingTime) ||
      toSafeDate(appt?.BookingTime) ||
      toSafeDate(appt?.date) ||
      null
    )
  }

  const isPendingStatus = (status) => {
    const s = String(status || '').trim().toLowerCase()
    return s === 'pending' || s === 'booked' || s === 'confirmed'
  }

  const toMinutes = (t) => {
    const [h, m] = normalizeTime(t).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return timelineStartMinutes;
    return h * 60 + m;
  };

  const formatDateForDisplay = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };

  const getStaffEntityId = (staff) => String(
    staff?.StaffId || staff?.staffId || staff?.id || staff?.UserId || ''
  );

  const getServiceCategoryId = (service) => String(
    service?.CategoryId || service?.categoryId || service?.CategoryID || ''
  ).trim();

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
  const fetchData = async (monthKey = selectedMonthKey) => {
    try {
      const [apptRes, staffRes, custRes, svcRes] = await Promise.all([
        api.get(`/api/owner/appointments?month=${encodeURIComponent(monthKey)}`),
        api.get('/api/owner/staff'),
        api.get('/api/owner/customers'),
        api.get('/api/owner/services'),
      ]);

      const apptData = Array.isArray(apptRes)
        ? apptRes
        : (Array.isArray(apptRes?.appointments) ? apptRes.appointments : (Array.isArray(apptRes?.data) ? apptRes.data : []));
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
                DurationMinutes: Number(item.DurationMinutes || item.durationMinutes || item.duration || 30),
                CategoryId: item.CategoryId || item.categoryId || section.CategoryId || section.categoryId || null,
              });
            });
          }
        });
      }

      const mapped = apptData.map(a => {
        const customer = customerData.find(c =>
          String(c.UserId || c.userId || c.id) === String(a.customerUserId || a.customerId || a.CustomerUserId)
        );

        const sIds = Array.isArray(a.serviceIds)
          ? a.serviceIds.map(String)
          : (a.serviceId ? [String(a.serviceId)] : []);

        const apptServices = flatServices.filter(s => sIds.includes(String(s.ServiceId)));

        const totalDuration = apptServices.reduce((sum, s) => sum + s.DurationMinutes, 0);

        const serviceNames = apptServices.map(s => s.Name).join(', ');

        let appointmentDate = null;
        const dateCandidates = [a.date, a.BookingDate, a.bookingDate, a.Date];
        for (const v of dateCandidates) {
          const text = String(v || '').trim();
          if (!text) continue;

          if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            const [yy, mm, dd] = text.split('-').map(Number);
            const localDate = new Date(yy, mm - 1, dd);
            if (!Number.isNaN(localDate.getTime())) {
              appointmentDate = localDate;
              break;
            }
          }

          const parsed = new Date(text);
          if (!Number.isNaN(parsed.getTime())) {
            appointmentDate = parsed;
            break;
          }
        }

        if (!appointmentDate) {
          const dateTimeCandidates = [a.BookingTime, a.startTime, a.time, a.StartTime];
          for (const v of dateTimeCandidates) {
            const parsed = new Date(String(v || '').trim());
            if (!Number.isNaN(parsed.getTime())) {
              appointmentDate = parsed;
              break;
            }
          }
        }

        return {
          ...a,
          id: a.BookingId || a.id || a.AppointmentId,
          // Normalize ids so the edit form can reliably pre-select values
          customerUserId: a.customerUserId || a.customerId || a.CustomerUserId,
          staffId: a.staffId || a.StaffId || a.staffID || a.StaffIdResolved,
          customer: a.customerName || a.CustomerName || a.customer || customer?.Name || customer?.name || 'Unknown Customer',
          customerPhone: a.customerPhone || a.CustomerPhone || customer?.Phone || customer?.phone || '',
          service: serviceNames || 'No Service',
          duration: totalDuration || 30,
          date: appointmentDate,
          time: normalizeTime(a.time || a.BookingTime || a.startTime),
          status: (a.status || a.Status || a.BookingStatus || 'pending').toLowerCase(),
          serviceIds: sIds,
          // Add price, discount, totalPrice fields
          price: a.price || 0,
          discount: a.discount || 0,
          discountType: a.discountType || 'percentage',
          totalPrice: a.totalPrice || 0
        };
      });

      setAppointments(mapped);
      setStaffMembers(staffData);
      setCustomers(customerData);
      setServices(flatServices);
      
    } catch (err) {
      console.error('FETCH ERROR:', err);
    }
  };

  useEffect(() => {
    fetchData(selectedMonthKey);
    ;(async () => {
      try {
        const map = (await api.get('/api/owner/settings')) || {}
        const dayPrefix = getWeekdayPrefixFromDate(selectedDate)
        const dayOpenKey = dayPrefix ? `Schedule${dayPrefix}OpenTime` : ''
        const dayCloseKey = dayPrefix ? `Schedule${dayPrefix}CloseTime` : ''
        const openingHour = parseHourFromSetting(
          (dayOpenKey && map[dayOpenKey]) || map.ScheduleOpenTime || map.SalonOpenTime,
          8
        )
        const closingHour = parseHourFromSetting(
          (dayCloseKey && map[dayCloseKey]) || map.ScheduleCloseTime || map.SalonCloseTime,
          20
        )
        const safeCloseHour = closingHour > openingHour ? closingHour : Math.min(openingHour + 1, 23)
        setBusinessHours({ openingHour, closingHour: safeCloseHour })
      } catch (err) {
        console.error(err)
      }
    })()
  }, [selectedMonthKey, selectedDate]);

  useEffect(() => {
    const fromSearch = parseDateFromSearch(location.search)
    const bookingIdFromSearch = parseBookingIdFromSearch(location.search)
    setHighlightBookingId(bookingIdFromSearch)
    setDidAutoOpenFromNotification(false)

    let cancelled = false

    const applySearchDateSafely = () => {
      if (!fromSearch || !isReasonableDeepLinkDate(fromSearch)) return
      if (cancelled) return
      setSelectedDateIfChanged(fromSearch)
    }

    if (!bookingIdFromSearch) {
      applySearchDateSafely()
      return () => {
        cancelled = true
      }
    }

    ;(async () => {
      try {
        const resolved = await api.get(`/api/owner/appointments/${encodeURIComponent(bookingIdFromSearch)}`)
        if (cancelled) return

        const row = resolved?.data || resolved || null
        const resolvedDate = row?.bookingTime
          ? new Date(row.bookingTime)
          : (row?.date ? new Date(row.date) : null)

        if (resolvedDate && !Number.isNaN(resolvedDate.getTime()) && isReasonableDeepLinkDate(resolvedDate)) {
          setSelectedDateIfChanged(resolvedDate)
          return
        }

        applySearchDateSafely()
      } catch {
        if (cancelled) return
        applySearchDateSafely()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.search])

  useEffect(() => {
    if (!highlightBookingId || didAutoOpenFromNotification) return
    const found = appointments.find((appt) => appointmentMatchesIdentity(appt, highlightBookingId))
    if (!found) return

    openEditModal(found)
    setDidAutoOpenFromNotification(true)
  }, [highlightBookingId, didAutoOpenFromNotification, appointments])

  const openEditModal = (appt) => {
    if (!appt) return
    const rawStatus = String(appt?.status || '').trim().toLowerCase();
    const normalizedStatus = (rawStatus === 'delete' || rawStatus === 'deleted') ? 'cancelled' : (rawStatus === 'booked' ? 'confirmed' : (appt?.status || 'pending'));
    setEditingAppt({ ...appt, status: normalizedStatus });
    const hasUserId = Boolean(String(appt?.customerUserId || appt?.customerId || appt?.CustomerUserId || '').trim())
    setCustomerMode(hasUserId ? 'existing' : 'walkin')
    setWalkInCustomerName(String(appt?.customer || appt?.CustomerName || '').trim())
    setWalkInCustomerPhone(String(appt?.customerPhone || appt?.CustomerPhone || '').trim())
    const currentIds = Array.isArray(appt.serviceIds) ? appt.serviceIds.map(String) : [];
    setSelectedServiceIds(currentIds);
    setModalStaffId(String(appt?.staffId || appt?.StaffId || ''));
    setOpen(true);
  }

  const handleEditClick = (e, appt) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') e.nativeEvent.stopImmediatePropagation();
    if (typeof console !== 'undefined' && console.debug) console.debug('OwnerAppointments: handleEditClick', { id: appt?.id, status: appt?.status, eventType: e.type, button: e.button });
    openEditModal(appt)
    e.preventDefault();
    e.stopPropagation();
    // Ensure no other listeners run for this event
  };

  const openDeleteModal = (appt) => {
    if (!appt) return
    setAppointmentToDelete(appt)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteClick = async (e, appt) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof console !== 'undefined' && console.debug) console.debug('OwnerAppointments: handleDeleteClick', { id: appt?.id, status: appt?.status, eventType: e.type, button: e.button });
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') e.nativeEvent.stopImmediatePropagation();
    openDeleteModal(appt)
  }

  const confirmDelete = async () => {
    if (!appointmentToDelete) return
    try {
      const id = appointmentToDelete.id || appointmentToDelete.BookingId
      setDeletingAppointmentId(String(id || ''))
      await api.put(`/api/owner/appointments/${id}`, { status: 'delete' });
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Appointment deleted successfully', title: 'Completed' } 
      }));
      await fetchData()
      setDeleteConfirmOpen(false)
      setAppointmentToDelete(null)
    } catch (err) {
      console.error('Failed to delete appointment:', err)
      window.dispatchEvent(new CustomEvent('portal:toast', {
        detail: { type: 'error', message: err?.message || 'Failed to delete appointment!' },
      }))
    } finally {
      setDeletingAppointmentId('')
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

  const selectedServiceCategoryIds = useMemo(() => {
    const ids = new Set(
      services
        .filter((s) => selectedServiceIds.includes(String(s.ServiceId)))
        .map((s) => getServiceCategoryId(s))
        .filter(Boolean)
    )
    return [...ids]
  }, [services, selectedServiceIds])

  const staffForSelectedServices = useMemo(() => {
    if (!selectedServiceCategoryIds.length) return staffMembers

    return staffMembers.filter((staff) => {
      const specialtyIds = Array.isArray(staff?.specialtyCategoryIds)
        ? staff.specialtyCategoryIds.map((x) => String(x || '').trim()).filter(Boolean)
        : []

      if (!specialtyIds.length) return false
      return selectedServiceCategoryIds.every((categoryId) => specialtyIds.includes(categoryId))
    })
  }, [staffMembers, selectedServiceCategoryIds])

  useEffect(() => {
    if (!modalStaffId) return
    const stillValid = staffForSelectedServices.some((s) => getStaffEntityId(s) === String(modalStaffId))
    if (!stillValid) {
      setModalStaffId('')
    }
  }, [staffForSelectedServices, modalStaffId])

  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const totalDuration = services
      .filter(s => selectedServiceIds.includes(String(s.ServiceId)))
      .reduce((sum, s) => sum + s.DurationMinutes, 0);

    const staffId = String(modalStaffId || formData.get('staffId') || '').trim();
    const date = formData.get('date');
    const time = formData.get('time');

    if (!staffId) {
      window.dispatchEvent(new CustomEvent('portal:toast', {
        detail: { type: 'error', title: 'Error', message: 'Please select staff.' },
      }));
      return;
    }

    if (!selectedServiceIds.length) {
      window.dispatchEvent(new CustomEvent('portal:toast', {
        detail: { type: 'error', title: 'Error', message: 'Please select at least one service for this staff.' },
      }));
      return;
    }

    const payload = {
      customerUserId: customerMode === 'existing'
        ? (String(formData.get('customerUserId') || '').trim() || null)
        : null,
      customerName: customerMode === 'walkin' ? String(walkInCustomerName || '').trim() : undefined,
      customerPhone: customerMode === 'walkin' ? String(walkInCustomerPhone || '').trim() : undefined,
      serviceIds: selectedServiceIds,
      staffId,
      date,
      time: normalizeTime(time),
      notes: formData.get('notes') || "",
      duration: totalDuration,
      promotionCode: promotionCode || null,
      // Determine status: prefer explicit form value; otherwise keep existing editingAppt status
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
      if (customerMode === 'existing' && !payload.customerUserId) {
        window.dispatchEvent(new CustomEvent('portal:toast', {
          detail: { type: 'error', title: 'Error', message: 'Please select customer account.' },
        }));
        return;
      }

      if (customerMode === 'walkin' && !payload.customerName) {
        window.dispatchEvent(new CustomEvent('portal:toast', {
          detail: { type: 'error', title: 'Error', message: 'Please enter walk-in customer name.' },
        }));
        return;
      }

      if (editingAppt) {
        const targetId = editingAppt.id || editingAppt.AppointmentId || editingAppt.BookingId;
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) console.debug('OwnerAppointments: updating', targetId, payload)
        await api.put(`/api/owner/appointments/${targetId}`, payload);
        window.dispatchEvent(new CustomEvent('portal:success-modal', { 
          detail: { message: 'Appointment updated successfully', title: 'Completed' } 
        }));
      } else {
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) console.debug('OwnerAppointments: creating', payload)
        await api.post('/api/owner/appointments', payload);
        window.dispatchEvent(new CustomEvent('portal:success-modal', { 
          detail: { message: 'Appointment created successfully', title: 'Completed' } 
        }));
      }
      setOpen(false);
      setEditingAppt(null);
      setCustomerMode('existing');
      setWalkInCustomerName('');
      setWalkInCustomerPhone('');
      setSelectedServiceIds([]);
      setPromotionCode('');
      await fetchData();
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || "Unable to save";
      window.dispatchEvent(new CustomEvent('portal:toast', {
        detail: { type: 'error', title: 'Error', message: errorMessage },
      }));
    }
  }

  const calendarAppointments = useMemo(
    () => appointments.filter(appt => isSameDay(appt.date || appt.BookingDate || appt.startTime || appt.BookingTime, selectedDate)),
    [appointments, selectedDate]
  );

  const monthlyAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      const source = appt.date || appt.BookingDate || appt.startTime || appt.BookingTime
      const d = source ? new Date(source) : null
      if (!d || Number.isNaN(d.getTime())) return false
      return d.getFullYear() === selectedDate.getFullYear() && d.getMonth() === selectedDate.getMonth()
    })
  }, [appointments, selectedDate]);

  const listAppointments = useMemo(() => {
    const source = viewMode === 'list' ? monthlyAppointments : calendarAppointments
    return source.filter(a => selectedStaff === 'all' || String(a.staffId) === String(selectedStaff));
  }, [viewMode, monthlyAppointments, calendarAppointments, selectedStaff]);

  const statusFilteredListAppointments = useMemo(() => {
    if (listStatusFilter === 'all') return listAppointments
    return listAppointments.filter((appt) => String(appt.status || '').trim().toLowerCase() === listStatusFilter)
  }, [listAppointments, listStatusFilter])

  const queueFilteredListAppointments = useMemo(() => {
    if (listQueueFilter === 'all') return statusFilteredListAppointments

    const now = Date.now()
    if (listQueueFilter === 'recent_booking') {
      return statusFilteredListAppointments.filter((appt) => {
        if (!isPendingStatus(appt.status)) return false
        const ref = getQueueReferenceDate(appt)
        if (!ref) return false
        return now - ref.getTime() <= 24 * 60 * 60 * 1000
      })
    }

    if (listQueueFilter === 'stale_pending') {
      return statusFilteredListAppointments.filter((appt) => {
        if (!isPendingStatus(appt.status)) return false
        const ref = getQueueReferenceDate(appt)
        if (!ref) return false
        return now - ref.getTime() >= 2 * 60 * 60 * 1000
      })
    }

    return statusFilteredListAppointments
  }, [statusFilteredListAppointments, listQueueFilter])

  const sortedListAppointments = useMemo(() => {
    if (listSortMode === 'all') return queueFilteredListAppointments

    const ranked = [...queueFilteredListAppointments]
    const getTs = (appt) => {
      const ref = getQueueReferenceDate(appt)
      return ref ? ref.getTime() : 0
    }

    ranked.sort((a, b) => {
      const aTs = getTs(a)
      const bTs = getTs(b)

      if (listSortMode === 'booking_oldest') return aTs - bTs
      if (listSortMode === 'pending_longest') {
        const aPending = isPendingStatus(a.status) ? 1 : 0
        const bPending = isPendingStatus(b.status) ? 1 : 0
        if (aPending !== bPending) return bPending - aPending
        return aTs - bTs
      }
      if (listSortMode === 'pending_newest') {
        const aPending = isPendingStatus(a.status) ? 1 : 0
        const bPending = isPendingStatus(b.status) ? 1 : 0
        if (aPending !== bPending) return bPending - aPending
        return bTs - aTs
      }

      return bTs - aTs
    })

    return ranked
  }, [queueFilteredListAppointments, listSortMode])

  const listTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedListAppointments.length / LIST_PAGE_SIZE))
  }, [sortedListAppointments.length])

  const pagedListAppointments = useMemo(() => {
    const safePage = Math.min(listPage, listTotalPages)
    const start = (safePage - 1) * LIST_PAGE_SIZE
    return sortedListAppointments.slice(start, start + LIST_PAGE_SIZE)
  }, [sortedListAppointments, listPage, listTotalPages])

  useEffect(() => {
    setListPage(1)
  }, [selectedDate, selectedStaff, listStatusFilter, listQueueFilter, listSortMode, viewMode])

  useEffect(() => {
    if (listPage > listTotalPages) {
      setListPage(listTotalPages)
    }
  }, [listPage, listTotalPages])

  const visibleStaff = useMemo(() => {
    if (selectedStaff === 'all') return staffMembers;
    return staffMembers.filter(s => getStaffEntityId(s) === String(selectedStaff));
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
          // Fix timezone issue: get local date parts instead of using toISOString
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch (e) {
        // ignore and try next
      }
    }
    return selectedDate.toISOString().split('T')[0];
  })();

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
              <option key={getStaffEntityId(s) || String(s.name || s.Name || '')} value={getStaffEntityId(s)}>
                {s.name || s.Name}
              </option>
            ))}
          </select>
          <button className="btn secondary" onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}>
            {viewMode === 'calendar' ? 'List View' : 'Calendar View'}
          </button>
          <button className="btn primary" onClick={() => {
            setEditingAppt(null);
            setCustomerMode('existing');
            setWalkInCustomerName('');
            setWalkInCustomerPhone('');
            setSelectedServiceIds([]);
            setModalStaffId('');
            setOpen(true);
          }}>
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
              const staffAppts = calendarAppointments.filter(a => {
                if (String(a.staffId) !== getStaffEntityId(staff)) return false;
                const start = toMinutes(a.time);
                const duration = Number(a.duration) || 30;
                const end = start + duration;
                return end > timelineStartMinutes && start < timelineEndMinutes;
              });
              const columns = layoutAppointments(staffAppts);

              return (
                <div key={getStaffEntityId(staff)} className="staff-column">
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

                      const isHighlighted = appointmentMatchesIdentity(appt, highlightBookingId)

                      return (
                        <div
                          key={appt.id}
                          className="appt-card"
                          onClick={() => openEditModal(appt)}
                          style={{
                            position: 'absolute',
                            top: ((clampedStart - timelineStartMinutes) / TIME_SLOT_MINUTES) * TIME_CELL_HEIGHT,
                            left: `${(colIndex * 100) / (columns.length || 1)}%`,
                            width: `${100 / (columns.length || 1)}%`,
                            height: (clampedDuration / TIME_SLOT_MINUTES) * TIME_CELL_HEIGHT,
                            background: getStatusColor(appt.status),
                            border: isHighlighted ? '3px solid #facc15' : '1px solid rgba(255,255,255,0.12)',
                            boxShadow: isHighlighted ? '0 0 0 2px rgba(250, 204, 21, 0.45), 0 8px 16px rgba(15, 23, 42, 0.22)' : '0 2px 4px rgba(15, 23, 42, 0.1)',
                            zIndex: 5,
                            padding: '4px 8px',
                            overflow: 'hidden',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ lineHeight: '1.2' }}>
                              <strong style={{ fontSize: '10.5px' }}>{appt.service} ({dur}m)</strong>
                              {isHighlighted ? (
                                <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: '#fff7cc' }}>
                                  From notification
                                </span>
                              ) : null}
                              <span style={{ fontSize: '9px', display: 'block', fontWeight: 'bold', textTransform: 'capitalize' }}>• {appt.status}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(e, appt)}
                              style={{
                                border: 'none',
                                borderRadius: '4px',
                                padding: '0 4px',
                                background: 'rgba(255,255,255,0.2)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '10px',
                                lineHeight: 1.2,
                              }}
                              title="Delete appointment"
                            >
                              X
                            </button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label htmlFor="list-status-filter" style={{ fontSize: '13px', color: '#475569' }}>Status:</label>
              <select
                id="list-status-filter"
                className="staff-filter-select"
                value={listStatusFilter}
                onChange={(e) => setListStatusFilter(String(e.target.value || 'all'))}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="booked">Booked</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <label htmlFor="list-queue-filter" style={{ fontSize: '13px', color: '#475569', marginLeft: '8px' }}>Queue:</label>
              <select
                id="list-queue-filter"
                className="staff-filter-select"
                value={listQueueFilter}
                onChange={(e) => setListQueueFilter(String(e.target.value || 'all'))}
              >
                <option value="all">All booking</option>
                <option value="recent_booking">Just booked (24h)</option>
                <option value="stale_pending">Pending too long (&gt;=2h)</option>
              </select>

              <label htmlFor="list-sort-mode" style={{ fontSize: '13px', color: '#475569', marginLeft: '8px' }}>Sort:</label>
              <select
                id="list-sort-mode"
                className="staff-filter-select"
                value={listSortMode}
                onChange={(e) => setListSortMode(String(e.target.value || 'all'))}
              >
                <option value="all">All (normal)</option>
                <option value="booking_newest">Newest booking first</option>
                <option value="booking_oldest">Oldest booking first</option>
                <option value="pending_longest">Pending longest first</option>
                <option value="pending_newest">Pending newest first</option>
              </select>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {sortedListAppointments.length} item(s)
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Time</th>
                  <th style={{ padding: '8px' }}>Staff</th>
                  <th style={{ padding: '8px' }}>Service</th>
                  <th style={{ padding: '8px' }}>Customer</th>
                  <th style={{ padding: '8px' }}>Duration</th>
                  <th style={{ padding: '8px' }}>Price</th>
                  <th style={{ padding: '8px' }}>Discount</th>
                  <th style={{ padding: '8px' }}>Total Price</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px', width: '190px' }}>Actions</th>
                </tr>
            </thead>
            <tbody>
              {pagedListAppointments.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: '12px', color: '#6b7280' }}>No appointments found.</td>
                </tr>
              )}
              {pagedListAppointments.map(appt => {
                const staff = staffMembers.find(s => getStaffEntityId(s) === String(appt.staffId));
                const isHighlighted = appointmentMatchesIdentity(appt, highlightBookingId);
                return (
                  <tr
                    key={appt.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      background: isHighlighted ? '#fff9db' : '#ffffff',
                    }}
                  >
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{formatDateForDisplay(appt.date || appt.BookingDate || appt.BookingTime)}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.time}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{staff?.name || staff?.Name || '—'}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.service}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.customer}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle' }}>{appt.duration}m</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle', textAlign: 'right' }}>
                      {appt.price ? `${Number(appt.price).toLocaleString()}đ` : '—'}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'middle', textAlign: 'right' }}>
                      {appt.discount && appt.discount > 0 ? (
                        <span>
                          {appt.discountType === 'percentage' ? `${appt.discount}%` : `${Number(appt.discount).toLocaleString()}đ`}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'middle', textAlign: 'right', fontWeight: 'bold' }}>
                      {appt.totalPrice ? `${Number(appt.totalPrice).toLocaleString()}đ` : '—'}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'middle', textTransform: 'capitalize' }}>{appt.status}</td>
                    <td style={{ padding: '8px', verticalAlign: 'middle', whiteSpace: 'nowrap', width: '190px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', flexWrap: 'nowrap' }}>
                        <button type="button" className="btn secondary" onClick={(e) => handleEditClick(e, appt)}>Edit</button>
                        <button type="button" className="btn danger" onClick={(e) => handleDeleteClick(e, appt)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setListPage((p) => Math.max(1, p - 1))}
              disabled={listPage <= 1}
            >
              Prev
            </button>
            <span style={{ fontSize: '13px', color: '#475569' }}>
              Page {listPage} / {listTotalPages}
            </span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}
              disabled={listPage >= listTotalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <PortalModal open={open} onClose={() => {setOpen(false); setEditingAppt(null); setPromotionCode(''); setCustomerMode('existing'); setWalkInCustomerName(''); setWalkInCustomerPhone('');}} title={editingAppt ? "Edit Appointment" : "Add New Appointment"}>
        <form className="appt-form" onSubmit={handleSubmit} style={{ maxHeight: '85vh', overflowY: 'auto', paddingRight: '10px' }}>
          <div className="form-group">
            <label>Customer Type</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}>
                <input
                  type="radio"
                  name="customerMode"
                  value="existing"
                  checked={customerMode === 'existing'}
                  onChange={() => setCustomerMode('existing')}
                />
                Existing account
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}>
                <input
                  type="radio"
                  name="customerMode"
                  value="walkin"
                  checked={customerMode === 'walkin'}
                  onChange={() => setCustomerMode('walkin')}
                />
                Walk-in customer
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>Customer</label>
            {customerMode === 'existing' ? (
              <select
                name="customerUserId"
                required={customerMode === 'existing'}
                defaultValue={editingAppt?.customerUserId || editingAppt?.customerId || ""}
              >
                <option value="">Select customer</option>
                {customers.map(c => <option key={c.UserId || c.id} value={c.UserId || c.id}>{c.Name || c.name}</option>)}
              </select>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                <input
                  type="text"
                  value={walkInCustomerName}
                  onChange={(e) => setWalkInCustomerName(e.target.value)}
                  placeholder="Enter walk-in customer name"
                  required={customerMode === 'walkin'}
                />
                <input
                  type="text"
                  value={walkInCustomerPhone}
                  onChange={(e) => setWalkInCustomerPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
            )}
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
              {services.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '13px' }}>
                  No services available.
                </div>
              ) : null}
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '-6px' }}>
            <small style={{ color: '#64748b' }}>
              {selectedServiceIds.length
                ? `Compatible staff: ${staffForSelectedServices.length}`
                : 'Select service(s) first, then choose a compatible staff member.'}
            </small>
          </div>

          <div className="form-group">
            <label>Staff</label>
            <select
              name="staffId"
              required
              value={modalStaffId}
              onChange={(e) => setModalStaffId(String(e.target.value || ''))}
              disabled={selectedServiceIds.length === 0}
            >
              <option value="">
                {selectedServiceIds.length === 0 ? 'Select service(s) first' : 'Select staff'}
              </option>
              {staffForSelectedServices.map(s => (
                <option key={getStaffEntityId(s) || String(s.name || s.Name || '')} value={getStaffEntityId(s)}>
                  {s.name || s.Name}
                </option>
              ))}
            </select>
            <small style={{ color: '#64748b' }}>
              {selectedServiceIds.length === 0
                ? 'Choose service(s) first to load compatible staff.'
                : 'Only staff compatible with selected services are shown.'}
            </small>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" name="date" required defaultValue={editDateDefault} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Time</label>
              <input
                type="time"
                name="time"
                required
                step="60"
                min={`${String(businessHours.openingHour).padStart(2, '0')}:00`}
                defaultValue={editingAppt?.time || `${String(businessHours.openingHour).padStart(2, '0')}:00`}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select name="status" defaultValue={editingAppt?.status || "pending"}>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea name="notes" rows="3" defaultValue={editingAppt?.notes || ""}></textarea>
          </div>

          <div className="form-group">
            <label>Promotion Code</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={promotionCode}
                onChange={(e) => setPromotionCode(e.target.value.toUpperCase())}
                placeholder="Enter promotion code"
                style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px' }}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={() => setPromotionCode('')}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn primary">{editingAppt ? "Save Changes" : "Create Appointment"}</button>
          </div>
        </form>
      </PortalModal>

      <ConfirmDeleteModal
        open={deleteConfirmOpen}
        title="Confirm delete"
        message="Are you sure you want to delete this appointment?"
        detail={`Date: ${formatDateForDisplay(appointmentToDelete?.date || appointmentToDelete?.BookingDate || appointmentToDelete?.BookingTime)} | Time: ${String(appointmentToDelete?.time || 'N/A')} | Staff: ${String(appointmentToDelete?.staffName || appointmentToDelete?.staff || 'N/A')}`}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        confirming={Boolean(deletingAppointmentId)}
      />
    </div>
  );
}
