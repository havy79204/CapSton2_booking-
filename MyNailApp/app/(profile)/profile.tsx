import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Card from '@/components/ui/card';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { get, post } from '@/services/apiClient';
import { subscribeStaffDataUpdates } from '@/lib/realtime';
import { API_BASE } from '@/services/apiClient';

const LIVE_REFRESH_MS = 5000;

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any | null>(null);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [latestReviews, setLatestReviews] = useState<any[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<any[]>([])
  const [todayAppointments, setTodayAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const raw = await AsyncStorage.getItem('@mynailapp:user');
      if (raw) {
        try {
          const localUser = JSON.parse(raw);
          if (localUser && typeof localUser === 'object') setProfile(localUser);
        } catch {}
      }

      const meRes = await get('/auth/me');
      const serverUser = meRes?.data || null;
      if (serverUser) {
        setProfile(serverUser);
        await AsyncStorage.setItem('@mynailapp:user', JSON.stringify(serverUser));
      }

      const summaryRes = await get('/staff/dashboard/summary');
      setSummaryStats(summaryRes?.data?.stats || null);
      setTodaySchedule(Array.isArray(summaryRes?.data?.todaySchedule) ? summaryRes.data.todaySchedule : [])
      setTodayAppointments(Array.isArray(summaryRes?.data?.todayAppointments) ? summaryRes.data.todayAppointments : [])

      // no-op: specialties expected on /auth/me for staff users

      const reviewRes = await get('/staff/dashboard/reviews?limit=3');
      setLatestReviews(Array.isArray(reviewRes?.data) ? reviewRes.data : []);
    } catch {
      setLatestReviews([]);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile(true);
      const unsubscribe = subscribeStaffDataUpdates(() => {
        loadProfile(false);
      });
      const timer = setInterval(() => {
        loadProfile(false);
      }, LIVE_REFRESH_MS);

      return () => {
        clearInterval(timer);
        unsubscribe();
      };
    }, [loadProfile]),
  );

  async function handleLogout() {
    try {
      try { await post('/auth/logout', {}) } catch {}
      await AsyncStorage.removeItem('@mynailapp:token');
      await AsyncStorage.removeItem('@mynailapp:user');
      try { (globalThis as any).__notifyAuthChanged?.(false) } catch {}
      router.replace('/login');
    } catch {
      Alert.alert('Loi', 'Khong the dang xuat');
    }
  }

  const initials = useMemo(() => {
    const name = String(profile?.name || '').trim();
    if (!name) return 'U';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
  }, [profile?.name]);

  function absoluteAvatarUrl(raw?: string | null) {
    if (!raw) return ''
    if (/^https?:\/\//i.test(String(raw))) return String(raw)
    const base = String(API_BASE || '').replace(/\/api\/?$/i, '')
    if (!base) return String(raw)
    if (String(raw).startsWith('/')) return `${base}${raw}`
    return `${base}/${raw}`
  }

  function onViewAllReviews() { router.push('/reviews') }

  // Normalize summary numbers to avoid mixing nullish and logical operators in JSX
  const servicesCount = summaryStats ? (summaryStats.totalServicesAll ?? summaryStats.totalServices ?? summaryStats.weeklyServices ?? 0) : 0
  const incomeNumber = summaryStats ? (summaryStats.monthIncome ?? summaryStats.weekIncome ?? summaryStats.weeklyRevenue ?? 0) : 0
  const incomeText = `${Number(incomeNumber || 0).toLocaleString()}đ`
  const ratingText = summaryStats ? Number(summaryStats.avgRatingAll ?? summaryStats.avgRating ?? 0).toFixed(1) : '0.0'

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.profileCard}>
        <LinearGradient colors={["#ff7ab6", "#7c3aed"]} style={styles.profileGradient}>
          <View style={styles.profileTop}>
            <View style={styles.avatarWrapLarge}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: absoluteAvatarUrl(profile.avatarUrl) }} style={styles.avatarLarge} />
              ) : (
                <View style={styles.initialsLarge}><Text style={styles.initialsText}>{initials}</Text></View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.nameLarge}>{profile?.name || 'Người dùng'}</Text>
              <Text style={styles.roleLarge}>{profile?.role || 'Khách hàng'}</Text>
              <Text style={styles.contactLarge}>{profile?.phone || profile?.email || ''}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/edit-profile')} style={styles.editBtn}><Feather name="edit-2" size={18} color="#fff" /></TouchableOpacity>
          </View>
          <View style={styles.profileStatsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statNumber}>{servicesCount}</Text>
              <Text style={styles.statLabel}>Dịch vụ</Text>
            </View>
            <View style={styles.statTileCenter}>
              <Text style={styles.statNumberLarge}>{incomeText}</Text>
              <Text style={styles.statLabel}>Thu nhập</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statNumber}>{ratingText}</Text>
              <Text style={styles.statLabel}>Đánh giá</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={styles.cardTitle}>Thông tin liên hệ</Text>
          <View style={styles.infoRow}><Feather name="mail" size={18} color="#6b7280"/><Text style={styles.infoText}>{profile?.email || ''}</Text></View>
          <View style={styles.infoRow}><Feather name="phone" size={18} color="#6b7280"/><Text style={styles.infoText}>{profile?.phone || ''}</Text></View>
          <View style={styles.infoRow}><Feather name="calendar" size={18} color="#6b7280"/><Text style={styles.infoText}>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : ''}</Text></View>
        </Card>
      </View>

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={styles.cardTitle}>Dịch vụ chuyên môn</Text>
          <View style={{ marginTop: 8, flexWrap: 'wrap', flexDirection: 'row' }}>
            {((Array.isArray(profile?.specialties) && profile.specialties.length) ? profile.specialties : (Array.isArray(summaryStats?.serviceDistribution) ? summaryStats.serviceDistribution.map((s: any) => s.label) : [])).length ? (
              ((Array.isArray(profile?.specialties) && profile.specialties.length) ? profile.specialties : (Array.isArray(summaryStats?.serviceDistribution) ? summaryStats.serviceDistribution.map((s: any) => s.label) : [])).map((p: any, i: number) => (
                <View key={String(i)} style={styles.skillPill}><Text style={{ color: '#be185d', fontWeight: '700' }}>{String(p)}</Text></View>
              ))
            ) : (
              <Text style={{ color: '#6b7280' }}>Chưa có dịch vụ chuyên môn</Text>
            )}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={styles.cardTitle}>Review mới nhất</Text>
          <View style={{ marginTop: 8 }}>
            {latestReviews.length ? latestReviews.map((r, idx) => (
              <View key={String(idx)} style={{ paddingVertical: 10, borderBottomWidth: idx === latestReviews.length - 1 ? 0 : 1, borderColor: '#f3f4f6' }}>
                <Text style={{ fontWeight: '700' }}>{r?.customerName || r?.author || 'Khách'}</Text>
                <Text style={{ color: '#6b7280', marginTop: 6 }}>{r?.comment || ''}</Text>
                <Text style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>{r?.serviceName || ''} • {r?.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</Text>
              </View>
            )) : (
              <Text style={{ color: '#6b7280' }}>Chưa có đánh giá</Text>
            )}
          </View>
        </Card>
      </View>

      

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={styles.cardTitle}>Cài đặt & Hỗ trợ</Text>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/edit-profile')}>
            <View style={styles.menuLeft}><Feather name="edit-2" size={18} color="#111"/><Text style={styles.menuText}>Chỉnh sửa thông tin</Text></View>
            <Feather name="chevron-right" size={18} color="#6b7280"/>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/change-password')}>
            <View style={styles.menuLeft}><Feather name="lock" size={18} color="#111"/><Text style={styles.menuText}>Đổi mật khẩu</Text></View>
            <Feather name="chevron-right" size={18} color="#6b7280"/>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/notifications')}>
            <View style={styles.menuLeft}><Feather name="bell" size={18} color="#111"/><Text style={styles.menuText}>Thông báo</Text></View>
            <Feather name="chevron-right" size={18} color="#6b7280"/>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/settings' as any)}>
            <View style={styles.menuLeft}><Feather name="settings" size={18} color="#111"/><Text style={styles.menuText}>Cài đặt</Text></View>
            <Feather name="chevron-right" size={18} color="#6b7280"/>
          </TouchableOpacity>
        </Card>
      </View>

      <View style={{ marginTop: 18, marginBottom: 32 }}>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}><Text style={styles.logoutText}>Đăng xuất</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  profileCard: { borderRadius: 14, overflow: 'hidden' },
  profileGradient: { padding: 16 },
  profileTop: { flexDirection: 'row', alignItems: 'center' },
  avatarWrapLarge: { width: 84, height: 84 },
  avatarLarge: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  initialsLarge: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  nameLarge: { color: '#fff', fontWeight: '800', fontSize: 20 },
  roleLarge: { color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  contactLarge: { color: 'rgba(255,255,255,0.9)', marginTop: 4, fontSize: 12 },
  editBtn: { padding: 8 },
  profileStatsRow: { flexDirection: 'row', marginTop: 14, alignItems: 'center' },
  statTile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', padding: 10, borderRadius: 10, alignItems: 'center', marginRight: 8 },
  statTileCenter: { flex: 1.4, backgroundColor: 'rgba(255,255,255,0.18)', padding: 12, borderRadius: 12, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '800', color: '#fff' },
  statNumberLarge: { fontSize: 18, fontWeight: '900', color: '#fff' },
  statLabel: { color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  skillPill: { backgroundColor: '#fff0f6', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18, marginRight: 8, marginBottom: 8 },
  cardTitle: { fontWeight: '800', fontSize: 16, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff' , marginBottom: 8, paddingLeft: 12},
  infoText: { marginLeft: 12, color: '#111' },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  menuText: { marginLeft: 12, fontWeight: '700' },
  logoutBtn: { backgroundColor: '#fee2e2', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  logoutText: { color: '#ef4444', fontWeight: '800' },
  cardTitleSmall: { fontWeight: '700', marginBottom: 8 },
})
