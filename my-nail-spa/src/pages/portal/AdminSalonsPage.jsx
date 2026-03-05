import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Save, Search, Store, Trash2 } from 'lucide-react'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'

function normalizeDraft(s) {
  return {
    id: s?.id || '',
    name: s?.name || '',
    tagline: s?.tagline || '',
    address: s?.address || '',
    logo: s?.logo || '',
    status: s?.status || 'active',
    createdAt: s?.createdAt || '',
  }
}

export function AdminSalonsPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [activeId, setActiveId] = useState('')
  const [allSalons, setAllSalons] = useState([])

  useEffect(() => {
    let alive = true
    async function load() {
      setError('')
      try {
        const res = await api.listSalons()
        if (!alive) return
        const next = Array.isArray(res?.items) ? res.items : []
        setAllSalons(next)
        setActiveId((prev) => prev || next[0]?.id || '')
      } catch (e) {
        if (!alive) return
        setError(e?.message || t('portal.common.error', 'Error'))
        setAllSalons([])
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [refresh])

  const items = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return allSalons
    return allSalons.filter((s) => `${s.name} ${s.tagline} ${s.address}`.toLowerCase().includes(q))
  }, [allSalons, query])

  const active = useMemo(() => {
    if (!activeId) return null
    const found = items.find((s) => s.id === activeId)
    return found || null
  }, [activeId, items])

  const [draft, setDraft] = useState(() => normalizeDraft(null))

  useEffect(() => {
    if (!active) return
    setDraft(normalizeDraft(active))
  }, [active?.id])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  function createNew() {
    ;(async () => {
      setError('')
      try {
        const res = await api.createSalon({
          name: 'New salon',
          tagline: 'Premium nails & spa',
          address: '—',
          status: 'active',
        })
        const record = res?.item
        setActiveId(record?.id || '')
        setDraft(normalizeDraft(record))
        setRefresh((x) => x + 1)
        markSaved()
      } catch (e) {
        setError(e?.message || t('portal.common.error', 'Error'))
      }
    })()
  }

  function save() {
    ;(async () => {
      setError('')
      try {
        const id = String(draft.id || '').trim()
        if (!id) throw new Error(t('portal.adminSalons.id', 'ID'))
        const payload = {
          name: String(draft.name || '').trim() || 'Salon',
          tagline: String(draft.tagline || '').trim(),
          address: String(draft.address || '').trim(),
          logo: String(draft.logo || '').trim(),
          status: String(draft.status || 'active').trim(),
        }
        const res = await api.updateSalon(id, payload)
        const record = res?.item
        setActiveId(record?.id || id)
        setDraft(normalizeDraft(record || draft))
        setRefresh((x) => x + 1)
        markSaved()
      } catch (e) {
        setError(e?.message || t('portal.common.error', 'Error'))
      }
    })()
  }

  function remove() {
    if (!active?.id) return
    if (!confirm(t('portal.adminSalons.deleteConfirm', 'Delete this salon?'))) return
    ;(async () => {
      setError('')
      try {
        await api.deleteSalon(active.id)
        setRefresh((x) => x + 1)
        setActiveId('')
        setDraft(normalizeDraft(null))
      } catch (e) {
        setError(e?.message || t('portal.common.error', 'Error'))
      }
    })()
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.adminSalons.title', 'Salons')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <MapPin size={16} />
          {t('portal.adminSalons.subtitle', 'Create, edit, delete salons and view history (demo)')}
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="salonsSearch" style={{ flex: 1 }}>
            <Search size={16} />
            <input
              className="input"
              placeholder={t('portal.adminSalons.search', 'Search salons...')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveId('')
              }}
            />
          </div>
          <button className="btn btn-primary" type="button" onClick={createNew}>
            <Store size={16} style={{ marginRight: 8 }} />
            {t('portal.adminSalons.new', 'New salon')}
          </button>
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          {saved ? t('portal.common.saved', 'Saved!') : t('portal.adminSalons.count', 'Salons: {{count}}').replace('{{count}}', items.length)}
        </div>
      </div>

      <div className="grid twoCol" style={{ gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 900, marginBottom: 10 }}>
            <Store size={16} /> {t('portal.adminSalons.list', 'Salon list')}
          </div>

          {!items.length ? (
            <div className="muted">{t('portal.adminSalons.none', 'No salons found.')}</div>
          ) : (
            <div className="portalList">
              {items.map((s) => {
                const activeRow = s.id === (active?.id || '')
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={activeRow ? 'portalListItem active' : 'portalListItem'}
                    onClick={() => {
                      setError('')
                      setActiveId(s.id)
                      setDraft(normalizeDraft(s))
                    }}
                  >
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontWeight: 600, color: activeRow ? '#fff' : 'rgba(255,255,255,0.9)' }}>{s.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.address || t('portal.common.none', '—')}</div>
                    </div>
                    <span className="badge" style={{ 
                      fontSize: 11, 
                      padding: '4px 8px', 
                      background: activeRow ? 'rgba(255,59,122,0.2)' : 'rgba(255,255,255,0.08)',
                      borderColor: activeRow ? 'rgba(255,59,122,0.4)' : 'rgba(255,255,255,0.14)',
                      color: activeRow ? '#ff9dbf' : 'rgba(255,255,255,0.7)'
                    }}>{s.status || '-'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>{t('portal.adminSalons.edit', 'Edit salon')}</div>
            <div className="muted" style={{ fontSize: 13 }}>{draft?.id ? `${t('portal.adminSalons.id', 'ID')}: ${draft.id}` : t('portal.common.none', '—')}</div>
          </div>

          {!active ? (
            <div className="muted" style={{ marginTop: 12 }}>{t('portal.adminSalons.selectPrompt', 'Select a salon to edit.')}</div>
          ) : (
            <>
              {error ? (
                <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
                  <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
                  <div className="muted" style={{ marginTop: 6 }}>{error}</div>
                </div>
              ) : null}

              <label className="muted" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>{t('portal.ownerServices.name', 'Name')}</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.adminSalons.tagline', 'Tagline')}</label>
              <input className="input" value={draft.tagline} onChange={(e) => setDraft((p) => ({ ...p, tagline: e.target.value }))} />

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.adminSalonDetail.address', 'Address')}</label>
              <input className="input" value={draft.address} onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))} />

              <div className="grid twoCol" style={{ gap: 10, marginTop: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.adminSalonDetail.status', 'Status')}</label>
                  <select className="input" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
                    <option value="active">{t('portal.ownerStaff.status.active', 'Active')}</option>
                    <option value="inactive">{t('portal.ownerStaff.status.disabled', 'Disabled')}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" type="button" onClick={save}>
                  <Save size={16} style={{ marginRight: 8 }} />
                  {t('portal.adminSalonDetail.save', 'Save')}
                </button>
                <button className="btn" type="button" onClick={() => navigate(`/portal/admin/salons/${active.id}`)}>
                  <MapPin size={16} style={{ marginRight: 8 }} />
                  {t('portal.adminSalons.openDetails', 'Open details')}
                </button>
                <button className="btn" type="button" onClick={remove}>
                  <Trash2 size={16} style={{ marginRight: 8 }} />
                  {t('portal.adminSalonDetail.delete', 'Delete')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
