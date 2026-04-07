import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { put } from '@/services/apiClient'

export default function ChangePasswordScreen() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin')
      return
    }
    if (newPassword.length < 6) {
      Alert.alert('Lỗi', 'Mật khẩu mới tối thiểu 6 ký tự')
      return
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Xác nhận mật khẩu không khớp')
      return
    }

    setLoading(true)
    try {
      await put('/auth/me/password', { currentPassword, newPassword })
      Alert.alert('Thành công', 'Đổi mật khẩu thành công', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert('Lỗi', String(e?.message || 'Không thể đổi mật khẩu'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đổi mật khẩu</Text>
      <TextInput placeholder="Mật khẩu hiện tại" style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
      <TextInput placeholder="Mật khẩu mới" style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <TextInput placeholder="Xác nhận mật khẩu mới" style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

      <TouchableOpacity style={styles.button} onPress={handleChangePassword} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cập nhật mật khẩu</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => router.back()}>
        <Text style={{ color: '#6b7280', fontWeight: '600' }}>Hủy</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 8, marginBottom: 12 },
  button: { backgroundColor: '#7c3aed', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
})
