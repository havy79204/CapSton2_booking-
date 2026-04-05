import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Card from '@/components/ui/card';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { get, post } from './api';
import { subscribeStaffDataUpdates } from '../lib/realtime';

const LIVE_REFRESH_MS = 5000;

type ProfileData = {
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  avatarUrl?: string;
  createdAt?: string;
  roleKey?: string;
  status?: string;
  specialties?: string[];
};

type StaffReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt?: string | null;
  bookingId?: string | null;
  customerName?: string;
  serviceName?: string;
};

const REVIEW_PAGE_SIZE = 20;

function roleToPosition(roleKey?: string) {
  if (String(roleKey || '') === '1') return 'Admin';
  if (String(roleKey || '') === '2') return 'Staff';
  if (String(roleKey || '') === '3') return 'Customer';
  return 'User';
}

function formatJoinDate(createdAt?: string) {
  if (!createdAt) return 'Chua cap nhat';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return 'Chua cap nhat';
  return d.toLocaleDateString('vi-VN');
}

function formatReviewDate(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN');
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [latestReviews, setLatestReviews] = useState<StaffReview[]>([]);
  const [allReviews, setAllReviews] = useState<StaffReview[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewsOffset, setReviewsOffset] = useState(0);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [loadingAllReviews, setLoadingAllReviews] = useState(false);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const raw = await AsyncStorage.getItem('@mynailapp:user');
      if (raw) {
        try {
          const localUser = JSON.parse(raw);
          if (localUser && typeof localUser === 'object') setProfile(localUser);
        } catch {
          // ignore
        }
      }

      const meRes = await get('/auth/me');
      const serverUser = meRes?.data || null;
      if (serverUser) {
        setProfile(serverUser);
        await AsyncStorage.setItem('@mynailapp:user', JSON.stringify(serverUser));
      }

      const summaryRes = await get('/staff/dashboard/summary');
      setSummaryStats(summaryRes?.data?.stats || null);

      const reviewRes = await get('/staff/dashboard/reviews?limit=5');
      setLatestReviews(Array.isArray(reviewRes?.data) ? reviewRes.data : []);
      if (!showAllReviews) {
        setShowAllReviews(false);
        setAllReviews([]);
        setReviewsOffset(0);
        setHasMoreReviews(false);
      }
    } catch {
      setLatestReviews([]);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [showAllReviews]);

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
      try {
        await post('/auth/logout', {});
      } catch {
        // ignore
      }
      await AsyncStorage.removeItem('@mynailapp:token');
      await AsyncStorage.removeItem('@mynailapp:user');
      try {
        // @ts-ignore
        globalThis.__notifyAuthChanged && globalThis.__notifyAuthChanged(false);
      } catch {
        // ignore
      }
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

  const ui = {
    name: profile?.name || 'Chua cap nhat',
    position: roleToPosition(profile?.roleKey),
    email: profile?.email || 'Chua cap nhat',
    phone: profile?.phone || 'Chua cap nhat',
    address: profile?.address || 'Chua cap nhat',
    joinDate: formatJoinDate(profile?.createdAt),
    specialties: Array.isArray(profile?.specialties) ? profile?.specialties : [],
  };

  const stats = {
    totalServices: Number(summaryStats?.totalServicesAll || summaryStats?.weeklyServices || 0),
    totalIncome: Number(summaryStats?.monthIncome || 0),
    avgRating: Number(summaryStats?.avgRatingAll || summaryStats?.avgRating || 0),
    totalReviews: Number(summaryStats?.totalReviewsAll || summaryStats?.totalReviews || 0),
  };

  async function fetchReviewPage(offset: number, append: boolean) {
    const reviewRes = await get(`/staff/dashboard/reviews?limit=${REVIEW_PAGE_SIZE}&offset=${offset}`);
    const rows = Array.isArray(reviewRes?.data) ? reviewRes.data : [];
    const paging = reviewRes?.paging || {};
    const nextOffset = Number.isFinite(Number(paging?.nextOffset))
      ? Number(paging.nextOffset)
      : offset + rows.length;
    const hasMore = typeof paging?.hasMore === 'boolean'
      ? paging.hasMore
      : rows.length >= REVIEW_PAGE_SIZE;

    setAllReviews((prev) => (append ? [...prev, ...rows] : rows));
    setReviewsOffset(nextOffset);
    setHasMoreReviews(Boolean(hasMore));
  }

  async function onViewAllReviews() {
    if (showAllReviews) {
      setShowAllReviews(false);
      setAllReviews([]);
      setReviewsOffset(0);
      setHasMoreReviews(false);
      return;
    }

    setShowAllReviews(true);
    setLoadingAllReviews(true);
    try {
      await fetchReviewPage(0, false);
    } catch {
      setAllReviews([]);
      setReviewsOffset(0);
      setHasMoreReviews(false);
    } finally {
      setLoadingAllReviews(false);
    }
  }

  async function onLoadMoreReviews() {
    if (loadingMoreReviews || !hasMoreReviews) return;

    setLoadingMoreReviews(true);
    try {
      await fetchReviewPage(reviewsOffset, true);
    } finally {
      setLoadingMoreReviews(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 12 }}>
      <LinearGradient colors={['#fb7185', '#8b5cf6']} style={styles.headerGradient}>
        <View style={styles.headerRow}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: String(profile.avatarUrl) }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}><Text style={styles.avatarText}>{initials}</Text></View>
          )}
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.name}>{ui.name}</Text>
            <Text style={styles.position}>{ui.position}</Text>
            <View style={styles.ratingRow}>
              <Feather name="star" size={14} color="#fff" />
              <Text style={styles.ratingText}>{stats.avgRating.toFixed(1)} ({stats.totalReviews} reviews)</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}><Text style={styles.statBig}>{stats.totalServices}</Text><Text style={styles.statLabel}>Dich vu</Text></View>
          <View style={styles.statBox}><Text style={styles.statBig}>${(stats.totalIncome / 1000).toFixed(1)}K</Text><Text style={styles.statLabel}>Thu nhap</Text></View>
          <View style={styles.statBox}><Text style={styles.statBig}>{stats.avgRating.toFixed(1)}</Text><Text style={styles.statLabel}>Danh gia</Text></View>
        </View>
      </LinearGradient>

      <Card>
        <Text style={styles.sectionTitle}>Thong tin lien he</Text>
        <View style={styles.infoRow}><Feather name="mail" size={18} color="#6b7280" /><View style={{ marginLeft: 10 }}><Text style={styles.infoLabel}>Email</Text><Text style={styles.infoValue}>{ui.email}</Text></View></View>
        <View style={styles.infoRow}><Feather name="phone" size={18} color="#6b7280" /><View style={{ marginLeft: 10 }}><Text style={styles.infoLabel}>So dien thoai</Text><Text style={styles.infoValue}>{ui.phone}</Text></View></View>
        <View style={styles.infoRow}><Feather name="map-pin" size={18} color="#6b7280" /><View style={{ marginLeft: 10 }}><Text style={styles.infoLabel}>Dia chi</Text><Text style={styles.infoValue}>{ui.address}</Text></View></View>
        <View style={styles.infoRow}><Feather name="calendar" size={18} color="#6b7280" /><View style={{ marginLeft: 10 }}><Text style={styles.infoLabel}>Ngay tham gia</Text><Text style={styles.infoValue}>{ui.joinDate}</Text></View></View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Dich vu chuyen mon</Text>
        <View style={styles.tagsRow}>
          {ui.specialties.length > 0 ? (
            ui.specialties.map((s) => (
              <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>
            ))
          ) : (
            <Text style={styles.emptyText}>Chua co du lieu chuyen mon</Text>
          )}
        </View>
      </Card>

      <Card>
        <View style={styles.reviewHeader}>
          <Text style={styles.sectionTitle}>Review moi nhat</Text>
          <TouchableOpacity onPress={onViewAllReviews}>
            <Text style={styles.viewAllText}>{showAllReviews ? 'Thu gon' : 'Xem tat ca'}</Text>
          </TouchableOpacity>
        </View>
        {latestReviews.length > 0 ? (
          latestReviews.map((rv) => (
            <View key={String(rv.id)} style={styles.reviewItem}>
              <View style={styles.reviewTop}>
                <Text style={styles.reviewCustomer}>{rv.customerName || 'Khach hang'}</Text>
                <Text style={styles.reviewMeta}>{'★'.repeat(Math.max(0, Math.min(5, Math.round(Number(rv.rating || 0))))) || '0★'}</Text>
              </View>
              <Text style={styles.reviewService}>{rv.serviceName || 'Dich vu'}</Text>
              <Text style={styles.reviewComment}>{rv.comment || '(Khong co noi dung)'}</Text>
              <Text style={styles.reviewDate}>{formatReviewDate(rv.createdAt)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Chua co review gan day</Text>
        )}

        {showAllReviews ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionSubTitle}>Tat ca danh gia</Text>
            {loadingAllReviews ? (
              <View style={styles.loadStateWrap}>
                <ActivityIndicator size="small" color="#8b5cf6" />
                <Text style={styles.loadStateText}>Dang tai danh gia...</Text>
              </View>
            ) : allReviews.length > 0 ? (
              allReviews.map((rv) => (
                <View key={`all-${String(rv.id)}`} style={styles.reviewItem}>
                  <View style={styles.reviewTop}>
                    <Text style={styles.reviewCustomer}>{rv.customerName || 'Khach hang'}</Text>
                    <Text style={styles.reviewMeta}>{'★'.repeat(Math.max(0, Math.min(5, Math.round(Number(rv.rating || 0))))) || '0★'}</Text>
                  </View>
                  <Text style={styles.reviewService}>{rv.serviceName || 'Dich vu'}</Text>
                  <Text style={styles.reviewComment}>{rv.comment || '(Khong co noi dung)'}</Text>
                  <Text style={styles.reviewDate}>{formatReviewDate(rv.createdAt)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Khong co danh gia</Text>
            )}

            {allReviews.length > 0 && hasMoreReviews ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={onLoadMoreReviews} disabled={loadingMoreReviews}>
                {loadingMoreReviews ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.loadMoreText}>Tai them 20 danh gia</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Cai dat & Ho tro</Text>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/edit-profile')}><Feather name="edit-2" size={18} color="#6b7280" /><Text style={styles.menuText}>Chinh sua thong tin</Text></TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/change-password')}><Feather name="lock" size={18} color="#6b7280" /><Text style={styles.menuText}>Doi mat khau</Text></TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/notifications')}><Feather name="bell" size={18} color="#6b7280" /><Text style={styles.menuText}>Thong bao</Text></TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}><Feather name="settings" size={18} color="#6b7280" /><Text style={styles.menuText}>Cai dat</Text></TouchableOpacity>
      </Card>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}><Text style={{ color: '#ef4444', fontWeight: '700' }}>Dang xuat</Text></TouchableOpacity>
      <View style={{ alignItems: 'center', marginTop: 12 }}><Text style={{ color: '#9ca3af', fontSize: 12 }}>NIOM&CE Staff v1.0.0</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  headerGradient: { borderRadius: 12, padding: 16, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarText: { color: '#fff', fontWeight: '800' },
  name: { color: '#fff', fontSize: 18, fontWeight: '800' },
  position: { color: '#fde68a', opacity: 0.95 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  ratingText: { color: '#fff', marginLeft: 6 },
  statsRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  statBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', padding: 10, borderRadius: 10, alignItems: 'center' },
  statBig: { color: '#fff', fontWeight: '800', fontSize: 18 },
  statLabel: { color: '#fff', opacity: 0.9, fontSize: 12 },
  sectionTitle: { fontWeight: '800', marginBottom: 8 },
  sectionSubTitle: { fontWeight: '700', color: '#374151', marginBottom: 6 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewAllText: { color: '#2563eb', fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: '#6b7280' },
  infoValue: { fontSize: 14, color: '#111827' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#fde8ff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  tagText: { color: '#7c3aed', fontWeight: '700' },
  emptyText: { color: '#6b7280', fontStyle: 'italic' },
  reviewItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  reviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewCustomer: { fontWeight: '700', color: '#111827' },
  reviewMeta: { color: '#f59e0b', fontWeight: '700' },
  reviewService: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  reviewComment: { fontSize: 14, color: '#1f2937', marginTop: 6 },
  reviewDate: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  loadStateWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadStateText: { color: '#6b7280' },
  loadMoreBtn: { marginTop: 12, backgroundColor: '#8b5cf6', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  loadMoreText: { color: '#ffffff', fontWeight: '700' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  menuText: { fontWeight: '600' },
  logoutBtn: { marginTop: 12, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: '#fff' },
});
