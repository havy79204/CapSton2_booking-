import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export function RequireAuth({ children, reason = 'auth' }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.isAuthed) return children

  const from = `${location.pathname}${location.search || ''}`
  return <Navigate to="/login" replace state={{ from, reason }} />
}
