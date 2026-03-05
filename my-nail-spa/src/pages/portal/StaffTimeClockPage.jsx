import { useEffect, useMemo, useState } from 'react'
import { DollarSign, Timer } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function todayKey() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

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

export function StaffTimeClockPage() {
  const auth = useAuth()
  const staffId = auth.user?.id
  const { t } = useI18n()

  const [refresh, setRefresh] = useState(0)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      if (!staffId) {
        setEntries([])
        return
      }
      setLoading(true)
      setError('')
      try {
        const res = await api.listTimeLogs({ staffId })
        if (!alive) return
        setEntries(Array.isArray(res?.items) ? res.items : [])
      } catch (e) {
        if (!alive) return
        setError(e?.message || 'Failed to load time logs')
        setEntries([])
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [refresh, staffId])

  const status = useMemo(() => {
    const last = entries[0]
    if (!last) return 'Out'
    return last.type === 'in' ? 'In' : 'Out'
  }, [entries])

  const todayEntries = useMemo(() => {
    const t = todayKey()
    return entries.filter((e) => String(e.at || '').slice(0, 10) === t)
  }, [entries])

  const todayHours = useMemo(() => minutesWorked(todayEntries) / 60, [todayEntries])

  const [tipAmount, setTipAmount] = useState('')

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.staffTime.title', 'Time Clock')}</h2>
        <div className="muted">{t('portal.staffTime.subtitle', 'Clock in/out and track working hours (demo)')}</div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div className="badge"><Timer size={14} /></div>
          <div style={{ fontWeight: 950 }}>{t('portal.staffTime.current', 'Current status')}: {status === 'In' ? t('portal.staffTime.in', 'In') : t('portal.staffTime.out', 'Out')}</div>
        </div>

        {error ? (
          <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(255,59,122,0.35)', marginBottom: 12 }}>
            <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
            <div className="muted" style={{ marginTop: 6 }}>{error}</div>
          </div>
        ) : null}

        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          {t('portal.staffTime.timeHint', 'Time clock writes punch logs to SQL Server and feeds Earnings.')} {' '}
          {t('portal.staffTime.today', 'Today')}: <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{todayHours.toFixed(2)}h</strong>
        </div>

        <div className="row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!staffId || status === 'In' || loading}
            onClick={async () => {
              if (!staffId) return
              await api.createTimeLog({ type: 'in', at: new Date().toISOString() })
              setRefresh((x) => x + 1)
            }}
          >
            {t('portal.staffTime.clockIn', 'Clock In')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!staffId || status === 'Out' || loading}
            onClick={async () => {
              if (!staffId) return
              await api.createTimeLog({ type: 'out', at: new Date().toISOString() })
              setRefresh((x) => x + 1)
            }}
          >
            {t('portal.staffTime.clockOut', 'Clock Out')}
          </button>
        </div>

        <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 14 }}>
          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 900, marginBottom: 8 }}>
            <DollarSign size={16} /> {t('portal.staffTime.tips', 'Tips (optional)')}
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ maxWidth: 200 }}
              placeholder={t('portal.staffTime.tipPlaceholder', '$ tip amount')}
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
            />
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const n = Number(tipAmount)
                if (!staffId || !Number.isFinite(n) || n <= 0) return
                await api.createTipLog({ amount: n, at: new Date().toISOString() })
                setTipAmount('')
                setRefresh((x) => x + 1)
              }}
            >
              {t('portal.staffTime.addTip', 'Add tip')}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {t('portal.staffTime.tipHint', 'Tips you add here appear in Earnings.')}
          </div>
        </div>

        <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('portal.staffTime.recent', 'Recent punches')}</div>
          {!entries.length ? (
            <div className="muted">{t('portal.staffTime.none', 'No punches yet.')}</div>
          ) : (
            <div className="portalTable">
              <div className="portalTableHead">
                <div>{t('portal.staffTime.type', 'Type')}</div>
                <div>{t('portal.staffTime.time', 'Time')}</div>
                <div>{t('portal.staffTime.note', 'Note')}</div>
                <div></div>
              </div>
              {entries.slice(0, 8).map((e) => (
                <div key={e.id} className="portalTableRow">
                  <div style={{ fontWeight: 900 }}>{e.type === 'in' ? t('portal.staffTime.in', 'In') : t('portal.staffTime.out', 'Out')}</div>
                  <div className="muted">{formatDateTime(e.at)}</div>
                  <div className="muted">{e.note || t('portal.common.none', '—')}</div>
                  <div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
