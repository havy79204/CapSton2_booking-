import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { setToken } from '../lib/auth.js'

function roleLabel(roleId) {
  if (roleId === 1) return 'Admin (Owner)'
  if (roleId === 2) return 'Staff'
  if (roleId === 3) return 'Customer'
  return `Role ${roleId}`
}

function normalizeRoleKey(value) {
  if (value === undefined || value === null) return NaN

  const num = Number(value)
  if (Number.isFinite(num)) {
    const asInt = Math.trunc(num)
    if ([1, 2, 3].includes(asInt)) return asInt
  }

  const text = String(value).trim().toLowerCase()
  if (text === '1' || text === 'admin' || text === 'owner') return 1
  if (text === '2' || text === 'staff') return 2
  if (text === '3' || text === 'customer') return 3
  return NaN
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [loadingRole, setLoadingRole] = React.useState(null)
  const [error, setError] = React.useState('')

  const quickLogin = React.useCallback(
    async (roleId) => {
      setError('')
      setLoadingRole(roleId)
      try {
        const data = await api.post('/api/auth/quick-login', { roleId })
        setToken(data?.token || '')
        const rk = normalizeRoleKey(data?.user?.roleKey ?? data?.user?.role ?? roleId)
        if (rk === 1) {
          navigate('/portals/owner', { replace: true })
        } else {
          navigate('/', { replace: true })
        }
      } catch (e) {
        setError(e?.message || 'Login failed')
      } finally {
        setLoadingRole(null)
      }
    },
    [navigate],
  )

  return (
    <div
      className="portal"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div className="portal-card">
          <div className="portal-cardInner">
            <div className="portal-pageHeader" style={{ marginBottom: 12 }}>
              <div className="portal-pageHeaderLeft">
                <h1 className="portal-pageTitle" style={{ fontSize: 28 }}>
                  Login
                </h1>
                <p className="portal-pageSubtitle">
                  Use quick login for fast testing (no password required).
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {[1, 2, 3].map((roleId) => (
                <button
                  key={roleId}
                  type="button"
                  className="portal-primaryBtn"
                  disabled={loadingRole !== null}
                  onClick={() => quickLogin(roleId)}
                  style={{ justifyContent: 'center' }}
                >
                  {loadingRole === roleId ? 'Signing in...' : `Quick login: ${roleLabel(roleId)}`}
                </button>
              ))}
            </div>

            {error ? (
              <div style={{ marginTop: 14 }}>
                <p className="portal-pageSubtitle" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
                <p className="portal-pageSubtitle" style={{ marginTop: 6 }}>
                  If you see "Quick login is disabled", set `ENABLE_QUICK_LOGIN=true` in backend `.env` and restart the server.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
