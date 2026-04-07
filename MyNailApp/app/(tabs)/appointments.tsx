import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { del, get, post, put } from '@/services/apiClient';
import Card from '@/components/ui/card';
import { Feather } from '@expo/vector-icons';
import { useToast } from '@/components/ui/Toast';
import { subscribeStaffDataUpdates } from '../../lib/realtime';

const LIVE_REFRESH_MS = 5000;

type MetaCustomer = { id: string; name: string; phone: string };
type MetaService = { id: string; name: string; price: number; durationMinutes: number };

export default function AppointmentsScreen() {
  const toast = useToast();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'done'>('all');

  const [metaCustomers, setMetaCustomers] = useState<MetaCustomer[]>([]);
  const [metaServices, setMetaServices] = useState<MetaService[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');

  const loadAppointments = useCallback(async () => {
    try {
      const res = await get('/staff/appointments');
      const list = Array.isArray(res?.data) ? res.data : [];
      const mapped = list.map((a: any) => {
        const s = String(a.status || '').toLowerCase();
        const mappedStatus = s.includes('complete') || s === 'done'
          ? 'done'
          : s.includes('booked') || s.includes('confirm')
            ? 'confirmed'
            : 'pending';

        return {
          id: a.id,
          date: a.date,
          time: a.time,
          customerName: a.customer,
          customerPhone: a.customerPhone || '',
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

  const loadMeta = useCallback(async () => {
    try {
      const res = await get('/staff/appointments/meta');
      const data = res?.data || {};
      setMetaCustomers(Array.isArray(data.customers) ? data.customers : []);
      setMetaServices(Array.isArray(data.services) ? data.services : []);
    } catch {
      setMetaCustomers([]);
      setMetaServices([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
      loadMeta();

      const unsubscribe = subscribeStaffDataUpdates(() => {
        loadAppointments();
      });

      const timer = setInterval(() => {
        loadAppointments();
      }, LIVE_REFRESH_MS);

      return () => {
        clearInterval(timer);
        unsubscribe();
      };
    }, [loadAppointments, loadMeta]),
  );

  const today = new Date().toISOString().split('T')[0];
  const todayCount = appointments.filter((a) => a.date === today).length;
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
  const pendingCount = appointments.filter((a) => a.status === 'pending').length;

  const filtered = appointments.filter((a) => {
    if (filter === 'confirmed' && a.status !== 'confirmed') return false;
    if (filter === 'pending' && a.status !== 'pending') return false;
    if (filter === 'done' && a.status !== 'done') return false;
    if (!q) return true;
    const s = `${a.customerName || ''} ${a.customerPhone || ''}`;
    return s.toLowerCase().includes(q.toLowerCase());
  });

  const shownCustomers = useMemo(() => {
    const k = customerQuery.trim().toLowerCase();
    if (!k) return metaCustomers.slice(0, 20);
    return metaCustomers
      .filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(k))
      .slice(0, 20);
  }, [metaCustomers, customerQuery]);

  function resetCreateForm() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${day}`);
    setTime('09:00');
    setNotes('');
    setSelectedCustomerId('');
    setSelectedServiceIds([]);
    setCustomerQuery('');
  }

  function toggleService(serviceId: string) {
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((id) => id !== serviceId);
      }
      return [...prev, serviceId];
    });
  }

  const selectedServiceMeta = useMemo(
    () => metaServices.filter((s) => selectedServiceIds.includes(s.id)),
    [metaServices, selectedServiceIds],
  );

  const selectedServicesTotalPrice = useMemo(
    () => selectedServiceMeta.reduce((sum, s) => sum + Number(s.price || 0), 0),
    [selectedServiceMeta],
  );

  const selectedServicesTotalDuration = useMemo(
    () => selectedServiceMeta.reduce((sum, s) => sum + Number(s.durationMinutes || 0), 0),
    [selectedServiceMeta],
  );

  async function handleCreateAppointment() {
    if (!selectedCustomerId || selectedServiceIds.length === 0 || !date || !time) {
      toast.showError('Vui lòng chọn khách, dịch vụ, ngày và giờ hẹn.');
      return;
    }

    setSaving(true);
    try {
      await post('/staff/appointments', {
        customerUserId: selectedCustomerId,
        serviceIds: selectedServiceIds,
        date,
        time,
        notes,
        status: 'Booked',
      });

      setCreateOpen(false);
      resetCreateForm();
      await loadAppointments();
    } catch (error: any) {
      toast.showError(error?.message || 'Không thể tạo lịch hẹn. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '800' }}>Lịch hẹn</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#ec4899', padding: 10, borderRadius: 20 }}
            onPress={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
          <Card style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontWeight: '700' }}>{confirmedCount}</Text>
            <Text style={{ color: '#6b7280' }}>Đã xác nhận</Text>
          </Card>
          <Card style={{ flex: 1, marginHorizontal: 4 }}>
            <Text style={{ fontWeight: '700' }}>{pendingCount}</Text>
            <Text style={{ color: '#6b7280' }}>Chờ xác nhận</Text>
          </Card>
          <Card style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontWeight: '700' }}>{todayCount}</Text>
            <Text style={{ color: '#6b7280' }}>Hôm nay</Text>
          </Card>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 8, marginBottom: 8 }}>
          {(['all', 'confirmed', 'pending', 'done'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 20,
                backgroundColor: filter === f ? '#f0e6ff' : '#fff',
                marginRight: 8,
              }}
            >
              <Text style={filter === f ? { color: '#7c3aed', fontWeight: '700' } : {}}>
                {f === 'all' ? 'Tất cả' : f === 'confirmed' ? 'Đã xác nhận' : f === 'pending' ? 'Chờ' : 'Hoàn thành'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput placeholder="Tìm theo tên hoặc SĐT..." value={q} onChangeText={setQ} style={styles.search} />

        <View style={{ marginTop: 12 }}>
          {filtered.length === 0 ? (
            <Text style={{ color: '#6b7280' }}>Không có lịch hẹn</Text>
          ) : (
            filtered.map((apt) => (
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
                      <View style={[styles.statusBadge, apt.status === 'confirmed' ? styles.statusConfirmed : apt.status === 'pending' ? styles.statusPending : styles.statusDone]}>
                        <Text style={[styles.statusText, apt.status === 'confirmed' ? styles.statusConfirmedText : apt.status === 'pending' ? styles.statusPendingText : styles.statusDoneText]}>
                          {apt.status === 'confirmed' ? 'Đã xác nhận' : apt.status === 'pending' ? 'Chờ' : 'Hoàn thành'}
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
                        onPress={async () => {
                          try {
                            await put(`/staff/appointments/${apt.id}`, { status: 'Booked' });
                            await loadAppointments();
                          } catch {
                            // ignore
                          }
                        }}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionConfirm}>Xác nhận</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            await del(`/staff/appointments/${apt.id}`);
                            await loadAppointments();
                          } catch {
                            // ignore
                          }
                        }}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionDelete}>Xóa</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Thêm lịch hẹn</Text>

            <Text style={styles.label}>Tìm khách hàng</Text>
            <TextInput
              style={styles.input}
              placeholder="Nhập tên hoặc SĐT"
              value={customerQuery}
              onChangeText={setCustomerQuery}
            />

            <ScrollView style={{ maxHeight: 150 }}>
              {shownCustomers.map((c) => {
                const active = c.id === selectedCustomerId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.pickItem, active ? styles.pickItemActive : null]}
                    onPress={() => setSelectedCustomerId(c.id)}
                  >
                    <Text style={active ? styles.pickTextActive : styles.pickText}>{c.name}</Text>
                    <Text style={styles.pickSub}>{c.phone}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Dịch vụ</Text>
            <ScrollView style={{ maxHeight: 130 }}>
              {metaServices.map((s) => {
                const active = selectedServiceIds.includes(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.pickItem, active ? styles.pickItemActive : null]}
                    onPress={() => toggleService(s.id)}
                  >
                    <Text style={active ? styles.pickTextActive : styles.pickText}>{s.name}</Text>
                    <Text style={styles.pickSub}>{Number(s.price || 0).toLocaleString('vi-VN')}đ • {s.durationMinutes || 30} phút</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.pickSub}>
              Đã chọn {selectedServiceIds.length} dịch vụ • Tổng {selectedServicesTotalPrice.toLocaleString('vi-VN')}đ • {selectedServicesTotalDuration} phút
            </Text>

            <Text style={styles.label}>Ngày (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-04-04" />

            <Text style={styles.label}>Giờ (HH:mm)</Text>
            <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="09:00" />

            <Text style={styles.label}>Ghi chú</Text>
            <TextInput style={[styles.input, { minHeight: 70 }]} value={notes} onChangeText={setNotes} multiline placeholder="Ghi chú thêm" />

            <View style={styles.sheetActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setCreateOpen(false)}>
                <Text>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={handleCreateAppointment}
                disabled={saving || !selectedCustomerId || selectedServiceIds.length === 0 || !date || !time}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Tạo lịch hẹn</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  search: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ec4899', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  statusText: { fontWeight: '700', fontSize: 12 },
  statusConfirmed: { backgroundColor: '#d1fae5' },
  statusConfirmedText: { color: '#059669' },
  statusPending: { backgroundColor: '#fff7ed' },
  statusPendingText: { color: '#b45309' },
  statusDone: { backgroundColor: '#eef2ff' },
  statusDoneText: { color: '#7c3aed' },
  priceBadge: { backgroundColor: '#fff0f6', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#fbcfe8' },
  priceText: { color: '#ec4899', fontWeight: '700' },
  actionBtn: { padding: 6 },
  actionConfirm: { color: '#10b981', fontWeight: '700' },
  actionDelete: { color: '#ef4444', fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', padding: 14, borderTopLeftRadius: 14, borderTopRightRadius: 14, maxHeight: '92%' },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  label: { marginTop: 8, marginBottom: 6, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  pickItem: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 6 },
  pickItemActive: { borderColor: '#ec4899', backgroundColor: '#fff0f6' },
  pickText: { color: '#111827', fontWeight: '600' },
  pickTextActive: { color: '#be185d', fontWeight: '700' },
  pickSub: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  sheetActions: { marginTop: 12, flexDirection: 'row' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnGhost: { backgroundColor: '#f3f4f6', marginRight: 8 },
  btnPrimary: { backgroundColor: '#ec4899' },
});
