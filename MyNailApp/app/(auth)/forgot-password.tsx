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
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { post } from '@/services/apiClient'
import Notice from '@/components/ui/Notice'
import { useToast } from '@/components/ui/Toast'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [requested, setRequested] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showNewPassword, setShowNewPassword] = useState(false)
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

  async function handleRequestCode() {
    setNotice(null)
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      const message = 'Vui lòng nhập email'
      setNotice({ type: 'error', message })
      toast.showError(message)
      return
    }
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!re.test(trimmedEmail)) {
      const message = 'Email không đúng định dạng'
      setNotice({ type: 'error', message })
      toast.showError(message)
      return
    }
    setLoading(true)
    try {
      const res = await post('/auth/forgot-password', { email: trimmedEmail })
      setRequested(true)
      const successMessage = 'Nếu email tồn tại, mã xác nhận đã được gửi.'
      setNotice({ type: 'success', message: successMessage })
      toast.showSuccess(successMessage)
      const devCode = res?.data?.code
      if (devCode) {
        setCode(String(devCode))
        toast.show(`Mã xác nhận (dev): ${devCode}`, { duration: 5000 })
      }
    } catch (e: any) {
      const status = e?.status
      let msg = String(e?.message || 'Không thể gửi yêu cầu')
      if (status === 404) msg = 'Email không tồn tại trong hệ thống'
      if (status === 400) msg = 'Email không hợp lệ'
      setNotice({ type: 'error', message: msg })
      toast.showError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    setNotice(null)
    if (!email.trim() || !code.trim() || !newPassword) {
      const message = 'Vui lòng nhập đầy đủ thông tin'
      setNotice({ type: 'error', message })
      toast.showError(message)
      return
    }
    if (newPassword.length < 6) {
      const message = 'Mật khẩu mới tối thiểu 6 ký tự'
      setNotice({ type: 'error', message })
      toast.showError(message)
      return
    }

    setLoading(true)
    try {
      await post('/auth/reset-password', {
        email: email.trim(),
        code: code.trim(),
        newPassword,
      })
      const message = 'Đổi mật khẩu thành công. Đang quay lại...'
      setNotice({ type: 'success', message })
      toast.showSuccess(message)
      setTimeout(() => {
        router.replace('/login')
      }, 700)
    } catch (e: any) {
      const status = e?.status
      let msg = String(e?.message || 'Không thể đặt lại mật khẩu')
      if (status === 400) msg = 'Mã xác nhận không đúng hoặc đã hết hạn'
      if (status === 404) msg = 'Email không tồn tại trong hệ thống'
      setNotice({ type: 'error', message: msg })
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
              <Feather name="star" size={26} color="#ffffff" />
            </LinearGradient>
            <Text style={styles.brandText}>NIOM&CE</Text>
          </View>

          <Text style={styles.title}>Quên mật khẩu?</Text>
          <Text style={styles.subTitle}>Nhập email để nhận mã xác nhận đặt lại mật khẩu.</Text>

          {notice ? (
            <Notice type={notice.type} message={notice.message} style={{ marginBottom: 12 }} />
          ) : null}

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

          {!requested ? (
            <TouchableOpacity style={styles.button} onPress={handleRequestCode} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Gửi mã xác nhận</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Mã xác nhận</Text>
                <View style={styles.inputWrap}>
                  <Feather name="key" size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    placeholder="Nhập mã"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Mật khẩu mới</Text>
                <View style={styles.inputWrap}>
                  <Feather name="lock" size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowNewPassword((prev) => !prev)}
                    accessibilityLabel={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                  >
                    <Feather name={showNewPassword ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={styles.button} onPress={handleResetPassword} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Đặt lại mật khẩu</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/login')}>
            <Feather name="arrow-left" size={16} color="#fb7185" />
            <Text style={styles.backText}>Quay lại đăng nhập</Text>
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
    paddingTop: 28,
    paddingBottom: 18,
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
    marginBottom: 16,
  },
  brandBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#8b5cf6', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  brandText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 13,
    color: '#64748b',
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
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  backLink: {
    marginTop: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  backText: {
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
