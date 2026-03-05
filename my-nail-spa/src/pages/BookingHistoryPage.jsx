import { useEffect, useMemo } from 'react'
import { CalendarCheck, MapPin } from 'lucide-react'

import { useBookings } from '../context/BookingContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'
import { formatUsd } from '../lib/money'

export function BookingHistoryPage() {
  const { t } = useI18n()
  const bookings = useBookings()
  const auth = useAuth()

  const phone = (auth.user?.phone || '').trim()
  const name = (auth.user?.name || '').trim().toLowerCase()

  useEffect(() => {
    if (phone) {
      bookings.refresh({ customerPhone: phone }).catch(() => {})
    } else if (name) {
      bookings.refresh({ customerName: auth.user?.name || '' }).catch(() => {})
    }
  }, [auth.user?.name, bookings, phone, name])

  const rows = useMemo(() => {
    const list = Array.isArray(bookings.bookings) ? bookings.bookings : []
    const filtered = list.filter((b) => {
      if (phone) return (b.customerPhone || '').trim() === phone
      if (name) return (b.customerName || '').trim().toLowerCase() === name
      return true
    })
    return filtered.sort((a, b) => (a.createdAt && b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : 0))
  }, [bookings.bookings, phone, name])

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('site.bookingHistory.title', 'Your bookings')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <CalendarCheck size={16} />
            {t('site.bookingHistory.subtitle', 'All booking transactions')}
          </div>
        </div>

        {!rows.length ? (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 900 }}>{t('site.bookingHistory.emptyTitle', 'No bookings yet')}</div>
            <div className="muted" style={{ marginTop: 6 }}>{t('site.bookingHistory.emptyDesc', 'You have not made any bookings.')}</div>
          </div>
        ) : (
          <div className="portalTable card">
            <div className="portalTableHead">
              <div>{t('site.bookingHistory.col.when', 'When')}</div>
              <div>{t('site.bookingHistory.col.salon', 'Salon')}</div>
              <div>{t('site.bookingHistory.col.services', 'Services')}</div>
              <div>{t('site.bookingHistory.col.status', 'Status')}</div>
              <div>{t('site.bookingHistory.col.total', 'Total')}</div>
            </div>
            {rows.map((b) => {
              const status = String(b.status || 'pending').toLowerCase()
              return (
                <div key={b.id} className="portalTableRow">
                  <div style={{ fontWeight: 900 }}>{b.dateISO} · {b.timeSlot}</div>
                  <div className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <MapPin size={14} />
                    {b.salonName || b.salonId || '—'}
                  </div>
                  <div className="muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(b.serviceIds || []).join(', ') || t('site.common.none', '—')}
                  </div>
                  <div>
                    <span className="badge" style={{
                      background: status === 'cancelled' ? '#f87171' : status === 'confirmed' ? '#22c55e' : status === 'completed' ? '#3b82f6' : status === 'paymentfailed' ? '#f97316' : '#6b7280',
                      color: '#fff',
                    }}>
                      {t(`site.bookingHistory.status.${status}`, b.status || 'pending')}
                    </span>
                  </div>
                  <div style={{ fontWeight: 900 }}>{formatUsd(b.totalPrice || 0)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
