import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MailCheck, X } from 'lucide-react'
import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'

import logo from '../assets/images/image.png'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const q = useQuery()
  const token = q.get('token') || ''
  const { t } = useI18n()

  const [status, setStatus] = useState(token ? t('auth.verify.prompt', 'Click “Activate account” to verify your email.') : '')
  const [error, setError] = useState('')

  const [activating, setActivating] = useState(false)
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendInfo, setResendInfo] = useState('')

  const showResend = !String(token || '').trim() || Boolean(error)

  function close() {
    navigate('/login')
  }

  async function activate() {
    setError('')
    setResendInfo('')
    const tok = String(token || '').trim()
    if (!tok) {
      setError(t('auth.verify.missing', 'Missing activation link. Please use the link from your email, or request a new activation email below.'))
      return
    }
    setActivating(true)
    try {
      const r = await api.verifyEmail(tok)
      if (r?.alreadyVerified) {
        setStatus(t('auth.verify.already', 'Your email is already verified. You can log in now.'))
      } else {
        setStatus(t('auth.verify.success', 'Verified successfully. Redirecting to login…'))
      }
      setTimeout(() => navigate('/login'), 900)
    } catch (e) {
      setError(e?.message || t('auth.verify.error', 'Verification failed'))
      setStatus('')
    } finally {
      setActivating(false)
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
          <span>{t('auth.verify.title', 'Verify email')}</span>
        </div>

        <div className="muted" style={{ marginTop: 4, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <MailCheck size={16} />
          {t('auth.verify.subtitle', 'Confirm your account to continue.')}
        </div>

        <div style={{ marginTop: 12 }}>
          {error ? <div className="authError">{error}</div> : null}
          {status ? (
            <div
              className="authNote"
              style={{ marginTop: 0, borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)' }}
            >
              <div className="authNoteTitle">{t('auth.common.status', 'Status')}</div>
              <div className="authNoteSub">{status}</div>
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            className="authSubmit"
            type="button"
            onClick={activate}
            disabled={activating || !String(token || '').trim()}
          >
            {activating ? t('auth.verify.activating', 'Activating…') : t('auth.verify.activate', 'Activate account')}
          </button>
        </div>

          {showResend ? (
            <div className="authNote" style={{ marginTop: 14 }}>
              <div className="authNoteTitle">{t('auth.verify.resendTitle', 'Resend activation email')}</div>
              <div className="authNoteSub">{t('auth.verify.resendSub', 'Enter your email to receive a new activation link.')}</div>

              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <input
                  className="authInput"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email.placeholder', 'you@email.com')}
                  autoComplete="email"
                />
                <button
                  className="authBtn"
                  type="button"
                  disabled={resending || !String(email).trim()}
                  onClick={async () => {
                    const cleanEmail = String(email).trim().toLowerCase()
                    if (!cleanEmail) return
                    setResending(true)
                    setResendInfo('')
                    setError('')
                    try {
                      const r = await api.resendVerification({ email: cleanEmail })
                      setResendInfo(`Sent. Check ${cleanEmail} for the activation email.`)
                      void r
                    } catch (e) {
                      setResendInfo(e?.message || 'Failed to resend activation email')
                    } finally {
                      setResending(false)
                    }
                  }}
                >
                  {resending ? t('auth.verify.resending', 'Sending…') : t('auth.verify.resend', 'Resend activation link')}
                </button>

                {resendInfo ? <div className="authSub">{resendInfo}</div> : null}
              </div>
            </div>
          ) : null}

        <div className="authFooter" style={{ marginTop: 10 }}>
          <button
            className="authLink"
            type="button"
            onClick={() => navigate('/login')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {t('auth.common.backLogin', 'Back to Login')}
          </button>
        </div>

        <button className="authCancel" type="button" onClick={close}>
          {t('auth.common.close', 'Close')}
        </button>
      </div>
    </div>
  )
}
