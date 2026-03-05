
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'
import { Save, Trash2, Percent, DollarSign, Gift } from 'lucide-react'
// import './AdminPromotionsPage.css'
export function AdminPromotionsPage() {
  const { t } = useI18n()
  const [promotions, setPromotions] = useState([])
  const [salons, setSalons] = useState([])
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [activeId, setActiveId] = useState('')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      setError('')
      try {
        const promos = await api.listPromotions()
        const salonsRes = await api.listSalons()
        if (!alive) return
        setPromotions(Array.isArray(promos?.items) ? promos.items : [])
        setSalons(Array.isArray(salonsRes?.items) ? salonsRes.items : [])
        setActiveId((prev) => prev || (promos?.items?.[0]?.id || promos?.items?.[0]?.PromotionId || ''))
      } catch (e) {
        if (!alive) return
        setError(e?.message || t('portal.common.error', 'Error'))
        setPromotions([])
        setSalons([])
      }
    }
    load()
    return () => { alive = false }
  }, [refresh, t])


  function normalizeDraft(p) {
    return {
      id: p?.id || p?.PromotionId || '',
      title: p?.title || p?.Title || '',
      description: p?.description || p?.Description || '',
      discountType: p?.discountType || p?.DiscountType || 'percent',
      discountValue: p?.discountValue || p?.DiscountValue || 0,
      startDate: p?.startDate || p?.StartDate || '',
      endDate: p?.endDate || p?.EndDate || '',
      salonIds: p?.salonIds || [],
      active: p?.active ?? p?.Active ?? true,
    }
  }

  const items = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return promotions
    return promotions.filter((p) => `${p.title || p.Title} ${p.description || p.Description}`.toLowerCase().includes(q))
  }, [promotions, query])

  const active = useMemo(() => {
    if (!activeId) return null
    const found = items.find((p) => (p.id || p.PromotionId) === activeId)
    return found || null
  }, [activeId, items])

  useEffect(() => {
    if (active && (!form || form.id !== (active.id || active.PromotionId))) {
      setForm(normalizeDraft(active))
    }
    // If no active, clear form
    if (!active && form) {
      setForm(null)
    }
  }, [active, form])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }


  async function createNew() {
    setError('')
    try {
      // Immediately create a new draft promotion in backend
      const res = await api.createPromotion({
        title: 'New promotion',
        description: '',
        discountType: 'percent',
        discountValue: 1,
        startDate: '',
        endDate: '',
        salonIds: salons.length ? [salons[0].id] : [],
        active: true,
      })
      const record = res?.item
      setActiveId(record?.id || record?.PromotionId || '')
      setForm(normalizeDraft(record))
      setRefresh((x) => x + 1)
      markSaved()
    } catch (e) {
      setError(e?.message || t('portal.common.error', 'Error'))
    }
  }

  function startEdit(p) {
    setError('')
    setForm(normalizeDraft(p))
    setActiveId(p.id || p.PromotionId)
  }

  function cancel() {
    setForm(null)
    setError('')
    setActiveId('')
  }

  async function save() {
    setError('')
    try {
      let savedPromotion = null;
      if (form.id) {
        const res = await api.updatePromotion(form.id, form)
        savedPromotion = res?.item || { ...form }
      } else {
        const res = await api.createPromotion(form)
        savedPromotion = res?.item || { ...form }
      }
      setForm(normalizeDraft(savedPromotion))
      setActiveId(savedPromotion.id || savedPromotion.PromotionId)
      setRefresh((x) => x + 1)
      markSaved()
    } catch (e) {
      setError(e?.message || t('portal.common.error', 'Error'))
    }
  }

  async function remove(id) {
    if (!window.confirm(t('portal.adminPromotions.deleteConfirm', 'Delete this promotion?'))) return
    setError('')
    try {
      await api.deletePromotion(id)
      setRefresh((x) => x + 1)
      setActiveId('')
      setForm(null)
    } catch (e) {
      setError(e?.message || t('portal.common.error', 'Error'))
    }
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.adminPromotions.title', 'Promotions')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Gift size={16} />
          {t('portal.adminPromotions.subtitle', 'Create, edit, delete promotions and assign to salons.')}
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="promotionsSearch" style={{ flex: 1 }}>
            <input
              className="input"
              placeholder={t('portal.adminPromotions.search', 'Search promotions...')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveId('')
              }}
            />
          </div>
          <button className="btn btn-primary" type="button" onClick={createNew}>
            <Gift size={16} style={{ marginRight: 8 }} />
            {t('portal.adminPromotions.new', 'New promotion')}
          </button>
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          {saved ? t('portal.common.saved', 'Saved!') : t('portal.adminPromotions.count', 'Promotions: {{count}}').replace('{{count}}', items.length)}
        </div>
      </div>

      <div className="grid twoCol" style={{ gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 900, marginBottom: 10 }}>
            <Gift size={16} /> {t('portal.adminPromotions.list', 'Promotion list')}
          </div>

          {!items.length ? (
            <div className="muted">{t('portal.adminPromotions.none', 'No promotions found.')}</div>
          ) : (
            <div className="portalList">
              {items.map((p) => {
                const activeRow = (p.id || p.PromotionId) === (active?.id || '')
                return (
                  <button
                    key={p.id || p.PromotionId}
                    type="button"
                    className={activeRow ? 'portalListItem active' : 'portalListItem'}
                    onClick={() => startEdit(p)}
                  >
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontWeight: 600, color: activeRow ? '#fff' : 'rgba(255,255,255,0.9)' }}>{p.title || p.Title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{(p.salonIds || []).map((id) => salons.find((s) => s.id === id)?.name || id).join(', ')}</div>
                    </div>
                    <span className="badge" style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      background: activeRow ? 'rgba(255,59,122,0.2)' : 'rgba(255,255,255,0.08)',
                      borderColor: activeRow ? 'rgba(255,59,122,0.4)' : 'rgba(255,255,255,0.14)',
                      color: activeRow ? '#ff9dbf' : 'rgba(255,255,255,0.7)'
                    }}>{(p.active ?? p.Active) ? 'Active' : 'Inactive'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>{form?.id ? t('portal.adminPromotions.edit', 'Edit promotion') : t('portal.adminPromotions.create', 'Create promotion')}</div>
            <div className="muted" style={{ fontSize: 13 }}>{form?.id ? `ID: ${form.id}` : t('portal.common.none', '—')}</div>
          </div>

          {!form ? (
            <div className="muted" style={{ marginTop: 12 }}>{t('portal.adminPromotions.selectPrompt', 'Select a promotion to edit or create a new one.')}</div>
          ) : (
            <>
              {error ? (
                <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
                  <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
                  <div className="muted" style={{ marginTop: 6 }}>{error}</div>
                </div>
              ) : null}

              <label className="muted" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>{t('portal.adminPromotions.titleLabel', 'Title')}</label>
              <input className="input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.adminPromotions.descriptionLabel', 'Description')}</label>
              <textarea className="input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />

              <div className="grid twoCol" style={{ gap: 10, marginTop: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.adminPromotions.discountType', 'Discount type')}</label>
                  <select className="input" value={form.discountType} onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))}>
                    <option value="percent">% {t('portal.adminPromotions.percent', 'Percent')}</option>
                    <option value="amount">$ {t('portal.adminPromotions.amount', 'Amount')}</option>
                  </select>
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.adminPromotions.discountValue', 'Discount value')}</label>
                  <input className="input" type="number" min={0} value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="grid twoCol" style={{ gap: 10, marginTop: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.adminPromotions.startDate', 'Start date')}</label>
                  <input className="input" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.adminPromotions.endDate', 'End date')}</label>
                  <input className="input" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.adminPromotions.salons', 'Salons')}</label>
              <select className="input" multiple value={form.salonIds} onChange={(e) => {
                const options = Array.from(e.target.selectedOptions).map((o) => o.value)
                setForm((p) => ({ ...p, salonIds: options }))
              }}>
                {salons.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <div className="form-row form-row-inline" style={{ marginTop: 10 }}>
                <label className="muted" style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
                  {t('portal.adminPromotions.active', 'Active')}
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" type="button" onClick={save}>
                  <Save size={16} style={{ marginRight: 8 }} />
                  {t('portal.adminPromotions.save', 'Save')}
                </button>
                {form.id && (
                  <button className="btn" type="button" onClick={() => remove(form.id)}>
                    <Trash2 size={16} style={{ marginRight: 8 }} />
                    {t('portal.adminPromotions.delete', 'Delete')}
                  </button>
                )}
                <button className="btn" type="button" onClick={cancel}>
                  {t('portal.adminPromotions.cancel', 'Cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
