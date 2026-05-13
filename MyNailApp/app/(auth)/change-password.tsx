import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { put } from '@/services/apiClient'
import Notice from '@/components/ui/Notice'
import { useToast } from '@/components/ui/Toast'

export default function ChangePasswordScreen() {
  const router = useRouter()
  const toast = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleChangePassword() {
    setNotice(null)
    if (!currentPassword || !newPassword || !confirmPassword) {
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
    if (newPassword !== confirmPassword) {
      const message = 'Xác nhận mật khẩu không khớp'
      setNotice({ type: 'error', message })
      toast.showError(message)
      return
    }

    setLoading(true)
    try {
      await put('/auth/me/password', { currentPassword, newPassword })
      const message = 'Đổi mật khẩu thành công. Đang quay lại...'
      setNotice({ type: 'success', message })
      toast.showSuccess(message)
      setTimeout(() => {
        router.back()
      }, 600)
    } catch (e: any) {
      const message = String(e?.message || 'Không thể đổi mật khẩu')
      setNotice({ type: 'error', message })
      toast.showError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={['#fff1f7', '#f5f3ff', '#fdf2f8']} style={styles.container}>
      <View style={styles.card}>
        <View style={styles.brandWrap}>
          <LinearGradient colors={['#fb7185', '#8b5cf6']} style={styles.brandBadge}>
            <Feather name="lock" size={26} color="#ffffff" />
          </LinearGradient>
          <Text style={styles.brandText}>NIOM&CE</Text>
        </View>

        <Text style={styles.title}>Đổi mật khẩu</Text>
        <Text style={styles.subTitle}>Cập nhật mật khẩu để bảo mật tài khoản.</Text>

        {notice ? (
          <Notice type={notice.type} message={notice.message} style={{ marginBottom: 12 }} />
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Mật khẩu hiện tại</Text>
          <View style={styles.inputWrap}>
            <Feather name="key" size={18} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowCurrent((prev) => !prev)}
              accessibilityLabel={showCurrent ? 'Ẩn mật khẩu hiện tại' : 'Hiện mật khẩu hiện tại'}
            >
              <Feather name={showCurrent ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
            </TouchableOpacity>
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
              secureTextEntry={!showNew}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNew((prev) => !prev)}
              accessibilityLabel={showNew ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
            >
              <Feather name={showNew ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Xác nhận mật khẩu mới</Text>
          <View style={styles.inputWrap}>
            <Feather name="check-circle" size={18} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirm((prev) => !prev)}
              accessibilityLabel={showConfirm ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
            >
              <Feather name={showConfirm ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleChangePassword} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cập nhật mật khẩu</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Feather name="arrow-left" size={16} color="#fb7185" />
          <Text style={styles.backText}>Hủy</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>© 2026 NIOM&CE. All rights reserved.</Text>
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
  buttonDisabled: {
    opacity: 0.75,
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
