import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, Eye, EyeOff, Plus, Save, Search, Trash2 } from 'lucide-react'

import { api } from '../../lib/api'
import { useI18n } from '../../context/I18nContext.jsx'

export function ProductsManager({ salonId, reloadToken, inventoryItems } = {}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])

  const imageFileRef = useRef(null)

  const [createFromSku, setCreateFromSku] = useState('')

  const allProducts = useMemo(() => {
    return Array.isArray(products) ? products : []
  }, [products])

  useEffect(() => {
    let alive = true
    if (!salonId) return undefined

    setLoading(true)
    setError('')

    api
      .listProducts({ salonId, includeDraft: true })
      .then((res) => {
        if (!alive) return
        setProducts(Array.isArray(res?.items) ? res.items : [])
        if (!activeId && Array.isArray(res?.items) && res.items.length) setActiveId(res.items[0].id)
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || t('portal.products.loadError', 'Failed to load products'))
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [reloadToken, salonId])

  const myProducts = useMemo(() => {
    const cleanSalonId = String(salonId || '').trim()
    if (!cleanSalonId) return []
    return allProducts.filter((p) => String(p.salonId || '') === cleanSalonId)
  }, [allProducts, salonId])

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return myProducts
    return myProducts.filter((p) => {
      const hay = `${p.name} ${p.description || ''} ${p.badge || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [myProducts, query])

  const active = useMemo(() => {
    if (!filtered.length) return null
    const found = filtered.find((p) => p.id === activeId)
    return found || filtered[0]
  }, [activeId, filtered])

  const skuLocked = Boolean(String(active?.sku || '').trim())

  function makeDraftFromProduct(p) {
    return {
      id: p?.id || '',
      sku: p?.sku || '',
      name: p?.name || '',
      price: Number(p?.price) || 0,
      badge: p?.badge || '',
      image: p?.image || '',
      description: p?.description || '',
      status: String(p?.status || 'draft'),
      stockQty: p?.stockQty ?? null,
    }
  }

  const [draft, setDraft] = useState(() => makeDraftFromProduct(active))

  useEffect(() => {
    if (!active) return
    if (draft?.id === active.id) return
    setDraft(makeDraftFromProduct(active))
  }, [active, draft?.id])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  async function createNew() {
    if (!salonId) return
    setError('')
    try {
      const res = await api.createProduct({
        salonId,
        name: t('portal.products.newDefaultName', 'New product'),
        price: 0,
        badge: t('portal.products.badge.new', 'New'),
        image: '',
        description: '',
        status: 'draft',
      })
      const record = res?.item
      if (record) {
        setProducts((prev) => [record, ...(Array.isArray(prev) ? prev : [])])
        setActiveId(record.id)
        setDraft(makeDraftFromProduct(record))
        markSaved()
      }
    } catch (e) {
      setError(e?.message || t('portal.products.createError', 'Failed to create product'))
    }
  }

  async function createNewFromInventory() {
    if (!salonId) return
    const sku = String(createFromSku || '').trim()
    if (!sku) return

    const inv = (Array.isArray(inventoryItems) ? inventoryItems : []).find((x) => String(x?.sku || '').trim() === sku)
    if (!inv) {
      setError(t('portal.products.inventory.notFound', 'Inventory SKU not found'))
      return
    }

    const existing = myProducts.find((p) => String(p?.sku || '').trim().toUpperCase() === String(sku).trim().toUpperCase())
    if (existing?.id) {
      setActiveId(existing.id)
      setDraft(makeDraftFromProduct(existing))
      setError(t('portal.products.inventory.exists', 'Product already exists for this SKU'))
      return
    }

    setError('')
    try {
      const res = await api.createProduct({
        salonId,
        sku: inv.sku,
        name: inv.name || inv.sku,
        price: inv.salePrice === null || inv.salePrice === undefined ? 0 : Number(inv.salePrice),
        badge: t('portal.products.badge.inventory', 'Inventory'),
        image: '',
        description: '',
        status: 'draft',
      })
      const record = res?.item
      if (record) {
        setProducts((prev) => [record, ...(Array.isArray(prev) ? prev : [])])
        setActiveId(record.id)
        setDraft(makeDraftFromProduct(record))
        markSaved()
      }
    } catch (e) {
      setError(e?.message || t('portal.products.inventory.createError', 'Failed to create product from inventory'))
    }
  }

  async function createNewSmart() {
    if (String(createFromSku || '').trim()) {
      await createNewFromInventory()
      return
    }
    await createNew()
  }

  async function save(nextDraftOrEvent) {
    if (!salonId) return
    const nextDraft = nextDraftOrEvent && typeof nextDraftOrEvent.preventDefault === 'function' ? undefined : nextDraftOrEvent
    const current = nextDraft || draft
    if (!current?.id) return

    const lockedSku = String(active?.sku || '').trim()
    const skuToPersist = lockedSku ? lockedSku : current.sku
    setError('')
    try {
      const res = await api.updateProduct(current.id, {
        sku: skuToPersist,
        name: current.name,
        description: current.description,
        badge: current.badge,
        image: current.image,
        price: Number(current.price || 0),
        status: current.status,
      })
      const updated = res?.item
      if (updated) {
        setProducts((prev) => (Array.isArray(prev) ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev))
        setDraft(makeDraftFromProduct(updated))
      }
      markSaved()
    } catch (e) {
      setError(e?.message || t('portal.products.saveError', 'Failed to save product'))
    }
  }

  async function setStatusAndSave(nextStatus) {
    if (!draft?.id) return
    const next = { ...draft, status: nextStatus }
    setDraft(next)
    await save(next)
  }

  function chooseImageFile() {
    if (!imageFileRef.current) return
    imageFileRef.current.value = ''
    imageFileRef.current.click()
  }

  async function onImageFilePicked(e) {
    const file = e?.target?.files?.[0]
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      setError(t('portal.products.image.typeError', 'Please choose an image file'))
      return
    }
    const maxBytes = 3 * 1024 * 1024
    if (file.size > maxBytes) {
      setError(t('portal.products.image.sizeError', 'Image is too large (max 3MB)'))
      return
    }

    const reader = new FileReader()
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onerror = () => reject(new Error(t('portal.products.image.readError', 'Failed to read image')))
      reader.onload = () => resolve(String(reader.result || ''))
      reader.readAsDataURL(file)
    })

    setDraft((p) => ({ ...p, image: dataUrl }))
    setError('')
  }

  async function remove() {
    if (!draft?.id) return
    if (!confirm(t('portal.products.deleteConfirm', 'Delete this product?'))) return
    setError('')
    try {
      await api.deleteProduct(draft.id)
      setProducts((prev) => (Array.isArray(prev) ? prev.filter((p) => p.id !== draft.id) : prev))
      setActiveId('')
    } catch (e) {
      setError(e?.message || t('portal.products.deleteError', 'Failed to delete product'))
    }
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.ownerInventory.tabs.products', 'Shop products')}</h2>
      </div>

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
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
                placeholder={t('portal.products.search', 'Search products...')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <select
              className="input"
              value={createFromSku}
              onChange={(e) => setCreateFromSku(e.target.value)}
              style={{ maxWidth: 320 }}
              title={t('portal.products.inventory.title', 'Create product from an existing Inventory SKU')}
            >
              <option value="">{t('portal.products.inventory.placeholder', '(Optional) From Inventory SKU...')}</option>
              {(Array.isArray(inventoryItems) ? inventoryItems : [])
                .filter((it) => String(it?.salonId || '') === String(salonId || ''))
                .sort((a, b) => String(a.sku || '').localeCompare(String(b.sku || '')))
                .map((it) => (
                  <option key={it.sku} value={it.sku}>
                    {it.sku} — {it.name || it.sku}
                  </option>
                ))}
            </select>

            <button className="btn btn-primary" type="button" onClick={createNewSmart}>
              <Plus size={16} style={{ marginRight: 8 }} />
              {t('portal.products.new', 'New product')}
            </button>
          </div>

          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            {loading
              ? t('portal.common.loading', 'Loading...')
              : saved
                ? t('portal.common.saved', 'Saved!')
                : t('portal.products.count', 'Your products: {{count}}').replace('{{count}}', filtered.length)}
          </div>

          {!filtered.length ? (
            <div className="muted">{t('portal.products.empty', 'No products yet. Click "New product".')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((p) => {
                const activeRow = p.id === (active?.id || '')
                const isDraft = String(p.status || '') === 'draft'
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={activeRow ? 'chip chipActive' : 'chip'}
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => {
                      setActiveId(p.id)
                      setDraft(makeDraftFromProduct(p))
                    }}
                  >
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <span className="badge"><Boxes size={14} /></span>
                      <span style={{ fontWeight: 800 }}>{p.name}</span>
                    </span>
                    <span className="muted" style={{ fontSize: 12, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      {p?.stockQty === null || p?.stockQty === undefined ? null : (
                        <span style={{ fontWeight: 900 }}>
                          {t('portal.products.stock', 'Stock: {{count}}').replace('{{count}}', String(p.stockQty))}
                        </span>
                      )}
                      {isDraft ? <EyeOff size={14} /> : <Eye size={14} />}
                      {isDraft ? t('portal.products.status.draft', 'Draft') : t('portal.products.status.published', 'Published')}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>{t('portal.products.editTitle', 'Edit product')}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {draft.status === 'draft'
                ? t('portal.products.visibility.hidden', 'Not visible in Shop')
                : t('portal.products.visibility.visible', 'Visible in Shop')}
            </div>
          </div>

          {!active ? (
            <div className="muted" style={{ marginTop: 12 }}>{t('portal.products.selectPrompt', 'Select a product to edit.')}</div>
          ) : (
            <>
              <label className="muted" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>{t('portal.products.name', 'Name')}</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.products.sku', 'Inventory SKU (sync)')}</label>
              <input
                className="input"
                placeholder={t('portal.products.skuPlaceholder', 'e.g., TOP-COAT-GLOSS')}
                value={draft.sku}
                readOnly={skuLocked}
                title={
                  skuLocked
                    ? t('portal.products.skuLocked', 'Locked: Inventory SKU is the sync key and cannot be changed after it is set.')
                    : t('portal.products.skuHint', 'Optional: set once to link this product with an Inventory item')
                }
                onChange={(e) => {
                  if (skuLocked) return
                  setDraft((p) => ({ ...p, sku: e.target.value }))
                }}
              />

              <div className="grid twoCol" style={{ gap: 10, marginTop: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.products.price', 'Price')}</label>
                  <input className="input" type="number" min="0" step="1" value={draft.price} onChange={(e) => setDraft((p) => ({ ...p, price: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.products.badge', 'Badge')}</label>
                  <input
                    className="input"
                    placeholder={t('portal.products.badgePlaceholder', 'e.g., New / Best seller')}
                    value={draft.badge}
                    onChange={(e) => setDraft((p) => ({ ...p, badge: e.target.value }))}
                  />
                </div>
              </div>

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.products.image.label', 'Image URL (optional)')}</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 220 }}
                  placeholder={t('portal.products.image.placeholder', 'https://...')}
                  value={draft.image}
                  onChange={(e) => setDraft((p) => ({ ...p, image: e.target.value }))}
                />
                <input
                  ref={imageFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => void onImageFilePicked(e)}
                />
                <button className="btn" type="button" onClick={chooseImageFile}>
                  {t('portal.products.image.choose', 'Choose image')}
                </button>
              </div>

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.products.description', 'Description')}</label>
              <textarea className="input" rows={4} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} style={{ resize: 'vertical' }} />

              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={draft.status === 'published' ? 'chip chipActive' : 'chip'}
                  onClick={() => void setStatusAndSave('published')}
                >
                  <Eye size={14} style={{ marginRight: 8 }} /> {t('portal.products.publish', 'Publish')}
                </button>
                <button
                  type="button"
                  className={draft.status === 'draft' ? 'chip chipActive' : 'chip'}
                  onClick={() => void setStatusAndSave('draft')}
                >
                  <EyeOff size={14} style={{ marginRight: 8 }} /> {t('portal.products.status.draft', 'Draft')}
                </button>
              </div>

              <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                <button className="btn" type="button" onClick={remove}>
                  <Trash2 size={16} style={{ marginRight: 8 }} />
                  {t('portal.common.delete', 'Delete')}
                </button>

                <button className="btn btn-primary" type="button" onClick={() => void save()}>
                  <Save size={16} style={{ marginRight: 8 }} />
                  {t('portal.common.save', 'Save')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
