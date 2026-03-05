import { useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { formatWeekRange, startOfWeekISO } from '../../lib/dates'
import { formatCurrency } from '../../lib/money'
import { api } from '../../lib/api'

function minutesWorked(entries) {
  const list = [...entries].sort((a, b) => (a.at < b.at ? -1 : 1))
  let open = null
  let totalMin = 0

  for (const e of list) {
    if (e.type === 'in') {
      open = e
    } else if (e.type === 'out' && open) {
      const a = new Date(open.at).getTime()
      const b = new Date(e.at).getTime()
      if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) totalMin += Math.round((b - a) / 60000)
      open = null
    }
  }

  return totalMin
}

export function StaffEarningsPage() {
  const auth = useAuth()
  const staffId = auth.user?.id
  const { t } = useI18n()

  const [time, setTime] = useState([])
  const [tips, setTips] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      if (!staffId) {
        setTime([])
        setTips([])
        return
      }
      setError('')
      try {
        const [tRes, tipRes] = await Promise.all([
          api.listTimeLogs({ staffId }),
          api.listTipLogs({ staffId }),
        ])
        if (!alive) return
        setTime(Array.isArray(tRes?.items) ? tRes.items : [])
        setTips(Array.isArray(tipRes?.items) ? tipRes.items : [])
      } catch (e) {
        if (!alive) return
        setError(e?.message || t('portal.common.error', 'Error'))
        setTime([])
        setTips([])
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [staffId])

  const rows = useMemo(() => {
    if (!staffId) return []

    const rate = 22 // demo hourly rate

    const byWeek = new Map()

    for (const e of time) {
      const iso = String(e.at || '').slice(0, 10)
      if (!iso) continue
      const week = startOfWeekISO(new Date(iso + 'T00:00:00'))
      if (!byWeek.has(week)) byWeek.set(week, { week, minutes: 0, tips: 0 })
    }

    // accumulate minutes by week using pairing within each week
    const timeByWeek = new Map()
    for (const e of time) {
      const iso = String(e.at || '').slice(0, 10)
      if (!iso) continue
      const week = startOfWeekISO(new Date(iso + 'T00:00:00'))
      if (!timeByWeek.has(week)) timeByWeek.set(week, [])
      timeByWeek.get(week).push(e)
    }
    for (const [week, entries] of timeByWeek.entries()) {
      if (!byWeek.has(week)) byWeek.set(week, { week, minutes: 0, tips: 0 })
      byWeek.get(week).minutes += minutesWorked(entries)
    }

    for (const t of tips) {
      const iso = String(t.at || '').slice(0, 10)
      if (!iso) continue
      const week = startOfWeekISO(new Date(iso + 'T00:00:00'))
      if (!byWeek.has(week)) byWeek.set(week, { week, minutes: 0, tips: 0 })
      byWeek.get(week).tips += Number(t.amount) || 0
    }

    const out = Array.from(byWeek.values())
      .map((x) => {
        const hours = x.minutes / 60
        const base = Math.round(hours * rate)
        const tipsAmt = Math.round(x.tips)
        return {
          weekISO: x.week,
          week: formatWeekRange(x.week),
          base,
          tips: tipsAmt,
          total: base + tipsAmt,
        }
      })
      .sort((a, b) => (a.weekISO < b.weekISO ? 1 : -1))

    return out.slice(0, 8)
  }, [staffId, time, tips])

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.staffEarnings.title', 'Earnings')}</h2>
        <div className="muted">{t('portal.staffEarnings.subtitle', 'Salary + tips (from Time Clock + tips)')}</div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(255,59,122,0.35)', marginBottom: 12 }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="portalTable card">
        <div className="portalTableHead">
          <div>{t('portal.staffEarnings.week', 'Week')}</div>
          <div>{t('portal.staffEarnings.base', 'Base')}</div>
          <div>{t('portal.staffEarnings.tips', 'Tips')}</div>
          <div>{t('portal.ownerBookings.table.total', 'Total')}</div>
        </div>
        {rows.length ? rows.map((r) => (
          <div key={r.weekISO} className="portalTableRow">
            <div style={{ fontWeight: 950, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span className="badge"><Wallet size={14} /></span>
              {r.week}
            </div>
            <div className="muted">{formatCurrency(r.base)}</div>
            <div className="muted">{formatCurrency(r.tips)}</div>
            <div style={{ fontWeight: 950 }}>{formatCurrency(r.total)}</div>
          </div>
        )) : (
          <div className="portalTableRow">
            <div className="muted">{t('portal.staffEarnings.none', 'No earnings yet')}</div>
            <div></div>
            <div></div>
            <div></div>
          </div>
        )}
      </div>
    </>
  )
}
