import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle, Mail, SunMedium } from 'lucide-react'

import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'

export function NotificationsPage() {
  const auth = useAuth()
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [settings, setSettings] = useState({ enableNotifications: true, enableEmail: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [s, list] = await Promise.all([
          api.getNotificationSettings().catch(() => ({})),
          api.listNotifications().catch(() => ({ items: [] })),
        ])
        if (!alive) return
        setSettings({
          enableNotifications: s?.settings?.enableNotifications !== false,
          enableEmail: s?.settings?.enableEmail !== false,
        })
        setItems(
  Array.isArray(list?.items)
    ? list.items
    : Array.isArray(list)
    ? list
    : []
)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const unreadCount = useMemo(() => items.filter((n) => !n.IsRead && n.isRead !== true).length, [items])

  async function toggleSetting(key) {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    setSaving(true)
    try {
      const res = await api.updateNotificationSettings(next)
      setSettings({
        enableNotifications: res?.settings?.enableNotifications !== false,
        enableEmail: res?.settings?.enableEmail !== false,
      })
    } finally {
      setSaving(false)
    }
  }

  async function markAllRead() {
    const ids = items.filter((n) => !n.IsRead && !n.isRead).map((n) => n.NotificationId || n.notificationId)
    if (!ids.length) return
    try {
      await api.markNotificationsRead(ids)
      setItems((prev) => prev.map((n) => ({ ...n, IsRead: true, isRead: true })))
    } catch {
      // ignore
    }
  }

  function formatDate(s) {
    if (!s) return ''
    try {
      return new Date(s).toLocaleString()
    } catch {
      return s
    }
  }

  const headerTone = settings.enableNotifications ? '#16a34a' : '#f97316'

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader" style={{ gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={18} color={headerTone} />
            <h2 style={{ margin: 0 }}>{t('site.notifications.title', 'Notifications')}</h2>
            {unreadCount ? (
              <span className="badge" style={{ background: '#ef4444', color: '#fff' }}>{unreadCount}</span>
            ) : null}
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={markAllRead} disabled={!unreadCount} style={{ fontSize: 13, padding: '6px 10px' }}>
            {t('site.notifications.markAll', 'Mark all read')}
          </button>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SunMedium size={16} />
            <div>
              <div style={{ fontWeight: 800 }}>{t('site.notifications.enable', 'Enable notifications')}</div>
              <div className="muted" style={{ fontSize: 13 }}>{t('site.notifications.enableDesc', 'In-app alerts for bookings and reminders.')}</div>
            </div>
          </div>
          <label className="switch" style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={settings.enableNotifications} onChange={() => toggleSetting('enableNotifications')} disabled={saving} />
            <span>{settings.enableNotifications ? t('site.notifications.on', 'On') : t('site.notifications.off', 'Off')}</span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mail size={16} />
            <div>
              <div style={{ fontWeight: 800 }}>{t('site.notifications.email', 'Email notifications')}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {t('site.notifications.emailDesc', 'Send copies to {{email}} when available.').replace('{{email}}', auth.user?.email || t('site.notifications.yourEmail', 'your email'))}
              </div>
            </div>
          </div>
          <label className="switch" style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={settings.enableEmail} onChange={() => toggleSetting('enableEmail')} disabled={saving} />
            <span>{settings.enableEmail ? t('site.notifications.on', 'On') : t('site.notifications.off', 'Off')}</span>
          </label>
        </div>

        {loading ? (
          <div className="card" style={{ padding: 14 }}>{t('site.common.loading', 'Loading…')}</div>
        ) : !items.length ? (
          <div className="card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>{t('site.notifications.emptyTitle', 'No notifications yet')}</div>
            <div className="muted" style={{ fontSize: 13 }}>{t('site.notifications.emptyDesc', 'We will show booking reminders and updates here.')}</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {items.map((n) => {
              const read = n.IsRead || n.isRead
              return (
                <div key={n.NotificationId || n.notificationId} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderBottom: '1px solid #e5e7eb', background: read ? '#fff' : '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#eef2ff', color: '#6366f1' }}>
                    <CheckCircle size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>{n.Title || n.title}</div>
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{n.Body || n.body}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{formatDate(n.CreatedAt || n.createdAt)}</div>
                  </div>
                  {!read ? (
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: '6px 10px' }}
                      onClick={async () => {
                        const id = n.NotificationId || n.notificationId
                        try {
                          await api.markNotificationsRead([id])
                          setItems((prev) => prev.map((x) => (x === n ? { ...x, IsRead: true, isRead: true } : x)))
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      {t('site.notifications.markOne', 'Mark read')}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
