import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Alert, Linking, Modal, Pressable, ActivityIndicator } from 'react-native'
// Lazy import expo modules at runtime to avoid bundler errors when packages are missing
import { get, del, API_BASE } from '@/services/apiClient'
import { Feather } from '@expo/vector-icons'

type TryOnItem = {
  tryOnId: string | number;
  sourceImageUrl?: string | null;
  templateImageUrl?: string | null;
  resultImageUrl?: string | null;
  designId?: string | null;
  params?: any;
  createdAt?: string | null;
}

export default function TryOnHistory() {
  const [list, setList] = useState<TryOnItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalImage, setModalImage] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await get('/customer/ai-tryon/history')
      // Backend returns { data: [...] } or array; normalize
      const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
      setList(items)
    } catch (err) {
      console.warn('Failed to load tryon history', err)
      setList([])
    } finally {
      setLoading(false)
    }
  }

  function openImage(url?: string | null) {
    if (!url) return
    const s = String(url)
    const final = s.startsWith('http') ? s : (s.startsWith('/') ? `${API_BASE}${s}` : `${API_BASE}/${s}`)
    Linking.openURL(final).catch(() => Alert.alert('Lỗi', 'Không thể mở hình ảnh'))
  }

  async function saveImageToDevice(url?: string | null) {
    if (!url) {
      Alert.alert('Lỗi', 'Không có URL hình ảnh')
      return
    }
    const s = String(url)
    const final = s.startsWith('http') ? s : (s.startsWith('/') ? `${API_BASE}${s}` : `${API_BASE}/${s}`)
    try {
      setDownloading(true)
      // dynamic imports so the app doesn't crash if the packages are not installed
      let FileSystem: any = null
      let MediaLibrary: any = null
      try {
        // Prefer the legacy module to avoid deprecation warnings in newer SDKs
        try {
          const fsLegacy = await import('expo-file-system/legacy')
          const fsLegacyAny = fsLegacy as any
          FileSystem = fsLegacyAny && (fsLegacyAny.default || fsLegacyAny)
        } catch (e) {
          const fs = await import('expo-file-system')
          const fsAny = fs as any
          FileSystem = fsAny && (fsAny.default || fsAny)
        }
      } catch (e) {
        // ignore
      }
      try {
        const ml = await import('expo-media-library')
        const mlAny = ml as any
        MediaLibrary = mlAny && (mlAny.default || mlAny)
      } catch (e) {
        // ignore
      }

      if (!FileSystem || !MediaLibrary) {
        Alert.alert('Thiếu dependency', 'Vui lòng cài đặt expo-file-system và expo-media-library trong dự án:\n\nexpo install expo-file-system expo-media-library')
        setDownloading(false)
        return
      }

      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Quyền bị từ chối', 'Cần quyền truy cập thư viện để lưu ảnh')
        setDownloading(false)
        return
      }

      const parts = final.split('/')
      const rawName = parts[parts.length - 1] || `tryon-${Date.now()}.jpg`
      const name = `${Date.now()}-${rawName.split('?')[0]}`
      const fileUri = `${FileSystem.cacheDirectory}${name}`

      // Try multiple download approaches for different expo versions
      let asset: any = null
      if (FileSystem && typeof FileSystem.downloadAsync === 'function') {
        // Use legacy downloadAsync when available (preferred to avoid newer API migration)
        const res = await FileSystem.downloadAsync(final, fileUri)
        asset = await MediaLibrary.createAssetAsync(res.uri)
      } else {
        // Fallback: fetch binary, convert to base64, write file, then create asset
        const resp = await fetch(final)
        if (!resp.ok) throw new Error('Failed to fetch image')
        const arr = await resp.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(arr)
        const len = bytes.byteLength
        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
        let b64: string
        if (typeof (globalThis as any).btoa === 'function') {
          b64 = (globalThis as any).btoa(binary)
        } else {
          // Node Buffer fallback (should exist in some RN environments)
          // @ts-ignore
          b64 = Buffer.from(binary, 'binary').toString('base64')
        }
        await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 })
        asset = await MediaLibrary.createAssetAsync(fileUri)
      }
      const albumName = 'MyNailApp'
      const album = await MediaLibrary.getAlbumAsync(albumName)
      if (album == null) {
        await MediaLibrary.createAlbumAsync(albumName, asset, false)
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false)
      }

      Alert.alert('Đã lưu', 'Hình ảnh đã được lưu vào thư viện')
    } catch (e: any) {
      console.warn('Save image failed', e)
      Alert.alert('Lỗi', 'Không thể lưu hình ảnh')
    } finally {
      setDownloading(false)
    }
  }

  function renderThumb(url?: string | null, label?: string) {
    if (!url) return (
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, backgroundColor: '#f3f4f6', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>No image</Text>
        </View>
        {label ? <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{label}</Text> : null}
      </View>
    )

    const s = String(url)
    const final = s.startsWith('http') ? s : (s.startsWith('/') ? `${API_BASE}${s}` : `${API_BASE}/${s}`)
    return (
      <TouchableOpacity onPress={() => { setModalImage(final); setModalVisible(true); }} style={{ alignItems: 'center' }}>
        <Image source={{ uri: final }} style={{ width: 64, height: 64, borderRadius: 6, resizeMode: 'cover' }} />
        {label ? <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{label}</Text> : null}
      </TouchableOpacity>
    )
  }

  function confirmDelete(id: string | number) {
    Alert.alert('Xác nhận', 'Bạn có muốn xóa bản try-on này không?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => doDelete(id) },
    ])
  }

  async function doDelete(id: string | number) {
    try {
      await del(`/customer/ai-tryon/${encodeURIComponent(String(id))}`)
      setList((s) => s.filter((x) => String(x.tryOnId) !== String(id)))
      Alert.alert('Đã xóa', 'Bản try-on đã được xóa')
    } catch (err: any) {
      const msg = (err && (err.message || (err.body && err.body.message))) || 'Không xóa được'
      Alert.alert('Lỗi', String(msg))
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Lịch sử Try-On</Text>
      </View>

      {loading ? (
        <Text style={styles.loading}>Đang tải...</Text>
      ) : list.length === 0 ? (
        <Text style={styles.empty}>Chưa có bản try-on nào.</Text>
      ) : (
          <FlatList
          data={list}
          keyExtractor={(i) => String(i.tryOnId)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ width: 220, flexDirection: 'row', justifyContent: 'space-between' }}>
                  {renderThumb(item.sourceImageUrl, 'Ảnh khách')}
                  {renderThumb(item.templateImageUrl, 'Ảnh mẫu')}
                  {renderThumb(item.resultImageUrl, 'Ảnh render')}
                </View>
                <View style={styles.meta}>
                  <Text style={styles.id}>ID: {String(item.tryOnId).slice(0, 8)}</Text>
                  <Text style={styles.date}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Text>
                </View>
              </View>
              <View style={[styles.actions, { marginTop: 8 }]}> 
                {item.sourceImageUrl ? (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => { const s = String(item.sourceImageUrl); const final = s.startsWith('http') ? s : (s.startsWith('/') ? `${API_BASE}${s}` : `${API_BASE}/${s}`); saveImageToDevice(final); }}>
                    <Feather name="download" size={16} color="#fff" />
                    <Text style={styles.actionText}>Tải khách</Text>
                  </TouchableOpacity>
                ) : null}
                {item.templateImageUrl ? (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => { const s = String(item.templateImageUrl); const final = s.startsWith('http') ? s : (s.startsWith('/') ? `${API_BASE}${s}` : `${API_BASE}/${s}`); saveImageToDevice(final); }}>
                    <Feather name="download" size={16} color="#fff" />
                    <Text style={styles.actionText}>Tải mẫu</Text>
                  </TouchableOpacity>
                ) : null}
                {item.resultImageUrl ? (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => { const s = String(item.resultImageUrl); const final = s.startsWith('http') ? s : (s.startsWith('/') ? `${API_BASE}${s}` : `${API_BASE}/${s}`); saveImageToDevice(final); }}>
                    <Feather name="download" size={16} color="#fff" />
                    <Text style={styles.actionText}>Tải render</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#ef4444' }]} onPress={() => confirmDelete(item.tryOnId)}>
                  <Feather name="trash" size={16} color="#fff" />
                  <Text style={styles.actionText}>Xóa</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)} transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          {modalImage ? (
            <View style={{ width: '100%', maxHeight: '85%', backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
              <Image source={{ uri: modalImage }} style={{ width: '100%', height: 460, resizeMode: 'contain', backgroundColor: '#000' }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8 }}>
                <Pressable style={[styles.actionBtn, { backgroundColor: '#2563eb' }]} onPress={() => { Linking.openURL(modalImage!).catch(() => Alert.alert('Lỗi', 'Không thể mở hình ảnh')) }}>
                  <Text style={styles.actionText}>Mở</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: '#10b981' }]} onPress={() => { saveImageToDevice(modalImage); }} disabled={downloading}>
                  {downloading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Tải</Text>}
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: '#ef4444' }]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.actionText}>Đóng</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <ActivityIndicator size="large" color="#fff" />
          )}
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#fff' },
  header: { marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  loading: { marginTop: 12, color: '#6b7280' },
  empty: { marginTop: 12, color: '#6b7280' },
  card: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6', padding: 8, borderRadius: 8 },
  thumbWrap: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholder: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, paddingHorizontal: 8 },
  id: { fontSize: 12, fontWeight: '700' },
  date: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, alignItems: 'center', flexDirection: 'row', gap: 6 },
  actionText: { color: '#fff', fontWeight: '700' },
})
