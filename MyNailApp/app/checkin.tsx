import React, { useEffect, useState, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native'
import { get, post, API_BASE } from '@/services/apiClient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'

function formatTime(dt: string | number | Date | undefined | null) {
  if (!dt) return '--'
  try { return new Date(dt as any).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '--' }
}

export default function CheckinPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [today, setToday] = useState<any>(null)
  const [week, setWeek] = useState<any[]>([])
  const [month, setMonth] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [todayRes, weekRes, monthRes] = await Promise.all([
        get('/staff/timelogs/today').catch(() => null),
        get('/staff/timelogs/week').catch(() => null),
        get('/staff/timelogs/month-summary').catch(() => null),
      ])
      // load stored user for debugging
      try {
        const raw = await AsyncStorage.getItem('@mynailapp:user')
        setCurrentUser(raw ? JSON.parse(raw) : null)
      } catch (e) { setCurrentUser(null) }
      setToday(todayRes?.today || null)
      setWeek((weekRes?.week || []).slice().reverse())
      setMonth(monthRes?.month || null)
    } catch (e) {
      setToday(null); setWeek([]); setMonth(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  // start/stop timer when unpairedIn changes
  useEffect(() => {
    // clear existing
    if (timerRef.current) {
      clearInterval(timerRef.current as any)
      timerRef.current = null
    }
    if (today && today.unpairedIn && today.unpairedIn.inAt) {
      const inAt = new Date(today.unpairedIn.inAt)
      setElapsedMs(Date.now() - inAt.getTime())
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - inAt.getTime())
      }, 1000)
    } else {
      setElapsedMs(0)
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current as any); timerRef.current = null } }
  }, [today])

  const onPress = async (type: 'IN' | 'OUT') => {
    // Prevent sending duplicate requests based on current UI state
    if (type === 'IN' && currentlyCheckedIn) {
      Alert.alert('Thông tin', 'Bạn đã check-in.');
      return
    }
    if (type === 'OUT' && !currentlyCheckedIn) {
      Alert.alert('Thông tin', 'Bạn chưa check-in.');
      return
    }

    setPosting(true)
    try {
      await post('/staff/timelogs', { type, note })
      setNote('')
      await loadAll()
    } catch (err) {
      // handle duplicate
      const e: any = err
      if (e && e.status === 409) {
        // refresh state from server to reflect the current timelog
        try { await loadAll() } catch (_) { /* ignore */ }
        Alert.alert('Thông tin', 'Thao tác đã được thực hiện trước đó. Trạng thái đã được cập nhật.')
      } else {
        Alert.alert('Lỗi', (e && e.message) || 'Không thể ghi log')
      }
    } finally { setPosting(false) }
  }

  if (loading) return (<View style={styles.container}><ActivityIndicator size="large" color="#8b5cf6" /></View>)

  const currentlyCheckedIn = today && today.unpairedIn

  function formatElapsed(ms: number) {
    if (!ms || ms <= 0) return '00:00:00'
    const total = Math.floor(ms / 1000)
    const hrs = Math.floor(total / 3600)
    const mins = Math.floor((total % 3600) / 60)
    const secs = total % 60
    return [hrs, mins, secs].map(n => String(n).padStart(2, '0')).join(':')
  }

  function formatHours(h: number | string | null | undefined) {
    const n = Number(h || 0)
    if (!Number.isFinite(n)) return '0'
    const rounded = Math.round(n * 10) / 10
    const s = rounded.toFixed(1)
    // remove trailing .0 for whole numbers
    return s.endsWith('.0') ? s.slice(0, -2) : s
  }

  function formatDateKey(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${day}/${m}/${y}`
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Trạng thái hiện tại</Text>
        {currentUser ? <Text style={{ color: '#fff', opacity: 0.9, marginTop: 6 }}> {currentUser?.email || currentUser?.name || JSON.stringify(currentUser)}</Text> : null}
        <Text style={styles.headerStatus}>{currentlyCheckedIn ? 'Đang làm việc' : 'Chưa check-in'}</Text>
        {currentlyCheckedIn ? (
          <>
            <Text style={{ color: '#fff', marginTop: 8 }}>⏱ Thời gian: {formatElapsed(elapsedMs)}</Text>
            <Text style={{ color: '#fff', opacity: 0.9, marginTop: 6 }}>⏰ Check-in: {today && today.unpairedIn ? new Date(today.unpairedIn.inAt).toLocaleTimeString() : ''}</Text>
            <TouchableOpacity style={[styles.headerBtn, { marginTop: 12 }]} onPress={() => onPress('OUT')} disabled={posting}>
              <Text style={styles.headerBtnText}>Check Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.headerBtn} onPress={() => onPress('IN')} disabled={posting}>
            <Text style={styles.headerBtnText}>Check In</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tháng này</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={[styles.statCard, styles.statCardBlue]}>
            <Text style={[styles.statValue, { color: '#0284c7' }]}>{month ? month.daysWorked : 0}</Text>
            <Text style={styles.statLabel}>Ngày công</Text>
          </View>
          <View style={[styles.statCard, styles.statCardOrange]}>
            <Text style={[styles.statValue, { color: '#ea580c' }]}>{month ? `${formatHours(month.totalHours)}h` : '0h'}</Text>
            <Text style={styles.statLabel}>Tổng giờ</Text>
          </View>
          <View style={[styles.statCard, styles.statCardIndigo]}>
            <Text style={[styles.statValue, { color: '#4f46e5' }]}>{month ? `${month.onTimePercent}%` : '0%'}</Text>
            <Text style={styles.statLabel}>Đúng giờ</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hôm nay</Text>
        <View style={styles.todayCardNew}>
          <View style={styles.todayHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16, color: '#059669' }}>📅</Text>
              <Text style={styles.todayDate}>{formatDateKey(new Date())}</Text>
            </View>
            {today && today.totalHours > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Hoàn thành</Text>
              </View>
            ) : null}
          </View>
          
          <View style={styles.todayBody}>
            <View style={{ flexDirection: 'row', width: '100%', marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.smallLabel}>Check-in</Text>
                <Text style={styles.timeLarge}>{today && today.pairs && today.pairs[0] ? formatTime(today.pairs[0].inAt) : (today && today.unpairedIn ? formatTime(today.unpairedIn.inAt) : '--')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.smallLabel}>Check-out</Text>
                <Text style={styles.timeLarge}>{today && today.pairs && today.pairs.length ? formatTime(today.pairs[today.pairs.length - 1].outAt) : '--'}</Text>
              </View>
            </View>

            <View style={styles.todaySeparator} />

            <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.smallLabel}>Tổng giờ làm</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.totalHoursLarge}>{today ? `${formatHours(today.totalHours)}h` : '--'}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tuần này</Text>
        {week.filter((d:any) => d.date !== formatDateKey(new Date())).map((d: any) => (
          <View key={d.date} style={styles.weekRow}>
            <View>
              <Text style={styles.weekDate}>{d.date}</Text>
              {d.pairs && d.pairs.length ? (
                <Text style={styles.weekTimes}>{formatTime(d.pairs[0].inAt)} - {formatTime(d.pairs[d.pairs.length - 1].outAt)}</Text>
              ) : <Text style={styles.weekTimes}>Không có</Text>}
            </View>
            <Text style={styles.weekHours}>{formatHours(d.totalHours)}h</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerCard: { margin: 12, borderRadius: 12, padding: 18, backgroundColor: '#a78bfa' },
  headerTitle: { color: '#fff', opacity: 0.9 },
  headerStatus: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 8 },
  headerBtn: { marginTop: 12, backgroundColor: '#fff', padding: 12, borderRadius: 10, alignItems: 'center' },
  headerBtnText: { color: '#8b5cf6', fontWeight: '800' },
  section: { paddingHorizontal: 12, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: '#1f2937' },
  
  todayCardNew: { backgroundColor: '#ecfdf5', padding: 16, borderRadius: 12 },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  todayDate: { fontWeight: '600', fontSize: 15, color: '#111827' },
  badge: { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  badgeText: { color: '#059669', fontWeight: '600', fontSize: 12 },
  todayBody: { width: '100%' },
  smallLabel: { color: '#4b5563', fontSize: 13 },
  timeLarge: { fontSize: 16, fontWeight: '600', marginTop: 4, color: '#111827' },
  todaySeparator: { height: 1, backgroundColor: '#a7f3d0', marginVertical: 14 },
  totalHoursLarge: { fontSize: 22, fontWeight: '700', color: '#059669' },
  locationText: { color: '#6b7280', fontSize: 13 },

  weekRow: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekDate: { fontWeight: '700' },
  weekTimes: { color: '#6b7280', marginTop: 4 },
  weekHours: { fontWeight: '800', color: '#6b21a8' },
  
  // Style mới cho phần Tháng này
  statCard: { padding: 14, borderRadius: 12, flex: 1, alignItems: 'center' },
  statCardBlue: { backgroundColor: '#e0f2fe' },
  statCardOrange: { backgroundColor: '#ffedd5' },
  statCardIndigo: { backgroundColor: '#e0e7ff' },
  statValue: { fontWeight: '900', fontSize: 20 },
  statLabel: { color: '#4b5563', marginTop: 6, fontSize: 12, fontWeight: '500' },
})