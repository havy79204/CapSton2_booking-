import React, { useEffect, useMemo, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import '../../styles/report.css'
import {
  IconBarCart,
  IconCalendar,
  IconDollar,
  IconUsers,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function formatVndCompact(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}M VND`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K VND`
  return `${value} VND`
}

function buildLinePath(values, width, height, padding) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const safeRange = Math.max(1, max - min)

  const innerW = width - padding * 2
  const innerH = height - padding * 2

  return values
    .map((v, i) => {
      const x = padding + (innerW * i) / Math.max(1, values.length - 1)
      const y = padding + innerH - ((v - min) / safeRange) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function buildConicGradient(stops) {
  let angle = 0
  const parts = stops.map((s) => {
    const start = angle
    angle += s.pct * 360
    return `${s.color} ${start.toFixed(2)}deg ${angle.toFixed(2)}deg`
  })
  return `conic-gradient(${parts.join(', ')})`
}

function formatYmd(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-US')
}

export default function OwnerReportsPage() {
  const [tab, setTab] = useState('retail')

  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return formatYmd(d)
  })
  const [toDate, setToDate] = useState(() => formatYmd(new Date()))
  const [search, setSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setLoadError('')

        const params = new URLSearchParams()
        if (fromDate) params.set('from', fromDate)
        if (toDate) params.set('to', toDate)
        if (search.trim()) params.set('search', search.trim())
        if (paymentMethod) params.set('paymentMethod', paymentMethod)
        if (sortBy) params.set('sortBy', sortBy)

        const qs = params.toString()
        const res = await api.get(`/api/owner/reports${qs ? `?${qs}` : ''}`)
        if (mounted) setReports(res)
      } catch (err) {
        console.error(err)
        if (mounted) setLoadError(err?.message || 'Unable to load reports')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [fromDate, toDate, search, paymentMethod, sortBy])

  const retailData = reports?.retailOrders || {
    summary: {
      totalOrdersInRange: 0,
      totalQtyInRange: 0,
      totalAmountInRange: 0,
      totalOrdersAfterFilters: 0,
      totalQtyAfterFilters: 0,
      totalAmountAfterFilters: 0,
    },
    filters: { paymentMethods: [] },
    orders: [],
  }

  const retailSummary = retailData.summary || {}
  const retailOrders = Array.isArray(retailData.orders) ? retailData.orders : []
  const paymentMethods = Array.isArray(retailData?.filters?.paymentMethods) ? retailData.filters.paymentMethods : []

  const kpis = useMemo(() => {
    const k = reports?.kpis || {}
    const summary = reports?.retailOrders?.summary || {}
    return [
      {
        title: 'Total Retail Orders (Date Range)',
        value: String(summary?.totalOrdersInRange ?? 0),
        accent: 'var(--primary-2)',
        iconBg: 'rgba(255, 45, 157, 0.08)',
        Icon: IconCalendar,
      },
      {
        title: 'Total Quantity Sold',
        value: String(summary?.totalQtyAfterFilters ?? 0),
        accent: 'var(--purple)',
        iconBg: 'var(--purple-soft)',
        Icon: IconBarCart,
      },
      {
        title: 'Retail Revenue',
        value: formatVndCompact(Number(summary?.totalAmountAfterFilters || 0)),
        accent: 'var(--info)',
        iconBg: 'var(--info-soft)',
        Icon: IconDollar,
      },
      {
        title: 'Active Service Customers',
        value: String(k?.activeCustomers ?? 0),
        accent: 'var(--success)',
        iconBg: 'var(--success-soft)',
        Icon: IconUsers,
      },
    ]
  }, [reports])

  const values = reports?.trend || []
  const safeValues = values.length ? values : [0]
  const svgW = 960
  const svgH = 280
  const padding = 24
  const path = buildLinePath(safeValues, svgW, svgH, padding)

  const services = reports?.services || []
  const staff = reports?.staff || []

  const payments = useMemo(() => {
    const palette = ['var(--primary-2)', 'var(--purple)', 'var(--info)', 'var(--success)', 'var(--warning)']
    const raw = Array.isArray(reports?.payments) ? reports.payments : []
    const base = raw.map((p, idx) => ({
      name: p.name,
      count: Number(p.count || 0),
      color: palette[idx % palette.length],
    }))
    const totalCount = base.reduce((s, p) => s + p.count, 0)
    const denom = totalCount || 1
    const items = base.map((p) => ({ ...p, pct: p.count / denom }))
    return {
      total: totalCount,
      items,
      gradient: buildConicGradient(items.length ? items : [{ color: 'var(--surface)', pct: 1 }]),
    }
  }, [reports])

  const servicesMax = Math.max(...services.map((s) => s.value), 1)
  const staffMaxAppt = Math.max(...staff.map((s) => s.appt), 1)
  const staffMaxRevenue = Math.max(...staff.map((s) => s.revenueM), 1)

  return (
    <div className="portal-report">
      <div className="portal-grid4">
        {kpis.map((kpi) => (
          <PortalCard
            key={kpi.title}
            className="portal-kpi"
            title={kpi.title}
            style={{
              '--kpi-accent': kpi.accent,
              '--kpi-icon-bg': kpi.iconBg,
            }}
            right={
              <div className="portal-kpiIcon" aria-hidden="true">
                <kpi.Icon />
              </div>
            }
          >
            <div className="portal-kpiValue">{kpi.value}</div>
          </PortalCard>
        ))}
      </div>

      <div className="portal-reportsTabs">
        <div className="portal-seg" role="tablist" aria-label="Reports tabs">
          <button
            type="button"
            className={`portal-segBtn ${tab === 'retail' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'retail'}
            onClick={() => setTab('retail')}
          >
            Retail
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'revenue' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'revenue'}
            onClick={() => setTab('revenue')}
          >
            Revenue
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'services' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'services'}
            onClick={() => setTab('services')}
          >
            Services
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'staff' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'staff'}
            onClick={() => setTab('staff')}
          >
            Staff
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'payment' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'payment'}
            onClick={() => setTab('payment')}
          >
            Payments
          </button>
        </div>
      </div>

      {tab === 'retail' ? (
        <>
          <PortalCard className="portal-reportsCart" title="Retail Order Filters">
            <div className="portal-modalGrid2">
              <label className="portal-field" style={{ marginTop: 8 }}>
                <span className="portal-label">From Date</span>
                <input className="portal-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>

              <label className="portal-field" style={{ marginTop: 8 }}>
                <span className="portal-label">To Date</span>
                <input className="portal-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
            </div>

            <div className="portal-modalGrid2">
              <label className="portal-field" style={{ marginTop: 8 }}>
                <span className="portal-label">Search</span>
                <input
                  className="portal-input"
                  placeholder="Order ID / product name / customer name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>

              <label className="portal-field" style={{ marginTop: 8 }}>
                <span className="portal-label">Payment Method</span>
                <select
                  className="portal-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">All</option>
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="portal-field" style={{ marginTop: 8 }}>
              <span className="portal-label">Sort By</span>
              <select className="portal-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="date_desc">Newest sale date</option>
                <option value="date_asc">Oldest sale date</option>
                <option value="total_desc">Total amount descending</option>
                <option value="total_asc">Total amount ascending</option>
                <option value="qty_desc">Quantity descending</option>
                <option value="qty_asc">Quantity ascending</option>
              </select>
            </label>
          </PortalCard>

          <PortalCard className="portal-reportsCart" title="Retail Order Details">
            {loadError ? (
              <div className="portal-formError" role="alert">
                {loadError}
              </div>
            ) : null}

            {loading ? <div className="portal-pageSubtitle">Loading data...</div> : null}

            {!loading ? (
              <>
                <div className="portal-pageSubtitle" style={{ marginBottom: 10 }}>
                  Total filtered orders: <b>{retailSummary?.totalOrdersAfterFilters ?? 0}</b> | Total quantity:{' '}
                  <b>{retailSummary?.totalQtyAfterFilters ?? 0}</b> | Total revenue:{' '}
                  <b>{formatVndCompact(Number(retailSummary?.totalAmountAfterFilters || 0))}</b>
                </div>

                {retailOrders.length === 0 ? (
                  <div className="portal-pageSubtitle">No orders match current filters.</div>
                ) : (
                  <div className="portal-tableWrap">
                    <table className="portal-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Sale Date</th>
                          <th>Products</th>
                          <th>Quantity</th>
                          <th>Payment</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retailOrders.map((o) => {
                          const names = (o.items || []).map((x) => x.productName).filter(Boolean)
                          const productText = names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`
                          return (
                            <tr key={o.orderId}>
                              <td className="portal-invName">{o.orderId}</td>
                              <td>{formatDateTime(o.completedAt || o.orderedAt)}</td>
                              <td>{productText || '-'}</td>
                              <td>{Number(o.totalQty || 0)}</td>
                              <td>
                                <span className="portal-invPill">{o.paymentMethod || '-'}</span>
                              </td>
                              <td>{formatVndCompact(Number(o.totalAmount || 0))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </PortalCard>
        </>
      ) : null}

      {tab === 'revenue' ? (
        <PortalCard className="portal-reportsCart" title="Revenue Trend">
          <div style={{ width: '100%', overflow: 'hidden' }}>
            <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" aria-label="Revenue trend chart">
              <defs>
                <linearGradient id="repLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--primary-2)" />
                  <stop offset="1" stopColor="var(--primary)" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75].map((t) => (
                <line
                  key={t}
                  x1={padding}
                  x2={svgW - padding}
                  y1={padding + (svgH - padding * 2) * t}
                  y2={padding + (svgH - padding * 2) * t}
                  stroke="rgba(107,114,128,0.18)"
                  strokeDasharray="4 6"
                />
              ))}

              <path d={path} stroke="url(#repLine)" strokeWidth="6" fill="none" />
              <path d={path} stroke="rgba(255,255,255,0.9)" strokeWidth="2" fill="none" />
            </svg>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'services' ? (
        <PortalCard className="portal-reportsCart" title="Most Popular Services">
          <div className="portal-reportBarCart" aria-label="Most loved services chart">
            {services.map((s) => (
              <div key={s.name} className="portal-reportBarCol">
                <div
                  className="portal-reportBar"
                  aria-label={`${s.name}: ${s.value}`}
                  style={{ '--bar-h': `${Math.round((s.value / servicesMax) * 240 + 18)}px` }}
                />
                <div className="portal-reportBarLabel">{s.name}</div>
              </div>
            ))}
          </div>
        </PortalCard>
      ) : null}

      {tab === 'staff' ? (
        <PortalCard
          className="portal-reportsCart"
          title={
            <div className="portal-reportTitleRow">
              <span>Staff Performance</span>
              <div className="portal-reportLegend" aria-label="Legend">
                <span className="portal-reportLegendItem">
                  <span className="portal-reportSwatch" style={{ '--swatch': 'var(--purple)' }} /> Appointments
                </span>
                <span className="portal-reportLegendItem">
                  <span className="portal-reportSwatch" style={{ '--swatch': 'var(--primary-2)' }} /> Revenue (millions)
                </span>
              </div>
            </div>
          }
        >
          <div className="portal-reportBarCart" aria-label="Staff performance chart">
            {staff.map((s) => (
              <div key={s.name} className="portal-reportBarCol">
                <div className="portal-reportBarPair" aria-label={`${s.name} performance`}>
                  <div
                    className="portal-reportBarAlt"
                    style={{ '--bar-h': `${Math.round((s.appt / staffMaxAppt) * 240 + 18)}px` }}
                    aria-label={`Appointments: ${s.appt}`}
                  />
                  <div
                    className="portal-reportBar"
                    style={{ '--bar-h': `${Math.round((s.revenueM / staffMaxRevenue) * 240 + 18)}px` }}
                    aria-label={`Revenue (millions): ${s.revenueM}`}
                  />
                </div>
                <div className="portal-reportBarLabel">{s.name}</div>
              </div>
            ))}
          </div>
        </PortalCard>
      ) : null}

      {tab === 'payment' ? (
        <div className="portal-reportsSplit">
          <PortalCard className="portal-reportsCart" title="Payment Methods">
            <div className="portal-reportPayWrap">
              <div className="portal-reportPie" style={{ background: payments.gradient }} aria-label="Payment method pie">
                <div className="portal-reportPieHole" aria-hidden="true" />
              </div>
              <div className="portal-reportPieLabels" aria-label="Pie labels">
                {payments.items.map((p) => (
                  <div key={p.name} className="portal-reportPieLabel" style={{ '--c': p.color }}>
                    {p.name} {Math.round(p.pct * 100)}%
                  </div>
                ))}
              </div>
            </div>
          </PortalCard>

          <PortalCard className="portal-reportsCart" title="Payment Details">
            <div className="portal-reportPayDetails" role="list">
              {payments.items.map((p) => (
                <div key={p.name} className="portal-reportPayRow" role="listitem">
                  <div className="portal-reportPayTop">
                    <div className="portal-reportPayName">
                      <span className="portal-reportDot" style={{ '--dot': p.color }} aria-hidden="true" />
                      {p.name}
                    </div>
                    <div className="portal-reportPayMeta">
                        {p.count} transactions ({(p.pct * 100).toFixed(1)}%)
                    </div>
                  </div>
                  <div className="portal-reportPayTrack" aria-hidden="true">
                    <div className="portal-reportPayFill" style={{ '--fill': p.color, width: `${Math.round(p.pct * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </PortalCard>
        </div>
      ) : null}
    </div>
  )
}