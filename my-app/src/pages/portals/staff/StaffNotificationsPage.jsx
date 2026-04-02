import React, { useEffect, useState } from 'react'
import PortalCard from '../../../components/Layout portal/PortalCard.jsx'
import { api } from '../../../lib/api.js'

function formatTs(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

export default function StaffNotificationsPage() {
  const [items, setItems] = useState([])
  const [msg, setMsg] = useState('')

  async function load() {
    setMsg('')
    try {
      const data = await api.get('/api/staff/notifications')
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setMsg(err?.message || 'Unable to load notifications.')
    }
  }

  useEffect(() => {
    Promise.resolve().then(load)
  }, [])

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
                await api.post('/api/staff/notifications/read', {})
                await load()
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

        {items.length ? (
          <div className="portal-list" role="list">
            {items.map((n) => (
              <div
                key={n.id}
                className="portal-listItem"
                role="listitem"
                style={{ opacity: n.read ? 0.7 : 1 }}
              >
                <div className="portal-listPrimary">
                  <div className="portal-listTitle" style={{ fontWeight: 900 }}>
                    {n.title || 'Notification'}
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
          <div className="portal-pageSubtitle">No notifications yet.</div>
        )}
      </PortalCard>
    </div>
  )
}
