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
        <h2 style={{ color: '#6a5562' }}>
          {t('site.orders.title', 'Orders')}
        </h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center', color: '#6a5562' }}>
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
          <div className="portalTable portalCols7 card">
            <div className="portalTableHead">
              <div>{t('site.orders.col.order', 'Order')}</div>
              <div>{t('site.orders.col.date', 'Date')}</div>
              <div style={{ textAlign: 'center' }}>{t('site.orders.col.items', 'Items')}</div>
              <div>{t('site.orders.col.payment', 'Payment')}</div>
              <div>{t('site.orders.col.total', 'Total')}</div>
              <div>{t('site.orders.col.status', 'Status')}</div>
              <div style={{ textAlign: 'center' }}>{t('site.orders.col.actions', 'Actions')}</div>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {summarizeItems(o.items) || t('site.orders.fallbackLabel', 'Order')}
                    </div>
                    <div className="muted" style={{ fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.id}>
                      #{o.id.substring(0, 12)}...
                    </div>
                  </div>
                  <div style={{ fontSize: 13 }}>{formatDate(o.createdAt)}</div>
                  <div style={{ textAlign: 'center', fontWeight: 600 }}>{(o.items || []).reduce((s, it) => s + (it.qty || 0), 0)}</div>
                  <div style={{ fontSize: 13 }}>
                    <span className="badge" style={{ backgroundColor: o.paymentMethod === 'VNPAY' ? '#0066cc' : '#16a34a', color: 'white', fontSize: 11 }}>
                      {o.paymentMethod || 'N/A'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{formatUsd(o.totals?.total ?? 0)}</div>
                  <div>
                    <span
                      className="badge"
                      style={{ 
                        backgroundColor: statusColor(), 
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '6px 12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      {t(`site.orders.status.${normalizedStatus}`, statusLabel)}
                    </span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {canCancel ? (
                      <button 
                        className="btn" 
                        onClick={() => handleCancelOrder(o.id)}
                        disabled={cancelling === o.id}
                        style={{ 
                          fontSize: 12, 
                          padding: '8px 16px',
                          backgroundColor: 'rgba(220, 38, 38, 0.1)',
                          border: '1px solid rgba(220, 38, 38, 0.3)',
                          color: '#dc2626',
                          fontWeight: 600
                        }}
                      >
                        {cancelling === o.id ? t('site.orders.cancelling', 'Cancelling...') : t('site.orders.cancel', 'Cancel')}
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>{t('site.common.none', '—')}</span>
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
