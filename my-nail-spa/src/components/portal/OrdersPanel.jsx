import { useEffect, useMemo, useState } from 'react'
import { Filter, Mail, Phone, ShoppingBag, User } from 'lucide-react'

import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'

const ORDER_STATUS = ['Pending', 'Confirmed', 'Processing', 'Shipping', 'Completed', 'Cancelled']
const BOOKING_STATUS = ['Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No Show']

function statusKey(status) {
  const s = String(status || '').trim()
  if (!s) return 'unknown'
  return s.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')
}

function normalizeStatus(status) {
  const s = String(status || '').trim()
  if (s === 'Paid') return 'Confirmed'
  if (s === 'Booked') return 'Confirmed'
  return s || 'Pending'
}

function getStatusColor(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return '#16a34a'
  if (s === 'cancelled' || s === 'no show') return '#dc2626'
  if (s === 'confirmed' || s === 'paid') return '#2563eb'
  if (s === 'processing' || s === 'in progress') return '#f59e0b'
  if (s === 'shipping') return '#8b5cf6'
  return '#6b7280'
}

function formatMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

function formatDateTime(iso, t) {
  try {
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return t('portal.orders.time.justNow', 'Just now')
    if (diffMins < 60) return t('portal.orders.time.minsAgo', '{{mins}}m ago').replace('{{mins}}', diffMins)
    if (diffHours < 24) return t('portal.orders.time.hoursAgo', '{{hours}}h ago').replace('{{hours}}', diffHours)
    if (diffDays < 7) return t('portal.orders.time.daysAgo', '{{days}}d ago').replace('{{days}}', diffDays)
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return t('portal.common.none', '—')
  }
}

export function OrdersPanel({ salonId } = {}) {
  const { t } = useI18n()
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [bookings, setBookings] = useState([])
  const [orders, setOrders] = useState([])

  function summarizeItems(items) {
    const list = Array.isArray(items) ? items : []
    const names = list
      .map((x) => String(x?.name || x?.productName || '').trim())
      .filter(Boolean)
    if (!names.length) return ''
    const uniq = Array.from(new Set(names))
    const head = uniq.slice(0, 2)
    const rest = uniq.length - head.length
    return rest > 0 ? `${head.join(', ')} +${rest}` : head.join(', ')
  }

  useEffect(() => {
    let alive = true
    if (!salonId) return undefined

    setLoading(true)
    setError('')

    Promise.all([
      api.listBookings({ salonId }).catch(() => ({ items: [] })),
      api.listOrders({ salonKey: salonId }).catch(() => ({ items: [] })),
    ])
      .then(([bookRes, ordersRes]) => {
        if (!alive) return
        setBookings(Array.isArray(bookRes?.items) ? bookRes.items : [])
        setOrders(Array.isArray(ordersRes?.items) ? ordersRes.items : [])
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || t('portal.orders.errorLoad', 'Failed to load orders'))
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [salonId])

  const rows = useMemo(() => {
    const bookingRows = (Array.isArray(bookings) ? bookings : [])
      .filter((b) => !salonId || String(b.salonId || '') === String(salonId))
      .map((b) => ({
        id: `booking:${b.id}`,
        rawId: b.id,
        label: b.customerName
          ? t('portal.orders.bookingLabelCustomer', 'Service booking — {{name}}').replace('{{name}}', b.customerName)
          : t('portal.orders.bookingLabel', 'Service booking'),
        channel: t('portal.orders.channel.online', 'Online'),
        total: Number(b.totalPrice || 0),
        status: normalizeStatus(b.status),
        paymentMethod: t('portal.common.none', '—'),
        customerName: b.customerName || t('portal.common.none', '—'),
        customerContact: b.customerPhone || t('portal.common.none', '—'),
        createdAt: b.createdAt,
        editable: true,
        isBooking: true,
      }))

    const retailRows = (Array.isArray(orders) ? orders : []).map((o) => ({
        id: `order:${o.id}`,
        rawId: o.id,
        label: summarizeItems(o.items) || t('portal.orders.retailLabel', 'Retail order'),
        channel: t('portal.orders.channel.online', 'Online'),
        total: Number(o.totals?.total ?? 0),
        status: normalizeStatus(o.status),
        paymentMethod: o.paymentMethod || t('portal.orders.payment.cod', 'COD'),
        customerName: o.customer?.name || o.customerName || t('portal.common.none', '—'),
        customerContact: o.customer?.email || o.customerEmail || o.customer?.phone || t('portal.common.none', '—'),
        createdAt: o.createdAt,
        editable: true,
        isBooking: false,
      }))

    const all = [...retailRows, ...bookingRows]
    if (filter === 'All') return all
    if (filter === 'Service') return all.filter((o) => o.isBooking)
    if (filter === 'Retail') return all.filter((o) => !o.isBooking)
    return all
  }, [bookings, filter, orders, salonId])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  async function updateOrderStatus(orderId, nextStatus) {
    if (!orderId) return
    
    const criticalStatuses = ['Cancelled', 'Completed']
    if (criticalStatuses.includes(nextStatus)) {
      const action = nextStatus === 'Cancelled'
        ? t('portal.orders.confirm.cancel', 'cancel')
        : t('portal.orders.confirm.complete', 'complete')
      if (!window.confirm(t('portal.orders.confirm.order', 'Are you sure you want to {{action}} this order?').replace('{{action}}', action))) {
        return
      }
    }

    setError('')
    setUpdating(`order:${orderId}`)
    
    try {
      const res = await api.updateOrderStatus(orderId, nextStatus)
      const updated = res?.item
      
      if (updated) {
        setOrders((prev) => Array.isArray(prev) ? prev.map((o) => o.id === orderId ? updated : o) : prev)
        markSaved()
      }
    } catch (e) {
      setError(e?.message || t('portal.orders.errorUpdate', 'Failed to update order status'))
      alert(t('portal.orders.errorUpdateAlert', 'Failed to update status: {{msg}}').replace('{{msg}}', e?.message || 'Unknown error'))
    } finally {
      setUpdating(null)
    }
  }

  async function updateBookingStatus(bookingId, nextStatus) {
    if (!bookingId) return
    
    const criticalStatuses = ['Cancelled', 'Completed', 'No Show']
    if (criticalStatuses.includes(nextStatus)) {
      const action = nextStatus === 'Cancelled'
        ? t('portal.orders.confirm.cancel', 'cancel')
        : nextStatus === 'No Show'
          ? t('portal.orders.confirm.noShow', 'mark as no-show')
          : t('portal.orders.confirm.complete', 'complete')
      if (!window.confirm(t('portal.orders.confirm.booking', 'Are you sure you want to {{action}} this booking?').replace('{{action}}', action))) {
        return
      }
    }

    setError('')
    setUpdating(`booking:${bookingId}`)
    
    try {
      const res = await api.updateBookingStatus(bookingId, nextStatus)
      const updated = res?.item
      
      if (updated) {
        setBookings((prev) => Array.isArray(prev) ? prev.map((b) => b.id === bookingId ? updated : b) : prev)
        markSaved()
      }
    } catch (e) {
      setError(e?.message || t('portal.orders.errorUpdateBooking', 'Failed to update booking status'))
      alert(t('portal.orders.errorUpdateAlert', 'Failed to update status: {{msg}}').replace('{{msg}}', e?.message || 'Unknown error'))
    } finally {
      setUpdating(null)
    }
  }

  return (
    <>
      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12, border: '1px solid rgba(255,59,122,0.35)' }}>

          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={16} />
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="All">{t('portal.orders.filter.all', 'All')}</option>
          <option value="Service">{t('portal.orders.filter.service', 'Service')}</option>
          <option value="Retail">{t('portal.orders.filter.retail', 'Retail')}</option>
        </select>
        <div className="muted" style={{ fontSize: 13 }}>
          {loading
            ? t('portal.common.loading', 'Loading…')
            : saved
              ? t('portal.common.saved', 'Saved!')
              : t('portal.orders.showing', 'Showing {{count}} orders').replace('{{count}}', rows.length)}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <div className="portalTable card portalCols6">
        <div className="portalTableHead">
          <div>{t('portal.orders.col.order', 'Order')}</div>
          <div>{t('portal.orders.col.customer', 'Customer')}</div>
          <div>{t('portal.orders.col.payment', 'Payment')}</div>
          <div>{t('portal.orders.col.total', 'Total')}</div>
          <div>{t('portal.orders.col.created', 'Created')}</div>
          <div>{t('portal.orders.col.status', 'Status')}</div>
        </div>
        {rows.map((o) => {
          const isUpdating = updating === o.id
          const statusOptions = o.isBooking ? BOOKING_STATUS : ORDER_STATUS
          
          return (
            <div key={o.id} className="portalTableRow">
              <div style={{ fontWeight: 950, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <span className="badge"><ShoppingBag size={14} /></span>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>
                    {o.label || t('portal.orders.fallbackLabel', 'Order')}
                  </div>
                  <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>
                    {o.id}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <User size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                  <span style={{ fontWeight: 900, fontSize: 13 }}>{o.customerName}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {o.customerContact.includes('@') ? (
                    <Mail size={12} style={{ color: '#10b981', flexShrink: 0 }} />
                  ) : (
                    <Phone size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>{o.customerContact}</span>
                </div>
              </div>
              <div className="muted">{o.paymentMethod || '—'}</div>
              <div style={{ fontWeight: 900 }}>{formatMoney(o.total)}</div>
              <div className="muted" style={{ fontSize: 13 }}>{formatDateTime(o.createdAt, t)}</div>
              <div>
                <select
                  className="input"
                  value={o.status}
                  onChange={(e) => {
                    const newStatus = e.target.value
                    if (o.editable && !isUpdating) {
                      if (o.isBooking) {
                        updateBookingStatus(o.rawId, newStatus)
                      } else {
                        updateOrderStatus(o.rawId, newStatus)
                      }
                    }
                  }}
                  disabled={!o.editable || isUpdating}
                  style={{
                    maxWidth: 180,
                    fontSize: 14,
                    background: getStatusColor(o.status),
                    color: 'white',
                    fontWeight: 600,
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: o.editable && !isUpdating ? 'pointer' : 'not-allowed',
                    opacity: isUpdating ? 0.6 : 1,
                  }}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{t(`portal.orders.status.${statusKey(s)}`, s)}</option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
