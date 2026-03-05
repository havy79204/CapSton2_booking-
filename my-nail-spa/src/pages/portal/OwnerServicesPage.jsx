import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Plus, Save, Scissors, Search, Sparkles, Trash2 } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'
import { formatUsd } from '../../lib/money'

function makeEmptyRecipeLine() {
  return { sku: '', qty: 1, uom: 'pcs' }
}

function makeDraftFromService(s) {
  return {
    id: s?.id || '',
    name: s?.name || '',
    durationMin: Number(s?.durationMin) || 30,
    price: Number(s?.price) || 0,
    status: String(s?.status || 'draft'),
  }
}

export function OwnerServicesPage({ embedded = false }) {
  const auth = useAuth()
  const { t } = useI18n()
  const salonId = auth.user?.salonId

  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [saved, setSaved] = useState(false)

  const [error, setError] = useState('')
  const [services, setServices] = useState([])

  const [recipeLines, setRecipeLines] = useState([])
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeError, setRecipeError] = useState('')
  const [recipeSaved, setRecipeSaved] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!salonId) {
        setServices([])
        return
      }
      setError('')
      try {
        const res = await api.listSalonServices(salonId, { includeDraft: true })
        if (!alive) return
        setServices(Array.isArray(res?.items) ? res.items : [])
      } catch (e) {
        if (!alive) return
        setError(e?.message || t('portal.ownerServices.errorLoad', 'Failed to load services'))
        setServices([])
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [refresh, salonId])

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return services
    return services.filter((s) => `${s.name} ${s.durationMin} ${s.price}`.toLowerCase().includes(q))
  }, [query, services])

  const active = useMemo(() => {
    if (!filtered.length) return null
    const found = filtered.find((s) => s.id === activeId)
    return found || filtered[0]
  }, [activeId, filtered])

  const [draft, setDraft] = useState(() => makeDraftFromService(active))

  useEffect(() => {
    let alive = true
    async function loadRecipe() {
      const serviceTypeId = String(draft?.id || '').trim()
      if (!salonId || !serviceTypeId) {
        setRecipeLines([])
        return
      }

      setRecipeError('')
      setRecipeLoading(true)
      try {
        const res = await api.getSalonServiceRecipe(salonId, serviceTypeId)
        if (!alive) return
        const items = Array.isArray(res?.items) ? res.items : []
        setRecipeLines(
          items.map((l) => ({
            sku: String(l.sku || ''),
            qty: Number(l.qty) || 0,
            uom: String(l.uom || 'pcs'),
          })),
        )
      } catch (e) {
        if (!alive) return
        setRecipeError(e?.message || t('portal.ownerServices.recipe.error', 'Failed to load recipe'))
        setRecipeLines([])
      } finally {
        if (!alive) return
        setRecipeLoading(false)
      }
    }

    loadRecipe()
    return () => {
      alive = false
    }
  }, [draft?.id, salonId])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  function markRecipeSaved() {
    setRecipeSaved(true)
    window.setTimeout(() => setRecipeSaved(false), 1200)
  }

  function selectService(s) {
    setActiveId(s.id)
    setDraft(makeDraftFromService(s))
  }

  function addRecipeLine() {
    setRecipeLines((prev) => [...prev, makeEmptyRecipeLine()])
  }

  function updateRecipeLine(idx, patch) {
    setRecipeLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function removeRecipeLine(idx) {
    setRecipeLines((prev) => prev.filter((_, i) => i !== idx))
  }

  function saveRecipe() {
    ;(async () => {
      const serviceTypeId = String(draft?.id || '').trim()
      if (!salonId || !serviceTypeId) return

      setRecipeError('')
      try {
        await api.updateSalonServiceRecipe(salonId, serviceTypeId, {
          lines: recipeLines.map((l) => ({
            sku: String(l.sku || '').trim(),
            qty: Number(l.qty) || 0,
            uom: String(l.uom || '').trim() || 'pcs',
          })),
        })

        // Reload normalized/cleaned server result.
        const res = await api.getSalonServiceRecipe(salonId, serviceTypeId)
        const items = Array.isArray(res?.items) ? res.items : []
        setRecipeLines(items.map((l) => ({ sku: String(l.sku || ''), qty: Number(l.qty) || 0, uom: String(l.uom || 'pcs') })))
        markRecipeSaved()
      } catch (e) {
        setRecipeError(e?.message || t('portal.ownerServices.recipe.error', 'Failed to save recipe'))
      }
    })()
  }

  function createNew() {
    ;(async () => {
      if (!salonId) return
      setError('')
      try {
        const res = await api.upsertSalonService(salonId, {
          name: t('portal.ownerServices.newDefaultName', 'New service'),
          durationMin: 45,
          price: 0,
          status: 'draft',
        })
        const record = res?.item
        setActiveId(record?.id || '')
        setDraft(makeDraftFromService(record))
        setRefresh((x) => x + 1)
        markSaved()
      } catch (e) {
        setError(e?.message || t('portal.ownerServices.errorCreate', 'Failed to create service'))
      }
    })()
  }

  function save() {
    ;(async () => {
      if (!salonId) return
      if (!draft?.id) return
      setError('')
      try {
        const res = await api.upsertSalonService(salonId, {
          id: String(draft.id).trim(),
          name: String(draft.name || '').trim() || t('portal.ownerServices.fallbackName', 'Service'),
          durationMin: Number(draft.durationMin) || 30,
          price: Number(draft.price) || 0,
          status: String(draft.status || 'draft'),
        })
        const record = res?.item
        if (record?.id) setActiveId(record.id)
        if (record) setDraft(makeDraftFromService(record))
        setRefresh((x) => x + 1)
        markSaved()
      } catch (e) {
        setError(e?.message || t('portal.ownerServices.errorSave', 'Failed to save service'))
      }
    })()
  }

  function remove() {
    ;(async () => {
      if (!salonId || !draft?.id) return
      if (!confirm(t('portal.ownerServices.deleteConfirm', 'Delete this service?'))) return
      setError('')
      try {
        await api.deleteSalonService(salonId, draft.id)
        setRefresh((x) => x + 1)
        setActiveId('')
      } catch (e) {
        setError(e?.message || t('portal.ownerServices.errorDelete', 'Failed to delete service'))
      }
    })()
  }

  if (!salonId) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900 }}>{t('portal.common.noSalon', 'No salon assigned')}</div>
        <div className="muted" style={{ marginTop: 8 }}>{t('portal.common.noSalonHint', "This owner account doesn't have a salonId.")}</div>
      </div>
    )
  }

  return (
    <>
      {!embedded ? (
        <div className="sectionHeader" style={{ marginBottom: 14 }}>
          <h2>{t('portal.ownerServices.title', 'Services')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Sparkles size={16} />
            {t('portal.ownerServices.subtitle', 'Add / edit / delete salon services (SQL Server)')}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(255,59,122,0.35)', marginBottom: 12 }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="grid twoCol" style={{ gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="salonsSearch" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                className="input"
                placeholder={t('portal.ownerServices.search', 'Search services...')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={createNew}>
              <Plus size={16} style={{ marginRight: 8 }} />
              {t('portal.ownerServices.new', 'New service')}
            </button>
          </div>

          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            {saved
              ? t('portal.ownerServices.saved', 'Saved!')
              : t('portal.ownerServices.count', 'Your services: {{count}}').replace('{{count}}', filtered.length)}
          </div>

          {!filtered.length ? (
            <div className="muted">{t('portal.ownerServices.none', 'No services yet. Click “New service”.')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((s) => {
                const isActive = s.id === (active?.id || '')
                const isDraft = String(s.status || '') === 'draft'
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={isActive ? 'chip chipActive' : 'chip'}
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => selectService(s)}
                  >
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <span className="badge"><Scissors size={14} /></span>
                      <span style={{ fontWeight: 800 }}>{s.name}</span>
                    </span>
                    <span className="muted" style={{ fontSize: 12, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                      <span>{formatUsd(s.price)} · {s.durationMin}m</span>
                      {isDraft ? <EyeOff size={14} /> : <Eye size={14} />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>{t('portal.ownerServices.editTitle', 'Edit service')}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {draft.status === 'draft'
                ? t('portal.ownerServices.hidden', 'Hidden in Booking')
                : t('portal.ownerServices.visible', 'Visible in Booking')}
            </div>
          </div>

          {!active ? (
            <div className="muted" style={{ marginTop: 12 }}>{t('portal.ownerServices.selectPrompt', 'Select a service to edit.')}</div>
          ) : (
            <>
              <label className="muted" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>{t('portal.ownerServices.name', 'Name')}</label>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              />

              <div className="grid twoCol" style={{ gap: 10, marginTop: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.ownerServices.duration', 'Duration (minutes)')}</label>
                  <input
                    className="input"
                    type="number"
                    min="10"
                    step="5"
                    value={draft.durationMin}
                    onChange={(e) => setDraft((p) => ({ ...p, durationMin: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.ownerServices.price', 'Price')}</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={draft.price}
                    onChange={(e) => setDraft((p) => ({ ...p, price: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={draft.status === 'published' ? 'chip chipActive' : 'chip'}
                  onClick={() => setDraft((p) => ({ ...p, status: 'published' }))}
                >
                  <Eye size={14} style={{ marginRight: 8 }} /> {t('portal.ownerServices.publish', 'Publish')}
                </button>
                <button
                  type="button"
                  className={draft.status === 'draft' ? 'chip chipActive' : 'chip'}
                  onClick={() => setDraft((p) => ({ ...p, status: 'draft' }))}
                >
                  <EyeOff size={14} style={{ marginRight: 8 }} /> {t('portal.ownerServices.draft', 'Draft')}
                </button>
              </div>

              <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                <button className="btn" type="button" onClick={remove}>
                  <Trash2 size={16} style={{ marginRight: 8 }} />
                  {t('portal.ownerServices.delete', 'Delete')}
                </button>

                <button className="btn btn-primary" type="button" onClick={save}>
                  <Save size={16} style={{ marginRight: 8 }} />
                  {t('portal.ownerServices.save', 'Save')}
                </button>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 900 }}>{t('portal.ownerServices.recipe.title', 'Inventory recipe (BOM)')}</div>
                  <button className="btn" type="button" onClick={addRecipeLine}>
                    <Plus size={16} style={{ marginRight: 8 }} />
                    {t('portal.ownerServices.recipe.add', 'Add line')}
                  </button>
                </div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  {t('portal.ownerServices.recipe.hint', 'One service can consume many SKUs (gel + remover + tips...). Applied when booking status becomes “Completed”.')}
                </div>

                {recipeError ? (
                  <div className="card" style={{ padding: 10, boxShadow: 'none', border: '1px solid rgba(255,59,122,0.35)', marginTop: 10 }}>
                    <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.ownerServices.recipe.error', 'Recipe error')}</div>
                    <div className="muted" style={{ marginTop: 6 }}>{recipeError}</div>
                  </div>
                ) : null}

                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  {recipeSaved
                    ? t('portal.ownerServices.recipe.saved', 'Recipe saved!')
                    : recipeLoading
                      ? t('portal.ownerServices.recipe.loading', 'Loading recipe…')
                      : t('portal.ownerServices.recipe.lines', 'Lines: {{count}}').replace('{{count}}', recipeLines.length)}
                </div>

                {!recipeLines.length ? (
                  <div className="muted" style={{ marginTop: 10 }}>{t('portal.ownerServices.recipe.none', 'No recipe lines. Click “Add line”.')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {recipeLines.map((l, idx) => (
                      <div key={`${idx}-${l.sku}`} className="card" style={{ padding: 10, boxShadow: 'none', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="grid" style={{ gridTemplateColumns: '1.4fr 0.8fr 0.8fr auto', gap: 10, alignItems: 'end' }}>
                          <div>
                            <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.ownerServices.recipe.sku', 'SKU')}</label>
                            <input
                              className="input"
                              placeholder={t('portal.ownerServices.recipe.skuPlaceholder', 'GEL-BASE-15ML')}
                              value={l.sku}
                              onChange={(e) => updateRecipeLine(idx, { sku: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.ownerServices.recipe.qty', 'Qty')}</label>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="0.001"
                              value={Number.isFinite(l.qty) ? l.qty : 0}
                              onChange={(e) => updateRecipeLine(idx, { qty: Number(e.target.value) })}
                            />
                          </div>
                          <div>
                            <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.ownerServices.recipe.uom', 'UoM')}</label>
                            <input
                              className="input"
                              placeholder={t('portal.ownerServices.recipe.uomPlaceholder', 'pcs / ml / g')}
                              value={l.uom}
                              onChange={(e) => updateRecipeLine(idx, { uom: e.target.value })}
                            />
                          </div>
                          <div>
                            <button className="btn" type="button" onClick={() => removeRecipeLine(idx)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" type="button" onClick={saveRecipe}>
                    <Save size={16} style={{ marginRight: 8 }} />
                    {t('portal.ownerServices.recipe.save', 'Save recipe')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
