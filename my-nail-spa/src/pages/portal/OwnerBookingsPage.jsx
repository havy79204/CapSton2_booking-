import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Filter, Save, Sparkles } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'
import { formatUsd } from '../../lib/money'

const STATUS = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No-show']

function safeStatus(s) {
  const x = String(s || '').trim()
  if (STATUS.includes(x)) return x
  return 'Pending'
}

function formatWhen(dateISO, time) {
  return `${dateISO || '—'} ${time || ''}`.trim()
}

export function OwnerBookingsPage({ embedded = false } = {}) {
  const auth = useAuth()
  const { t } = useI18n()
  const salonId = auth.user?.salonId

  const statusLabel = useMemo(() => ({
    Pending: t('portal.ownerBookings.status.pending', 'Pending'),
    Confirmed: t('portal.ownerBookings.status.confirmed', 'Confirmed'),
    Completed: t('portal.ownerBookings.status.completed', 'Completed'),
    Cancelled: t('portal.ownerBookings.status.cancelled', 'Cancelled'),
    'No-show': t('portal.ownerBookings.status.noShow', 'No-show'),
  }), [t])

  const [filter, setFilter] = useState('All')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [error, setError] = useState('')
  const [services, setServices] = useState([])
  const [bookings, setBookings] = useState([])

  useEffect(() => {
    let alive = true
    if (!salonId) return undefined

    setLoading(true)
    setError('')

    Promise.all([
      api.listSalonServices(salonId, { includeDraft: true }).catch(() => ({ items: [] })),
      api.listBookings({ salonId }).catch(() => ({ items: [] })),
    ])
      .then(([svcRes, bookingsRes]) => {
        if (!alive) return
        setServices(Array.isArray(svcRes?.items) ? svcRes.items : [])
        setBookings(Array.isArray(bookingsRes?.items) ? bookingsRes.items : [])
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || t('portal.common.error', 'Error'))
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [salonId])

  const serviceName = useMemo(() => {
    const map = new Map()
    for (const s of services) map.set(s.id, s.name)
    return map
  }, [services])

  const rows = useMemo(() => {
    if (!salonId) return []
    const list = (Array.isArray(bookings) ? bookings : [])
      .filter((b) => String(b.salonId || '') === String(salonId))
      .map((b) => {
        const ids = Array.isArray(b.serviceIds) ? b.serviceIds : []
        const names = ids.map((id) => serviceName.get(id) || id).filter(Boolean)
        return {
          ...b,
          status: safeStatus(b.status),
          serviceNames: names,
        }
      })
      .sort((a, b) => {
        const aa = `${a.dateISO || ''} ${a.timeSlot || ''}`
        const bb = `${b.dateISO || ''} ${b.timeSlot || ''}`
        return aa < bb ? 1 : -1
      })

    if (filter === 'All') return list
    return list.filter((b) => safeStatus(b.status) === filter)
  }, [bookings, filter, salonId, serviceName])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  async function updateStatus(bookingId, nextStatus) {
    if (!bookingId) return
    setError('')
    try {
      const res = await api.updateBookingStatus(bookingId, nextStatus)
      const updated = res?.item
      if (updated) {
        setBookings((prev) => (Array.isArray(prev) ? prev.map((b) => (b.id === bookingId ? updated : b)) : prev))
      }
      markSaved()
    } catch (e) {
      setError(e?.message || t('portal.common.error', 'Error'))
    }
  }

  async function handleCancelBooking(bookingId) {
    if (!window.confirm(t('portal.ownerBookings.cancelConfirm', 'Are you sure you want to cancel this booking?'))) return
    
    setCancelling(bookingId)
    setError('')
    try {
      const res = await api.cancelBooking(bookingId)
      const updated = res?.item
      if (updated) {
        setBookings((prev) => (Array.isArray(prev) ? prev.map((b) => (b.id === bookingId ? updated : b)) : prev))
      }
      markSaved()
      alert(t('portal.ownerBookings.cancelSuccess', 'Booking cancelled successfully'))
    } catch (e) {
      const msg = e?.message || t('portal.common.error', 'Error')
      setError(msg)
      alert(msg)
    } finally {
      setCancelling(null)
    }
  }

  if (!salonId) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900 }}>{t('portal.common.noSalon', 'No salon assigned')}</div>
        <div className="muted" style={{ marginTop: 8 }}>{t('portal.common.noSalonHint', "This account doesn't have a salonId.")}</div>
      </div>
    )
  }

  return (
    <>
      {!embedded ? (
        <div className="sectionHeader" style={{ marginBottom: 14 }}>
          <h2>{t('portal.ownerBookings.title', 'Bookings')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Sparkles size={16} />
            {t('portal.ownerBookings.subtitle', 'View and update customer booking status (SQL Server)')}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={16} />
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="All">{t('portal.ownerBookings.filter.all', 'All statuses')}</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>{statusLabel[s] || s}</option>
          ))}
        </select>
        <div className="muted" style={{ fontSize: 13 }}>
          {loading
            ? t('portal.ownerBookings.loading', 'Loading…')
            : saved
              ? t('portal.ownerBookings.saved', 'Saved!')
              : t('portal.ownerBookings.showing', 'Showing {{count}} bookings').replace('{{count}}', rows.length)}
        </div>
        <div style={{ flex: 1 }} />
        <div className="muted" style={{ fontSize: 13, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Save size={14} /> {t('portal.ownerBookings.persist', 'Status updates persist in SQL Server')}
        </div>
      </div>

      <div className="portalTable card portalCols5">
        <div className="portalTableHead">
          <div>{t('portal.ownerBookings.table.when', 'When')}</div>
          <div>{t('portal.ownerBookings.table.customer', 'Customer')}</div>
          <div>{t('portal.ownerBookings.table.services', 'Services')}</div>
          <div>{t('portal.ownerBookings.table.total', 'Total')}</div>
          <div>{t('portal.ownerBookings.table.status', 'Status')}</div>
          <div>{t('portal.ownerBookings.table.actions', 'Actions')}</div>
        </div>

        {rows.map((b) => {
          const status = String(b.status || '').toLowerCase()
          const canCancel = status === 'pending'
          
          return (
            <div key={b.id} className="portalTableRow">
              <div style={{ fontWeight: 950, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <span className="badge"><CalendarCheck size={14} /></span>
                {formatWhen(b.dateISO, b.timeSlot) || t('portal.common.none', '—')}
              </div>
              <div className="muted">{b.customerName || t('portal.common.none', '—')}</div>
              <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(b.serviceNames || []).join(', ') || t('portal.common.none', '—')}
              </div>
              <div style={{ fontWeight: 900 }}>{formatUsd(b.totalPrice || 0)}</div>
              <div>
                <select
                  className="input"
                  value={safeStatus(b.status)}
                  onChange={(e) => void updateStatus(b.id, e.target.value)}
                  style={{ maxWidth: 180 }}
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>{statusLabel[s] || s}</option>
                  ))}
                </select>
              </div>
              <div>
                {canCancel ? (
                  <button 
                    className="btn" 
                    onClick={() => handleCancelBooking(b.id)}
                    disabled={cancelling === b.id}
                    style={{ fontSize: 13, padding: '6px 12px' }}
                  >
                    {cancelling === b.id ? t('portal.ownerBookings.cancelling', 'Cancelling...') : t('portal.ownerBookings.cancel', 'Cancel')}
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>{t('portal.common.none', '—')}</span>
                )}
              </div>
            </div>
          )
        })}

        {!rows.length ? (
          <div className="muted" style={{ padding: 14 }}>{t('portal.ownerBookings.none', 'No bookings yet.')}</div>
        ) : null}
      </div>
    </>
  )
}
