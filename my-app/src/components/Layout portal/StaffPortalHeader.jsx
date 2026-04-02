import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IconBell, IconMessage, IconSearch } from './PortalIcons.jsx'
import { api } from '../../lib/api.js'
import { clearToken } from '../../lib/auth.js'

export default function StaffPortalHeader() {
  const location = useLocation()
  const navigate = useNavigate()

  const onLogout = React.useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // ignore
    }

    clearToken()
    window.location.href = '/login'
  }, [])

  const headerMeta = React.useMemo(() => {
    const path = location.pathname
    const key = path.split('/').filter(Boolean).slice(-1)[0] || 'schedule'

    const map = {
      schedule: { title: 'Schedule', subtitle: 'Shift planning and staff coordination' },
      appointments: { title: 'Appointments', subtitle: 'Manage daily appointments' },
      staff: { title: 'Staff', subtitle: 'Staff list and performance' },
      services: { title: 'Services', subtitle: 'Service packages and pricing' },
      inventory: { title: 'Inventory', subtitle: 'Track stock and inbound/outbound' },
      products: { title: 'Products', subtitle: 'Retail product list and details' },
      orders: { title: 'Orders', subtitle: 'Manage retail orders and processing status' },
    }

    return map[key] ?? { title: 'Staff Portal', subtitle: 'Staff operations' }
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
              onClick={() => navigate('/portals/staff/notifications')}
            >
              <IconBell />
              <span className="portal-dot" aria-hidden="true" />
            </button>
            <button
              className="portal-iconBtn"
              type="button"
              aria-label="Messages"
              onClick={() => navigate('/portals/staff/chat')}
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
