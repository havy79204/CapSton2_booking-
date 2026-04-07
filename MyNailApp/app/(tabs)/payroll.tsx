import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Card from '@/components/ui/card';
import { get } from '@/services/apiClient';
import { subscribeStaffDataUpdates } from '../../lib/realtime';

const LIVE_REFRESH_MS = 5000;
const CHART_PIXELS = 140

type MonthMetrics = {
  monthKey: string;
  totalAppointments: number;
  totalHours: number;
  workDays: number;
  totalRevenue: number;
  commission: number;
  tips: number;
  totalIncome: number;
  baseSalary: number;
};

type PayrollResponse = {
  currentMonth: MonthMetrics;
  history: MonthMetrics[];
  chartSeries?: { monthKey: string; totalIncome: number }[];
  chartSeriesSimple?: { label: string; value: number }[];
  tipLogs: { date: string; amount: number; note: string }[];
  tiers: { lowerBound: number; upperBound: number; rate: number }[];
};

const EMPTY_MONTH: MonthMetrics = {
  monthKey: '',
  totalAppointments: 0,
  totalHours: 0,
  workDays: 0,
  totalRevenue: 0,
  commission: 0,
  tips: 0,
  totalIncome: 0,
  baseSalary: 0,
};

function formatMonthLabel(monthKey: unknown) {
  if (typeof monthKey !== 'string' || monthKey.length < 7) return '--/--';
  return monthKey.slice(5).replace('-', '/');
}

function formatCompactVnd(value: number) {
  const n = Math.max(0, Number(value || 0));
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

export default function PayrollScreen() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [barsWidth, setBarsWidth] = useState(0)
  const isWeb = Platform.OS === 'web'
  const [tab, setTab] = useState<'overview' | 'history' | 'tips'>('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PayrollResponse | null>(null);

  const loadPayroll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await get('/staff/payroll');
      setData(res?.data || null);
    } catch {
      setData(null);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPayroll(true);
      const unsubscribe = subscribeStaffDataUpdates(() => {
        loadPayroll(false);
      });
      const timer = setInterval(() => {
        loadPayroll(false);
      }, LIVE_REFRESH_MS);

      return () => {
        clearInterval(timer);
        unsubscribe();
      };
    }, [loadPayroll]),
  );

  const current = data?.currentMonth || EMPTY_MONTH;
  const history = data?.history || [];
  const chartSeries = data?.chartSeries || [];
  const tipLogs = data?.tipLogs || [];

  const chartData = useMemo(() => {
    // Accept multiple backend shapes: chartSeries [{monthKey,totalIncome}],
    // chartSeriesSimple [{label,value}], or fallback to history+current.
    let rawSource: any[] = []
    if (Array.isArray(chartSeries) && chartSeries.length > 0) rawSource = chartSeries
    else if (data?.chartSeriesSimple && Array.isArray(data.chartSeriesSimple) && data.chartSeriesSimple.length > 0) rawSource = data.chartSeriesSimple
    else if (history.length > 0) rawSource = [...history].reverse().concat([current]).slice(-6)
    else rawSource = [current]

    // Normalize to {monthKey, totalIncome}
    const source = rawSource.map((s, idx) => ({
      monthKey: String(s.monthKey ?? s.label ?? (s[0] || '')).slice(0, 7),
      totalIncome: Number(s.totalIncome ?? s.value ?? s.totalIncome ?? 0),
    }))

    const maxVal = Math.max(1, ...source.map((m) => Number(m.totalIncome || 0)))
    // Use a fixed pixel chart height for reliable web rendering
    const CHART_PIXELS = 140

    return source.map((m, idx) => {
      const value = Number(m.totalIncome || 0)
      const ratio = value / maxVal
      const pixelHeight = Math.max(6, Math.round(ratio * CHART_PIXELS))
      return {
        key: `${m.monthKey || 'unknown'}-${idx}`,
        monthLabel: formatMonthLabel(m.monthKey),
        value,
        ratio,
        pixelHeight,
      }
    })
  }, [history, current, chartSeries, data]);

  const chartMax = useMemo(
    () => Math.max(1, ...chartData.map((x) => Number(x.value || 0))),
    [chartData],
  );

  const yTicks = useMemo(() => {
    const steps = [1, 0.75, 0.5, 0.25, 0];
    return steps.map((ratio) => ({
      ratio,
      value: Math.round(chartMax * ratio),
    }));
  }, [chartMax]);

  return (
    <ScrollView style={{ padding: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 12 }}>Quản lý lương</Text>

      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <TouchableOpacity style={[styles.tab, tab === 'overview' ? styles.tabActive : null]} onPress={() => setTab('overview')}>
          <Text style={tab === 'overview' ? styles.tabTextActive : styles.tabText}>Tổng quan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'history' ? styles.tabActive : null]} onPress={() => setTab('history')}>
          <Text style={tab === 'history' ? styles.tabTextActive : styles.tabText}>Lịch sử</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'tips' ? styles.tabActive : null]} onPress={() => setTab('tips')}>
          <Text style={tab === 'tips' ? styles.tabTextActive : styles.tabText}>Tip</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Card><ActivityIndicator /></Card>
      ) : tab === 'overview' ? (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <Card style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardLabel}>Tổng thu nhập tháng</Text>
              <Text style={styles.cardValue}>{Number(current.totalIncome || 0).toLocaleString('vi-VN')}đ</Text>
            </Card>
            <Card style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.cardLabel}>Hoa hồng</Text>
              <Text style={styles.cardValue}>{Number(current.commission || 0).toLocaleString('vi-VN')}đ</Text>
            </Card>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <Card style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardLabel}>Lương cứng</Text>
              <Text style={styles.cardValue}>{Number(current.baseSalary || 0).toLocaleString('vi-VN')}đ</Text>
            </Card>
            <Card style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.cardLabel}>Tip tháng</Text>
              <Text style={styles.cardValue}>{Number(current.tips || 0).toLocaleString('vi-VN')}đ</Text>
            </Card>
          </View>

          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Hiệu suất 6 tháng gần nhất</Text>
            <View style={styles.performanceWrap}>
              <View style={styles.yAxisCol}>
                {yTicks.map((tick) => (
                  <Text key={`tick-${tick.ratio}`} style={styles.yAxisLabel}>{formatCompactVnd(tick.value)}</Text>
                ))}
              </View>

              <View style={styles.chartCol}>
                {yTicks.map((tick) => (
                  <View key={`grid-${tick.ratio}`} style={[styles.chartGridLine, { top: `${(1 - tick.ratio) * 100}%` }]} />
                ))}

                <View style={styles.chartBarsRow} onLayout={(e) => setBarsWidth(e.nativeEvent.layout.width)}>
                  {chartData.map((c, idx) => {
                    const mouseHandlers = isWeb ? ({ onMouseEnter: () => setSelectedKey(c.key), onMouseLeave: () => setSelectedKey(null) } as any) : {}
                    return (
                      <TouchableOpacity
                        key={c.key}
                        activeOpacity={0.8}
                        onPress={() => setSelectedKey(c.key)}
                        {...mouseHandlers}
                        style={{ width: `${100 / chartData.length - 3}%`, alignItems: 'center' }}
                      >
                        <View style={[styles.bar, { height: c.pixelHeight }]} />
                        <Text style={styles.barLabel}>{c.monthLabel}</Text>
                      </TouchableOpacity>
                    )
                  })}

                  {/* tooltip for hover/selection */}
                  {selectedKey && (() => {
                    const selIdx = chartData.findIndex((x) => x.key === selectedKey)
                    if (selIdx === -1 || barsWidth <= 0) return null
                    const barCenter = Math.round((selIdx + 0.5) * (barsWidth / chartData.length))
                    const sel = chartData[selIdx]
                    const tooltipLeft = Math.max(8, Math.min(barsWidth - 120, barCenter - 60))
                    const tooltipTop = Math.max(8, CHART_PIXELS - (sel.pixelHeight || 6) - 40)
                    return (
                      <View style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop, pointerEvents: 'none' }]}> 
                        <Text style={styles.tooltipText}>{Number(sel.value || 0).toLocaleString('vi-VN')}đ</Text>
                      </View>
                    )
                  })()}
                </View>
              </View>
            </View>
          </Card>

          {/* debug block removed */}

          <Card>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Thống kê làm việc tháng</Text>
            <Text style={styles.statLine}>Số lịch hẹn: {current.totalAppointments}</Text>
            <Text style={styles.statLine}>Số giờ làm: {Number(current.totalHours || 0).toFixed(1)} giờ</Text>
            <Text style={styles.statLine}>Số ngày làm: {current.workDays} ngày</Text>
            <Text style={styles.statLine}>Tổng doanh thu: {Number(current.totalRevenue || 0).toLocaleString('vi-VN')}đ</Text>
          </Card>
        </>
      ) : tab === 'history' ? (
        history.length === 0 ? (
          <Card><Text style={{ color: '#6b7280' }}>Chưa có dữ liệu lương lịch sử.</Text></Card>
        ) : (
          history.map((m, idx) => (
            <Card key={`${m.monthKey || 'unknown'}-${idx}`} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700' }}>Tháng {formatMonthLabel(m.monthKey)}</Text>
                <Text style={{ fontWeight: '700', color: '#ec4899' }}>{Number(m.totalIncome || 0).toLocaleString('vi-VN')}đ</Text>
              </View>
              <Text style={styles.historyLine}>Lương cứng: {Number(m.baseSalary || 0).toLocaleString('vi-VN')}đ</Text>
              <Text style={styles.historyLine}>Hoa hồng: {Number(m.commission || 0).toLocaleString('vi-VN')}đ</Text>
              <Text style={styles.historyLine}>Tip: {Number(m.tips || 0).toLocaleString('vi-VN')}đ</Text>
              <Text style={styles.historyLine}>Doanh thu tạo ra: {Number(m.totalRevenue || 0).toLocaleString('vi-VN')}đ</Text>
            </Card>
          ))
        )
      ) : (
        tipLogs.length === 0 ? (
          <Card><Text style={{ color: '#6b7280' }}>Không có dữ liệu tip.</Text></Card>
        ) : (
          tipLogs.map((t, idx) => (
            <Card key={`${t.date}-${idx}`} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700' }}>{t.date}</Text>
                <Text style={{ color: '#10b981', fontWeight: '700' }}>+{Number(t.amount || 0).toLocaleString('vi-VN')}đ</Text>
              </View>
              <Text style={{ color: '#6b7280', marginTop: 4 }}>{t.note || 'Tip từ khách hàng'}</Text>
            </Card>
          ))
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tab: { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center', backgroundColor: '#fff', marginRight: 8 },
  tabActive: { backgroundColor: '#f0e6ff' },
  tabText: { color: '#6b7280', fontWeight: '600' },
  tabTextActive: { color: '#7c3aed', fontWeight: '700' },
  cardLabel: { color: '#6b7280', marginBottom: 6 },
  cardValue: { fontSize: 18, fontWeight: '800' },
  statLine: { marginBottom: 6, color: '#374151' },
  historyLine: { color: '#374151', marginTop: 4 },
  performanceWrap: { flexDirection: 'row', height: 190 },
  yAxisCol: { width: 44, justifyContent: 'space-between', paddingBottom: 18, paddingTop: 2 },
  yAxisLabel: { fontSize: 10, color: '#6b7280' },
  chartCol: { flex: 1, position: 'relative', justifyContent: 'flex-end', paddingBottom: 18 },
  
  chartGridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#e5e7eb', zIndex: 0 },
  chartBarsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: '100%' },
  bar: { width: '100%', backgroundColor: '#ec4899', borderRadius: 6, zIndex: 2, minHeight: 6, alignSelf: 'stretch' },
    barLabel: { fontSize: 11, color: '#6b7280', marginTop: 6 },
    point: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', borderWidth: 3, borderColor: '#ec4899' },
    tooltip: { position: 'absolute', backgroundColor: '#111827', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, zIndex: 10 },
    tooltipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
