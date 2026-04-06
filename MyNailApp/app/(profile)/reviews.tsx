import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Card from '@/components/ui/card';
import { get } from '@/services/apiClient';

const PAGE_SIZE = 20;

export default function ReviewsPage() {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (off = 0, append = false) => {
    try {
      const res = await get(`/staff/dashboard/reviews?limit=${PAGE_SIZE}&offset=${off}`);
      const rows = Array.isArray(res?.data) ? res.data : [];
      const paging = res?.paging || {};
      const nextOffset = Number.isFinite(Number(paging?.nextOffset)) ? Number(paging.nextOffset) : off + rows.length;
      const more = typeof paging?.hasMore === 'boolean' ? paging.hasMore : rows.length >= PAGE_SIZE;
      setReviews((prev) => (append ? [...prev, ...rows] : rows));
      setOffset(nextOffset);
      setHasMore(Boolean(more));
    } catch (e) {
      setReviews([]);
      setOffset(0);
      setHasMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPage(0, false).finally(() => setLoading(false));
    }, [fetchPage])
  );

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try { await fetchPage(offset, true) } finally { setLoadingMore(false) }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 12 }}>
      <Card><Text style={styles.title}>Quản lý Review</Text><Text style={styles.subtitle}>Tất cả đánh giá cho các booking bạn thực hiện</Text></Card>

      {loading ? (<View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator /></View>) : reviews.length === 0 ? (<Card><Text style={styles.emptyText}>Chưa có đánh giá</Text></Card>) : (
        <Card>
          {reviews.map((r: any) => (
            <View key={r.id} style={styles.reviewItem}>
              <View style={styles.reviewTop}><Text style={styles.reviewCustomer}>{r.customerName || 'Khách hàng'}</Text><Text style={styles.reviewMeta}>{'★'.repeat(Math.max(0, Math.min(5, Math.round(Number(r.rating || 0))))) || '0★'}</Text></View>
              <Text style={styles.reviewService}>{r.serviceName || 'Dịch vụ'}</Text>
              <Text style={styles.reviewComment}>{r.comment || '(Không có nội dung)'}</Text>
              <Text style={styles.reviewDate}>{r.createdAt ? (new Date(r.createdAt)).toLocaleDateString('vi-VN') : ''}</Text>
            </View>
          ))}

          {hasMore ? (<TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore} disabled={loadingMore}>{loadingMore ? <ActivityIndicator color="#fff" /> : <Text style={styles.loadMoreText}>Tải thêm</Text>}</TouchableOpacity>) : null}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', flex: 1 },
  title: { fontWeight: '800', fontSize: 18 },
  subtitle: { color: '#6b7280', marginTop: 6 },
  emptyText: { color: '#6b7280', padding: 12 },
  reviewItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewCustomer: { fontWeight: '700', color: '#111827' },
  reviewMeta: { color: '#f59e0b', fontWeight: '700' },
  reviewService: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  reviewComment: { fontSize: 14, color: '#1f2937', marginTop: 6 },
  reviewDate: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  loadMoreBtn: { marginTop: 12, backgroundColor: '#8b5cf6', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  loadMoreText: { color: '#fff', fontWeight: '700' },
})
