import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { IconBell, IconMessage, IconSearch } from './PortalIcons.jsx'
import { api } from '../../lib/api.js'
import { clearToken, getToken } from '../../lib/auth.js'

export default function PortalHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = React.useState(0)

  const onLogout = React.useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // ignore
    }

    clearToken()
    window.location.href = '/login'
  }, [])

  const loadUnreadCount = React.useCallback(async () => {
    try {
      const data = await api.get('/api/owner/notifications')
      const list = Array.isArray(data) ? data : []
      setUnreadCount(list.filter((item) => !item?.read).length)
    } catch {
      // ignore header badge fetch errors
    }
  }, [])

  React.useEffect(() => {
    loadUnreadCount()
  }, [loadUnreadCount])

  React.useEffect(() => {
    const onCountUpdate = (event) => {
      const count = Number(event?.detail?.unreadCount || 0)
      setUnreadCount(Math.max(0, count))
    }

    window.addEventListener('owner:notifications-count', onCountUpdate)
    return () => window.removeEventListener('owner:notifications-count', onCountUpdate)
  }, [])

  React.useEffect(() => {
    const token = getToken()
    if (!token) return undefined

    const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
    const socketBase = String(rawBase || '').replace(/\/+$/, '')

    const socket = io(socketBase, {
      auth: { token },
      transports: ['polling', 'websocket'],
    })

    const onOwnerNotification = () => {
      loadUnreadCount()
    }

    socket.on('owner:notification', onOwnerNotification)

    return () => {
      socket.off('owner:notification', onOwnerNotification)
      socket.disconnect()
    }
  }, [loadUnreadCount])

  const headerMeta = React.useMemo(() => {
    const path = location.pathname
    const key = path.split('/').filter(Boolean).slice(-1)[0] || 'dashboard'

    const map = {
      dashboard: { title: 'Dashboard', subtitle: 'Overview of operations and performance' },
      appointments: { title: 'Appointments', subtitle: 'Manage daily appointments' },
      schedule: { title: 'Schedule', subtitle: 'Shift planning and staff coordination' },
      staff: { title: 'Staff', subtitle: 'Staff list and performance' },
      services: { title: 'Services', subtitle: 'Service packages and pricing' },
      inventory: { title: 'Inventory', subtitle: 'Track stock and inbound/outbound' },
      customers: { title: 'Customers', subtitle: 'Manage customer profiles' },
      reports: { title: 'Reports', subtitle: 'Revenue reports and analytics' },
      settings: { title: 'Settings', subtitle: 'System and salon settings' },
      products: { title: 'Products', subtitle: 'Retail product list and details' },
      orders: { title: 'Orders', subtitle: 'Manage retail orders and processing status' },
    }

    return map[key] ?? { title: 'Owner Portal', subtitle: 'Administration and operations' }
  }, [location.pathname])

  return (
    <header className="portal-header">
      <div className="portal-headerInner">
        <div className="portal-headerLeft">
          <h1 className="portal-headerTitle">{headerMeta.title}</h1>
          <p className="portal-headerSubtitle">{headerMeta.subtitle}</p>
        </div>

        <div className="portal-headerActions" aria-label="Header actions">

          <div className="portal-headerRight">
            <button
              className="portal-iconBtn"
              type="button"
              aria-label="Notifications"
              onClick={() => navigate('/portals/owner/notifications')}
            >
              <IconBell />
              {unreadCount > 0 ? (
                <span className="portal-notificationBadge" aria-hidden="true">
                  {Math.min(unreadCount, 99)}
                </span>
              ) : null}
            </button>
            <button
              className="portal-iconBtn"
              type="button"
              aria-label="Messages"
              onClick={() => navigate('/portals/owner/chat')}
            >
              <IconMessage />
            </button>
            <button className="portal-outlineBtn" type="button" onClick={onLogout} aria-label="Log out">
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
