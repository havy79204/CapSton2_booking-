import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import {
  IconAlertTriangle,
  IconBarCart,
  IconCalendar,
  IconClock,
  IconCube,
  IconDollar,
  IconInfo,
  IconUsers,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function formatVnd(value) {
  const amount = Number(value || 0)
  return amount.toLocaleString('vi-VN') + ' VND'
}

function formatCompactVnd(value) {
  const amount = Number(value || 0)
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1).replace('.', ',') + 'M VND'
  if (amount >= 1_000) return Math.round(amount / 1_000) + 'K VND'
  return amount + ' VND'
}

function pctText(value) {
  const n = Number(value || 0)
  if (n > 0) return '+' + n + '%'
  return n + '%'
}

function clipText(value, max = 72) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '...'
}

function buildConic(parts) {
  const total = parts.reduce((s, x) => s + Number(x.value || 0), 0)
  if (total <= 0) return 'conic-gradient(#e2e8f0 0deg 360deg)'
  let angle = 0
  const ranges = parts.map((p) => {
    const start = angle
    angle += (Number(p.value || 0) / total) * 360
    return `${p.color} ${start.toFixed(1)}deg ${angle.toFixed(1)}deg`
  })
  return `conic-gradient(${ranges.join(', ')})`
}

function statusTone(level) {
  if (level === 'good') return 'is-good'
  if (level === 'warning') return 'is-warning'
  if (level === 'critical') return 'is-critical'
  return 'is-neutral'
}

export default function OwnerDashboardPage() {
  const [period, setPeriod] = useState('day')
  const [refDate, setRefDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [refMonth, setRefMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [refYear, setRefYear] = useState(() => String(new Date().getFullYear()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hoveredRevenueBar, setHoveredRevenueBar] = useState(null)

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ period })
      if (period === 'day' || period === 'week') params.set('refDate', refDate)
      if (period === 'month') params.set('refMonth', refMonth)
      if (period === 'year') params.set('refYear', refYear)
      const result = await api.get('/api/owner/dashboard?' + params.toString())
      setData(result)
    } catch (err) {
      setError(err?.message || 'Unable to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [period, refDate, refMonth, refYear])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const timer = setInterval(() => {
      loadDashboard()
    }, 30000)
    return () => clearInterval(timer)
  }, [loadDashboard])

  const trendRows = useMemo(() => {
    const bucket = data?.revenueData?.[period]
    return Array.isArray(bucket) ? bucket : []
  }, [data, period])

  const revenueTotalSeries = useMemo(() => trendRows.map((x) => Number(x.revenueTotal || x.revenue || 0)), [trendRows])

  const revenueChartMeta = useMemo(() => {
    const maxRevenueRaw = Math.max(...(revenueTotalSeries.length ? revenueTotalSeries : [0]), 0)
    const revenueUnit = maxRevenueRaw >= 1_000_000 ? 1_000_000 : maxRevenueRaw >= 100_000 ? 100_000 : 10_000
    const maxRevenue = Math.max(revenueUnit, Math.ceil(maxRevenueRaw / revenueUnit) * revenueUnit)
    const revenueTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(maxRevenue * r))
    return { maxRevenue, revenueTicks }
  }, [revenueTotalSeries])

  const hoveredRevenuePoint = hoveredRevenueBar !== null ? trendRows[hoveredRevenueBar] : null

  const revenueSplit = [
    { label: 'Booking Revenue', value: Number(data?.revenueBreakdown?.services || 0), color: '#f59e0b' },
    { label: 'Order Revenue', value: Number(data?.revenueBreakdown?.products || 0), color: '#2563eb' },
  ]

  const revenueBreakdownMeta = useMemo(() => {
    const bookingRevenue = Number(data?.revenueBreakdown?.services || 0)
    const orderRevenue = Number(data?.revenueBreakdown?.products || 0)
    const total = bookingRevenue + orderRevenue
    const bookingPct = total > 0 ? Math.round((bookingRevenue / total) * 1000) / 10 : 0
    const orderPct = total > 0 ? Math.round((orderRevenue / total) * 1000) / 10 : 0
    return { bookingRevenue, orderRevenue, total, bookingPct, orderPct }
  }, [data])

  const bookingStatusSummary = useMemo(() => {
    const apiStatus = data?.bookingStatus || {}
    const fromApi = {
      pending: Number(apiStatus.pending || apiStatus.upcoming || 0),
      booked: Number(apiStatus.booked || 0),
      completed: Number(apiStatus.completed || 0),
      canceled: Number(apiStatus.canceled || apiStatus.cancelled || 0) + Number(apiStatus.noShow || 0),
    }

    const apiTotal = fromApi.pending + fromApi.booked + fromApi.completed + fromApi.canceled
    if (apiTotal > 0) return fromApi

    const schedule = Array.isArray(data?.todaySchedule) ? data.todaySchedule : []
    const fromSchedule = { pending: 0, booked: 0, completed: 0, canceled: 0 }
    for (const row of schedule) {
      const raw = String(row?.status || row?.statusLabel || '').trim().toLowerCase()
      if (raw === 'completed' || raw === 'complete' || raw === 'done') fromSchedule.completed += 1
      else if (raw === 'booked' || raw === 'confirmed' || raw === 'confirm') fromSchedule.booked += 1
      else if (raw === 'canceled' || raw === 'cancelled' || raw === 'cancel' || raw === 'no-show' || raw === 'noshow' || raw === 'no_show' || raw === 'no show') fromSchedule.canceled += 1
      else fromSchedule.pending += 1
    }
    return fromSchedule
  }, [data])

  const bookingStatusParts = [
    { label: 'Pending', value: bookingStatusSummary.pending, color: '#f59e0b' },
    { label: 'Booked', value: bookingStatusSummary.booked, color: '#3b82f6' },
    { label: 'Completed', value: bookingStatusSummary.completed, color: '#22c55e' },
    { label: 'Cancelled', value: bookingStatusSummary.canceled, color: '#ef4444' },
  ]

  const customerParts = [
    { label: 'New', value: Number(data?.customerOverview?.newCustomers || 0), color: '#3b82f6' },
    { label: 'Returning', value: Number(data?.customerOverview?.returningCustomers || 0), color: '#22c55e' },
  ]

  const orderStatusMapped = useMemo(() => {
    const base = Array.isArray(data?.ordersByStatus) ? data.ordersByStatus : []
    const mapped = { pending: 0, completed: 0, cancelled: 0 }
    for (const row of base) {
      const raw = String(row.status || '').trim().toLowerCase()
      const count = Number(row.count || 0)
      if (raw === 'completed' || raw === 'complete' || raw === 'done') mapped.completed += count
      else if (raw === 'cancelled' || raw === 'canceled' || raw === 'cancel') mapped.cancelled += count
      else mapped.pending += count
    }
    return mapped
  }, [data])

  const orderStatusParts = [
    { label: 'Pending', value: orderStatusMapped.pending, color: '#f59e0b' },
    { label: 'Completed', value: orderStatusMapped.completed, color: '#22c55e' },
    { label: 'Canceled', value: orderStatusMapped.cancelled, color: '#ef4444' },
  ]

  const k = data?.kpis || {}

  return (
    <div className="dashboard-page">
      <div className="dashboard-actionsRow">
        <div className="dashboard-headLeft">
          <div className="dashboard-actionsTitle">Owner Dashboard</div>
          <div className="dashboard-summary">Operational clarity for performance, causes, and next actions</div>
        </div>
        <div className="dashboard-actions">
          <Link to="/portals/owner/appointments" className="dashboard-actionBtn">New Booking</Link>
          <Link to="/portals/owner/orders" className="dashboard-actionBtn">Process Orders</Link>
          <Link to="/portals/owner/inventory" className="dashboard-actionBtn">Inventory Alerts</Link>
        </div>
      </div>

      <PortalCard title="Filters" className="portal-card">
        <div className="dashboard-filtersCombined">
          <div className="portal-seg" role="tablist" aria-label="Period switch">
            {['day', 'week', 'month', 'year'].map((x) => (
              <button key={x} type="button" className={`portal-segBtn ${period === x ? 'active' : ''}`.trim()} onClick={() => setPeriod(x)}>
                {x.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="dashboard-referenceControls">
            {(period === 'day' || period === 'week') && (
              <label className="dashboard-refField">
                <span>Reference date</span>
                <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
              </label>
            )}
            {period === 'month' && (
              <label className="dashboard-refField">
                <span>Reference month</span>
                <input type="month" value={refMonth} onChange={(e) => setRefMonth(e.target.value)} />
              </label>
            )}
            {period === 'year' && (
              <label className="dashboard-refField">
                <span>Reference year</span>
                <input type="number" value={refYear} onChange={(e) => setRefYear(e.target.value)} min="2000" max="2100" />
              </label>
            )}
          </div>
        </div>
      </PortalCard>

      {error ? <div className="portal-formError">{error}</div> : null}
      {loading ? <div className="dashboard-summary">Loading dashboard...</div> : null}

      <div className="dashboard-kpiGrid">
        <PortalCard title="Revenue" className="portal-kpi" right={<div className="portal-kpiIcon"><IconDollar /></div>}>
          <div className="portal-kpiValue">{formatCompactVnd(k?.revenue?.value)}</div>
          <div className={`portal-kpiMeta ${statusTone(k?.revenue?.status)}`}>{pctText(k?.revenue?.deltaPct)} vs previous</div>
          <div className="dashboard-listSub">Avg/booking: {formatCompactVnd(k?.revenue?.avgRevenuePerBooking)}</div>
        </PortalCard>

        <PortalCard title="Bookings Today" className="portal-kpi" right={<div className="portal-kpiIcon"><IconCalendar /></div>}>
          <div className="portal-kpiValue">{k?.bookings?.value || 0}</div>
          <div className="dashboard-listSub">Pending {k?.bookings?.pending ?? k?.bookings?.upcoming ?? bookingStatusSummary.pending} | Booked {k?.bookings?.booked ?? bookingStatusSummary.booked}</div>
          <div className="dashboard-listSub">Completed {k?.bookings?.completed ?? bookingStatusSummary.completed} | Canceled {(k?.bookings?.canceled ?? k?.bookings?.cancelled ?? 0) + Number(k?.bookings?.noShow || 0) || bookingStatusSummary.canceled}</div>
        </PortalCard>

        <PortalCard title="Customers" className="portal-kpi" right={<div className="portal-kpiIcon"><IconUsers /></div>}>
          <div className="portal-kpiValue">{k?.customers?.active30Days || 0}</div>
          <div className="dashboard-listSub">Active 30 days</div>
          <div className="dashboard-listSub">Inactive {k?.customers?.inactive || 0} | New {k?.customers?.newCustomers || 0}</div>
        </PortalCard>

        <PortalCard title="Retention" className="portal-kpi" right={<div className="portal-kpiIcon"><IconInfo /></div>}>
          <div className="portal-kpiValue">{k?.retention?.returningRatePct || 0}%</div>
          <div className="dashboard-listSub">Returning customer rate</div>
          <div className="dashboard-listSub">Visits/customer/month: {k?.retention?.avgVisitsPerCustomerPerMonth || 0}</div>
        </PortalCard>

        <PortalCard title="Orders Today" className="portal-kpi" right={<div className="portal-kpiIcon"><IconBarCart /></div>}>
          <div className="portal-kpiValue">{k?.orders?.todayTotalOrders || 0}</div>
          <div className="dashboard-listSub">Product revenue</div>
          <div className="dashboard-listSub">{formatCompactVnd(k?.orders?.todayProductRevenue || 0)}</div>
        </PortalCard>

        <PortalCard title="Inventory" className="portal-kpi" right={<div className="portal-kpiIcon"><IconCube /></div>}>
          <div className="portal-kpiValue">{k?.inventory?.lowStockCount || 0}</div>
          <div className="dashboard-listSub">Low stock | Critical {k?.inventory?.criticalCount || 0}</div>
          <div className="dashboard-listSub">Value: {formatCompactVnd(k?.inventory?.totalValue || 0)}</div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Revenue Trend (Stacked Revenue)" className="portal-card dashboard-revenueFullWidthCard">
          <div className="dashboard-revenueLegend">
            <span><i className="service" />Booking Revenue</span>
            <span><i className="product" />Order Revenue</span>
          </div>
          <div className="dashboard-revenueChartLikeRef">
            <div className="dashboard-revenueYAxis">
              {[...revenueChartMeta.revenueTicks].reverse().map((t) => (
                <span key={`tick-${t}`}>{Math.round(t / 1000)}</span>
              ))}
            </div>
            <div className="dashboard-chartWrap" onMouseLeave={() => setHoveredRevenueBar(null)}>
              <svg width="100%" viewBox="0 0 900 280" preserveAspectRatio="none" aria-label="Revenue trend chart">
                {[0, 1, 2, 3, 4].map((i) => {
                  const y = 24 + ((260 - 48) * i) / 4
                  return <line key={`h-${i}`} x1="24" y1={y} x2="876" y2={y} stroke="#dbe5f1" strokeDasharray="3 5" />
                })}
                {trendRows.map((_, idx) => {
                  const n = Math.max(1, trendRows.length)
                  const innerW = 900 - 48
                  const innerH = 260 - 48
                  const barSpace = innerW / n
                  const barW = Math.max(6, Math.min(26, barSpace * 0.62))
                  const x = 24 + idx * barSpace + (barSpace - barW) / 2
                  const xCenter = x + barW / 2
                  const max = Math.max(revenueChartMeta.maxRevenue, 1)
                  const service = Math.max(0, Number(trendRows[idx]?.revenueBooking || 0))
                  const product = Math.max(0, Number(trendRows[idx]?.revenueOrder || 0))
                  const serviceH = (service / max) * innerH
                  const productH = (product / max) * innerH
                  const yService = 236 - serviceH
                  const yProduct = yService - productH
                  const total = service + product
                  const tip = [
                    `Period: ${trendRows[idx]?.label || ''}`,
                    `Booking Revenue: ${formatVnd(service)}`,
                    `Order Revenue: ${formatVnd(product)}`,
                    `Total: ${formatVnd(total)}`,
                  ].join('\n')

                  return (
                    <g key={`stack-${idx}`} onMouseEnter={() => setHoveredRevenueBar(idx)}>
                      <title>{tip}</title>
                      <rect x={x} y={yService} width={barW} height={Math.max(0, serviceH)} fill="#f59e0b" rx="2" />
                      <rect x={x} y={yProduct} width={barW} height={Math.max(0, productH)} fill="#2563eb" rx="2" />
                      <text
                        x={xCenter}
                        y="270"
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="11"
                      >
                        {trendRows[idx]?.label || ''}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
          {hoveredRevenuePoint ? (
            <div className="dashboard-tooltip">
              Booking Revenue: {formatVnd(hoveredRevenuePoint.revenueBooking || 0)} | Order Revenue: {formatVnd(hoveredRevenuePoint.revenueOrder || 0)} | Total: {formatVnd(hoveredRevenuePoint.revenueTotal || hoveredRevenuePoint.revenue || 0)}
            </div>
          ) : null}
        </PortalCard>

        <PortalCard title="Phân Tích Doanh Thu" className="portal-card dashboard-revenueBreakdownCard">
          <div className="dashboard-breakdownSubtitle">Doanh thu từ dịch vụ và sản phẩm</div>
          <div className="dashboard-breakdownLayout">
            <div className="dashboard-breakdownDonutCol">
              <div className="dashboard-breakdownDonut" style={{ background: buildConic(revenueSplit) }}>
                <div className="dashboard-breakdownDonutHole" />
              </div>
              <div className="dashboard-breakdownTotal">{formatVnd(revenueBreakdownMeta.total)}</div>
              <div className="dashboard-breakdownTotalLabel">Tổng doanh thu</div>
            </div>

            <div className="dashboard-breakdownDetailsCol">
              <div className="dashboard-breakdownBlock booking">
                <div className="dashboard-breakdownBlockHead">
                  <div className="dashboard-breakdownName">
                    <span className="dashboard-statusDot" style={{ background: '#f59e0b' }} />
                    Dịch Vụ
                  </div>
                  <div className="dashboard-breakdownAmount">{formatVnd(revenueBreakdownMeta.bookingRevenue)}</div>
                </div>
                <div className="dashboard-breakdownPercent">{revenueBreakdownMeta.bookingPct}% tổng doanh thu</div>
                <div className="dashboard-breakdownItems">
                  {(data?.topServices || []).slice(0, 4).map((x) => (
                    <div className="dashboard-breakdownItem" key={`svc_break_${x.name}`}>
                      <span>{x.name}</span>
                      <b>{formatVnd(x.revenue)}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dashboard-breakdownBlock order">
                <div className="dashboard-breakdownBlockHead">
                  <div className="dashboard-breakdownName">
                    <span className="dashboard-statusDot" style={{ background: '#2563eb' }} />
                    Sản Phẩm
                  </div>
                  <div className="dashboard-breakdownAmount">{formatVnd(revenueBreakdownMeta.orderRevenue)}</div>
                </div>
                <div className="dashboard-breakdownPercent">{revenueBreakdownMeta.orderPct}% tổng doanh thu</div>
                <div className="dashboard-breakdownItems">
                  {(data?.topProducts || []).slice(0, 3).map((x) => (
                    <div className="dashboard-breakdownItem" key={`prd_break_${x.name}`}>
                      <span>{x.name}</span>
                      <b>{formatVnd(x.revenue)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Customer Overview" className="portal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 132, height: 132, borderRadius: '50%', background: buildConic(customerParts), flexShrink: 0 }} />
            <div className="dashboard-statusInline" style={{ width: '100%' }}>
              {customerParts.map((x) => (
                <div className="dashboard-statusChip" key={x.label}>
                  <span className="dashboard-statusLeft"><span className="dashboard-statusDot" style={{ background: x.color }} />{x.label}</span>
                  <b>{x.value}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="portal-tableWrap" style={{ marginTop: 12 }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Total Spend</th>
                  <th>Visits</th>
                  <th>Featured Review</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topCustomers || []).map((x) => (
                  <tr key={x.name}>
                    <td>{x.name}</td>
                    <td>{formatVnd(x.spending)}</td>
                    <td>{x.visits}</td>
                    <td>
                      {x.featuredReview
                        ? `${Number(x.featuredReviewRating || 0)}/5 - ${clipText(x.featuredReview, 64)}`
                        : (Number(x.avgRating || 0) > 0 ? `${Number(x.avgRating || 0)}/5` : 'No review')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>

        <PortalCard title="Staff Performance" className="portal-card">
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Revenue</th>
                  <th>Bookings</th>
                  <th>Rating</th>
                  <th>Featured Review</th>
                </tr>
              </thead>
              <tbody>
                {(data?.staffPerformance || []).map((x, idx) => (
                  <tr key={x.name + idx}>
                    <td>{x.name}{idx === 0 ? ' (Top)' : ''}</td>
                    <td>{formatVnd(x.revenue)}</td>
                    <td>{x.appts}</td>
                    <td>{Number(x.avgRating || 0) > 0 ? `${Number(x.avgRating || 0)}/5` : 'No review'}</td>
                    <td>{x.featuredReview ? `${Number(x.featuredReviewRating || 0)}/5 - ${clipText(x.featuredReview, 64)}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Today Schedule (Auto-refresh 30s)" className="portal-card">
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Staff</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {(data?.todaySchedule || []).slice(0, 12).map((row) => (
                  <tr key={String(row.bookingId) + row.time}>
                    <td>{row.time}</td>
                    <td>{row.customer}</td>
                    <td>{row.staff}</td>
                    <td>{row.service}</td>
                    <td>
                      <span className={`dashboard-stockTag ${row.status === 'canceled' ? 'is-critical' : row.status === 'completed' ? 'is-warning' : ''}`.trim()}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td>
                      {Number(row.reviewRating || 0) > 0 ? (
                        <div>
                          <span className={`dashboard-reviewPill ${Number(row.reviewRating || 0) <= 2 ? 'is-negative' : Number(row.reviewRating || 0) >= 4 ? 'is-positive' : 'is-neutral'}`.trim()}>
                            {Number(row.reviewRating || 0)}/5
                          </span>
                          <div className="dashboard-reviewInlineText">{clipText(row.reviewComment, 52) || 'No comment'}</div>
                        </div>
                      ) : row.status === 'completed' ? (
                        <span className="dashboard-reviewInlineText">No review yet</span>
                      ) : (
                        <span className="dashboard-reviewInlineText">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>

        <PortalCard title="Staff Availability (Real-time snapshot)" className="portal-card" right={<div className="portal-kpiIcon"><IconClock /></div>}>
          <div className="dashboard-statusInline">
            {(data?.staffAvailability || []).map((x, idx) => (
              <div className="dashboard-statusChip" key={x.name + idx}>
                <span className="dashboard-statusLeft">
                  <span className="dashboard-statusDot" style={{ background: x.status === 'busy' ? '#ef4444' : '#22c55e' }} />
                  {x.name}
                </span>
                <b>{x.status === 'busy' ? 'Busy' : 'Available'}</b>
              </div>
            ))}
          </div>
        </PortalCard>

      </div>

      <div className="portal-grid2">
        <PortalCard title="Booking Status" className="portal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 132, height: 132, borderRadius: '50%', background: buildConic(bookingStatusParts), flexShrink: 0 }} />
            <div className="dashboard-statusInline" style={{ width: '100%' }}>
              {bookingStatusParts.map((x) => (
                <div className="dashboard-statusChip" key={x.label}>
                  <span className="dashboard-statusLeft"><span className="dashboard-statusDot" style={{ background: x.color }} />{x.label}</span>
                  <b>{x.value}</b>
                </div>
              ))}
            </div>
          </div>
        </PortalCard>

        <PortalCard title="Peak Hours" className="portal-card">
          <div className="dashboard-heatmap">
            {(data?.bookingHeatmap || []).map((x) => (
              <div className={`dashboard-heatCell ${x.isPeak ? 'is-peak' : ''}`.trim()} key={x.hour}>
                <span style={{ width: 54 }}>{x.hour}</span>
                <div className="dashboard-heatTrack"><span style={{ width: `${Math.min(100, (Number(x.count || 0) / Math.max(1, Math.max(...(data?.bookingHeatmap || []).map((i) => Number(i.count || 0), 1)))) * 100)}%` }} /></div>
                <span>{x.count}</span>
                {x.isPeak ? <span className="dashboard-peakBadge">Peak</span> : null}
              </div>
            ))}
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Order Status" className="portal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 132, height: 132, borderRadius: '50%', background: buildConic(orderStatusParts), flexShrink: 0 }} />
            <div className="dashboard-statusInline" style={{ width: '100%' }}>
              {orderStatusParts.map((x) => (
                <div className="dashboard-statusChip" key={x.label}>
                  <span className="dashboard-statusLeft"><span className="dashboard-statusDot" style={{ background: x.color }} />{x.label}</span>
                  <b>{x.value}</b>
                </div>
              ))}
            </div>
          </div>
        </PortalCard>

        <PortalCard title="Order Attention" className="portal-card dashboard-orderAttentionCard">
          <div className="dashboard-orderAttentionStats">
            <div className="dashboard-orderAttentionStat is-warning">
              <span>Pending Orders</span>
              <b>{Number(k?.pendingOrders?.value || 0)}</b>
            </div>
            <div className="dashboard-orderAttentionStat is-info">
              <span>Today Orders</span>
              <b>{Number(k?.orders?.todayTotalOrders || 0)}</b>
            </div>
            <div className="dashboard-orderAttentionStat is-good">
              <span>Completion Rate</span>
              <b>{Number(k?.orderCompletion?.value || 0)}%</b>
            </div>
          </div>
          <div className="dashboard-list" style={{ marginTop: 10 }}>
            {(data?.insights || []).filter((x) => String(x.text || '').toLowerCase().includes('order')).slice(0, 3).map((item, idx) => (
              <div className="dashboard-listItem" key={`order-attn-${idx}`}>
                <div>
                  <div className="dashboard-listTitle">{item.text}</div>
                </div>
                {item.actionHref ? <Link className="dashboard-insightAction" to={item.actionHref}>{item.actionLabel || 'Open'}</Link> : null}
              </div>
            ))}
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Inventory Alerts" className="portal-warningCard dashboard-cardFullWidth" right={<span className="portal-warningPill"><IconAlertTriangle /> Priority</span>}>
          <div className="dashboard-list">
            {(data?.inventoryAlerts || []).map((x) => (
              <div className="dashboard-listItem" key={x.name}>
                <div>
                  <div className="dashboard-listTitle">{x.name}</div>
                  <div className="dashboard-listSub">Current: {x.qty} | Reorder: {x.reorderLevel}</div>
                </div>
                <span className={`dashboard-stockTag ${x.severity === 'critical' ? 'is-critical' : 'is-warning'}`.trim()}>
                  {x.severity === 'critical' ? 'Critical' : 'Low stock'}
                </span>
              </div>
            ))}
          </div>
        </PortalCard>
      </div>

    </div>
  )
}
