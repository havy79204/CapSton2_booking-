import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../../styles/dashboard.css'
import '../../styles/global-buttons.css'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import {
  IconAlertTriangle,
  IconBarCart,
  IconCalendar,
  IconCube,
  IconDollar,
  IconStar,
  IconUsers,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api, showPortalToast } from '../../lib/api.js'

function formatMoneyCompact(value) {
  const n = Number(value || 0)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M VND`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K VND`
  return `${n} VND`
}

function trendSymbol(trend) {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return '→'
}

function trendText(trend, delta) {
  const d = Math.abs(Number(delta || 0))
  if (d === 0 || trend === 'flat') return 'No change'
  return `${trendSymbol(trend)} ${d}%`
}

function toneClass(status) {
  if (status === 'critical') return 'is-critical'
  if (status === 'warning') return 'is-warning'
  if (status === 'good') return 'is-good'
  return 'is-neutral'
}

function formatRelativeDays(daysAgo) {
  if (daysAgo === null || daysAgo === undefined) return '-'
  if (daysAgo <= 0) return 'today'
  if (daysAgo === 1) return '1 day ago'
  return `${daysAgo} days ago`
}

function GlobalPeriodFilter({ value, onChange }) {
  const items = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ]

  return (
    <div className="portal-seg dashboard-globalFilter" role="tablist" aria-label="Global time filter">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`portal-segBtn ${value === it.key ? 'active' : ''}`.trim()}
          onClick={() => onChange(it.key)}
          role="tab"
          aria-selected={value === it.key}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

function TimeReferencePicker({ period, refDate, refMonth, refYear, onRefDate, onRefMonth, onRefYear }) {
  return (
    <div className="dashboard-referenceControls">
      {(period === 'day' || period === 'week') ? (
        <label className="dashboard-refField">
          <span>{period === 'day' ? 'Select date' : 'Week ending'}</span>
          <input type="date" value={refDate} onChange={(e) => onRefDate(e.target.value)} />
        </label>
      ) : null}
      {period === 'month' ? (
        <label className="dashboard-refField">
          <span>Select month</span>
          <input type="month" value={refMonth} onChange={(e) => onRefMonth(e.target.value)} />
        </label>
      ) : null}
      {period === 'year' ? (
        <label className="dashboard-refField">
          <span>Select year</span>
          <input type="number" min="2000" max="2100" step="1" value={refYear} onChange={(e) => onRefYear(e.target.value)} />
        </label>
      ) : null}
    </div>
  )
}

function SimpleLineChart({ rows, metric, color, onHover, highlightPeak = false }) {
  const safe = rows.length ? rows : [{ label: 'N/A', revenue: 0, appts: 0 }]
  const values = safe.map((x) => Number(x[metric] || 0))
  const w = 760
  const h = 250
  const p = 24
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1, max - min)
  const iw = w - p * 2
  const ih = h - p * 2

  const path = values
    .map((v, i) => {
      const x = p + (iw * i) / Math.max(1, values.length - 1)
      const y = p + ih - ((v - min) / range) * ih
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  const hasSignal = values.some((v) => v > 0)
  const peak = Math.max(...values, 0)
  const peakIdx = values.findIndex((v) => v === peak)

  return (
    <div className="dashboard-chartWrap">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={p}
            x2={w - p}
            y1={p + ih * t}
            y2={p + ih * t}
            stroke="rgba(148,163,184,0.3)"
            strokeDasharray="4 5"
          />
        ))}
        <path d={path} stroke={color} strokeWidth="4" fill="none" />
        {safe.map((row, i) => {
          const x = p + (iw * i) / Math.max(1, values.length - 1)
          const y = p + ih - ((Number(row[metric] || 0) - min) / range) * ih
          if (highlightPeak && hasSignal && i === peakIdx) {
            return <circle key={`peak-${i}`} cx={x} cy={y} r="6" fill="#ffffff" stroke={color} strokeWidth="3" />
          }
          if (i % Math.ceil(Math.max(1, safe.length / 8)) !== 0 && i !== safe.length - 1) return null
          return <circle key={`pt-${i}`} cx={x} cy={y} r="3" fill={color} />
        })}
        {highlightPeak && hasSignal && peakIdx >= 0 ? (() => {
          const x = p + (iw * peakIdx) / Math.max(1, values.length - 1)
          const y = p + ih - ((Number(safe[peakIdx][metric] || 0) - min) / range) * ih
          return (
            <text x={x} y={Math.max(p + 10, y - 10)} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="800">
              Peak
            </text>
          )
        })() : null}
        {safe.map((_, i) => {
          const x = p + (iw * i) / Math.max(1, values.length - 1)
          const band = iw / Math.max(1, values.length - 1)
          return (
            <rect
              key={i}
              x={Math.max(p, x - band / 2)}
              y={p}
              width={band}
              height={ih}
              fill="transparent"
              onMouseEnter={() => onHover(safe[i])}
              onMouseLeave={() => onHover(null)}
            />
          )
        })}
        {!hasSignal ? (
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="#64748b" fontSize="14" fontWeight="700">
            No data in selected period
          </text>
        ) : null}
      </svg>
      <div className="dashboard-axis">
        <span>Min: {metric === 'revenue' ? formatMoneyCompact(min) : min}</span>
        <span>Max: {metric === 'revenue' ? formatMoneyCompact(max) : max}</span>
      </div>
      <div className="dashboard-axisLabels">
        <span>Y: {metric === 'revenue' ? 'Revenue' : metric === 'appts' ? 'Appointments' : 'Orders'}</span>
        <span>X: Time</span>
      </div>
      <div className="dashboard-xLabels">
        <span>{safe[0]?.label || '-'}</span>
        <span>{safe[Math.floor(safe.length / 2)]?.label || '-'}</span>
        <span>{safe[safe.length - 1]?.label || '-'}</span>
      </div>
    </div>
  )
}

function RevenueComparisonChart({ currentRows, previousRows, onHover }) {
  const current = currentRows.length ? currentRows : [{ label: 'N/A', revenueTotal: 0, revenue: 0 }]
  const previous = previousRows.length ? previousRows : []
  const getCurrent = (row) => Number(row.revenueTotal ?? row.revenue ?? 0)
  const getPreviousAt = (idx) => Number(previous[idx]?.revenueTotal ?? previous[idx]?.revenue ?? 0)

  const allValues = current.flatMap((row, i) => [getCurrent(row), getPreviousAt(i)])
  const w = 760
  const h = 250
  const p = 24
  const max = Math.max(...allValues, 0)
  const min = 0
  const range = Math.max(1, max - min)
  const iw = w - p * 2
  const ih = h - p * 2
  const hasSignal = allValues.some((v) => v > 0)

  const pathFor = (rows, metricGetter) => rows.map((row, i) => {
    const v = metricGetter(row, i)
    const x = p + (iw * i) / Math.max(1, current.length - 1)
    const y = p + ih - ((v - min) / range) * ih
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')

  const currentPath = pathFor(current, (row) => getCurrent(row))
  const previousPath = pathFor(current, (_, i) => getPreviousAt(i))

  return (
    <div className="dashboard-chartWrap">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={p}
            x2={w - p}
            y1={p + ih * t}
            y2={p + ih * t}
            stroke="rgba(148,163,184,0.3)"
            strokeDasharray="4 5"
          />
        ))}

        <path d={currentPath} stroke="#db2777" strokeWidth="4.5" fill="none" />
        <path d={previousPath} stroke="#94a3b8" strokeWidth="2.6" strokeDasharray="7 6" fill="none" />

        {current.map((row, i) => {
          const v = getCurrent(row)
          const x = p + (iw * i) / Math.max(1, current.length - 1)
          const y = p + ih - ((v - min) / range) * ih
          if (i % Math.ceil(Math.max(1, current.length / 8)) !== 0 && i !== current.length - 1) return null
          return <circle key={`cur-pt-${i}`} cx={x} cy={y} r="3.5" fill="#db2777" />
        })}

        {current.map((_, i) => {
          const x = p + (iw * i) / Math.max(1, current.length - 1)
          const band = iw / Math.max(1, current.length - 1)
          return (
            <rect
              key={i}
              x={Math.max(p, x - band / 2)}
              y={p}
              width={band}
              height={ih}
              fill="transparent"
              onMouseEnter={() => onHover({
                label: current[i]?.label,
                revenueCurrent: getCurrent(current[i] || {}),
                revenuePrevious: getPreviousAt(i),
              })}
              onMouseLeave={() => onHover(null)}
            />
          )
        })}

        {!hasSignal ? (
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="#64748b" fontSize="14" fontWeight="700">
            No data in selected period
          </text>
        ) : null}
      </svg>
      <div className="dashboard-axis">
        <span>Min: {formatMoneyCompact(min)}</span>
        <span>Max: {formatMoneyCompact(max)}</span>
      </div>
      <div className="dashboard-axisLabels">
        <span>Y: Revenue</span>
        <span>X: Time</span>
      </div>
      <div className="dashboard-xLabels">
        <span>{current[0]?.label || '-'}</span>
        <span>{current[Math.floor(current.length / 2)]?.label || '-'}</span>
        <span>{current[current.length - 1]?.label || '-'}</span>
      </div>
    </div>
  )
}

function DualMetricLineChart({
  rows,
  mainMetric,
  subMetric,
  mainColor,
  subColor,
  onHover,
  leftLabel,
  rightLabel,
  mainIsMoney = false,
  subIsMoney = false,
}) {
  const safe = rows.length ? rows : [{ label: 'N/A', [mainMetric]: 0, [subMetric]: 0 }]
  const mainValues = safe.map((x) => Number(x[mainMetric] || 0))
  const subValues = safe.map((x) => Number(x[subMetric] || 0))
  const w = 760
  const h = 250
  const p = 24
  const maxMain = Math.max(...mainValues, 0)
  const maxSub = Math.max(...subValues, 0)
  const rangeMain = Math.max(1, maxMain)
  const rangeSub = Math.max(1, maxSub)
  const iw = w - p * 2
  const ih = h - p * 2

  const pathFor = (values, range) => values.map((v, i) => {
    const x = p + (iw * i) / Math.max(1, values.length - 1)
    const y = p + ih - (v / range) * ih
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')

  const mainPath = pathFor(mainValues, rangeMain)
  const subPath = pathFor(subValues, rangeSub)
  const hasSignal = mainValues.some((v) => v > 0) || subValues.some((v) => v > 0)

  return (
    <div className="dashboard-chartWrap">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={p}
            x2={w - p}
            y1={p + ih * t}
            y2={p + ih * t}
            stroke="rgba(148,163,184,0.3)"
            strokeDasharray="4 5"
          />
        ))}
        <path d={mainPath} stroke={mainColor} strokeWidth="4" fill="none" />
        <path d={subPath} stroke={subColor} strokeWidth="2.6" strokeDasharray="7 6" strokeOpacity="0.9" fill="none" />

        {safe.map((row, i) => {
          const x = p + (iw * i) / Math.max(1, safe.length - 1)
          const yMain = p + ih - (Number(row[mainMetric] || 0) / rangeMain) * ih
          if (i % Math.ceil(Math.max(1, safe.length / 8)) !== 0 && i !== safe.length - 1) return null
          return <circle key={`main-pt-${i}`} cx={x} cy={yMain} r="3" fill={mainColor} />
        })}

        {safe.map((_, i) => {
          const x = p + (iw * i) / Math.max(1, safe.length - 1)
          const band = iw / Math.max(1, safe.length - 1)
          return (
            <rect
              key={i}
              x={Math.max(p, x - band / 2)}
              y={p}
              width={band}
              height={ih}
              fill="transparent"
              onMouseEnter={() => onHover(safe[i])}
              onMouseLeave={() => onHover(null)}
            />
          )
        })}

        {!hasSignal ? (
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="#64748b" fontSize="14" fontWeight="700">
            No data in selected period
          </text>
        ) : null}
      </svg>
      <div className="dashboard-axis">
        <span>{leftLabel} Max: {mainIsMoney ? formatMoneyCompact(maxMain) : maxMain}</span>
        <span>{rightLabel} Max: {subIsMoney ? formatMoneyCompact(maxSub) : maxSub}</span>
      </div>
      <div className="dashboard-axisLabels">
        <span>Y-left: {leftLabel}</span>
        <span>Y-right: {rightLabel}</span>
      </div>
      <div className="dashboard-xLabels">
        <span>{safe[0]?.label || '-'}</span>
        <span>{safe[Math.floor(safe.length / 2)]?.label || '-'}</span>
        <span>{safe[safe.length - 1]?.label || '-'}</span>
      </div>
    </div>
  )
}

function getStatusColor(status, idx) {
  const s = String(status || '').toLowerCase()
  if (s.includes('pending')) return '#f59e0b'
  if (s.includes('completed') || s === 'done') return '#16a34a'
  if (s.includes('cancel')) return '#ef4444'
  const palette = ['#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b']
  return palette[idx % palette.length]
}

function OrdersStatusPieChart({ rows }) {
  const safe = rows.length ? rows : [{ status: 'No data', count: 1 }]
  const total = safe.reduce((sum, x) => sum + Number(x.count || 0), 0)
  const w = 420
  const h = 300
  const cx = w / 2
  const cy = h / 2 - 6
  const outerR = 108
  const innerR = 62
  const labelR = (outerR + innerR) / 2

  const toPoint = (angleDeg, radius) => {
    const rad = (Math.PI / 180) * (angleDeg - 90)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  const slices = safe.reduce((acc, row, idx) => {
    const value = Number(row.count || 0)
    const pct = total ? (value / total) * 100 : 0
    const start = acc.currentAngle
    const end = start + (pct / 100) * 360
    const mid = start + (end - start) / 2
    const color = getStatusColor(row.status, idx)
    const largeArc = end - start > 180 ? 1 : 0
    const pOuterStart = toPoint(start, outerR)
    const pOuterEnd = toPoint(end, outerR)
    const pInnerEnd = toPoint(end, innerR)
    const pInnerStart = toPoint(start, innerR)
    const labelPoint = toPoint(mid, labelR)
    const path = [
      `M ${pOuterStart.x} ${pOuterStart.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${pOuterEnd.x} ${pOuterEnd.y}`,
      `L ${pInnerEnd.x} ${pInnerEnd.y}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${pInnerStart.x} ${pInnerStart.y}`,
      'Z',
    ].join(' ')
    acc.items.push({
      status: row.status,
      count: value,
      pct: Math.round(pct),
      color,
      path,
      lx: labelPoint.x,
      ly: labelPoint.y,
      showLabel: pct >= 12,
    })
    acc.currentAngle = end
    return acc
  }, { currentAngle: 0, items: [] }).items

  return (
    <div className="dashboard-pieWrap">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
        {slices.map((s) => (
          <g key={s.status}>
            <path
              d={s.path}
              fill={s.color}
              stroke="#ffffff"
              strokeWidth="2"
            />
            {s.showLabel ? (
              <text x={s.lx} y={s.ly + 4} textAnchor="middle" fill="#ffffff" className="dashboard-pieSlicePct">
                {s.pct}%
              </text>
            ) : null}
          </g>
        ))}
        <circle cx={cx} cy={cy} r={innerR - 2} fill="#ffffff" />
        <text x={cx} y={cy - 3} textAnchor="middle" fill="#334155" className="dashboard-pieCenterLabel">Total Orders</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#0f172a" className="dashboard-pieCenterStatus">{total}</text>
      </svg>

      <div className="dashboard-statusInline">
        {slices.map((s) => (
          <div key={`st-${s.status}`} className="dashboard-statusChip">
            <span className="dashboard-statusLeft">
              <span className="dashboard-statusDot" style={{ background: s.color }} />
              <span className="dashboard-statusName">{s.status}</span>
            </span>
            <span className="dashboard-statusValue">{s.count} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function KpiProgress({ valueText, targetText, progressPct }) {
  if (!targetText) return null
  return (
    <div className="dashboard-kpiTarget">
      <div className="dashboard-kpiTargetText">{valueText} / {targetText}</div>
      <div className="dashboard-kpiProgressTrack"><span style={{ width: `${Math.min(100, Number(progressPct || 0))}%` }} /></div>
    </div>
  )
}

export default function OwnerDashboardPage() {
  const now = new Date()
  const nowIso = now.toISOString().slice(0, 10)
  const nowMonth = nowIso.slice(0, 7)
  const nowYear = String(now.getFullYear())

  const [searchParams, setSearchParams] = useSearchParams()
  const allowedPeriods = new Set(['day', 'week', 'month', 'year'])
  const initialPeriod = allowedPeriods.has(searchParams.get('period')) ? searchParams.get('period') : 'day'
  const initialRefDate = searchParams.get('refDate') || nowIso
  const initialRefMonth = searchParams.get('refMonth') || nowMonth
  const initialRefYear = searchParams.get('refYear') || nowYear

  const [period, setPeriod] = useState(initialPeriod)
  const [refDate, setRefDate] = useState(initialRefDate)
  const [refMonth, setRefMonth] = useState(initialRefMonth)
  const [refYear, setRefYear] = useState(initialRefYear)
  const [dashboard, setDashboard] = useState(null)
  const [hoverRevenue, setHoverRevenue] = useState(null)
  const [hoverAppt, setHoverAppt] = useState(null)
  const [hoverOrders, setHoverOrders] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('period', period)
    if (period === 'day' || period === 'week') params.set('refDate', refDate)
    if (period === 'month') params.set('refMonth', refMonth)
    if (period === 'year') params.set('refYear', refYear)
    setSearchParams(params, { replace: true })
  }, [period, refDate, refMonth, refYear, setSearchParams])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const params = new URLSearchParams({ period })
        if (period === 'day' || period === 'week') params.set('refDate', refDate)
        if (period === 'month') params.set('refMonth', refMonth)
        if (period === 'year') params.set('refYear', refYear)
        const res = await api.get(`/api/owner/dashboard?${params.toString()}`)
        if (mounted) setDashboard(res)
      } catch (err) {
        console.error(err)
        showPortalToast({ type: 'error', message: err?.message || 'Failed to load dashboard data.' })
      }
    })()

    return () => {
      mounted = false
    }
  }, [period, refDate, refMonth, refYear])

  const cards = useMemo(() => {
    const k = dashboard?.kpis || {}
    return [
      {
        key: 'revenue',
        title: 'Revenue',
        value: formatMoneyCompact(k?.revenue?.value || 0),
        rawValue: Number(k?.revenue?.value || 0),
        valueText: formatMoneyCompact(k?.revenue?.value || 0),
        delta: k?.revenue?.deltaPct || 0,
        trend: k?.revenue?.trend || 'flat',
        context: String(k?.revenue?.context || ''),
        status: k?.revenue?.status || 'neutral',
        prominent: !!k?.revenue?.prominent,
        target: Number(k?.revenue?.target || 0),
        targetText: formatMoneyCompact(k?.revenue?.target || 0),
        progressPct: Number(k?.revenue?.progressPct || 0),
        iconBg: 'var(--info-soft)',
        Icon: IconDollar,
      },
      {
        key: 'appointments',
        title: 'Appointments',
        value: String(k?.appointments?.value || 0),
        rawValue: Number(k?.appointments?.value || 0),
        valueText: String(k?.appointments?.value || 0),
        delta: k?.appointments?.deltaPct || 0,
        trend: k?.appointments?.trend || 'flat',
        context: String(k?.appointments?.context || ''),
        status: k?.appointments?.status || 'neutral',
        target: Number(k?.appointments?.target || 0),
        targetText: String(k?.appointments?.target || 0),
        progressPct: Number(k?.appointments?.progressPct || 0),
        iconBg: 'var(--success-soft)',
        Icon: IconCalendar,
      },
      {
        key: 'customers',
        title: 'Customers',
        value: String(k?.customers?.value || 0),
        rawValue: Number(k?.customers?.value || 0),
        valueText: String(k?.customers?.value || 0),
        delta: k?.customers?.deltaPct || 0,
        trend: k?.customers?.trend || 'flat',
        context: String(k?.customers?.context || ''),
        status: k?.customers?.status || 'neutral',
        iconBg: 'var(--purple-soft)',
        Icon: IconUsers,
      },
      {
        key: 'rating',
        title: 'Rating',
        value: `${k?.rating?.value || 0}`,
        rawValue: Number(k?.rating?.value || 0),
        valueText: `${k?.rating?.value || 0}/5`,
        delta: k?.rating?.deltaPct || 0,
        trend: k?.rating?.trend || 'flat',
        context: String(k?.rating?.context || ''),
        status: k?.rating?.status || 'neutral',
        iconBg: 'var(--golden-soft)',
        Icon: IconStar,
      },
      {
        key: 'avgRevenuePerCustomer',
        title: 'Avg Rev/Customer',
        value: formatMoneyCompact(k?.avgRevenuePerCustomer?.value || 0),
        rawValue: Number(k?.avgRevenuePerCustomer?.value || 0),
        valueText: formatMoneyCompact(k?.avgRevenuePerCustomer?.value || 0),
        delta: k?.avgRevenuePerCustomer?.deltaPct || 0,
        trend: k?.avgRevenuePerCustomer?.trend || 'flat',
        context: String(k?.avgRevenuePerCustomer?.context || ''),
        status: k?.avgRevenuePerCustomer?.status || 'neutral',
        target: Number(k?.avgRevenuePerCustomer?.target || 0),
        targetText: formatMoneyCompact(k?.avgRevenuePerCustomer?.target || 0),
        progressPct: Number(k?.avgRevenuePerCustomer?.progressPct || 0),
        iconBg: 'var(--info-soft)',
        Icon: IconDollar,
      },
      {
        key: 'orderCompletion',
        title: 'Order Completion',
        value: `${k?.orderCompletion?.value || 0}%`,
        rawValue: Number(k?.orderCompletion?.value || 0),
        valueText: `${k?.orderCompletion?.value || 0}% completed`,
        delta: k?.orderCompletion?.deltaPct || 0,
        trend: k?.orderCompletion?.trend || 'flat',
        trendLabel: Number(k?.orderCompletion?.value || 0) >= Number(k?.orderCompletion?.target || 0) ? 'On target' : 'Below target',
        context: String(k?.orderCompletion?.context || ''),
        status: k?.orderCompletion?.status || 'neutral',
        target: Number(k?.orderCompletion?.target || 0),
        targetText: `goal ${k?.orderCompletion?.target || 0}%`,
        progressPct: Number(k?.orderCompletion?.progressPct || 0),
        iconBg: 'var(--info-soft)',
        Icon: IconBarCart,
      },
      {
        key: 'pendingOrders',
        title: 'Pending Orders',
        value: String(k?.pendingOrders?.value || 0),
        rawValue: Number(k?.pendingOrders?.value || 0),
        valueText: String(k?.pendingOrders?.value || 0),
        delta: k?.pendingOrders?.deltaPct || 0,
        trend: k?.pendingOrders?.trend || 'flat',
        trendLabel: Number(k?.pendingOrders?.value || 0) === 0 ? 'All clear' : `${k?.pendingOrders?.value || 0} pending`,
        context: String(k?.pendingOrders?.context || ''),
        status: k?.pendingOrders?.status || 'warning',
        iconBg: 'var(--warning-soft)',
        Icon: IconAlertTriangle,
      },
      {
        key: 'lowStock',
        title: 'Low Stock',
        value: `${k?.lowStock?.value || 0} items`,
        rawValue: Number(k?.lowStock?.value || 0),
        valueText: `${k?.lowStock?.value || 0}`,
        delta: k?.lowStock?.critical || 0,
        trend: k?.lowStock?.trend || 'flat',
        context: `${k?.lowStock?.critical || 0} critical`,
        status: k?.lowStock?.status || 'warning',
        prominent: !!k?.lowStock?.prominent,
        iconBg: 'var(--warning-soft)',
        Icon: IconCube,
      },
    ]
  }, [dashboard])

  const chartRows = dashboard?.revenueData?.[period] || []
  const revenuePrevRows = dashboard?.revenuePreviousData?.[period] || []
  const apptRows = dashboard?.appointmentsTrend?.[period] || chartRows
  const orderRows = dashboard?.ordersTrend?.[period] || []
  const ordersByStatus = dashboard?.ordersByStatus || []
  const topCustomers = dashboard?.topCustomers || []
  const staff = dashboard?.staffPerformance || []
  const totalStaffRevenue = staff.reduce((acc, s) => acc + Number(s.revenue || 0), 0)
  const inventory = [...(dashboard?.inventoryAlerts || [])].sort((a, b) => Number(a.qty || 0) - Number(b.qty || 0))
  const services = dashboard?.revenueByService || []
  const products = dashboard?.productPerformance || []
  const heatmap = dashboard?.bookingHeatmap || []
  const insights = dashboard?.insights || []
  const actions = dashboard?.actions || []

  const revenuePeak = chartRows.reduce((best, row) => {
    const total = Number(row.revenueTotal ?? row.revenue ?? 0)
    if (!best || total > best.value) return { label: row.label, value: total }
    return best
  }, null)

  const apptPeak = apptRows.reduce((best, row) => {
    const value = Number(row.revenueBooking || 0)
    if (!best || value > best.value) return { label: row.label, value }
    return best
  }, null)

  const sortedServices = [...services].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
  const totalServiceRevenue = sortedServices.reduce((sum, s) => sum + Number(s.revenue || 0), 0)
  const topService = sortedServices[0]
  const topProduct = products[0]
  const productRevenueTotal = products.reduce((sum, p) => sum + Number(p.revenue || 0), 0)

  const peakHour = heatmap.reduce((best, row) => {
    const value = Number(row.count || 0)
    if (!best || value > best.value) return { hour: row.hour, value }
    return best
  }, null)

  const orderPeak = orderRows.reduce((best, row) => {
    const value = Number(row.orders || 0)
    if (!best || value > best.value) return { label: row.label, value }
    return best
  }, null)

  const sortedStatuses = [...ordersByStatus].sort((a, b) => Number(b.count || 0) - Number(a.count || 0))

  return (
    <div className="dashboard-page">
      <div className="dashboard-actionsRow">
        <div className="dashboard-headLeft">
          <div className="dashboard-summary">{dashboard?.summary || ''}</div>
        </div>
      </div>

      <div className="dashboard-filterRow">
        <div className="dashboard-filtersCombined">
          <div className="dashboard-actions">
            {actions.map((a) => (
              <a key={a.label} href={a.href} className="dashboard-actionBtn">{a.label}</a>
            ))}
          </div>
          <GlobalPeriodFilter value={period} onChange={setPeriod} />
          <TimeReferencePicker
            period={period}
            refDate={refDate}
            refMonth={refMonth}
            refYear={refYear}
            onRefDate={setRefDate}
            onRefMonth={setRefMonth}
            onRefYear={setRefYear}
          />
        </div>
      </div>

      <div className="portal-grid4 dashboard-kpiGrid">
        {cards.map((card) => (
          <PortalCard
            key={card.key}
            className={`portal-kpi ${toneClass(card.status)} ${card.prominent ? 'is-prominent' : ''}`.trim()}
            title={card.title}
            right={<div className="portal-kpiIcon" style={{ background: card.iconBg }}><card.Icon /></div>}
          >
            <div className="portal-kpiValue">{card.value}</div>
            <KpiProgress valueText={card.valueText} target={card.target} targetText={card.targetText} progressPct={card.progressPct} />
            <div className="dashboard-kpiMeta">
              <span className={`dashboard-kpiTrend ${toneClass(card.status)}`.trim()}>
                {card.trendLabel || trendText(card.trend, card.delta)}
              </span>
              <span>{card.context}</span>
            </div>
          </PortalCard>
        ))}
      </div>

      <div className="portal-grid2 dashboard-sectionGrid">
        <PortalCard title="Revenue Trend">
          <div className="dashboard-legend dashboard-legendMulti">
            <span className="dashboard-legendItem"><span className="dashboard-lineSwatch is-revenue-main" /> Current Period Revenue</span>
            <span className="dashboard-legendItem"><span className="dashboard-lineSwatch is-revenue-prev is-dashed" /> Previous Period Revenue</span>
          </div>
          <RevenueComparisonChart currentRows={chartRows} previousRows={revenuePrevRows} onHover={setHoverRevenue} />
          {hoverRevenue ? (
            <div className="dashboard-tooltip">
              Date: {hoverRevenue.label}
              {' | '}Current: {formatMoneyCompact(hoverRevenue.revenueCurrent)}
              {' | '}Previous: {formatMoneyCompact(hoverRevenue.revenuePrevious)}
            </div>
          ) : null}
          <div className="dashboard-chartInsight">
            {revenuePeak ? `Revenue peaks on ${revenuePeak.label} (${formatMoneyCompact(revenuePeak.value)}).` : 'No revenue trend data in this period.'}
          </div>
        </PortalCard>

        <PortalCard title="Peak Booking Hours">
          <div className="dashboard-heatmap">
            {heatmap.map((h) => {
              const max = Math.max(1, ...heatmap.map((x) => Number(x.count || 0)))
              const intensity = Math.round((Number(h.count || 0) / max) * 100)
              return (
                <div key={h.hour} className={`dashboard-heatCell ${h.isPeak ? 'is-peak' : ''}`.trim()}>
                  <div className="dashboard-heatHour">{h.hour}</div>
                  <div className="dashboard-heatTrack">
                    <span style={{ width: `${intensity}%` }} />
                  </div>
                  <div className="dashboard-heatCount">{h.count} {h.isPeak ? <span className="dashboard-peakBadge">Peak</span> : null}</div>
                </div>
              )
            })}
          </div>
          <div className="dashboard-chartInsight">
            {peakHour ? `${peakHour.hour} is the busiest hour (${peakHour.value} bookings).` : 'No peak-hour data in this period.'}
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2 dashboard-sectionGrid">
        <PortalCard title="Appointments Trend">
          <div className="dashboard-legend dashboard-legendMulti">
            <span className="dashboard-legendItem"><span className="dashboard-lineSwatch is-appt-main" /> Booking Revenue</span>
            <span className="dashboard-legendItem"><span className="dashboard-lineSwatch is-appt-sub is-dashed" /> Bookings Count</span>
          </div>
          <DualMetricLineChart
            rows={apptRows}
            mainMetric="revenueBooking"
            subMetric="appts"
            mainColor="#16a34a"
            subColor="#0f766e"
            leftLabel="Booking Revenue"
            rightLabel="Bookings"
            mainIsMoney
            onHover={setHoverAppt}
          />
          {hoverAppt ? (
            <div className="dashboard-tooltip">
              Date: {hoverAppt.label}
              {' | '}Booking Revenue: {formatMoneyCompact(hoverAppt.revenueBooking)}
              {' | '}Bookings: {hoverAppt.appts || 0}
            </div>
          ) : null}
          <div className="dashboard-chartInsight">
            {apptPeak ? `Booking revenue peaks on ${apptPeak.label} (${formatMoneyCompact(apptPeak.value)}).` : 'No appointment trend data in this period.'}
          </div>
        </PortalCard>

        <PortalCard title="Revenue by Service">
          <div className="dashboard-bars">
            {sortedServices.map((s, idx) => {
              const max = Math.max(1, ...sortedServices.map((x) => Number(x.revenue || 0)))
              const width = Math.round((Number(s.revenue || 0) / max) * 100)
              const pct = totalServiceRevenue ? Math.round((Number(s.revenue || 0) / totalServiceRevenue) * 100) : 0
              return (
                <div key={s.name} className={`dashboard-barRow ${idx === 0 ? 'is-top' : ''}`.trim()}>
                  <div className="dashboard-barLabel">{s.name} <span className="dashboard-barPct">({pct}%)</span></div>
                  <div className="dashboard-barTrack"><span style={{ width: `${width}%` }} /></div>
                  <div className="dashboard-barValue">{formatMoneyCompact(s.revenue)}</div>
                </div>
              )
            })}
          </div>
          <div className="dashboard-chartInsight">
            {topService ? `${topService.name} is the top service by revenue.` : 'No service revenue data in this period.'}
          </div>
        </PortalCard>
      </div>

      <div className="portal-grid2 dashboard-sectionGrid">
        <PortalCard title="Orders Trend">
          <div className="dashboard-legend dashboard-legendMulti">
            <span className="dashboard-legendItem"><span className="dashboard-lineSwatch is-order-main" /> Orders Count</span>
            <span className="dashboard-legendItem"><span className="dashboard-lineSwatch is-order-sub is-dashed" /> Order Revenue</span>
          </div>
          <DualMetricLineChart
            rows={orderRows}
            mainMetric="orders"
            subMetric="orderRevenue"
            mainColor="#0ea5e9"
            subColor="#94a3b8"
            leftLabel="Orders"
            rightLabel="Order Revenue"
            subIsMoney
            onHover={setHoverOrders}
          />
          {hoverOrders ? (
            <div className="dashboard-tooltip">
              Date: {hoverOrders.label}
              {' | '}Orders: {hoverOrders.orders || 0}
              {' | '}Order Revenue: {formatMoneyCompact(hoverOrders.orderRevenue)}
            </div>
          ) : null}
          <div className="dashboard-chartInsight">
            {orderPeak ? `Orders peak on ${orderPeak.label} (${orderPeak.value} orders).` : 'No order trend data in this period.'}
          </div>
        </PortalCard>

        <PortalCard title="Orders by Status" className="dashboard-ordersStatusCard">
          <OrdersStatusPieChart rows={sortedStatuses} />
        </PortalCard>
      </div>

      <PortalCard title="Product Report">
        <div className="dashboard-bars dashboard-productBars">
          {products.map((p, idx) => {
            const maxRevenue = Math.max(1, ...products.map((x) => Number(x.revenue || 0)))
            const width = Math.round((Number(p.revenue || 0) / maxRevenue) * 100)
            const pct = productRevenueTotal ? Math.round((Number(p.revenue || 0) / productRevenueTotal) * 100) : 0
            return (
              <div key={p.name} className={`dashboard-barRow ${idx === 0 ? 'is-top' : ''}`.trim()}>
                <div className="dashboard-barLabel">{p.name} <span className="dashboard-barPct">({pct}%)</span></div>
                <div className="dashboard-barTrack"><span style={{ width: `${width}%` }} /></div>
                <div className="dashboard-barValue">{formatMoneyCompact(p.revenue)} • {p.sold} sold</div>
              </div>
            )
          })}
        </div>
        <div className="dashboard-chartInsight">
          {topProduct ? `${topProduct.name} is the top product (${formatMoneyCompact(topProduct.revenue)} from ${topProduct.sold} sold).` : 'No product sales in this period.'}
        </div>
      </PortalCard>

      <div className="portal-grid2 dashboard-sectionGrid">
        <PortalCard title="Top Customers">
          <div className="dashboard-list">
            {topCustomers.map((c, idx) => (
              <div className={`dashboard-listItem ${idx === 0 ? 'is-top1' : ''}`.trim()} key={`${c.name}-${c.lastVisit}`}>
                <div>
                  <div className="dashboard-listTitle">
                    {c.name}
                    {c.vip ? <span className="dashboard-badgeVip">VIP</span> : null}
                    {c.atRisk ? <span className="dashboard-badgeRisk">At-risk</span> : null}
                    {idx === 0 ? <span className="dashboard-badgeTop">Top 1</span> : null}
                  </div>
                  <div className="dashboard-listSub">
                    {c.visits} visits • avg: {formatMoneyCompact(c.avgSpendPerVisit)} • last: {formatRelativeDays(c.lastVisitDaysAgo)}
                  </div>
                </div>
                <div className="dashboard-money">{formatMoneyCompact(c.spending)}</div>
              </div>
            ))}
          </div>
        </PortalCard>

        <PortalCard title="Staff Performance">
          <div className="dashboard-list">
            {staff.map((s) => {
              const contrib = totalStaffRevenue ? Math.round((Number(s.revenue || 0) / totalStaffRevenue) * 100) : 0
              return (
                <div className="dashboard-listItem" key={`${s.rank}-${s.name}`}>
                  <div>
                    <div className="dashboard-listTitle">
                      <span className="dashboard-rank">#{s.rank}</span> {s.name}
                      {s.rank === 1 ? <span className="dashboard-badgeTop">Top Performer</span> : null}
                    </div>
                    <div className="dashboard-listSub">
                      {s.appts} appts • {s.customers} customers • utilization {s.utilizationPct}% • efficiency {s.efficiencyPct}%
                    </div>
                    <div className="dashboard-progress"><span style={{ width: `${contrib}%` }} /></div>
                  </div>
                  <div className="dashboard-money">{formatMoneyCompact(s.revenue)}</div>
                </div>
              )
            })}
          </div>
        </PortalCard>
      </div>

      <PortalCard
        className="portal-warningCard"
        title="Inventory Alerts"
        right={<span className="portal-warningPill">{inventory.length} low stock • {inventory.filter((x) => x.severity === 'critical').length} critical</span>}
      >
        <div className="dashboard-list">
          {inventory.map((p) => (
            <div className="dashboard-listItem" key={p.name}>
              <div>
                <div className="dashboard-listTitle">{p.name}</div>
                <div className="dashboard-listSub">{p.qty} items left (~{p.daysRemaining} days remaining) • Reorder: {p.reorderLevel}</div>
              </div>
              <div className={`dashboard-stockTag ${p.severity === 'critical' ? 'is-critical' : 'is-warning'}`.trim()}>
                {p.severity === 'critical' ? 'Critical' : 'Low'}
              </div>
            </div>
          ))}
        </div>
      </PortalCard>
    </div>
  )
}
