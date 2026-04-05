import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { post, API_BASE } from './api'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    if (!email || !password) {
      Alert.alert('Lỗi', 'Email và mật khẩu không được để trống')
      return false
    }
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!re.test(email)) {
      Alert.alert('Lỗi', 'Email không đúng định dạng')
      return false
    }
    return true
  }

  async function handleLogin() {
    if (!validate()) return
    setLoading(true)
    try {
      const res = await post('/auth/login', { email, password })
      if (res && res.success) {
        await AsyncStorage.setItem('@mynailapp:token', res.token)
        await AsyncStorage.setItem('@mynailapp:user', JSON.stringify(res.user || {}))
        // navigate to dashboard route
        router.replace('/(tabs)/appointments')
      } else {
        Alert.alert('Đăng nhập thất bại', (res && res.message) || 'Sai tài khoản hoặc mật khẩu')
      }
    } catch (err: any) {
      const msg = (err && err.message) ? String(err.message) : 'Không thể kết nối đến server'
      Alert.alert('Lỗi', msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleQuickLogin() {
    setLoading(true)
    try {
      const res = await post('/auth/quick-login', { roleId: 2 })
      console.log('quick-login response', res)
      if (res && (res.ok || res.success) && (res.data || res.user || res.token)) {
        // support multiple response shapes: {ok,data:{user,token}} or {success,token,user}
        const payload = res.data || { user: res.user, token: res.token }
        const token = payload.token
        const user = payload.user
        if (token) await AsyncStorage.setItem('@mynailapp:token', token)
        if (user) await AsyncStorage.setItem('@mynailapp:user', JSON.stringify(user || {}))
        console.log('stored token, navigating home')
        try {
          // notify layout about auth change so it updates immediately
          // @ts-ignore
          globalThis.__notifyAuthChanged && globalThis.__notifyAuthChanged(true)
        } catch {}
        router.replace('/')
      } else {
        console.warn('quick-login failed response', res)
        Alert.alert('Lỗi', 'Quick login không thành công')
      }
    } catch (e) {
      console.error('quick-login error', e)
      Alert.alert('Lỗi', 'Không thể kết nối đến server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đăng nhập</Text>
      <Text style={styles.hint}>API base: {API_BASE}</Text>
      <TextInput placeholder="Email" style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput placeholder="Mật khẩu" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Đăng nhập</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, { backgroundColor: '#06b6d4', marginTop: 8 }]} onPress={handleQuickLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Quick login (dev)</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => router.push('/forgot-password')} disabled={loading}>
        <Text style={{ color: '#2563eb', fontWeight: '600' }}>Quên mật khẩu?</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  hint: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 8, marginBottom: 12 },
  button: { backgroundColor: '#7c3aed', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
})
