import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export function PortalIndexRedirect() {
  const auth = useAuth()
  const role = String(auth.user?.role || '').trim().toLowerCase()

  if (role === 'admin' || role === 'owner' || role === 'staff') {
    return <Navigate to="/portal/dashboard" replace />
  }
  return <Navigate to="/" replace />
}
