import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mail, X } from 'lucide-react'
import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'

import logo from '../assets/images/image.png'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()

  const redirectTo = useMemo(() => {
    const from = location.state?.from
    return typeof from === 'string' && from.startsWith('/') ? from : '/'
  }, [location.state])

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  function close() {
    navigate('/login', { state: { from: redirectTo } })
  }

  async function submit(e) {
    e.preventDefault()
    setError('')

    const clean = String(email || '').trim().toLowerCase()
    if (!clean) {
      setError(t('auth.forgot.emailRequired', 'Please enter your email'))
      return
    }

    try {
      await api.forgotPassword({ email: clean })
      setStatus(t('auth.forgot.sent', 'If the email exists in our system, we have sent a password reset link. Please check your inbox.'))
    } catch (err) {
      setError(err?.message || t('auth.forgot.error', 'Failed to send reset email'))
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
          <span>{t('auth.forgot.title', 'Forgot password')}</span>
        </div>

        <div className="muted" style={{ marginTop: 4 }}>
          {t('auth.forgot.subtitle', 'Enter your email to receive a password reset link.')}
        </div>

        <form onSubmit={submit} className="authForm" style={{ marginTop: 10 }}>
          <label className="authLabel">{t('auth.email', 'Email')}</label>
          <div className="authField">
            <Mail size={16} className="authFieldIcon" />
            <input
              className="authInput"
              placeholder={t('auth.email.placeholder', 'you@email.com')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
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
            {t('auth.forgot.submit', 'Send reset link')}
          </button>

          <div className="authFooter">
            <button
              className="authLink"
              type="button"
              onClick={() => navigate('/login', { state: { from: redirectTo } })}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              {t('auth.common.backLogin', 'Back to Login')}
            </button>
          </div>

          <button className="authCancel" type="button" onClick={close}>
            {t('auth.common.close', 'Close')}
          </button>
        </form>
      </div>
    </div>
  )
}
