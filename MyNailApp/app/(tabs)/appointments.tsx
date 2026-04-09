import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { get, put } from '@/services/apiClient';
import Card from '@/components/ui/card';
import { useToast } from '@/components/ui/Toast';
import { subscribeStaffDataUpdates } from '../../lib/realtime';

const LIVE_REFRESH_MS = 5000;

export default function AppointmentsScreen() {
  const toast = useToast();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'done'>('all');

  const [saving, setSaving] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      loadAppointments();

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
    }, [loadAppointments]),
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

  return (
    <>
      <ScrollView style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '800' }}>Lịch hẹn</Text>
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
                    {apt.status === 'confirmed' ? (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            setSaving(true);
                            await put(`/staff/appointments/${apt.id}`, { status: 'Completed' });
                            await loadAppointments();
                          } catch (error: any) {
                            toast.showError(error?.message || 'Không thể cập nhật trạng thái lịch hẹn.');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        style={[styles.actionBtn, saving ? { opacity: 0.6 } : null]}
                        disabled={saving}
                      >
                        <Text style={styles.actionConfirm}>Hoàn thành</Text>
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
});
