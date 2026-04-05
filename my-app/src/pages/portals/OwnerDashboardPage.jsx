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
  IconStar,
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

function safePct(part, total) {
  const p = Number(part || 0)
  const t = Number(total || 0)
  if (t <= 0) return 0
  return Math.round((p / t) * 100)
}

function orderStatusUi(rawStatus) {
  const status = String(rawStatus || '').trim().toLowerCase()
  if (status === 'completed' || status === 'complete' || status === 'done') {
    return { label: 'Completed', chipClass: 'done' }
  }
  if (status === 'cancelled' || status === 'cancelled' || status === 'cancel') {
    return { label: 'Cancelled', chipClass: 'cancelled' }
  }
  return { label: 'Pending', chipClass: 'pending' }
}

function paymentMethodLabel(rawValue) {
  const method = String(rawValue || '').trim().toLowerCase()
  if (!method) return 'Unknown'
  if (method.includes('cod')) return 'COD'
  if (method.includes('vnpay')) return 'VNPay'
  if (method.includes('momo')) return 'MoMo'
  if (method.includes('cash')) return 'Cash'
  if (method.includes('bank')) return 'Bank Transfer'
  if (method.includes('card')) return 'Card'
  return rawValue
}

function pendingAgeDays(createdAt) {
  const dt = new Date(createdAt)
  if (Number.isNaN(dt.getTime())) return 0
  const diff = Date.now() - dt.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function scheduleMinutes(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return Number.MAX_SAFE_INTEGER
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.MAX_SAFE_INTEGER
  return hh * 60 + mm
}

function scheduleStatusPriority(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === 'pending') return 0
  if (s === 'booked' || s === 'confirmed' || s === 'confirm') return 1
  if (s === 'cancelled' || s === 'cancel') return 2
  if (s === 'completed' || s === 'complete' || s === 'done') return 3
  return 4
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
      cancelled: Number(apiStatus.cancelled || apiStatus.cancelled || 0) + Number(apiStatus.noShow || 0),
    }

    const apiTotal = fromApi.pending + fromApi.booked + fromApi.completed + fromApi.cancelled
    if (apiTotal > 0) return fromApi

    const schedule = Array.isArray(data?.todaySchedule) ? data.todaySchedule : []
    const fromSchedule = { pending: 0, booked: 0, completed: 0, cancelled: 0 }
    for (const row of schedule) {
      const raw = String(row?.status || row?.statusLabel || '').trim().toLowerCase()
      if (raw === 'completed' || raw === 'complete' || raw === 'done') fromSchedule.completed += 1
      else if (raw === 'booked' || raw === 'confirmed' || raw === 'confirm') fromSchedule.booked += 1
      else if (raw === 'cancelled' || raw === 'cancelled' || raw === 'cancel' || raw === 'no-show' || raw === 'noshow' || raw === 'no_show' || raw === 'no show') fromSchedule.cancelled += 1
      else fromSchedule.pending += 1
    }
    return fromSchedule
  }, [data])

  const bookingStatusParts = [
    { label: 'Pending', value: bookingStatusSummary.pending, color: '#f59e0b' },
    { label: 'Booked', value: bookingStatusSummary.booked, color: '#3b82f6' },
    { label: 'Completed', value: bookingStatusSummary.completed, color: '#22c55e' },
    { label: 'Cancelled', value: bookingStatusSummary.cancelled, color: '#ef4444' },
  ]

  const orderStatusMapped = useMemo(() => {
    const base = Array.isArray(data?.ordersByStatus) ? data.ordersByStatus : []
    const mapped = { pending: 0, completed: 0, cancelled: 0 }
    for (const row of base) {
      const raw = String(row.status || '').trim().toLowerCase()
      const count = Number(row.count || 0)
      if (raw === 'completed' || raw === 'complete' || raw === 'done') mapped.completed += count
      else if (raw === 'cancelled' || raw === 'cancelled' || raw === 'cancel') mapped.cancelled += count
      else mapped.pending += count
    }
    return mapped
  }, [data])

  const orderStatusParts = [
    { label: 'Pending', value: orderStatusMapped.pending, color: '#f59e0b' },
    { label: 'Completed', value: orderStatusMapped.completed, color: '#22c55e' },
    { label: 'Cancelled', value: orderStatusMapped.cancelled, color: '#ef4444' },
  ]

  const k = data?.kpis || {}
  const bookingTotal = Number(k?.bookings?.value || 0)
  const bookingCompleted = Number(k?.bookings?.completed || 0)
  const bookingCancelled = Number(bookingStatusSummary.cancelled || 0)
  const bookingCompletionRate = safePct(bookingCompleted, bookingTotal)
  const bookingCancelRate = safePct(bookingCancelled, bookingTotal)
  const ratingKpi = k?.rating || {}
  const ratingValue = Number(ratingKpi.value || 0)
  const ratingDeltaValue = Number(ratingKpi.deltaValue || 0)
  const ratingTotalReviews = Math.max(0, Number(ratingKpi.totalReviews || 0))
  const bookingRatingValue = Number(ratingKpi.bookingValue || 0)
  const bookingRatingReviews = Math.max(0, Number(ratingKpi.bookingReviews || 0))
  const orderRatingValue = Number(ratingKpi.orderValue || 0)
  const orderRatingReviews = Math.max(0, Number(ratingKpi.orderReviews || 0))
  const ratingDeltaText = `${ratingDeltaValue >= 0 ? '+' : ''}${ratingDeltaValue.toFixed(1)}`
  const orderTotal = Number(orderStatusMapped.pending || 0) + Number(orderStatusMapped.completed || 0) + Number(orderStatusMapped.cancelled || 0)
  const orderCompleted = Number(orderStatusMapped.completed || 0)
  const orderCancelled = Number(orderStatusMapped.cancelled || 0)
  const orderCompletionRate = safePct(orderCompleted, orderTotal)
  const orderCancelRate = safePct(orderCancelled, orderTotal)
  const returningCount = Number(data?.customerOverview?.returningCustomers || 0)
  const newCount = Number(data?.customerOverview?.newCustomers || 0)
  const activeCount = Number(k?.customers?.active30Days || 0)
  const returningPct = safePct(returningCount, Math.max(activeCount, returningCount + newCount))
  const inactiveCount = Number(k?.customers?.inactive || 0)
  const inventoryTotalItems = Math.max(0, Number(k?.inventory?.totalItems || 0))
  const inventoryOutCount = Math.max(0, Number(k?.inventory?.outOfStockCount || 0))
  const inventoryLowCount = Math.max(0, Number(k?.inventory?.lowStockCount || 0))
  const inventoryHealthyCount = Math.max(0, Number(k?.inventory?.healthyCount || 0))
  const inventoryOutPct = safePct(inventoryOutCount, inventoryTotalItems)
  const topCustomers = Array.isArray(data?.topCustomers) ? data.topCustomers : []
  const topCustomersFeatured = topCustomers.slice(0, 6)
  const topStaff = Array.isArray(data?.staffPerformance) ? data.staffPerformance : []
  const topStaffFeatured = topStaff.filter((x) => Number(x?.revenue || 0) > 0).slice(0, 6)
  const todayScheduleRows = useMemo(() => {
    const rows = Array.isArray(data?.todaySchedule) ? [...data.todaySchedule] : []
    rows.sort((a, b) => {
      const byStatus = scheduleStatusPriority(a?.status) - scheduleStatusPriority(b?.status)
      if (byStatus !== 0) return byStatus
      return scheduleMinutes(a?.time) - scheduleMinutes(b?.time)
    })
    return rows
  }, [data])

  const staffAvailabilityRows = useMemo(() => {
    const rows = Array.isArray(data?.staffAvailability) ? [...data.staffAvailability] : []
    rows.sort((a, b) => {
      const aAvailable = String(a?.status || '').toLowerCase() !== 'busy'
      const bAvailable = String(b?.status || '').toLowerCase() !== 'busy'
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1

      const aNext = scheduleMinutes(String(a?.nextBookingTime || '').replace(/^next\s+at\s+/i, '').replace(/^shift\s+/i, ''))
      const bNext = scheduleMinutes(String(b?.nextBookingTime || '').replace(/^next\s+at\s+/i, '').replace(/^shift\s+/i, ''))
      if (aNext !== bNext) return aNext - bNext

      return String(a?.name || '').localeCompare(String(b?.name || ''))
    })
    return rows
  }, [data])

  const recentOrders = useMemo(() => {
    const rows = Array.isArray(data?.recentOrders) ? data.recentOrders : []
    const pendingOnly = rows
      .map((row) => {
        const statusUi = orderStatusUi(row?.status)
        const ageDays = pendingAgeDays(row?.createdAt)
        return {
          ...row,
          statusUi,
          ageDays,
          isOverdue: statusUi.label === 'Pending' && ageDays > 7,
        }
      })
      .filter((row) => row.statusUi.label === 'Pending')

    pendingOnly.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      return Number(b.ageDays || 0) - Number(a.ageDays || 0)
    })

    return pendingOnly.slice(0, 6)
  }, [data])
  const peakRows = useMemo(() => {
    const rows = Array.isArray(data?.bookingHeatmap) ? data.bookingHeatmap : []
    const peakBase = Math.max(1, ...rows.map((x) => Number(x?.count || 0)))
    return rows.map((x) => ({
      ...x,
      pct: Math.min(100, Math.round((Number(x?.count || 0) / peakBase) * 100)),
    }))
  }, [data])

  return (
    <div className="dashboard-page">
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
          <div className="dashboard-kpiHeadline">
            <div className="portal-kpiValue">{formatCompactVnd(k?.revenue?.value)}</div>
            <div className={`portal-kpiMeta ${statusTone(k?.revenue?.status)}`}>↑ {pctText(k?.revenue?.deltaPct)}</div>
          </div>
          <div className="dashboard-listSub">Booking {formatCompactVnd(k?.revenue?.bookingRevenue || 0)} | Order {formatCompactVnd(k?.revenue?.productRevenue || 0)}</div>
        </PortalCard>

        <PortalCard title="Active Customers" className="portal-kpi" right={<div className="portal-kpiIcon"><IconUsers /></div>}>
          <div className="dashboard-kpiHeadline">
            <div className="portal-kpiValue">{activeCount} active</div>
            <div className="dashboard-kpiBadge">{inactiveCount} deactive</div>
          </div>
          <div className="dashboard-listSub">New {newCount} | Returning {returningCount} ({returningPct}%)</div>
        </PortalCard>

        <PortalCard title="Rating" className="portal-kpi" right={<div className="portal-kpiIcon"><IconStar /></div>}>
          <div className="dashboard-kpiHeadline">
            <div className="portal-kpiValue">{ratingValue > 0 ? ratingValue.toFixed(1) : '-'}</div>
            <div className={`portal-kpiMeta ${statusTone(ratingKpi?.status)}`}>↑ {ratingDeltaText}({ratingTotalReviews})</div>
          </div>
          <div className="dashboard-listSub">Booking {bookingRatingValue > 0 ? bookingRatingValue.toFixed(1) : '-'} ({bookingRatingReviews}) · Order {orderRatingValue > 0 ? orderRatingValue.toFixed(1) : '-'} ({orderRatingReviews})</div>
        </PortalCard>

        <PortalCard title="Booking Reliability" className="portal-kpi" right={<div className="portal-kpiIcon"><IconClock /></div>}>
          <div className="dashboard-kpiHeadline">
            <div className="portal-kpiValue">{bookingCompletionRate}% completed</div>
            <div className={`portal-kpiMeta ${statusTone(k?.appointments?.status)}`}>Cancel {bookingCancelRate}%</div>
          </div>
          <div className="dashboard-listSub">Completed {bookingCompleted} | Total {bookingTotal}</div>
        </PortalCard>

        <PortalCard title="Orders Reliability" className="portal-kpi" right={<div className="portal-kpiIcon"><IconBarCart /></div>}>
          <div className="dashboard-kpiHeadline">
            <div className="portal-kpiValue">{orderCompletionRate}% completed</div>
            <div className={`portal-kpiMeta ${statusTone(k?.orders?.status)}`}>Cancel {orderCancelRate}%</div>
          </div>
          <div className="dashboard-listSub">Completed {orderCompleted} | Total {orderTotal}</div>
        </PortalCard>

        <PortalCard title="Inventory Alerts" className="portal-kpi" right={<div className="portal-kpiIcon"><IconAlertTriangle /></div>}>
          <div className="portal-kpiValue">{inventoryOutPct}% out of stock</div>
          <div className="dashboard-kpiRow">
            <span className="dashboard-kpiChip cancelled">Out {inventoryOutCount}</span>
            <span className="dashboard-kpiChip pending">Low {inventoryLowCount}</span>
            <span className="dashboard-kpiChip done">Healthy {inventoryHealthyCount}</span>
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2 ">
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

        <PortalCard title="Revenue Analysis" className="portal-card dashboard-revenueBreakdownCard">
          <div className="dashboard-breakdownSubtitle">Revenue from services and products</div>
          <div className="dashboard-breakdownLayout">
            <div className="dashboard-breakdownDonutCol">
              <div className="dashboard-breakdownDonut" style={{ background: buildConic(revenueSplit) }}>
                <div className="dashboard-breakdownDonutHole" />
              </div>
              <div className="dashboard-breakdownTotal">{formatVnd(revenueBreakdownMeta.total)}</div>
              <div className="dashboard-breakdownTotalLabel">Total revenue</div>
            </div>

            <div className="dashboard-breakdownDetailsCol">
              <div className="dashboard-breakdownBlock booking">
                <div className="dashboard-breakdownBlockHead">
                  <div className="dashboard-breakdownName">
                    <span className="dashboard-statusDot" style={{ background: '#f59e0b' }} />
                    Services
                  </div>
                  <div className="dashboard-breakdownAmount">{formatVnd(revenueBreakdownMeta.bookingRevenue)}</div>
                </div>
                <div className="dashboard-breakdownPercent">{revenueBreakdownMeta.bookingPct}% of total revenue</div>
                <div className="dashboard-breakdownItems">
                  {(data?.topServices || []).slice(0, 5).map((x) => (
                    <div className="dashboard-breakdownItem" key={`svc_break_${x.name}`}>
                      <span>
                        {x.name} <small>({Number(x.bookings || 0)})</small>
                        <small className="dashboard-breakdownRating"> <IconStar />{Number(x.avgRating || 0) > 0 ? Number(x.avgRating || 0).toFixed(1) : '-'}</small>
                      </span>
                      <b>{formatVnd(x.revenue)}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dashboard-breakdownBlock order">
                <div className="dashboard-breakdownBlockHead">
                  <div className="dashboard-breakdownName">
                    <span className="dashboard-statusDot" style={{ background: '#2563eb' }} />
                    Product
                  </div>
                  <div className="dashboard-breakdownAmount">{formatVnd(revenueBreakdownMeta.orderRevenue)}</div>
                </div>
                <div className="dashboard-breakdownPercent">{revenueBreakdownMeta.orderPct}% of total revenue</div>
                <div className="dashboard-breakdownItems">
                  {(data?.topProducts || []).slice(0, 5).map((x) => (
                    <div className="dashboard-breakdownItem" key={`prd_break_${x.name}`}>
                      <span>
                        {x.name} <small>({Number(x.sold || 0)})</small>
                        <small className="dashboard-breakdownRating"> <IconStar />{Number(x.avgRating || 0) > 0 ? Number(x.avgRating || 0).toFixed(1) : '-'}</small>
                      </span>
                      <b>{formatVnd(x.revenue)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </PortalCard>
      </div>

      {period === 'day' ? (
        <div className="portal-grid2">
          <PortalCard
            title={(
              <span className="dashboard-cardTitleWithIcon">
                <IconCalendar />
                Today Schedule (Auto-refresh 30s)
              </span>
            )}
            className="portal-card"
          >
            <div className="dashboard-scheduleList">
              {todayScheduleRows.map((row) => {
              const rating = Number(row.reviewRating || 0)
              const activeStars = Math.max(0, Math.min(5, Math.round(rating)))
              const hour = Number.parseInt(String(row.time || '').slice(0, 2), 10)
              const timeTone = Number.isFinite(hour)
                ? (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening')
                : 'afternoon'
              const statusRaw = String(row.status || '').toLowerCase()
              const statusTone = statusRaw === 'completed'
                ? 'completed'
                : statusRaw === 'booked'
                  ? 'booked'
                  : statusRaw === 'cancelled'
                    ? 'cancelled'
                    : 'pending'
              const statusLabel = statusRaw === 'completed'
                ? 'Completed'
                : statusRaw === 'booked'
                  ? 'Booked'
                  : statusRaw === 'cancelled'
                    ? 'Cancelled'
                    : 'Pending'
              const needsAttention = rating > 0 && rating <= 2
              return (
                <div className={`dashboard-scheduleItem is-${timeTone} ${needsAttention ? 'is-attention' : ''}`.trim()} key={String(row.bookingId) + row.time}>
                  <div className="dashboard-scheduleTime">{row.time}</div>

                  <div className="dashboard-scheduleMain">
                    <div className="dashboard-scheduleCustomer">{row.customer}</div>
                    <div className="dashboard-scheduleService">{row.service}</div>
                    {row.reviewComment ? <div className="dashboard-scheduleComment">"{clipText(row.reviewComment, 88)}"</div> : null}
                  </div>

                  <div className="dashboard-scheduleRight">
                    <div className="dashboard-scheduleStaff">{row.staff}</div>
                    {rating > 0 ? (
                      <div className="dashboard-scheduleRatingRow">
                        <span className="dashboard-scheduleStars" aria-label={`${rating}/5`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={`${row.bookingId}_star_${i}`} className={`dashboard-scheduleStar ${i < activeStars ? 'is-on' : 'is-off'}`.trim()}>
                              <IconStar />
                            </span>
                          ))}
                        </span>
                        {needsAttention ? <span className="dashboard-scheduleAttention">Needs attention</span> : null}
                      </div>
                    ) : null}
                    <span className={`dashboard-scheduleStatus ${statusTone}`.trim()}>{statusLabel}</span>
                  </div>
                </div>
              )
              })}
            </div>
          </PortalCard>

          <PortalCard title="Staff Availability (Real-time snapshot)" className="portal-card" right={<div className="portal-kpiIcon"><IconClock /></div>}>
            <div className="dashboard-availabilityList">
              {staffAvailabilityRows.map((x, idx) => (
                <div className={`dashboard-availabilityItem ${x.status === 'busy' ? 'is-busy' : 'is-available'}`.trim()} key={x.name + idx}>
                  <div className="dashboard-availabilityTop">
                    <div className="dashboard-availabilityNameWrap">
                      <span className="dashboard-statusDot" style={{ background: x.status === 'busy' ? '#ef4444' : '#22c55e' }} />
                      <b className="dashboard-availabilityName">{x.name}</b>
                    </div>
                    <span className="dashboard-availabilityState">{x.status === 'busy' ? 'Busy' : 'Available'}</span>
                  </div>

                  <div className="dashboard-availabilityMeta">
                    {x.status === 'busy'
                      ? 'Currently serving a customer'
                      : (x.nextBookingTime ? `Next at ${x.nextBookingTime}` : 'No upcoming booking')}
                  </div>

                  <div className="dashboard-availabilitySkills">
                    {(Array.isArray(x.skills) ? x.skills : []).slice(0, 3).map((skill, skillIdx) => (
                      <span className="dashboard-availabilitySkill" key={`${x.name}_${skill}_${skillIdx}`}>{skill}</span>
                    ))}
                    {(!Array.isArray(x.skills) || x.skills.length === 0) ? <span className="dashboard-availabilitySkill is-empty">No skill data</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </PortalCard>

        </div>
      ) : null}

      <div className="portal-grid2 dashboard-grid2--equalHeight">
        <PortalCard title="Customer Overview" className="portal-card" right={<div className="dashboard-leaderboardHint">Top {topCustomersFeatured.length}</div>}>
          <div className="dashboard-leaderboard dashboard-tableTopSpace">
            {topCustomersFeatured.map((x, idx) => {
              const rank = idx + 1
              const rankTone = rank === 1 ? 'is-top1' : rank === 2 ? 'is-top2' : rank === 3 ? 'is-top3' : ''

              return (
                <div className={`dashboard-leaderboardItem ${rankTone}`.trim()} key={`${x.customerUserId || x.name}-${rank}`}>
                  <div className="dashboard-rankPill">{rank}</div>
                  <div className="dashboard-leaderboardMain">
                    <div className="dashboard-leaderboardTopRow">
                      <div className="dashboard-leaderboardNameWrap">
                        <div className="dashboard-leaderboardName">{x.name}</div>
                      </div>
                      <div className="dashboard-leaderboardValue customer">{formatCompactVnd(x.spending)}</div>
                    </div>
                    <div className="dashboard-leaderboardMetaRow">
                      <span><IconUsers />{Number(x.visits || 0)} visits</span>
                      <span><IconStar />{Number(x.avgRating || 0) > 0 ? `${Number(x.avgRating || 0).toFixed(1)} (${Number(x.ratingCount || 0)} reviews)` : '-'}</span>
                      <span><IconCalendar />Last {x.lastVisit || '-'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </PortalCard>

        <PortalCard title="Staff Performance" className="portal-card" right={<div className="dashboard-leaderboardHint">Top {topStaffFeatured.length} featured</div>}>
          <div className="dashboard-leaderboard dashboard-leaderboard--staff">
            {topStaffFeatured.map((x, idx) => {
              const rank = idx + 1
              const rankTone = rank === 1 ? 'is-top1' : rank === 2 ? 'is-top2' : rank === 3 ? 'is-top3' : ''

              return (
                <div className={`dashboard-leaderboardItem ${rankTone}`.trim()} key={`${x.staffId || x.name}-${rank}`}>
                  <div className="dashboard-rankPill">{rank}</div>
                  <div className="dashboard-leaderboardMain">
                    <div className="dashboard-leaderboardTopRow">
                      <div className="dashboard-leaderboardNameWrap">
                        <div className="dashboard-leaderboardName">{x.name}</div>
                      </div>
                      <div className="dashboard-leaderboardValue staff">{formatCompactVnd(x.revenue)}</div>
                    </div>
                    <div className="dashboard-leaderboardMetaRow">
                      <span><IconUsers />{Number(x.appts || 0)} bookings</span>
                      <span><IconStar />{Number(x.avgRating || 0) > 0 ? `${Number(x.avgRating || 0).toFixed(1)} (${Number(x.ratingCount || 0)} reviews)` : '-'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Peak Hours" className="portal-card">
          <div className="dashboard-peakList">
            {peakRows.length === 0 ? (
              <div className="dashboard-peakEmpty">No completed or active booking slots in this period.</div>
            ) : peakRows.map((x) => (
              <div className={`dashboard-peakItem ${x.isPeak ? 'is-peak' : ''}`.trim()} key={x.hour}>
                <div className="dashboard-peakItemHead">
                  <span className="dashboard-peakHour">{x.hour}</span>
                  <span className="dashboard-peakCount">{x.count} bookings</span>
                  {x.isPeak ? <span className="dashboard-peakBadge">Peak</span> : null}
                </div>
                <div className="dashboard-peakTrack"><span style={{ width: `${x.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </PortalCard>

        <PortalCard title="Booking Status" className="portal-card">
          <div className="dashboard-donutRow dashboard-donutRow--status">
            <div className="dashboard-donutDisplay dashboard-donutDisplay--status" style={{ background: buildConic(bookingStatusParts) }} />
            <div className="dashboard-statusInline dashboard-statusInline--wide dashboard-statusInline--legendRow">
              {bookingStatusParts.map((x) => (
                <div className="dashboard-statusChip" key={x.label}>
                  <span className="dashboard-statusLeft"><span className="dashboard-statusDot" style={{ background: x.color }} />{x.label}</span>
                  <b>{x.value}</b>
                </div>
              ))}
            </div>
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Pending Orders" className="portal-card dashboard-orderAttentionCard">
          <div className="dashboard-list dashboard-list--spaced dashboard-recentOrders">
            {recentOrders.length === 0 ? (
              <div className="dashboard-listSub">No pending orders in this period.</div>
            ) : recentOrders.map((item) => {
              const orderLabel = item.orderId > 0 ? `#${item.orderId}` : 'Order'
              const customer = clipText(item.customerName || 'Guest', 24)
              const created = item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '-'
              const payment = paymentMethodLabel(item.paymentMethod)
              const pendingText = item.ageDays > 0 ? `Pending ${item.ageDays} day${item.ageDays > 1 ? 's' : ''}` : 'Pending today'
              const productLine = clipText(item.productSummary || 'No product details', 92)
              return (
                <div className={`dashboard-listItem dashboard-recentOrderItem ${item.isOverdue ? 'is-overdue' : ''}`.trim()} key={`recent-order-${orderLabel}-${created}`}>
                  <div className="dashboard-recentOrderTop">
                    <div className="dashboard-recentOrderMain">
                      <div className="dashboard-listTitle dashboard-recentOrderTitle">{orderLabel} - {customer}</div>
                      <div className="dashboard-listSub dashboard-recentOrderMeta">{created}</div>
                    </div>
                    <div className="dashboard-recentOrderSide">
                      <b className="dashboard-recentOrderTotal">{formatCompactVnd(item.total || 0)}</b>
                      <div className="dashboard-recentOrderSideTags">
                        <span className="dashboard-kpiChip payment">{payment}</span>
                        <span className={`dashboard-kpiChip ${item.isOverdue ? 'overdue' : 'neutral'}`}>{pendingText}</span>
                      </div>
                    </div>

                    <div className="dashboard-recentOrderProducts">{productLine}</div>
                  </div>

                  {item.isOverdue ? <div className="dashboard-recentOrderWarn">Warning: Pending over 1 week, please process soon.</div> : null}
                </div>
              )
            })}
          </div>
          </PortalCard>

          <PortalCard title="Order Status" className="portal-card">
            <div className="dashboard-donutRow dashboard-donutRow--status">
              <div className="dashboard-donutDisplay dashboard-donutDisplay--status" style={{ background: buildConic(orderStatusParts) }} />
              <div className="dashboard-statusInline dashboard-statusInline--wide dashboard-statusInline--legendRow">
                {orderStatusParts.map((x) => (
                  <div className="dashboard-statusChip" key={x.label}>
                    <span className="dashboard-statusLeft"><span className="dashboard-statusDot" style={{ background: x.color }} />{x.label}</span>
                    <b>{x.value}</b>
                  </div>
                ))}
              </div>
            </div>
        </PortalCard>
      </div>

      <div className="portal-grid2">
        <PortalCard title="Inventory Alerts" className="portal-warningCard dashboard-cardFullWidth" right={<span className="portal-warningPill"><IconAlertTriangle /> Priority</span>}>
          <div className="dashboard-list dashboard-inventoryAlertList">
            {(data?.inventoryAlerts || []).map((x) => (
              <div className={`dashboard-listItem dashboard-inventoryAlertItem ${x.severity === 'out_of_stock' ? 'is-out' : 'is-warning'}`.trim()} key={x.name}>
                <div className="dashboard-inventoryAlertMain">
                  <div className="dashboard-listTitle">{x.name}</div>
                  <div className="dashboard-listSub dashboard-inventoryAlertMeta">Type: {x.typeLabel || (x.type === 'retail' ? 'Retail Product' : 'Supply Item')}</div>
                  <div className="dashboard-kpiRow dashboard-inventoryAlertChips">
                    <span className="dashboard-kpiChip neutral">Current: {x.qty}</span>
                    <span className="dashboard-kpiChip pending">Reorder: {x.reorderLevel}</span>
                    <span className={`dashboard-kpiChip ${x.severity === 'out_of_stock' || x.daysRemaining <= 3 ? 'cancelled' : 'neutral'}`}>Days Left: {x.daysRemaining}</span>
                  </div>
                  <div className="dashboard-listSub dashboard-inventoryAlertPriceRow">
                    Import: {formatCompactVnd(x.importPrice || 0)} | Sell: {formatCompactVnd(x.sellPrice || 0)}
                  </div>
                </div>
                <span className={`dashboard-stockTag ${x.severity === 'out_of_stock' ? 'is-out' : 'is-warning'}`.trim()}>
                  {x.severityLabel || (x.severity === 'out_of_stock' ? 'Out of stock' : 'Warning')}
                </span>
              </div>
            ))}
          </div>
        </PortalCard>
      </div>

    </div>
  )
}
