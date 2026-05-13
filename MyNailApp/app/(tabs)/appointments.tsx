import React, { useCallback, useState, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { get, post, put } from '@/services/apiClient';
import Card from '@/components/ui/card';
import { useToast } from '@/components/ui/Toast';
import { subscribeStaffDataUpdates } from '../../lib/realtime';

const LIVE_REFRESH_MS = 5000;
type AppointmentStatus = 'pending' | 'confirmed' | 'booked' | 'completed' | 'cancelled';

function formatDateInput(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeInput(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function normalizeAppointmentStatus(status: unknown): AppointmentStatus {
  const s = String(status || '').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('complete') || s === 'done') return 'completed';
  if (s.includes('booked') || s.includes('booker')) return 'booked';
  if (s.includes('confirm')) return 'confirmed';
  return 'pending';
}

export default function AppointmentsScreen() {
  const toast = useToast();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [metaCustomers, setMetaCustomers] = useState<any[]>([]);
  const [metaServices, setMetaServices] = useState<any[]>([]);
  const [metaServiceCategoryIds, setMetaServiceCategoryIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceFocused, setServiceFocused] = useState(false);
  const suppressServiceBlur = useRef(false);
  const [q, setQ] = useState('');
  const [statusSort, setStatusSort] = useState<'all' | AppointmentStatus>('all');
  const [statusSortOpen, setStatusSortOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [walkinCustomerName, setWalkinCustomerName] = useState('');
  const [walkinCustomerPhone, setWalkinCustomerPhone] = useState('');
  const [bookingDate, setBookingDate] = useState(formatDateInput());
  const [bookingTime, setBookingTime] = useState(formatTimeInput());
  const [bookingNotes, setBookingNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const [phoneLookupResults, setPhoneLookupResults] = useState<any[]>([]);

  const [savingId, setSavingId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState('');

  const loadAppointments = useCallback(async () => {
    try {
      const res = await get('/staff/appointments');
      const list = Array.isArray(res?.data) ? res.data : [];
      const mapped = list.map((a: any) => {
        const mappedStatus = normalizeAppointmentStatus(a.status);

        return {
          id: a.id,
          date: a.date,
          time: a.time,
          customerName: a.customerName || a.CustomerName || a.customer || a.name || '',
          customerPhone: a.customerPhone || a.CustomerPhone || a.phone || a.Phone || '',
          service: a.service,
          status: mappedStatus,
          price: Number(a.price || 0),
        };
      });
      setAppointments(mapped);
    } catch {
      setAppointments([]);
    }
  }, []);

  const loadAppointmentMeta = useCallback(async () => {
    try {
      const res = await get('/staff/appointments/meta');
      console.log('[appointments] meta response', res);
      const customers = Array.isArray(res?.data?.customers) ? res.data.customers : [];
      const services = Array.isArray(res?.data?.services) ? res.data.services : [];
      const categoryIds = Array.isArray(res?.data?.staffCategoryIds)
        ? res.data.staffCategoryIds.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      setMetaCustomers(customers);
      setMetaServices(services);
      setMetaServiceCategoryIds(categoryIds);

      try {
        const meRes = await get('/auth/me');
        const me = meRes?.data || null;
        const id = String(me?.userId || me?.id || me?.UserId || '').trim();
        if (id) setCurrentUserId(id);
      } catch (_) {
        // ignore
      }

      if (!selectedServiceId && services.length > 0) {
        setSelectedServiceId(String(services[0]?.id || ''));
      }
    } catch {
      setMetaCustomers([]);
      setMetaServices([]);
    }
  }, [selectedCustomerId, selectedServiceId]);

  const filteredServices = useMemo(() => {
    const services = metaServices || [];
    if (!metaServiceCategoryIds.length) return services;
    return services.filter((s: any) => {
      const categoryId = String(s?.categoryId || '').trim();
      return categoryId && metaServiceCategoryIds.includes(categoryId);
    });
  }, [metaServices, metaServiceCategoryIds]);

  const serviceSuggestions = useMemo(() => {
    const q = String(serviceQuery || '').trim().toLowerCase();
    if (!q) return filteredServices.slice(0, 20);
    return (filteredServices || []).filter((s: any) => String(s?.name || '').toLowerCase().includes(q)).slice(0, 20);
  }, [serviceQuery, filteredServices]);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
      loadAppointmentMeta();

      const unsubscribe = subscribeStaffDataUpdates(() => {
        loadAppointments();
        loadAppointmentMeta();
      });

      const timer = setInterval(() => {
        loadAppointments();
      }, LIVE_REFRESH_MS);

      return () => {
        clearInterval(timer);
        unsubscribe();
      };
    }, [loadAppointmentMeta, loadAppointments]),
  );

  const today = new Date().toISOString().split('T')[0];
  const todayCount = appointments.filter((a: any) => a.date === today).length;
  const confirmedCount = appointments.filter((a: any) => a.status === 'confirmed').length;
  const pendingCount = appointments.filter((a: any) => a.status === 'pending').length;
  const bookedCount = appointments.filter((a: any) => a.status === 'booked').length;

  const filtered = appointments.filter((a: any) => {
    if (!q) return true;
    const normalize = (x: string) => String(x || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .toLowerCase();
    const nq = normalize(q);
    const s = `${a.customerName || ''} ${a.customerPhone || ''}`;
    return normalize(s).includes(nq);
  });

  const statusSortOptions: Array<{ value: 'all' | AppointmentStatus; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'booked', label: 'Booked' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const selectedSortLabel = statusSortOptions.find((x) => x.value === statusSort)?.label || 'All';

  const parseTime = (apt: any) => {
    const d = String(apt?.date || '').trim();
    const t = String(apt?.time || '').trim();
    const ts = new Date(`${d}T${t || '00:00'}:00`).getTime();
    return Number.isFinite(ts) ? ts : 0;
  };

  const visibleAppointments = [...filtered].sort((a, b) => {
    if (statusSort === 'all') {
      return parseTime(b) - parseTime(a)
    }
    else {
      const aRank = a.status === statusSort ? 0 : 1;
      const bRank = b.status === statusSort ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
    }
    return parseTime(a) - parseTime(b);
  });

  const updateStatus = async (apt: any, nextStatus: 'Confirmed' | 'Booked' | 'Cancelled' | 'Completed') => {
    try {
      setSavingId(String(apt.id || ''));
      await put(`/staff/appointments/${apt.id}`, { status: nextStatus });
      await loadAppointments();
      toast.showSuccess('Cập nhật trạng thái lịch hẹn thành công.');
    } catch (error: any) {
      toast.showError(error?.message || 'Không thể cập nhật trạng thái lịch hẹn.');
    } finally {
      setSavingId('');
    }
  };

  const validateCreateForm = () => {
    if (!selectedCustomerId) {
      if (!String(walkinCustomerPhone || '').trim()) {
        toast.showError('Vui lòng nhập số điện thoại khách hàng.');
        return false;
      }

      if (!String(walkinCustomerName || '').trim()) {
        toast.showError('Vui lòng nhập tên khách hàng.');
        return false;
      }
    }

    if (!selectedServiceId) {
      toast.showError('Vui lòng chọn dịch vụ.');
      return false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bookingDate || '').trim())) {
      toast.showError('Ngày hẹn không hợp lệ. Dùng định dạng YYYY-MM-DD.');
      return false;
    }

    if (!/^\d{2}:\d{2}$/.test(String(bookingTime || '').trim())) {
      toast.showError('Giờ hẹn không hợp lệ. Dùng định dạng HH:mm.');
      return false;
    }

    return true;
  };

  const submitCreateAppointment = async () => {
    if (!validateCreateForm()) return;

    try {
      setCreating(true);
      const payload = {
        customerUserId: selectedCustomerId || null,
        customerName: selectedCustomerId ? undefined : (String(walkinCustomerName || '').trim() || undefined),
        customerPhone: selectedCustomerId ? undefined : (String(walkinCustomerPhone || '').trim() || undefined),
        serviceIds: [selectedServiceId],
        date: String(bookingDate || '').trim(),
        time: String(bookingTime || '').trim(),
        notes: String(bookingNotes || '').trim(),
        status: 'Pending',
      };

      if (editingId) {
        await put(`/staff/appointments/${editingId}`, payload);
        toast.showSuccess('Cập nhật lịch hẹn thành công.');
      } else {
        await post('/staff/appointments', payload);
        toast.showSuccess('Tạo lịch hẹn thành công.');
      }

      setBookingNotes('');
      setBookingDate(formatDateInput());
      setBookingTime(formatTimeInput());
      setWalkinCustomerName('');
      setWalkinCustomerPhone('');
      setSelectedCustomerId('');
      setPhoneLookupResults([]);
      setCreateOpen(false);
      setEditingId('');
      await loadAppointments();
      await loadAppointmentMeta();
    } catch (error: any) {
      toast.showError(error?.message || (editingId ? 'Không thể cập nhật lịch hẹn.' : 'Không thể tạo lịch hẹn.'));
    } finally {
      setCreating(false);
    }
  };

  const normalizePhone = (value: string) => String(value || '').replace(/\D+/g, '');

  const getDateFromInput = (value: string) => {
    const parts = String(value || '').trim().split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts.map((x) => Number(x));
      const d = new Date(yyyy, (mm || 1) - 1, dd || 1);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const getTimeFromInput = (value: string) => {
    const parts = String(value || '').trim().split(':');
    const now = new Date();
    if (parts.length >= 2) {
      const hh = Number(parts[0]);
      const mm = Number(parts[1]);
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    return now;
  };

  const handlePhoneLookup = async () => {
    const rawPhone = String(walkinCustomerPhone || '').trim();
    if (!rawPhone) {
      toast.showError('Vui lòng nhập số điện thoại.');
      return;
    }

    const buildLocalMatches = (target: string) => {
      const seen = new Set();
      const results: any[] = [];

      const addMatch = (item: any) => {
        const name = String(item?.name || item?.customerName || item?.customer || '').trim();
        const phone = String(item?.phone || item?.customerPhone || '').trim();
        const id = String(item?.id || item?.userId || item?.customerUserId || item?.CustomerUserId || '').trim();
        const key = `${id}|${name}|${phone}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ customerUserId: id || null, customerName: name, phone });
      };

      for (const c of metaCustomers || []) {
        const phone = normalizePhone(c?.phone || '');
        if (!phone) continue;
        if (phone === target || phone.endsWith(target) || target.endsWith(phone)) addMatch(c);
      }

      for (const a of appointments || []) {
        const phone = normalizePhone(a?.customerPhone || '');
        if (!phone) continue;
        if (phone === target || phone.endsWith(target) || target.endsWith(phone)) addMatch(a);
      }

      return results;
    };

    try {
      setPhoneLookupLoading(true);
      const res = await get(`/staff/appointments/customers?q=${encodeURIComponent(rawPhone)}`);
      const list = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
            ? res
            : [];
      const target = normalizePhone(rawPhone);
      let filtered = list;
      if (target) {
        const byPhone = list.filter((item: any) => {
          const phone = normalizePhone(item?.phone || item?.Phone || item?.customerPhone || item?.CustomerPhone || '');
          if (!phone) return false;
          return phone === target || phone.endsWith(target) || target.endsWith(phone);
        });
        if (byPhone.length) filtered = byPhone;
      }

      if (filtered.length === 0) {
        filtered = buildLocalMatches(target);
      }

      setPhoneLookupResults(filtered);
      if (filtered.length === 0) {
        setSelectedCustomerId('');
        toast.showError('Không tìm thấy khách theo số điện thoại.');
      } else if (filtered.length === 1) {
        const item = filtered[0] || {};
        const name = String(item?.customerName || item?.name || '').trim();
        const phone = String(item?.phone || item?.Phone || '').trim();
        const customerUserId = String(item?.customerUserId || item?.CustomerUserId || item?.userId || '').trim();
        if (customerUserId) setSelectedCustomerId(customerUserId);
        if (name) setWalkinCustomerName(name);
        if (phone) setWalkinCustomerPhone(phone);
      }
    } catch (err: any) {
      toast.showError(err?.message || 'Không thể tìm kiếm khách hàng.');
    } finally {
      setPhoneLookupLoading(false);
    }
  };

  const openEditAppointment = async (id: string) => {
    try {
      const res = await get(`/staff/appointments/${id}`);
      const a = res?.data || null;
      if (!a) return;

      setEditingId(String(a.id || id));
      setCreateOpen(true);

      const hasAccount = Boolean(a.customerUserId);
      setSelectedCustomerId(hasAccount ? String(a.customerUserId) : '');
      setWalkinCustomerName(String(a.customerName || ''));
      setWalkinCustomerPhone(String(a.customerPhone || ''));
      setPhoneLookupResults([]);
      setSelectedServiceId(String((Array.isArray(a.serviceIds) ? a.serviceIds[0] : a.serviceId) || ''));
      setBookingDate(String(a.date || formatDateInput()));
      setBookingTime(String(a.time || formatTimeInput()));
      setBookingNotes(String(a.notes || ''));
    } catch (err) {
      toast.showError('Không thể lấy chi tiết lịch hẹn.');
    }
  };

  return (
    <>
      <ScrollView style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '800' }}>Lịch hẹn</Text>
          <TouchableOpacity style={styles.createToggleBtn} onPress={() => setCreateOpen((v) => !v)}>
            <Text style={styles.createToggleBtnText}>{createOpen ? 'Đóng' : '+ Tạo lịch hẹn'}</Text>
          </TouchableOpacity>
        </View>

        {createOpen ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.createTitle}>Tạo lịch hẹn tại quán</Text>

            <Text style={styles.createLabel}>Số điện thoại *</Text>
            <TextInput
              value={walkinCustomerPhone}
              onChangeText={(value) => {
                setWalkinCustomerPhone(value);
                setSelectedCustomerId('');
                setPhoneLookupResults([]);
              }}
              placeholder="Ví dụ: 0901234567"
              keyboardType="phone-pad"
              style={styles.createInput}
            />

            <TouchableOpacity
              style={[styles.lookupBtn, phoneLookupLoading ? { opacity: 0.6 } : null]}
              onPress={handlePhoneLookup}
              disabled={phoneLookupLoading}
            >
              <Text style={styles.lookupBtnText}>{phoneLookupLoading ? 'Đang tìm...' : 'Lấy thông tin khách'}</Text>
            </TouchableOpacity>

            {phoneLookupResults.length > 0 ? (
              <View style={styles.lookupBox}>
                {phoneLookupResults.map((item: any, idx: number) => {
                  const name = String(item?.customerName || item?.name || '').trim();
                  const phone = String(item?.phone || item?.Phone || '').trim();
                  const customerUserId = String(item?.customerUserId || item?.CustomerUserId || item?.userId || '').trim();
                  const key = `${customerUserId || phone || idx}-${idx}`;

                  return (
                    <View key={key} style={styles.lookupItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lookupName}>{name || 'Khách hàng'}</Text>
                        {phone ? <Text style={styles.lookupPhone}>{phone}</Text> : null}
                      </View>
                      <TouchableOpacity
                        style={styles.lookupAction}
                        onPress={() => {
                          if (customerUserId) setSelectedCustomerId(customerUserId);
                          else setSelectedCustomerId('');
                          if (name) setWalkinCustomerName(name);
                          if (phone) setWalkinCustomerPhone(phone);
                          setPhoneLookupResults([]);
                        }}
                      >
                        <Text style={styles.lookupActionText}>{customerUserId ? 'Dùng thông tin' : 'Điền nhanh'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Text style={styles.createLabel}>Tên khách hàng *</Text>
            <TextInput
              value={walkinCustomerName}
              onChangeText={setWalkinCustomerName}
              placeholder="Ví dụ: Nguyen Van A"
              style={styles.createInput}
            />

            <Text style={styles.createLabel}>Dịch vụ</Text>
            <TextInput
              value={serviceQuery}
              onChangeText={(v) => {
                setServiceQuery(v);
                setSelectedServiceId('');
              }}
              onFocus={() => setServiceFocused(true)}
              onBlur={() => setTimeout(() => { if (!suppressServiceBlur.current) setServiceFocused(false) }, 200)}
              placeholder="Tìm dịch vụ..."
              style={styles.createInput}
            />

            {(serviceQuery.length > 0 || serviceFocused) ? (
              <ScrollView style={styles.suggestionBox} nestedScrollEnabled>
                {serviceSuggestions.length === 0 ? (
                  <Text style={styles.metaEmptyText}>Không tìm thấy dịch vụ.</Text>
                ) : (
                  serviceSuggestions.map((s: any, idx: number) => {
                    const keyId = String(s.id || s._id || s.name || idx);
                    return (
                      <TouchableOpacity
                        key={`${keyId}-${idx}`}
                        style={styles.suggestionItem}
                        onPressIn={() => { suppressServiceBlur.current = true }}
                        onPress={() => {
                          const sid = String(s.id || s._id || '').trim();
                          setSelectedServiceId(sid);
                          setServiceQuery(String(s.name || ''));
                          setServiceFocused(false);
                          console.log('[UI] service selected', sid, s?.name);
                          setTimeout(() => { suppressServiceBlur.current = false }, 50);
                        }}
                      >
                        <Text style={styles.suggestionText}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            ) : null}
            <View style={{ marginTop: 6 }}>
              <Text style={{ color: '#6b7280', fontSize: 12 }}>Selected service id: {selectedServiceId || '(none)'}</Text>
              <Text style={{ color: '#6b7280', fontSize: 12 }}>Service query: {serviceQuery || '(empty)'}</Text>
            </View>

            <View style={styles.createRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.createLabel}>Ngày (YYYY-MM-DD)</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                  <TextInput
                    value={bookingDate}
                    onChangeText={setBookingDate}
                    placeholder="2026-04-24"
                    style={styles.createInput}
                    editable={Platform.OS === 'web'}
                    {...(Platform.OS === 'web' ? ({ type: 'date' } as any) : {})}
                  />
                </TouchableOpacity>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.createLabel}>Giờ (HH:mm)</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(true)}>
                  <TextInput
                    value={bookingTime}
                    onChangeText={setBookingTime}
                    placeholder="14:30"
                    style={styles.createInput}
                    editable={Platform.OS === 'web'}
                    {...(Platform.OS === 'web' ? ({ type: 'time' } as any) : {})}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {showDatePicker ? (
              <DateTimePicker
                value={getDateFromInput(bookingDate)}
                mode="date"
                onChange={(_, selected) => {
                  setShowDatePicker(false);
                  if (selected) setBookingDate(formatDateInput(selected));
                }}
              />
            ) : null}

            {showTimePicker ? (
              <DateTimePicker
                value={getTimeFromInput(bookingTime)}
                mode="time"
                onChange={(_, selected) => {
                  setShowTimePicker(false);
                  if (selected) setBookingTime(formatTimeInput(selected));
                }}
              />
            ) : null}

            <Text style={styles.createLabel}>Ghi chú</Text>
            <TextInput
              value={bookingNotes}
              onChangeText={setBookingNotes}
              placeholder="Nhập ghi chú cho lịch hẹn"
              style={[styles.createInput, styles.createTextarea]}
              multiline
            />

            <TouchableOpacity
              style={[styles.submitCreateBtn, creating ? { opacity: 0.6 } : null]}
              onPress={submitCreateAppointment}
              disabled={creating}
            >
              <Text style={styles.submitCreateBtnText}>{creating ? 'Đang tạo...' : 'Tạo lịch hẹn'}</Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
          <Card style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontWeight: '700' }}>{confirmedCount}</Text>
            <Text style={{ color: '#6b7280' }}>Đã xác nhận</Text>
          </Card>
          <Card style={{ flex: 1, marginHorizontal: 4 }}>
            <Text style={{ fontWeight: '700' }}>{pendingCount}</Text>
            <Text style={{ color: '#6b7280' }}>Chờ xác nhận</Text>
          </Card>
          <Card style={{ flex: 1, marginHorizontal: 4 }}>
            <Text style={{ fontWeight: '700' }}>{bookedCount}</Text>
            <Text style={{ color: '#6b7280' }}>Khách đã tới</Text>
          </Card>
          <Card style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontWeight: '700' }}>{todayCount}</Text>
            <Text style={{ color: '#6b7280' }}>Hôm nay</Text>
          </Card>
        </View>

        <View style={styles.sortWrap}>
          <Text style={styles.sortLabel}>Status:</Text>
          <TouchableOpacity style={styles.sortSelect} onPress={() => setStatusSortOpen((v) => !v)}>
            <Text style={styles.sortSelectText}>{selectedSortLabel}</Text>
            <Text style={styles.sortCaret}>{statusSortOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        </View>

        {statusSortOpen ? (
          <View style={styles.sortMenu}>
            {statusSortOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.sortOption, statusSort === opt.value ? styles.sortOptionActive : null]}
                onPress={() => {
                  setStatusSort(opt.value);
                  setStatusSortOpen(false);
                }}
              >
                <Text style={[styles.sortOptionText, statusSort === opt.value ? styles.sortOptionTextActive : null]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <TextInput placeholder="Tìm theo tên hoặc SĐT..." value={q} onChangeText={setQ} style={styles.search} />

        <View style={{ marginTop: 12 }}>
          {visibleAppointments.length === 0 ? (
            <Text style={{ color: '#6b7280' }}>Không có lịch hẹn</Text>
          ) : (
            visibleAppointments.map((apt) => (
              <Card key={String(apt.id)} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(apt.customerName || 'KH').split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '700', fontSize: 16 }}>{apt.customerName}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          apt.status === 'pending'
                            ? styles.statusPending
                            : apt.status === 'confirmed'
                              ? styles.statusConfirmed
                              : apt.status === 'booked'
                                ? styles.statusBooked
                                : apt.status === 'cancelled'
                                  ? styles.statusCancelled
                                  : styles.statusCompleted,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            apt.status === 'pending'
                              ? styles.statusPendingText
                              : apt.status === 'confirmed'
                                ? styles.statusConfirmedText
                                : apt.status === 'booked'
                                  ? styles.statusBookedText
                                  : apt.status === 'cancelled'
                                    ? styles.statusCancelledText
                                    : styles.statusCompletedText,
                          ]}
                        >
                          {apt.status === 'pending'
                            ? 'Chờ xác nhận'
                            : apt.status === 'confirmed'
                              ? 'Đã xác nhận'
                              : apt.status === 'booked'
                                ? 'Khách đã tới'
                                : apt.status === 'cancelled'
                                  ? 'Đã hủy'
                                  : 'Hoàn thành'}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: '#6b7280' }}>{apt.customerPhone}</Text>
                    <Text style={{ marginTop: 6 }}>{apt.service}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
                      <Text style={{ color: '#6b7280' }}>{apt.date} • {apt.time}</Text>
                      {apt.price ? (
                        <View style={styles.priceBadge}><Text style={styles.priceText}>{Number(apt.price).toLocaleString('vi-VN')}đ</Text></View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ marginLeft: 8, alignItems: 'flex-end' }}>
                    {apt.status === 'pending' ? (
                      <TouchableOpacity
                        onPress={() => updateStatus(apt, 'Confirmed')}
                        style={[styles.actionBtn, savingId === String(apt.id) ? { opacity: 0.6 } : null]}
                        disabled={savingId === String(apt.id)}
                      >
                        <Text style={styles.actionConfirm}>Xác nhận</Text>
                      </TouchableOpacity>
                    ) : null}

                    {apt.status === 'confirmed' ? (
                      <>
                        <TouchableOpacity
                          onPress={() => updateStatus(apt, 'Booked')}
                          style={[styles.actionBtn, savingId === String(apt.id) ? { opacity: 0.6 } : null]}
                          disabled={savingId === String(apt.id)}
                        >
                          <Text style={styles.actionBooked}>Khách đã tới</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => updateStatus(apt, 'Cancelled')}
                          style={[styles.actionBtn, savingId === String(apt.id) ? { opacity: 0.6 } : null]}
                          disabled={savingId === String(apt.id)}
                        >
                          <Text style={styles.actionCancel}>Không tới</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}

                    {apt.status === 'booked' ? (
                      <TouchableOpacity
                        onPress={() => updateStatus(apt, 'Completed')}
                        style={[styles.actionBtn, savingId === String(apt.id) ? { opacity: 0.6 } : null]}
                        disabled={savingId === String(apt.id)}
                      >
                        <Text style={styles.actionComplete}>Hoàn thành</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  createToggleBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createToggleBtnText: { color: '#fff', fontWeight: '700' },
  createTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10, color: '#111827' },
  createLabel: { color: '#374151', fontWeight: '600', marginBottom: 6, marginTop: 8 },
  createRow: { flexDirection: 'row', alignItems: 'center' },
  createInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  createTextarea: { minHeight: 90, textAlignVertical: 'top' },
  submitCreateBtn: {
    marginTop: 12,
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitCreateBtnText: { color: '#fff', fontWeight: '700' },
  chipScroller: { marginBottom: 2 },
  metaChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  metaChipActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#60a5fa',
  },
  metaChipText: { color: '#111827', fontWeight: '600' },
  metaChipTextActive: { color: '#1d4ed8' },
  metaEmptyText: { color: '#6b7280', fontStyle: 'italic', paddingVertical: 6 },
  suggestionBox: { maxHeight: 220, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff', marginTop: 6, marginBottom: 8 },
  suggestionItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  suggestionText: { color: '#111827', fontWeight: '600' },
  suggestionSub: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  lookupBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fdf2f8',
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
  lookupBtnText: { color: '#be185d', fontWeight: '700' },
  lookupBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  lookupItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  lookupName: { color: '#111827', fontWeight: '700' },
  lookupPhone: { color: '#6b7280', marginTop: 2 },
  lookupAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
  },
  lookupActionText: { color: '#0e7490', fontWeight: '700' },
  sortWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  sortLabel: { color: '#374151', marginRight: 8, fontWeight: '600' },
  sortSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 170,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortSelectText: { color: '#111827', fontWeight: '600' },
  sortCaret: { color: '#6b7280', marginLeft: 8, fontSize: 10 },
  sortMenu: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#fff',
    marginBottom: 8,
    overflow: 'hidden',
  },
  sortOption: { paddingHorizontal: 12, paddingVertical: 10 },
  sortOptionActive: { backgroundColor: '#f3f4f6' },
  sortOptionText: { color: '#111827' },
  sortOptionTextActive: { fontWeight: '700' },
  search: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ec4899', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  statusText: { fontWeight: '700', fontSize: 12 },
  statusConfirmed: { backgroundColor: '#d1fae5' },
  statusConfirmedText: { color: '#059669' },
  statusPending: { backgroundColor: '#fff7ed' },
  statusPendingText: { color: '#b45309' },
  statusBooked: { backgroundColor: '#dbeafe' },
  statusBookedText: { color: '#1d4ed8' },
  statusCancelled: { backgroundColor: '#fee2e2' },
  statusCancelledText: { color: '#b91c1c' },
  statusCompleted: { backgroundColor: '#eef2ff' },
  statusCompletedText: { color: '#7c3aed' },
  priceBadge: { backgroundColor: '#fff0f6', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#fbcfe8' },
  priceText: { color: '#ec4899', fontWeight: '700' },
  actionBtn: { padding: 6 },
  actionConfirm: { color: '#10b981', fontWeight: '700' },
  actionBooked: { color: '#2563eb', fontWeight: '700' },
  actionCancel: { color: '#dc2626', fontWeight: '700' },
  actionComplete: { color: '#7c3aed', fontWeight: '700' },
});
