import React, { useEffect, useMemo, useState } from 'react'
import '../../styles/dashboard.css'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import {
  IconCalendar,
  IconCube,
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

function Segmented({ value, onChange }) {
  const items = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ]

  return (
    <div className="portal-seg" role="tablist" aria-label="Revenue range">
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

export default function OwnerDashboardPage() {
  const [range, setRange] = useState('week')
  const [dashboard, setDashboard] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await api.get('/api/owner/dashboard')
        if (mounted) setDashboard(res)
      } catch (err) {
        console.error(err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const revenueData = dashboard?.revenueData || { day: [], week: [], month: [] }
  const values = revenueData[range] || []
  const safeValues = values.length ? values : [0]
  const svgW = 720
  const svgH = 260
  const padding = 22
  const path = buildLinePath(safeValues, svgW, svgH, padding)

  const kpis = useMemo(() => {
    const k = dashboard?.kpis
    return [
      {
        title: 'Today Revenue',
        value: formatVndCompact(Number(k?.revenueToday || 0)),
        accent: 'var(--info)',
        iconBg: 'var(--info-soft)',
        Icon: IconDollar,
      },
      {
        title: 'Today Appointments',
        value: String(k?.apptsToday ?? 0),
        accent: 'var(--success)',
        iconBg: 'var(--success-soft)',
        Icon: IconCalendar,
      },
      {
        title: 'Total Customers',
        value: String(k?.customersTotal ?? 0),
        accent: 'var(--purple)',
        iconBg: 'var(--purple-soft)',
        Icon: IconUsers,
      },
      {
        title: 'Low Stock Products',
        value: String(k?.lowStock ?? 0),
        accent: 'var(--warning)',
        iconBg: 'var(--warning-soft)',
        Icon: IconCube,
      },
    ]
  }, [dashboard])

  const recentAppointments = dashboard?.recentAppointments || []
  const staffPerformance = dashboard?.staffPerformance || []
  const inventoryAlerts = dashboard?.inventoryAlerts || []

  return (
    <div className="dashboard-page">
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
              <div className="portal-kpiIcon">
                <kpi.Icon />
              </div>
            }
          >
            <div className="portal-kpiRow">
              <div>
                <div className="portal-kpiValue">{kpi.value}</div>
                {kpi.delta ? (
                  <div className="portal-kpiMeta">
                    <span className={`portal-kpiDelta ${kpi.trend}`.trim()}>
                      {kpi.trend === 'up' ? 'â†—' : 'â†˜'} {kpi.delta}
                    </span>
                    {kpi.deltaLabel ? <span>{kpi.deltaLabel}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </PortalCard>
        ))}
      </div>

      <div className="portal-grid2">
        <PortalCard title="Revenue" right={<Segmented value={range} onChange={setRange} />}>
          <div style={{ width: '100%', overflow: 'hidden' }}>
            <svg
              width="100%"
              viewBox={`0 0 ${svgW} ${svgH}`}
              preserveAspectRatio="none"
              aria-label="Revenue chart"
            >
              {/* grid */}
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

              <path d={path} stroke="var(--primary)" strokeWidth="4" fill="none" />

              {/* end dots */}
              {safeValues.map((v, i) => {
                if (i !== 0 && i !== safeValues.length - 1) return null
                const x = padding + ((svgW - padding * 2) * i) / Math.max(1, safeValues.length - 1)
                const max = Math.max(...safeValues)
                const min = Math.min(...safeValues)
                const safeRange = Math.max(1, max - min)
                const y = padding + (svgH - padding * 2) - ((v - min) / safeRange) * (svgH - padding * 2)
                return (
                  <circle
                    key={`${i}-${v}`}
                    cx={x}
                    cy={y}
                    r="7"
                    fill="var(--primary)"
                    stroke="var(--surface)"
                    strokeWidth="3"
                  />
                )
              })}
            </svg>
          </div>
        </PortalCard>

        <PortalCard title="Staff Performance">
          <div className="portal-rankList">
            {staffPerformance.map((s) => (
              <div key={s.rank} className="portal-rankItem">
                <div className="portal-rankLeft">
                  <div className="portal-rankBadge">{s.rank}</div>
                  <div className="portal-rankPrimary">
                    <div className="portal-rankName">{s.name}</div>
                    <div className="portal-rankSub">{s.appts} appointments</div>
                  </div>
                </div>

                <div className="portal-rankValue">{s.revenue}</div>
              </div>
            ))}
          </div>
        </PortalCard>
      </div>

      <div className="portal-gridBottom">
        <PortalCard title="Recent Appointments">
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Staff</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentAppointments.map((a, idx) => (
                  <tr key={`${a.customer || 'c'}-${a.time || 't'}-${idx}`}>
                    <td style={{ fontWeight: 900 }}>{a.customer}</td>
                    <td>{a.service}</td>
                    <td>{a.staff}</td>
                    <td>{a.time}</td>
                    <td>
                      <span className={`portal-badge ${a.status}`.trim()}>{a.statusLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>

        <PortalCard
          className="portal-warningCard"
          title="Inventory Alerts"
          right={<span className="portal-warningPill">{inventoryAlerts.length} low stock</span>}
        >
          <div className="portal-list">
            {inventoryAlerts.map((p) => (
              <div key={p.name} className="portal-listItem">
                <div className="portal-listPrimary">
                  <div className="portal-listTitle">{p.name}</div>
                  <div className="portal-listSub">Inventory quantity</div>
                </div>
                <div className="portal-warningQty">{p.qty}</div>
              </div>
            ))}
          </div>
        </PortalCard>
      </div>
    </div>
  )
}
