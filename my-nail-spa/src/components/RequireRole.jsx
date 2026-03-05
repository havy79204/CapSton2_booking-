import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export function RequireRole({ children, allowedRoles, reason = 'role' }) {
  const auth = useAuth()
  const location = useLocation()

  if (!auth.isAuthed) {
    const from = `${location.pathname}${location.search || ''}`
    return <Navigate to="/login" replace state={{ from, reason }} />
  }

  const role = String(auth.user?.role || '').trim().toLowerCase()
  const allowed = (allowedRoles || []).map((r) => String(r || '').trim().toLowerCase())
  if (!allowed.includes(role)) {
    return <Navigate to="/" replace />
  }

  return children
}
