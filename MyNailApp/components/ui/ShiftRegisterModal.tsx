import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '@/components/ui/Toast';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date;
  mode?: 'shift' | 'leave';
  onRegister?: (date: Date | undefined, payload: { time?: string; type?: string; note?: string }) => Promise<boolean> | boolean;
};

const SHIFT_TIMES: Record<string, string> = {
  morning: '08:00 - 12:00',
  afternoon: '13:00 - 17:00',
  evening: '17:00 - 21:00',
  full: '08:00 - 17:00',
};

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(value: string) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMonthGrid(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const firstDay = (first.getDay() + 6) % 7;
  const days: Array<number | null> = [];

  for (let i = 0; i < firstDay; i += 1) days.push(null);
  for (let d = 1; d <= last.getDate(); d += 1) days.push(d);

  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export default function ShiftRegisterModal({ isOpen, onClose, selectedDate, mode = 'shift', onRegister }: Props) {
  const label = selectedDate ? selectedDate.toLocaleDateString() : 'Chọn ngày';
  const [shiftType, setShiftType] = useState<keyof typeof SHIFT_TIMES>('morning');
  const [note, setNote] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const toast = useToast();

  useEffect(() => {
    if (!selectedDate) {
      setDateInput('');
      setCalendarMonth(new Date());
      return;
    }
    setDateInput(toYmd(selectedDate));
    setCalendarMonth(new Date(selectedDate));
  }, [selectedDate, isOpen]);

  const monthGrid = useMemo(() => getMonthGrid(calendarMonth), [calendarMonth]);

  const handleSubmit = async () => {
    let targetDate = selectedDate;
    if (mode === 'leave' && dateInput.trim()) {
      const parsed = parseYmd(dateInput.trim());
      if (!parsed) {
        toast.showError('Ngày không hợp lệ. Dùng định dạng YYYY-MM-DD');
        return;
      }
      targetDate = parsed;
    }

    const payload = mode === 'leave'
      ? { type: shiftType, note: note || 'Xin nghỉ ca' }
      : { time: SHIFT_TIMES[shiftType], type: shiftType, note: note || undefined };

    try {
      const result = onRegister ? await onRegister(targetDate, payload) : true;
      if (result === true) {
        toast.show(mode === 'leave' ? 'Gửi xin nghỉ thành công' : 'Đăng ký ca thành công');
        onClose();
        setNote('');
        setShiftType('morning');
        setDateInput('');
        setCalendarVisible(false);
      } else {
        toast.showError(mode === 'leave' ? 'Không thể gửi xin nghỉ cho ngày này' : 'Ca trùng với ca đã có');
      }
    } catch (error: any) {
      toast.showError(error?.message || (mode === 'leave' ? 'Lỗi khi gửi xin nghỉ' : 'Lỗi khi đăng ký'));
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{mode === 'leave' ? 'Xin nghỉ ca' : 'Đăng ký ca'}</Text>
          <Text style={styles.date}>{label}</Text>

          {mode === 'leave' ? (
            <>
              <Text style={styles.label}>Ngày xin nghỉ</Text>
              <View style={styles.dateRow}>
                <TextInput
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="2026-04-04"
                  style={[styles.dateInput, { flex: 1 }]}
                />
                <TouchableOpacity
                  style={styles.calendarBtn}
                  onPress={() => setCalendarVisible((v) => !v)}
                >
                  <Feather name="calendar" size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              {calendarVisible ? (
                <View style={styles.calendarBox}>
                  <View style={styles.calendarHead}>
                    <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                      <Text style={styles.calendarNav}>{'<'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.calendarTitle}>Tháng {calendarMonth.getMonth() + 1}/{calendarMonth.getFullYear()}</Text>
                    <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                      <Text style={styles.calendarNav}>{'>'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.weekHeader}>
                    {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w) => (
                      <Text key={w} style={styles.weekHeaderText}>{w}</Text>
                    ))}
                  </View>

                  <View style={styles.dayGrid}>
                    {monthGrid.map((d, idx) => {
                      if (!d) return <View key={`empty-${idx}`} style={styles.dayCell} />;
                      const picked = parseYmd(dateInput);
                      const isSelected = Boolean(
                        picked
                        && picked.getFullYear() === calendarMonth.getFullYear()
                        && picked.getMonth() === calendarMonth.getMonth()
                        && picked.getDate() === d,
                      );

                      return (
                        <TouchableOpacity
                          key={`day-${idx}`}
                          style={[styles.dayCell, isSelected ? styles.daySelected : null]}
                          onPress={() => {
                            setDateInput(toYmd(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), d)));
                            setCalendarVisible(false);
                          }}
                        >
                          <Text style={isSelected ? styles.daySelectedText : styles.dayText}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>{mode === 'leave' ? 'Chọn ca xin nghỉ' : 'Chọn ca làm việc'}</Text>
          <View style={styles.shiftGrid}>
            {Object.keys(SHIFT_TIMES).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.shiftOption, shiftType === k ? styles.shiftOptionActive : null]}
                onPress={() => setShiftType(k as keyof typeof SHIFT_TIMES)}
              >
                <View style={styles.shiftRow}>
                  <Feather name="clock" size={14} color={shiftType === k ? '#ec4899' : '#6b7280'} />
                  <Text style={shiftType === k ? styles.shiftTitle : styles.shiftTitleMuted}>
                    {k === 'morning' ? 'Ca sáng' : k === 'afternoon' ? 'Ca chiều' : k === 'evening' ? 'Ca tối' : 'Nghỉ cả ngày'}
                  </Text>
                </View>
                <Text style={shiftType === k ? styles.shiftTime : styles.shiftTimeMuted}>{SHIFT_TIMES[k]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{mode === 'leave' ? 'Lý do xin nghỉ' : 'Ghi chú (không bắt buộc)'}</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Thêm ghi chú..." multiline style={styles.textarea} />

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, styles.btnGhost, { marginRight: 8 }]}>
              <Text>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} style={[styles.btn, styles.btnPrimary]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{mode === 'leave' ? 'Gửi yêu cầu nghỉ' : 'Đăng ký ngay'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12, maxHeight: '95%' },
  title: { fontSize: 18, fontWeight: '700' },
  date: { color: '#6b7280', marginTop: 4 },
  label: { marginTop: 12, marginBottom: 8, fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 },
  calendarBtn: { marginLeft: 8, backgroundColor: '#ec4899', width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  calendarBox: { marginTop: 10, borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 10, padding: 10, backgroundColor: '#fafafa' },
  calendarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calendarTitle: { fontWeight: '700' },
  calendarNav: { fontSize: 18, fontWeight: '700', color: '#374151', paddingHorizontal: 6 },
  weekHeader: { flexDirection: 'row', marginBottom: 6 },
  weekHeaderText: { flex: 1, textAlign: 'center', fontSize: 12, color: '#64748b', fontWeight: '700' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayText: { color: '#111827' },
  daySelected: { backgroundColor: '#ec4899' },
  daySelectedText: { color: '#fff', fontWeight: '700' },
  shiftGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  shiftOption: { width: '48%', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  shiftOptionActive: { backgroundColor: '#fff0f6', borderColor: '#f9a8d4' },
  shiftRow: { flexDirection: 'row', alignItems: 'center' },
  shiftTitle: { fontWeight: '700', marginLeft: 8, color: '#ec4899' },
  shiftTitleMuted: { fontWeight: '700', marginLeft: 8, color: '#374151' },
  shiftTime: { color: '#6b7280', marginTop: 6 },
  shiftTimeMuted: { color: '#6b7280', marginTop: 6 },
  textarea: { minHeight: 80, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, textAlignVertical: 'top' },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  btnGhost: { backgroundColor: '#f3f4f6' },
  btnPrimary: { backgroundColor: '#ec4899' },
  actionRow: { flexDirection: 'row', marginTop: 12 },
});
