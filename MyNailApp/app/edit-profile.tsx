import React, { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import { get, put, post } from './api'

export default function EditProfileScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [pendingAvatarDataUrl, setPendingAvatarDataUrl] = useState('')

  async function pickAvatarFromDevice() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Lỗi', 'Bạn cần cấp quyền truy cập thư viện ảnh')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
      })

      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      const base64 = asset.base64
      if (!base64) {
        Alert.alert('Lỗi', 'Không đọc được dữ liệu ảnh')
        return
      }

      const mime = asset.mimeType || 'image/jpeg'
      const dataUrl = `data:${mime};base64,${base64}`
      setPendingAvatarDataUrl(dataUrl)
      if (asset.uri) {
        setAvatarUrl(String(asset.uri))
      }
    } catch (e: any) {
      Alert.alert('Lỗi', String(e?.message || 'Không thể cập nhật avatar'))
    }
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const localRaw = await AsyncStorage.getItem('@mynailapp:user')
        if (localRaw && mounted) {
          try {
            const u = JSON.parse(localRaw)
            setName(String(u?.name || ''))
            setEmail(String(u?.email || ''))
            setPhone(String(u?.phone || ''))
            setAvatarUrl(String(u?.avatarUrl || ''))
          } catch {}
        }

        const res = await get('/auth/me')
        const u = res?.data || {}
        if (mounted) {
          setName(String(u?.name || ''))
          setEmail(String(u?.email || ''))
          setPhone(String(u?.phone || ''))
          setAvatarUrl(String(u?.avatarUrl || ''))
          setPendingAvatarDataUrl('')
        }
      } catch {
        // ignore and keep local values
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Lỗi', 'Tên không được để trống')
      return
    }

    setSaving(true)
    try {
      let latestUser: any = null
      if (pendingAvatarDataUrl) {
        const avatarRes = await post('/auth/me/avatar', { dataUrl: pendingAvatarDataUrl })
        latestUser = avatarRes?.data || null
      }

      const res = await put('/auth/me', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      })

      const user = { ...(latestUser || {}), ...(res?.data || {}) }
      if (user?.avatarUrl) {
        setAvatarUrl(String(user.avatarUrl))
      }
      setPendingAvatarDataUrl('')
      await AsyncStorage.setItem('@mynailapp:user', JSON.stringify(user))
      Alert.alert('Thành công', 'Đã cập nhật thông tin')
      router.back()
    } catch (e: any) {
      Alert.alert('Lỗi', String(e?.message || 'Không thể cập nhật thông tin'))
    } finally {
      setSaving(false)
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Chỉnh sửa thông tin</Text>
      <View style={styles.avatarRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} />
        ) : (
          <View style={[styles.avatarPreview, styles.avatarPlaceholder]}><Text style={{ color: '#6b7280' }}>No Avatar</Text></View>
        )}
        <TouchableOpacity style={styles.avatarButton} onPress={pickAvatarFromDevice} disabled={saving}>
          <Text style={styles.avatarButtonText}>Chọn ảnh</Text>
        </TouchableOpacity>
      </View>
      <TextInput placeholder="Họ tên" style={styles.input} value={name} onChangeText={setName} />
      <TextInput placeholder="Email" style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput placeholder="Số điện thoại" style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Lưu thay đổi</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => router.back()}>
        <Text style={{ color: '#6b7280', fontWeight: '600' }}>Hủy</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 8, marginBottom: 12 },
  button: { backgroundColor: '#7c3aed', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  avatarPreview: { width: 84, height: 84, borderRadius: 42 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  avatarButton: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  avatarButtonText: { color: '#fff', fontWeight: '700' },
})
