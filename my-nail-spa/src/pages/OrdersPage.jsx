import { useEffect, useState } from 'react'
import { PackageOpen, Receipt } from 'lucide-react'

import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'
import { formatUsd } from '../lib/money'
import { api } from '../lib/api'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function OrdersPage() {
  const auth = useAuth()
  const { t } = useI18n()

  const [orders, setOrders] = useState([])
  const [cancelling, setCancelling] = useState(null)

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

  async function handleCancelOrder(orderId) {
    if (!window.confirm(t('site.orders.confirmCancel', 'Are you sure you want to cancel this order?'))) return
    
    setCancelling(orderId)
    try {
      await api.cancelOrder(orderId)
      // Refresh orders list
      const email = auth.user?.email
      const userId = auth.user?.id
      const r = await api.listOrders({ userId, email })
      setOrders(Array.isArray(r?.items) ? r.items : [])
      alert(t('site.orders.cancelSuccess', 'Order cancelled successfully'))
    } catch (err) {
      alert(err?.message || t('site.orders.cancelError', 'Failed to cancel order'))
    } finally {
      setCancelling(null)
    }
  }

  useEffect(() => {
    let alive = true
    const email = auth.user?.email
    const userId = auth.user?.id

    api
      .listOrders({ userId, email })
      .then((r) => {
        if (!alive) return
        setOrders(Array.isArray(r?.items) ? r.items : [])
      })
      .catch(() => {
        if (!alive) return
        setOrders([])
      })

    return () => {
      alive = false
    }
  }, [auth.user?.email, auth.user?.id])

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('site.orders.title', 'Orders')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Receipt size={16} />
            {t('site.orders.subtitle', 'Your checkout history')}
          </div>
        </div>

        {!orders.length ? (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 900 }}>
              <PackageOpen size={18} />
              {t('site.orders.emptyTitle', 'No orders yet')}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              {t('site.orders.emptyDesc', 'Place an order from Cart to see it here.')}
            </div>
          </div>
        ) : (
          <div className="portalTable card">
            <div className="portalTableHead">
              <div>{t('site.orders.col.order', 'Order')}</div>
              <div>{t('site.orders.col.date', 'Date')}</div>
              <div>{t('site.orders.col.items', 'Items')}</div>
              <div>{t('site.orders.col.payment', 'Payment')}</div>
              <div>{t('site.orders.col.total', 'Total')}</div>
              <div>{t('site.orders.col.status', 'Status')}</div>
              <div>{t('site.orders.col.actions', 'Actions')}</div>
            </div>

            {orders.map((o) => {
              const rawStatus = String(o.status || 'Unknown').toLowerCase()
              const normalizedStatus = rawStatus === 'pendingpayment' ? 'pending' : rawStatus
              const canCancel = normalizedStatus === 'pending'

              function statusColor() {
                if (normalizedStatus === 'cancelled' || normalizedStatus === 'paymentfailed') return '#dc2626'
                if (normalizedStatus === 'paid' || normalizedStatus === 'completed') return '#16a34a'
                if (normalizedStatus === 'paidinventorypending') return '#f59e0b'
                return '#6b7280'
              }

              const statusLabel = normalizedStatus.replace(/\b\w/g, (m) => m.toUpperCase()) || 'Unknown'
              
              return (
                <div key={o.id} className="portalTableRow">
                  <div style={{ fontWeight: 950, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span className="badge"><Receipt size={14} /></span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div style={{ fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>
                        {summarizeItems(o.items) || t('site.orders.fallbackLabel', 'Order')}
                      </div>
                      <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>
                        {o.id}
                      </div>
                    </div>
                  </div>
                  <div className="muted">{formatDate(o.createdAt)}</div>
                  <div className="muted">{(o.items || []).reduce((s, it) => s + (it.qty || 0), 0)}</div>
                  <div className="muted">{o.paymentMethod || t('site.common.none', '—')}</div>
                  <div style={{ fontWeight: 950 }}>{formatUsd(o.totals?.total ?? 0)}</div>
                  <div>
                    <span
                      className="badge"
                      style={{ backgroundColor: statusColor(), color: 'white' }}
                    >
                      {t(`site.orders.status.${normalizedStatus}`, statusLabel)}
                    </span>
                  </div>
                  <div>
                    {canCancel ? (
                      <button 
                        className="btn" 
                        onClick={() => handleCancelOrder(o.id)}
                        disabled={cancelling === o.id}
                        style={{ fontSize: 13, padding: '6px 12px' }}
                      >
                        {cancelling === o.id ? t('site.orders.cancelling', 'Cancelling...') : t('site.orders.cancel', 'Cancel')}
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 13 }}>{t('site.common.none', '—')}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
