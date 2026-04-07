import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { get } from '@/services/apiClient';
import Card from '@/components/ui/card';
import Avatar from '@/components/ui/avatar';
import { BarChart, DonutLegend } from '@/components/ui/chart';
import Ratings from '@/components/ui/ratings';
import { subscribeStaffDataUpdates } from '../../lib/realtime';

const LIVE_REFRESH_MS = 5000;

export default function HomeScreen() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any[]>([])
  const [todaySchedule, setTodaySchedule] = useState<any[]>([])
  const [todayAppointments, setTodayAppointments] = useState<any[]>([])
  const [recentAppointments, setRecentAppointments] = useState<any[]>([])
  const [weekly, setWeekly] = useState<number[]>([])
  const [serviceDistribution, setServiceDistribution] = useState<any[]>([])
  const [ratings, setRatings] = useState<any[]>([])
  const [recentReviews, setRecentReviews] = useState<any[]>([])

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const [res, payrollRes] = await Promise.all([
        get('/staff/dashboard/summary'),
        get('/staff/payroll').catch(() => null),
      ])
      const data = res?.data || {}
      const s = data?.stats || {}
      const payrollCurrent = payrollRes?.data?.currentMonth || null
      const distributionRaw = Array.isArray(data?.serviceDistribution) ? data.serviceDistribution : []
      const totalDistributionCount = distributionRaw.reduce((sum: number, x: any) => sum + Number(x?.count || x?.value || 0), 0)
      const distribution = distributionRaw.map((x: any) => {
        const hasPercent = Number.isFinite(Number(x?.value)) && Number(x?.value) >= 0 && Number(x?.value) <= 100
        const percent = hasPercent
          ? Number(x.value)
          : (totalDistributionCount > 0 ? Math.round((Number(x?.count || 0) * 100) / totalDistributionCount) : 0)
        return {
          label: x?.label,
          value: percent,
          count: Number(x?.count || 0),
        }
      })

      setStats([
        {
          title: 'Tháng này',
          value: String(Number(payrollCurrent?.totalAppointments || s.monthlyCustomers || 0)),
          subtitle: 'Khách hẹn',
          color: ['#06b6d4', '#3b82f6'],
        },
        {
          title: 'Giờ làm tháng',
          value: `${Number(payrollCurrent?.totalHours || s.monthlyHours || 0)}h`,
          subtitle: 'Tổng giờ làm',
          color: ['#10b981', '#06b6d4'],
        },
        {
          title: 'Thu nhập tháng',
          value: `${Number(payrollCurrent?.totalIncome || s.monthIncome || 0).toLocaleString('vi-VN')}đ`,
          subtitle: 'Thu nhập',
          color: ['#8b5cf6', '#ec4899'],
        },
        { title: 'Review tuần', value: String(Number(s.weeklyReviews || 0)), subtitle: 'Đánh giá mới', color: ['#f59e0b', '#fb923c'] },
      ])
      setTodaySchedule(Array.isArray(data?.todaySchedule) ? data.todaySchedule : [])
      setTodayAppointments(Array.isArray(data?.todayAppointments) ? data.todayAppointments : [])
      setRecentAppointments(Array.isArray(data?.recentAppointments) ? data.recentAppointments : [])
      setWeekly(Array.isArray(data?.weekly) ? data.weekly.map((x: any) => Number(x.value || 0)) : [0, 0, 0, 0, 0, 0, 0])
      setServiceDistribution(distribution)
      setRatings(Array.isArray(data?.ratings) ? data.ratings : [])
      setRecentReviews(Array.isArray(data?.recentReviews) ? data.recentReviews : [])
    } catch {
      setStats([])
      setTodaySchedule([])
      setTodayAppointments([])
      setRecentAppointments([])
      setWeekly([0, 0, 0, 0, 0, 0, 0])
      setServiceDistribution([])
      setRatings([])
      setRecentReviews([])
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData(true)
      const unsubscribe = subscribeStaffDataUpdates(() => {
        loadData(false)
      })
      const timer = setInterval(() => {
        loadData(false)
      }, LIVE_REFRESH_MS)

      return () => {
        clearInterval(timer)
        unsubscribe()
      }
    }, [loadData]),
  )

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    )
  }

  const weeklyTotalAppointments = weekly.reduce((sum, value) => sum + Number(value || 0), 0)
  const totalServicesDone = serviceDistribution.reduce((sum: number, item: any) => sum + Number(item?.count || 0), 0)
  const topService = serviceDistribution.length > 0
    ? [...serviceDistribution].sort((a: any, b: any) => Number(b?.count || 0) - Number(a?.count || 0))[0]
    : null

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>

      <View style={styles.statsGrid}>
        {stats.map((s, i) => (
          <Card key={i} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: s.color[0] }]}>
              <Text style={styles.statIconText}>{s.value[0]}</Text>
            </View>
            <View style={{ marginTop: 6 }}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statSubtitle}>{s.subtitle}</Text>
            </View>
          </Card>
        ))}
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={styles.sectionTitle}>Lịch làm hôm nay</Text>
          {todaySchedule.length === 0 && <Text style={styles.emptyText}>Hôm nay chưa có ca làm.</Text>}
          {todaySchedule.map((shift, idx) => (
            <View key={`${shift.time}-${idx}`} style={styles.scheduleRow}>
              <Text style={[styles.shiftType, shift.type === 'leave' ? styles.shiftLeave : styles.shiftAssigned]}>
                {shift.type === 'leave' ? 'Nghỉ' : 'Làm việc'}
              </Text>
              <Text style={styles.shiftTime}>{shift.time}</Text>
              {shift.note ? <Text style={styles.shiftNote}>{shift.note}</Text> : null}
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={styles.sectionTitle}>Lịch hẹn hôm nay</Text>
          {todayAppointments.length === 0 && <Text style={styles.emptyText}>Không có lịch hẹn hôm nay.</Text>}
          {todayAppointments.map((apt) => (
            <View key={apt.id} style={styles.appRow}>
              <Avatar initials={apt.initials} />
              <View style={styles.appInfo}>
                <Text style={styles.appCustomer}>{apt.customer}</Text>
                <Text style={styles.appService}>{apt.service}</Text>
              </View>
              <Text style={styles.appTime}>{apt.time}</Text>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={styles.sectionTitle}>Số lịch hẹn 7 ngày gần nhất</Text>
          <BarChart
            data={['T2','T3','T4','T5','T6','T7','CN'].map((d, i) => ({ label: d, value: weekly[i] }))}
            height={140}
          />
          <Text style={styles.summaryText}>Tổng lịch hẹn 7 ngày qua: {weeklyTotalAppointments}</Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={styles.sectionTitle}>Danh sách lịch hẹn 7 ngày gần nhất</Text>
          {recentAppointments.length === 0 && <Text style={styles.emptyText}>Không có lịch hẹn trong 7 ngày qua.</Text>}
          {recentAppointments.slice(0, 8).map((apt) => (
            <View key={`${apt.id}-${apt.date}-${apt.time}`} style={styles.appRow}>
              <Avatar initials={apt.initials} />
              <View style={styles.appInfo}>
                <Text style={styles.appCustomer}>{apt.customer}</Text>
                <Text style={styles.appService}>{apt.service}</Text>
              </View>
              <View>
                <Text style={styles.appDate}>{apt.date}</Text>
                <Text style={styles.appTime}>{apt.time}</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={styles.sectionTitle}>Phân bố dịch vụ</Text>
          <Text style={styles.summaryText}>Tổng dịch vụ đã làm 7 ngày qua: {totalServicesDone}</Text>
          <Text style={styles.summaryText}>
            Dịch vụ được đặt nhiều nhất: {topService?.label || 'Chưa có'}
            {topService ? ` (${Number(topService.value || 0)}%)` : ''}
          </Text>
          <DonutLegend
            items={(serviceDistribution.length ? serviceDistribution : [
              { label: 'Khác', value: 0 },
            ]).map((x: any, i: number) => ({
              label: x.label,
              value: Number(x.value || 0),
              color: ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981'][i % 4],
            }))}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={styles.sectionTitle}>Phân bố đánh giá tuần qua</Text>
          <Ratings
            items={ratings.length ? ratings : [
              { rating: '5★', count: 0 },
              { rating: '4★', count: 0 },
              { rating: '3★', count: 0 },
              { rating: '2★', count: 0 },
              { rating: '1★', count: 0 },
            ]}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={styles.sectionTitle}>Đánh giá khách hàng tuần qua</Text>
          {recentReviews.length === 0 && <Text style={styles.emptyText}>Chưa có đánh giá trong tuần qua.</Text>}
          {recentReviews.map((rv: any) => (
            <View key={rv.id} style={styles.reviewRow}>
              <Text style={styles.reviewHead}>{rv.customerName} • {rv.serviceName}</Text>
              <Text style={styles.reviewMeta}>{'★'.repeat(Math.max(0, Number(rv.rating || 0)))} ({rv.rating}/5)</Text>
              <Text style={styles.reviewComment}>{rv.comment || 'Khách hàng không để lại bình luận.'}</Text>
            </View>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f8fafc', flex: 1 },
  statsGrid: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' as any },
  statCard: { width: '48%', padding: 12, marginBottom: 8 },
  statIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statIconText: { color: '#fff', fontWeight: '700' },
  statValue: { fontSize: 18, fontWeight: '700', marginTop: 6 },
  statSubtitle: { fontSize: 12, color: '#6b7280' },
  section: { paddingHorizontal: 12, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#6b7280' },
  summaryText: { color: '#4b5563', marginTop: 6, fontWeight: '600' },
  scheduleRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  shiftType: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  shiftLeave: { color: '#ef4444' },
  shiftAssigned: { color: '#10b981' },
  shiftTime: { fontWeight: '700', color: '#111827' },
  shiftNote: { color: '#6b7280', marginTop: 2, fontSize: 12 },
  appRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  appInfo: { flex: 1, marginLeft: 12 },
  appCustomer: { fontWeight: '700' },
  appService: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  appDate: { color: '#6b7280', fontSize: 12, textAlign: 'right' },
  appTime: { color: '#ec4899', fontWeight: '700' },
  reviewRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  reviewHead: { fontWeight: '700', color: '#111827' },
  reviewMeta: { marginTop: 3, color: '#f59e0b', fontWeight: '700' },
  reviewComment: { marginTop: 4, color: '#374151' },
  chartGrid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 12 },
  barColumn: { alignItems: 'center', flex: 1 },
  bar: { width: 14, backgroundColor: '#f472b6', borderRadius: 6 },
  barLabel: { fontSize: 12, color: '#6b7280', marginTop: 6 },
});
