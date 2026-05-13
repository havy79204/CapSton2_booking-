import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import { api } from '../../lib/api.js'
import { getToken } from '../../lib/auth.js'

function formatTs(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

export default function OwnerNotificationsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [msg, setMsg] = useState('')

  const categoryOptions = [
    { key: 'all', label: 'All' },
    { key: 'operations', label: 'Operations' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'hr', label: 'Human Resources' },
  ]

  const severityLabel = {
    info: 'Info',
    success: 'Positive',
    warning: 'Warning',
    error: 'Critical',
  }

  function toIsoDate(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''

    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`

    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return ''

    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    if (year < 2020 || year > new Date().getFullYear() + 2) return ''
    return `${year}-${month}-${day}`
  }

  function handleNotificationClick(item) {
    const category = String(item?.category || '').toLowerCase()
    const type = String(item?.type || '').toLowerCase()
    const bookingDate = toIsoDate(item?.bookingTime || item?.createdAt)
    const bookingId = String(item?.bookingId || '').trim()
    const orderId = String(item?.orderId || '').trim()

    if (type === 'booking' || bookingId) {
      const query = new URLSearchParams()
      if (bookingDate) query.set('date', bookingDate)
      if (bookingId) query.set('bookingId', bookingId)
      navigate(`/portals/owner/appointments?${query.toString()}`)
      return
    }

    if (orderId || type === 'order' || type === 'payment') {
      const query = new URLSearchParams()
      if (orderId) query.set('orderId', orderId)
      const qs = query.toString()
      navigate(`/portals/owner/orders${qs ? `?${qs}` : ''}`)
      return
    }

    if (category === 'inventory') {
      navigate('/portals/owner/inventory')
      return
    }

    if (category === 'hr') {
      navigate('/portals/owner/staff')
      return
    }

    if (category === 'revenue') {
      navigate('/portals/owner/dashboard')
    }
  }

  function publishUnreadCount(nextItems) {
    const unreadCount = (Array.isArray(nextItems) ? nextItems : []).filter((item) => !item?.read).length
    try {
      window.dispatchEvent(
        new CustomEvent('owner:notifications-count', {
          detail: { unreadCount },
        })
      )
    } catch (e) {
      void e
    }
  }

  const load = useCallback(async () => {
    setMsg('')
    try {
      const data = await api.get('/api/owner/notifications')
      const nextItems = Array.isArray(data) ? data : []
      setItems(nextItems)
      publishUnreadCount(nextItems)
    } catch (err) {
      console.error(err)
      setMsg(err?.message || 'Unable to load notifications.')
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  useEffect(() => {
    const token = getToken()
    if (!token) return undefined

    const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
    const socketBase = String(rawBase || '').replace(/\/+$/, '')

    const socket = io(socketBase, {
      auth: { token },
      transports: ['polling', 'websocket'],
    })

    const onOwnerNotification = async (payload) => {
      const message = payload?.message || 'You have a new owner notification'
      try {
        window.dispatchEvent(
          new CustomEvent('portal:toast', {
            detail: { type: 'info', message, timeoutMs: 2500 },
          })
        )
      } catch (e) {
        void e
      }

      await load()
    }

    socket.on('owner:notification', onOwnerNotification)

    return () => {
      socket.off('owner:notification', onOwnerNotification)
      socket.disconnect()
    }
  }, [load])

  const filteredItems = items.filter((item) => {
    if (activeCategory === 'all') return true
    return String(item?.category || '').toLowerCase() === activeCategory
  })

  return (
    <div>
      <PortalCard
        title="Notifications"
        right={
          <button
            type="button"
            className="portal-outlineBtn"
            onClick={async () => {
              setMsg('')
              try {
                await api.post('/api/owner/notifications/read', {})
                await load()
                publishUnreadCount([])
              } catch (err) {
                console.error(err)
                setMsg(err?.message || 'Unable to mark as read.')
              }
            }}
          >
            Mark all as read
          </button>
        }
      >
        {msg ? <div className="portal-pageSubtitle" style={{ marginBottom: 10 }}>{msg}</div> : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {categoryOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={activeCategory === option.key ? 'portal-primaryBtn' : 'portal-outlineBtn'}
              onClick={() => setActiveCategory(option.key)}
              style={{ minWidth: 120 }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filteredItems.length ? (
          <div className="portal-list" role="list">
            {filteredItems.map((n) => (
              <div
                key={n.id}
                className="portal-listItem"
                role="listitem"
                style={{ opacity: n.read ? 0.7 : 1 }}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="portal-listPrimary">
                  <div className="portal-listTitle" style={{ fontWeight: 900 }}>
                    {n.title || 'Notification'}
                  </div>
                  <div className="portal-listSub" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="portal-badge confirmed">
                      {severityLabel[String(n.severity || 'info').toLowerCase()] || 'Thong tin'}
                    </span>
                    <span className="portal-badge pending">
                      {String(n.category || 'general').toUpperCase()}
                    </span>
                  </div>
                  <div className="portal-listSub">{n.body || ''}</div>
                  <div className="portal-listSub">{formatTs(n.createdAt)}</div>
                </div>
                <span className={`portal-badge ${n.read ? 'confirmed' : 'pending'}`.trim()}>
                  {n.read ? 'Read' : 'New'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="portal-pageSubtitle">No notifications in this category.</div>
        )}
      </PortalCard>
    </div>
  )
}
