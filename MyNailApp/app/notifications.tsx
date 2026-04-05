import React, { useCallback, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { get, post } from './api'
import { subscribeStaffDataUpdates } from '../lib/realtime'

const LIVE_REFRESH_MS = 5000

type NotifyItem = {
  id: string
  title: string
  body: string
  createdAt?: string
  group?: string
  category?: string
  severity?: string
  read?: boolean
}

function groupLabel(group?: string) {
  if (group === 'appointment') return 'Lịch hẹn'
  if (group === 'schedule') return 'Ca làm & Chấm công'
  if (group === 'feedback') return 'Tương tác & Phản hồi'
  return 'Thông báo khác'
}

function formatDateTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('vi-VN')
}

export default function NotificationsScreen() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<NotifyItem[]>([])

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const res = await get('/staff/notifications')
      setItems(Array.isArray(res?.data) ? res.data : [])
    } catch {
      setItems([])
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

  async function markAllRead() {
    try {
      await post('/staff/notifications/read', {})
      await loadData()
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Thông báo</Text>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={styles.markRead}>Đánh dấu đã đọc</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 28 }}
        ListEmptyComponent={<Text style={styles.emptyText}>Chưa có thông báo</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, item.read ? styles.cardRead : null]}>
            <Text style={styles.group}>{groupLabel(item.group)}</Text>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemBody}>{item.body}</Text>
            <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  headerRow: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  markRead: { color: '#2563eb', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  cardRead: { opacity: 0.8 },
  group: { fontSize: 12, color: '#7c3aed', fontWeight: '700', marginBottom: 4 },
  itemTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 6 },
  itemBody: { fontSize: 14, color: '#374151' },
  time: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 30 },
})
