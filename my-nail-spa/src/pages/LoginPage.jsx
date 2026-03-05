import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'

import logo from '../assets/images/image.png'

function makeCaptcha(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()

  const reason = location.state?.reason

  const redirectTo = useMemo(() => {
    const from = location.state?.from
    return typeof from === 'string' && from.startsWith('/') ? from : '/'
  }, [location.state])

  const [form, setForm] = useState({ email: '', password: '' })
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [captcha, setCaptcha] = useState(() => makeCaptcha())
  const [captchaInput, setCaptchaInput] = useState('')

  function refreshCaptcha() {
    setCaptcha(makeCaptcha())
    setCaptchaInput('')
  }

  function assertCaptchaOk() {
    const a = String(captchaInput || '').trim().toUpperCase()
    const b = String(captcha || '').trim().toUpperCase()
    if (!a) throw new Error(t('auth.login.captchaRequired', 'Please enter the verification code'))
    if (a !== b) throw new Error(t('auth.login.captchaMismatch', "Verification code doesn't match"))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')

    try {
      assertCaptchaOk()
      await auth.login(form)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err?.message || t('auth.login.error', 'Login failed'))
      refreshCaptcha()
    }
  }

  function close() {
    navigate('/')
  }

  // Social login is not implemented in the backend yet.

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

            {auth.isAuthed ? (
              <div className="authLogged">
                <div className="authLoggedTitle">{t('auth.login.already', "You're signed in")}</div>
                <div className="authLoggedSub">
                  {auth.user.name} · {auth.user.email}
                </div>
                <div className="authRow" style={{ marginTop: 12 }}>
                  <button className="authBtn" type="button" onClick={() => navigate('/')}>
                    {t('auth.common.backHome', 'Back to Home')}
                  </button>
                  <button className="authBtn authBtnPrimary" type="button" onClick={() => auth.logout()}>
                    {t('auth.common.logout', 'Logout')}
                  </button>
                </div>
              </div>
            ) : null}

        <div className="authDivider">
          <span>{t('auth.login.title', 'Log In with NIOM&CE')}</span>
        </div>

        <form onSubmit={submit} className="authForm">
          <label className="authLabel">{t('auth.login.userOrEmail', 'Username or Email')}</label>
          <div className="authField">
            <Mail size={16} className="authFieldIcon" />
            <input
              className="authInput"
              placeholder={t('auth.login.userOrEmail', 'Username or Email')}
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              autoComplete={remember ? 'username' : 'off'}
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
              autoComplete={remember ? 'current-password' : 'off'}
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

          <label className="authLabel">{t('auth.login.captcha', 'Captcha')}</label>
          <div className="authCaptchaRow">
            <div className="authCaptchaBox" aria-label={t('auth.login.captchaAria', 'Captcha code')}>
              <span className="authCaptchaCode">{captcha}</span>
              <button
                className="authCaptchaRefresh"
                type="button"
                onClick={refreshCaptcha}
                aria-label={t('auth.login.captchaRefresh', 'Refresh captcha')}
                title={t('auth.login.captchaRefresh', 'Refresh captcha')}
              >
                ↻
              </button>
            </div>
            <input
              className="authCaptchaInput"
              placeholder={t('auth.login.captchaPlaceholder', 'Enter code')}
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
              inputMode="text"
              autoComplete="off"
            />
          </div>

          <div className="authRow" style={{ marginTop: 2 }}>
            <label className="authRemember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>{t('auth.login.remember', 'Remember Me')}</span>
            </label>

            <button
              className="authLink"
              type="button"
              onClick={() => navigate('/forgot-password', { state: { from: redirectTo } })}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              {t('auth.login.forgot', 'Forgot Password?')}
            </button>
          </div>

          {error ? <div className="authError">{error}</div> : null}

          <button className="authSubmit" type="submit">
            {t('auth.login.submit', 'Login')}
          </button>

          <div className="authFooter">
            <span>{t('auth.login.noAccount', "Don't have an account?")}</span>
            <button
              className="authLink"
              type="button"
              onClick={() => navigate('/signup', { state: { from: redirectTo } })}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              {t('auth.login.signup', 'Sign Up Now')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
