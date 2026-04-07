import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { post } from '@/services/apiClient'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [requested, setRequested] = useState(false)

  async function handleRequestCode() {
    if (!email.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập email')
      return
    }
    setLoading(true)
    try {
      const res = await post('/auth/forgot-password', { email: email.trim() })
      setRequested(true)
      const devCode = res?.data?.code
      if (devCode) {
        setCode(String(devCode))
        Alert.alert('Mã xác nhận (dev)', `Mã của bạn là: ${devCode}`)
      } else {
        Alert.alert('Thành công', 'Nếu email tồn tại, mã xác nhận đã được gửi')
      }
    } catch (e: any) {
      Alert.alert('Lỗi', String(e?.message || 'Không thể gửi yêu cầu'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!email.trim() || !code.trim() || !newPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin')
      return
    }
    if (newPassword.length < 6) {
      Alert.alert('Lỗi', 'Mật khẩu mới tối thiểu 6 ký tự')
      return
    }

    setLoading(true)
    try {
      await post('/auth/reset-password', {
        email: email.trim(),
        code: code.trim(),
        newPassword,
      })
      Alert.alert('Thành công', 'Đổi mật khẩu thành công', [
        { text: 'Đăng nhập', onPress: () => router.replace('/login') },
      ])
    } catch (e: any) {
      Alert.alert('Lỗi', String(e?.message || 'Không thể đặt lại mật khẩu'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quên mật khẩu</Text>
      <TextInput
        placeholder="Email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      {!requested ? (
        <TouchableOpacity style={styles.button} onPress={handleRequestCode} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Gửi mã xác nhận</Text>}
        </TouchableOpacity>
      ) : (
        <>
          <TextInput
            placeholder="Mã xác nhận"
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
          />
          <TextInput
            placeholder="Mật khẩu mới"
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={handleResetPassword} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Đặt lại mật khẩu</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => router.replace('/login')}>
        <Text style={{ color: '#2563eb', fontWeight: '600' }}>Quay lại đăng nhập</Text>
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
