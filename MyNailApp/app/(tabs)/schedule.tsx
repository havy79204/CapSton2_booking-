import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Colors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { del, get, post } from '@/services/apiClient';
import { subscribeStaffDataUpdates } from '../../lib/realtime';

import Card from '@/components/ui/card';
import ShiftRegisterModal from '@/components/ui/ShiftRegisterModal';

const LIVE_REFRESH_MS = 5000;

function getDayStatus(shifts: any[] = []) {
  if (!Array.isArray(shifts) || shifts.length === 0) return { label: 'Chưa có lịch', tone: 'none' as const };
  if (shifts.some((s) => s?.type === 'leave')) return { label: 'Nghỉ', tone: 'leave' as const };
  if (shifts.some((s) => s?.type === 'leave-request')) return { label: 'Đơn nghỉ đã gửi', tone: 'leave-request' as const };
  if (shifts.some((s) => s?.type === 'assigned')) return { label: 'Đi làm', tone: 'assigned' as const };
  return { label: 'Có lịch', tone: 'none' as const };
}

function formatWeekRange(dates: Date[]) {
  const a = dates[0];
  const b = dates[dates.length - 1];
  return `${a.getDate()}/${a.getMonth() + 1} - ${b.getDate()}/${b.getMonth() + 1}`;
}

export default function ScheduleScreen() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [scheduleData, setScheduleData] = useState<any[]>([]);

  const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  const getWeekDates = useCallback(() => {
    const dates: Date[] = [];
    const start = new Date(currentDate);
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    for (let i = 0; i < 7; i++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      dates.push(dd);
    }
    return dates;
  }, [currentDate]);

  const weekDates = useMemo(() => getWeekDates(), [getWeekDates]);

  function toLocalIso(d: Date | undefined) {
    if (!d) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const loadSchedule = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const weekStart = toLocalIso(weekDates[0]);
      const res = await get(`/staff/schedule?weekStart=${weekStart}`);
      // If server returns 304 Not Modified, keep previously-loaded schedule data
      if (res?.notModified) {
        return;
      }

      if (Array.isArray(res?.data)) {
        setScheduleData(res.data);
      }
    } catch {
      // preserve existing scheduleData on transient failures
      // console.warn can be added for debugging
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [weekDates]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule(true);
      const unsubscribe = subscribeStaffDataUpdates(() => {
        loadSchedule(false);
      });
      const timer = setInterval(() => {
        loadSchedule(false);
      }, LIVE_REFRESH_MS);

      return () => {
        clearInterval(timer);
        unsubscribe();
      };
    }, [loadSchedule]),
  );

  useEffect(() => {
    loadSchedule(true);
  }, [loadSchedule]);

  const getScheduleForDate = (date: Date) => {
    const s = toLocalIso(date);
    return scheduleData.find((x) => x.date === s);
  };

  const navigateWeek = (dir: 'prev' | 'next') => {
    const nd = new Date(currentDate);
    nd.setDate(nd.getDate() + (dir === 'next' ? 7 : -7));
    setCurrentDate(nd);
  };

  const onRegister = (date: Date) => {
    setSelectedDate(date);
    setShowModal(true);
  };

  const handleRegisterSubmit = async (date: Date | undefined, payload: { note?: string; type?: string; isRecurring?: number; endDate?: string | null }) => {
    const dateStr = date ? toLocalIso(date) : toLocalIso(new Date());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = date ? new Date(date) : new Date();
    start.setHours(0, 0, 0, 0);

    if (start.getTime() < today.getTime()) {
      throw new Error('StartDate không được là ngày trong quá khứ');
    }

    if (payload.endDate) {
      const end = new Date(`${payload.endDate}T00:00:00`);
      if (Number.isNaN(end.getTime())) {
        throw new Error('EndDate không hợp lệ');
      }
      if (end.getTime() < start.getTime()) {
        throw new Error('EndDate phải lớn hơn hoặc bằng StartDate');
      }
    }

    // Removed previous restriction that required requests to be submitted 7 days in advance.

    try {
      await post('/staff/schedule/shifts', {
        date: dateStr,
        note: payload.note || '',
        shiftType: payload.type || 'full',
        isRecurring: payload.isRecurring || 0,
        endDate: payload.endDate || null,
      });
      await loadSchedule();
      return true;
    } catch (error: any) {
      throw new Error(error?.message || 'Không thể gửi yêu cầu nghỉ. Vui lòng thử lại.');
    }
  };

  const handleDeleteLeaveRequest = async (leaveItem: any, date: Date) => {
    const offScheduleId = leaveItem?.meta?.offScheduleId;
    if (!offScheduleId) return;

    Alert.alert('Xóa đơn xin nghỉ', 'Bạn chắc chắn muốn hủy đơn xin nghỉ đang chờ duyệt?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await del('/staff/schedule/shifts', {
              offScheduleId,
              date: toLocalIso(date),
              shiftType: leaveItem?.meta?.leaveType || 'full',
            });
            await loadSchedule(false);
          } catch (error: any) {
            Alert.alert('Không thể xóa', error?.message || 'Không thể xóa đơn xin nghỉ.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.page, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.page, { backgroundColor: Colors.light.background }]} contentContainerStyle={{ padding: 12 }}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Feather name="calendar" size={28} color="#ec4899" style={{ marginRight: 10 }} />
          <View>
            <Text style={styles.title}>Lịch làm việc</Text>
            <Text style={styles.subtitle}>Xin nghỉ theo ngày trong tuần</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.plus} onPress={() => { setSelectedDate(new Date()); setShowModal(true); }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>+</Text>
        </TouchableOpacity>
      </View>

      <Card style={{ marginBottom: 12 }}>
        <View style={styles.weekHeader}>
          <TouchableOpacity onPress={() => navigateWeek('prev')} style={styles.navButton}><Text>{'<'}</Text></TouchableOpacity>
          <Text style={styles.weekTitle}>Tuần này • {formatWeekRange(weekDates)}</Text>
          <TouchableOpacity onPress={() => navigateWeek('next')} style={styles.navButton}><Text>{'>'}</Text></TouchableOpacity>
        </View>

        <View>
          {weekDates.map((date, idx) => {
            const schedule = getScheduleForDate(date);
            const dayStatus = getDayStatus(schedule?.shifts || []);
            const today = date.toDateString() === new Date().toDateString();
            return (
              <View key={idx} style={[styles.dayCard, today ? styles.todayCard : null]}>
                <View style={styles.dayRow}>
                  <View style={[styles.dateBox, today ? styles.dateBoxToday : null]}>
                    <Text style={[styles.dayShort, today ? { color: '#fff' } : null]}>{weekDays[idx]}</Text>
                    <Text style={[styles.dayNum, today ? { color: '#fff' } : null]}>{date.getDate()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayName}>{date.toLocaleDateString('vi-VN', { weekday: 'long' })}</Text>
                    <Text style={styles.subText}>{schedule?.shifts?.length ? `${schedule.shifts.length} mục lịch` : 'Chưa có lịch'}</Text>
                    <View style={[
                      styles.dayStatusBadge,
                      dayStatus.tone === 'assigned' ? styles.badgeAssigned : null,
                      dayStatus.tone === 'leave-request' ? styles.badgeLeaveRequest : null,
                      dayStatus.tone === 'leave' ? styles.badgeLeave : null,
                    ]}>
                      <Text style={[
                        styles.dayStatusText,
                        dayStatus.tone === 'assigned' ? styles.badgeAssignedText : null,
                        dayStatus.tone === 'leave-request' ? styles.badgeLeaveRequestText : null,
                        dayStatus.tone === 'leave' ? styles.badgeLeaveText : null,
                      ]}>{dayStatus.label}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.registerBtn} onPress={() => onRegister(date)}>
                      <Text style={{ color: '#fff' }}>Xin nghỉ</Text>
                  </TouchableOpacity>
                </View>

                {schedule?.shifts && schedule.shifts.length > 0 ? (
                  <View style={styles.shiftsGrid}>
                    {schedule.shifts.map((sh: any, i: number) => (
                      <View key={i} style={[
                        styles.shiftItem,
                        sh.type === 'leave-request' ? styles.leaveRequest : null,
                        sh.type === 'leave' ? styles.leave : null,
                        sh.type === 'assigned' ? styles.assigned : null,
                      ]}>
                        <Feather name={sh.type === 'leave' || sh.type === 'leave-request' ? 'x-circle' : 'clock'} size={16} color="#6b7280" />
                        <View style={{ marginLeft: 8 }}>
                          <Text style={styles.shiftTime}>{sh.type === 'leave-request' ? 'Đang chờ duyệt' : sh.type === 'leave' ? 'Nghỉ' : sh.time}</Text>
                          <Text style={styles.shiftNote}>{sh?.meta?.note || (sh.type === 'assigned' ? 'Ca làm việc' : 'Xin nghỉ')}</Text>
                        </View>
                        {sh.type === 'leave-request' && sh?.meta?.offScheduleId && String(sh?.meta?.status || '').toLowerCase() === 'pending' ? (
                          <TouchableOpacity
                            style={styles.deleteLeaveBtn}
                            onPress={() => handleDeleteLeaveRequest(sh, date)}
                          >
                            <Text style={styles.deleteLeaveBtnText}>Xóa</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyBox}><Text style={styles.emptyText}>Chưa có ca làm việc</Text></View>
                )}
              </View>
            );
          })}
        </View>
      </Card>

      <ShiftRegisterModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        selectedDate={selectedDate}
        mode="leave"
        onRegister={handleRegisterSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: 'transparent', flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#6b7280' },
  plus: { backgroundColor: '#ec4899', padding: 12, borderRadius: 20 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navButton: { padding: 8, borderRadius: 8 },
  weekTitle: { fontWeight: '700' },
  dayCard: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e6e9ef', marginBottom: 10, backgroundColor: '#fff' },
  todayCard: { borderColor: '#ec4899', backgroundColor: '#fff6fb' },
  dayRow: { flexDirection: 'row', alignItems: 'center' },
  dateBox: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  dateBoxToday: { backgroundColor: '#ec4899' },
  dayShort: { fontSize: 12 },
  dayNum: { fontSize: 20, fontWeight: '700' },
  dayName: { fontWeight: '700' },
  subText: { color: '#6b7280' },
  dayStatusBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', backgroundColor: '#f3f4f6' },
  dayStatusText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  badgeAssigned: { backgroundColor: '#dcfce7' },
  badgeAssignedText: { color: '#15803d' },
  badgeLeaveRequest: { backgroundColor: '#fef3c7' },
  badgeLeaveRequestText: { color: '#b45309' },
  badgeLeave: { backgroundColor: '#fee2e2' },
  badgeLeaveText: { color: '#b91c1c' },
  registerBtn: { backgroundColor: '#ec4899', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  shiftsGrid: { marginTop: 10 },
  shiftItem: { padding: 10, borderRadius: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  deleteLeaveBtn: { marginLeft: 'auto', backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  deleteLeaveBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  assigned: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  leaveRequest: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
  leave: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
  shiftTime: { fontWeight: '700' },
  shiftNote: { color: '#6b7280' },
  emptyBox: { marginTop: 10, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' },
  emptyText: { color: '#6b7280' },
});
