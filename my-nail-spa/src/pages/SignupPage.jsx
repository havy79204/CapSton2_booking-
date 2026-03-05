import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, User, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
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

export function SignupPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()

  const redirectTo = useMemo(() => {
    const from = location.state?.from
    return typeof from === 'string' && from.startsWith('/') ? from : '/'
  }, [location.state])

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agree, setAgree] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [verifyUrl, setVerifyUrl] = useState('')
  const [createdEmail, setCreatedEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  function close() {
    navigate('/')
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setStatus('')
    setVerifyUrl('')

    try {
      if (!form.name.trim()) throw new Error(t('auth.signup.nameRequired', 'Please enter your name'))
      if (!agree) throw new Error(t('auth.signup.termsRequired', 'Please accept the Terms'))

      const pw = String(form.password || '')
      const cpw = String(confirmPassword || '')
      if (!pw) throw new Error(t('auth.signup.passwordRequired', 'Please enter a password'))
      if (!cpw) throw new Error(t('auth.signup.confirmRequired', 'Please confirm your password'))

      const pwErr = passwordError(pw, t)
      if (pwErr) throw new Error(pwErr)

      if (pw !== cpw) throw new Error(t('auth.signup.mismatch', "Passwords don't match"))

      const result = await auth.signup(form)
      if (result?.requiresVerification) {
        const cleanEmail = String(form.email || '').trim().toLowerCase()
        setCreatedEmail(cleanEmail)
        setStatus(t('auth.signup.created', 'Account created. Please check {{email}} for an activation link.').replace('{{email}}', cleanEmail))
        if (result?.verifyUrl) setVerifyUrl(String(result.verifyUrl))
        return
      }
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err?.message || t('auth.signup.error', 'Sign up failed'))
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
          <span>{t('auth.signup.title', 'Create your account')}</span>
        </div>

        <form onSubmit={submit} className="authForm">
          <label className="authLabel">{t('auth.signup.fullName', 'Full name')}</label>
          <div className="authField">
            <User size={16} className="authFieldIcon" />
            <input
              className="authInput"
              placeholder={t('auth.signup.fullNamePlaceholder', 'Your name')}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              autoComplete="name"
            />
          </div>

          <label className="authLabel">{t('auth.email', 'Email')}</label>
          <div className="authField">
            <Mail size={16} className="authFieldIcon" />
            <input
              className="authInput"
              placeholder={t('auth.email.placeholder', 'you@email.com')}
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              autoComplete="email"
            />
          </div>

          <label className="authLabel">{t('auth.password', 'Password')}</label>
          <div className="authField authFieldToggle">
            <Lock size={16} className="authFieldIcon" />
            <input
              className="authInput"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.password', 'Password')}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
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

          <label className="authLabel">{t('auth.signup.confirmLabel', 'Confirm password')}</label>
          <div className="authField authFieldToggle">
            <Lock size={16} className="authFieldIcon" />
            <input
              className="authInput"
              type={showConfirm ? 'text' : 'password'}
              placeholder={t('auth.signup.confirmPlaceholder', 'Confirm password')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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

          <div className="authRow" style={{ marginTop: 2 }}>
            <label className="authRemember">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>{t('auth.signup.agree', 'I agree to the Terms')}</span>
            </label>

            <button
              className="authLink"
              type="button"
              onClick={() => navigate('/login', { state: { from: redirectTo } })}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              {t('auth.signup.already', 'Already have an account?')}
            </button>
          </div>

          {error ? <div className="authError">{error}</div> : null}

          {status ? (
            <div
              className="authNote"
              style={{ marginTop: 0, borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)' }}
            >
              <div className="authNoteTitle">{t('auth.signup.verifyTitle', 'Verify your email')}</div>
              <div className="authNoteSub">{status}</div>
              {verifyUrl ? (
                <div style={{ marginTop: 10 }}>
                  <a className="authLink" href={verifyUrl}>
                    {t('auth.signup.openActivation', 'Open activation link')}
                  </a>
                </div>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <button
                  className="authLink"
                  type="button"
                  disabled={resending || !createdEmail}
                  onClick={async () => {
                    if (!createdEmail) return
                    setResending(true)
                    setError('')
                    try {
                      const r = await api.resendVerification({ email: createdEmail })
                      if (r?.verifyUrl) setVerifyUrl(String(r.verifyUrl))
                      setStatus(`Activation email sent again to ${createdEmail}.`)
                    } catch (e) {
                      setError(e?.message || 'Failed to resend activation email')
                    } finally {
                      setResending(false)
                    }
                  }}
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  {resending ? t('auth.signup.resending', 'Sending…') : t('auth.signup.resend', 'Resend activation email')}
                </button>
              </div>
            </div>
          ) : null}

          <button className="authSubmit" type="submit">
            {t('auth.signup.submit', 'Sign Up')}
          </button>

          <button className="authCancel" type="button" onClick={close}>
            {t('auth.common.close', 'Close')}
          </button>
        </form>
      </div>
    </div>
  )
}
