import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, X } from 'lucide-react'
import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'

import logo from '../assets/images/image.png'

function passwordError(pw, t) {
  const v = String(pw || '')
  if (v.length < 8) return t('auth.password.minLength', 'Password must be at least 8 characters')
  if (!/^[A-Z]/.test(v)) return t('auth.password.uppercase', 'Password must start with an uppercase letter')
  if (!/[^A-Za-z0-9]/.test(v)) return t('auth.password.special', 'Password must include at least 1 special character')
  return ''
}

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const q = useQuery()
  const { t } = useI18n()

  const token = q.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  function close() {
    navigate('/login')
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setStatus('')

    const pw = String(password || '')
    const cpw = String(confirm || '')
    const t = String(token || '').trim()
    if (!t) {
      setError(t('auth.reset.missingToken', 'Missing reset link. Please use the link from your email.'))
      return
    }
    if (!pw) {
      setError(t('auth.reset.passwordRequired', 'Please enter a new password'))
      return
    }
    const pwErr = passwordError(pw, t)
    if (pwErr) {
      setError(pwErr)
      return
    }
    if (pw !== cpw) {
      setError(t('auth.reset.mismatch', 'Passwords do not match'))
      return
    }

    try {
      await api.resetPassword({ token: t, password: pw })
      setStatus(t('auth.reset.success', 'Password updated successfully. You can log in now.'))
      setTimeout(() => navigate('/login'), 800)
    } catch (err) {
      setError(err?.message || t('auth.reset.error', 'Reset failed'))
    }
  }

  return (
    <div className="authOverlay" role="dialog" aria-modal="true">
      <button className="authClose" type="button" aria-label="Close" onClick={close}>
        <X size={18} />
      </button>

      <div className="authModal">
        <div className="authBrandRow">
          <img className="authLogo" src={logo} alt="NIOM&CE" />
          <div className="authBrandText">NIOM&CE</div>
        </div>

        <div className="authDivider" style={{ marginTop: 6 }}>
          <span>{t('auth.reset.title', 'Reset password')}</span>
        </div>

        <form onSubmit={submit} className="authForm" style={{ marginTop: 10 }}>
          <label className="authLabel">{t('auth.reset.newPassword', 'New password')}</label>
          <div className="authField authFieldToggle">
            <Lock size={16} className="authFieldIcon" />
            <input
              className="authInput"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="authToggle"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? t('auth.password.hide', 'Hide password') : t('auth.password.show', 'Show password')}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <label className="authLabel">{t('auth.reset.confirm', 'Confirm')}</label>
          <div className="authField authFieldToggle">
            <Lock size={16} className="authFieldIcon" />
            <input
              className="authInput"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="authToggle"
              onClick={() => setShowConfirm((p) => !p)}
              aria-label={showConfirm ? t('auth.password.hide', 'Hide password') : t('auth.password.show', 'Show password')}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error ? <div className="authError">{error}</div> : null}
          {status ? (
            <div
              className="authNote"
              style={{ marginTop: 0, borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)' }}
            >
              <div className="authNoteTitle">{t('auth.common.done', 'Done')}</div>
              <div className="authNoteSub">{status}</div>
            </div>
          ) : null}

          <button className="authSubmit" type="submit">
            {t('auth.reset.submit', 'Update password')}
          </button>

          <button className="authCancel" type="button" onClick={close}>
            {t('auth.common.close', 'Close')}
          </button>
        </form>
      </div>
    </div>
  )
}
