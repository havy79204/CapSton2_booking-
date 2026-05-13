import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { post } from '@/services/apiClient'
import { useToast } from '@/components/ui/Toast'

export default function LoginScreen() {
  const router = useRouter()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const focusCount = useRef(0)
  const liftAnim = useRef(new Animated.Value(0)).current

  const liftStyle = {
    transform: [
      {
        translateY: liftAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -80],
        }),
      },
    ],
  }

  function animateLift(to: number) {
    Animated.timing(liftAnim, {
      toValue: to,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }

  function handleFocus() {
    focusCount.current += 1
    animateLift(1)
  }

  function handleBlur() {
    focusCount.current = Math.max(0, focusCount.current - 1)
    if (focusCount.current === 0) animateLift(0)
  }

  function validate() {
    if (!email || !password) {
      const message = 'Email và mật khẩu không được để trống'
      toast.showError(message)
      return false
    }
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!re.test(email)) {
      const message = 'Email không đúng định dạng'
      toast.showError(message)
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
        const roleKey = Number(res?.user?.roleKey)
        if (roleKey !== 2) {
          const message = 'Email hoặc mật khẩu không đúng'
          toast.showError(message)
          return
        }
        await AsyncStorage.setItem('@mynailapp:token', res.token)
        await AsyncStorage.setItem('@mynailapp:user', JSON.stringify(res.user || {}))
        try { (globalThis as any).__notifyAuthChanged && (globalThis as any).__notifyAuthChanged(true) } catch {}
        const message = 'Đăng nhập thành công! Đang chuyển...'
        toast.showSuccess(message)
        setTimeout(() => {
          router.replace('/(tabs)/appointments')
        }, 600)
      } else {
        const message = (res && res.message) || 'Email hoặc mật khẩu không đúng'
        toast.showError(message)
      }
    } catch (err: any) {
      const status = err?.status
      let msg = (err && err.message) ? String(err.message) : 'Không thể kết nối đến server'
      if (status === 401 || status === 403) msg = 'Email hoặc mật khẩu không đúng'
      if (status === 404) msg = 'Tài khoản không tồn tại'
      toast.showError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={['#fff1f7', '#f5f3ff', '#fdf2f8']} style={styles.container}>
      <Animated.View style={liftStyle}>
        <View style={styles.card}>
          <View style={styles.brandWrap}>
            <LinearGradient colors={['#fb7185', '#8b5cf6']} style={styles.brandBadge}>
              <Feather name="star" size={28} color="#ffffff" />
            </LinearGradient>
            <Text style={styles.brandText}>NIOM&CE</Text>
            <Text style={styles.brandSub}>Quản lý salon chuyên nghiệp</Text>
          </View>

          <Text style={styles.title}>Đăng nhập</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                placeholder="example@email.com"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Mật khẩu</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Đăng nhập</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => router.push('/forgot-password')}
            disabled={loading}
          >
            <Text style={styles.forgotText}>Quên mật khẩu?</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>© 2026 NIOM&CE. All rights reserved.</Text>
      </Animated.View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 36,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  brandBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#8b5cf6', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  brandText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  brandSub: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  eyeButton: {
    padding: 6,
    marginLeft: 4,
  },
  button: {
    marginTop: 6,
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  forgotLink: {
    marginTop: 14,
    alignItems: 'center',
  },
  forgotText: {
    color: '#fb7185',
    fontWeight: '600',
  },
  footer: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 12,
    color: '#94a3b8',
  },
})
