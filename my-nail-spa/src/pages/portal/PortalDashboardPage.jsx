import { createElement, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarClock, ShoppingBag, Sparkles, Users, Wallet } from 'lucide-react'
import { ResponsiveContainer, Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'

import { useAuth } from '../../context/AuthContext.jsx'
import { useBookings } from '../../context/BookingContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'
import { formatUsd } from '../../lib/money'

function todayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function labelISO(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

function safeStatus(s) {
  const x = String(s || '').trim()
  if (!x) return 'Pending'
  return x
}

function orderDateISO(order) {
  const iso = String(order?.createdAt || '').slice(0, 10)
  return iso || null
}
function revenueForOrderForSalon(order, salonId) {
  const clean = String(salonId || '').trim()
  if (!clean) return Number(order?.totals?.total ?? 0)

  const key = String(order?.salonKey || '').trim()
  const sid = String(order?.salonId || '').trim()
  if (key === clean || sid === clean) return Number(order?.totals?.total ?? 0)
  return 0
}

function buildDailySeries({ bookings, orders, days, salonId } = {}) {
  const end = todayISO()
  const start = addDaysISO(end, -(days - 1))
  const cleanSalonId = String(salonId || '').trim() || null
  const map = new Map()

  const cancelled = new Set(['Cancelled', 'No-show'])

  for (const b of bookings || []) {
    if (!b?.dateISO) continue
    if (b.dateISO < start || b.dateISO > end) continue
    if (cleanSalonId && String(b.salonId || '') !== cleanSalonId) continue

    const status = safeStatus(b.status)
    if (cancelled.has(status)) continue

    const prev = map.get(b.dateISO) || {
      dateISO: b.dateISO,
      bookings: 0,
      serviceRevenueCompleted: 0,
      serviceRevenueBooked: 0,
      retailRevenue: 0,
      totalRevenue: 0,
    }

    const price = Number(b.totalPrice || 0)
    prev.bookings += 1
    prev.serviceRevenueBooked += Number.isFinite(price) ? price : 0
    if (status === 'Completed') prev.serviceRevenueCompleted += Number.isFinite(price) ? price : 0
    map.set(b.dateISO, prev)
  }

  for (const o of orders || []) {
    const iso = orderDateISO(o)
    if (!iso) continue
    if (iso < start || iso > end) continue

    const rev = cleanSalonId ? revenueForOrderForSalon(o, cleanSalonId) : Number(o?.totals?.total ?? 0)
    if (!Number.isFinite(rev) || rev <= 0) continue

    const prev = map.get(iso) || {
      dateISO: iso,
      bookings: 0,
      serviceRevenueCompleted: 0,
      serviceRevenueBooked: 0,
      retailRevenue: 0,
      totalRevenue: 0,
    }
    prev.retailRevenue += rev
    map.set(iso, prev)
  }

  const series = []
  for (let i = 0; i < days; i += 1) {
    const iso = addDaysISO(start, i)
    const row = map.get(iso) || {
      dateISO: iso,
      bookings: 0,
      serviceRevenueCompleted: 0,
      serviceRevenueBooked: 0,
      retailRevenue: 0,
      totalRevenue: 0,
    }
    const totalRevenue = Number(row.serviceRevenueCompleted || 0) + Number(row.retailRevenue || 0)
    series.push({ ...row, totalRevenue, label: labelISO(iso) })
  }
  return series
}

function Stat({ icon, label, value, hint }) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        border: '1px solid rgba(255,255,255,0.12)',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className="badge" style={{ background: 'rgba(0,0,0,0.26)', border: '1px solid rgba(255,255,255,0.10)' }}>
          {createElement(icon, { size: 14 })}
        </div>
        <div style={{ fontWeight: 900 }}>{label}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: '-0.02em' }}>{value}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{hint}</div>
    </div>
  )
}

export function PortalDashboardPage() {
  const auth = useAuth()
  const bookingsCtx = useBookings()
  const { t } = useI18n()

  const role = String(auth.user?.role || '').trim().toLowerCase()
  const mySalonId = auth.user?.salonId

  const [salons, setSalons] = useState([])
  const [scopeSalonId, setScopeSalonId] = useState(() => (role === 'admin' ? 'all' : String(mySalonId || '').trim()))
  const [orders, setOrders] = useState([])
  const [staffCount, setStaffCount] = useState(0)
  const [loading, setLoading] = useState({ orders: false, meta: false })
  const [error, setError] = useState('')

  useEffect(() => {
    if (role !== 'admin') return
    let alive = true
    setLoading((p) => ({ ...p, meta: true }))
    api
      .listSalons()
      .then((res) => {
        if (!alive) return
        setSalons(Array.isArray(res?.items) ? res.items : [])
      })
      .catch(() => {
        // no-op
      })
      .finally(() => {
        if (!alive) return
        setLoading((p) => ({ ...p, meta: false }))
      })
    return () => {
      alive = false
    }
  }, [role])

  useEffect(() => {
    let alive = true
    setError('')

    const scope = String(scopeSalonId || '').trim()
    const orderParams = scope && scope !== 'all' ? { salonKey: scope } : {}

    setLoading((p) => ({ ...p, orders: true }))
    api
      .listOrders(orderParams)
      .then((res) => {
        if (!alive) return
        setOrders(Array.isArray(res?.items) ? res.items : [])
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || 'Failed to load orders')
        setOrders([])
      })
      .finally(() => {
        if (!alive) return
        setLoading((p) => ({ ...p, orders: false }))
      })

    return () => {
      alive = false
    }
  }, [scopeSalonId])

  useEffect(() => {
    let alive = true
    const scope = String(scopeSalonId || '').trim()
    const salonId = scope && scope !== 'all' ? scope : null

    api
      .listUsers(salonId ? { salonId } : {})
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res?.items) ? res.items : []
        setStaffCount(list.filter((u) => u?.role === 'staff').length)
      })
      .catch(() => {
        if (!alive) return
        setStaffCount(0)
      })

    return () => {
      alive = false
    }
  }, [scopeSalonId])

  const scopedBookings = useMemo(() => {
    const scope = String(scopeSalonId || '').trim()
    const list = Array.isArray(bookingsCtx.bookings) ? bookingsCtx.bookings : []
    if (!scope || scope === 'all') return list
    return list.filter((b) => String(b.salonId || '') === scope)
  }, [bookingsCtx.bookings, scopeSalonId])

  const series14 = useMemo(() => {
    const scope = String(scopeSalonId || '').trim()
    return buildDailySeries({
      bookings: scopedBookings,
      orders,
      days: 14,
      salonId: scope && scope !== 'all' ? scope : null,
    })
  }, [orders, scopedBookings, scopeSalonId])

  const today = todayISO()
  const todayBookings = useMemo(() => scopedBookings.filter((b) => b?.dateISO === today), [scopedBookings, today])
  const pendingBookings = useMemo(() => scopedBookings.filter((b) => safeStatus(b.status) === 'Pending'), [scopedBookings])
  const revenue14 = useMemo(() => series14.reduce((s, r) => s + Number(r.totalRevenue || 0), 0), [series14])

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.dashboard.title', 'Dashboard')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Sparkles size={16} />
          {t('portal.dashboard.subtitle', 'Real-time portal metrics (SQL Server)')}
        </div>
      </div>

      {role === 'admin' ? (
        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <BarChart3 size={16} />
          <select className="input" value={scopeSalonId} onChange={(e) => setScopeSalonId(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="all">{t('portal.dashboard.scopeAll', 'All salons')}</option>
            {(salons || []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="muted" style={{ fontSize: 13 }}>
            {loading.meta ? t('portal.dashboard.scopeLoading', 'Loading salons…') : t('portal.dashboard.scopeHint', 'Scope your metrics')}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.dashboard.errorTitle', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="portalGrid" style={{ marginBottom: 14 }}>
        <Stat
          icon={CalendarClock}
          label={t('portal.dashboard.stats.todayBookings', 'Today bookings')}
          value={todayBookings.length}
          hint={`${t('portal.dashboard.stats.dateLabel', 'Date')}: ${today}`}
        />
        <Stat
          icon={ShoppingBag}
          label={t('portal.dashboard.stats.orders', 'Orders')}
          value={loading.orders ? '…' : orders.length}
          hint={t('portal.dashboard.stats.ordersHint', 'Retail orders in scope')}
        />
        <Stat
          icon={Users}
          label={t('portal.dashboard.stats.staff', 'Staff')}
          value={staffCount}
          hint={t('portal.dashboard.stats.staffHint', 'Active staff accounts')}
        />
        <Stat
          icon={Wallet}
          label={t('portal.dashboard.stats.revenue', 'Revenue (14d)')}
          value={formatUsd(revenue14)}
          hint={t('portal.dashboard.stats.revenueHint', 'Completed service + retail')}
        />
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 950 }}>{t('portal.dashboard.chart.title', 'Revenue trend')}</div>
            <div className="muted" style={{ fontSize: 13 }}>{t('portal.dashboard.chart.subtitle', 'Last 14 days')}</div>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {pendingBookings.length} {t('portal.dashboard.chart.pending', 'pending bookings')}
          </div>
        </div>

        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series14} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.55)" />
              <YAxis stroke="rgba(255,255,255,0.55)" />
              <Tooltip contentStyle={{ background: 'rgba(18,18,18,0.95)', border: '1px solid rgba(255,255,255,0.12)' }} />
              <Line type="monotone" dataKey="serviceRevenueCompleted" stroke="rgba(255,59,122,0.95)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="retailRevenue" stroke="rgba(120,200,255,0.95)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="totalRevenue" stroke="rgba(255,255,255,0.85)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

function Card({ title, subtitle, right, children } = {}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        border: '1px solid rgba(255,255,255,0.12)',
        background:
          'radial-gradient(1200px 480px at 20% -20%, rgba(255,59,122,0.18), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)',
      }}
    >
      {(title || subtitle || right) ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            {title ? <div style={{ fontWeight: 950 }}>{title}</div> : null}
            {subtitle ? <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</div> : null}
          </div>
          {right ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function ChartCard({ title, subtitle, right, height = 290, children } = {}) {
  return (
    <Card title={title} subtitle={subtitle} right={right}>
      <div style={{ height }}>
        {children}
      </div>
    </Card>
  )
}
