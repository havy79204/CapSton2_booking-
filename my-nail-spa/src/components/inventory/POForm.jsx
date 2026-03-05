import { useMemo, useState } from 'react'
import { Plus, Receipt, Store, Trash2 } from 'lucide-react'

import { useI18n } from '../../context/I18nContext.jsx'

function normSku(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, '-')
    .toUpperCase()
}

function money(n) {
  const x = Number(n || 0)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

export function POForm({
  salonId,
  onCreatePO,
  performedBy,
  skuCatalog,
} = {}) {
  const { t } = useI18n()
  const [vendor, setVendor] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([{ sku: '', qty: 1, unitCost: 0, uom: 'each' }])
  const [createdId, setCreatedId] = useState('')
  const [openSkuIdx, setOpenSkuIdx] = useState(-1)

  const catalog = useMemo(() => {
    const list = Array.isArray(skuCatalog) ? skuCatalog : []
    return list
      .map((x) => ({
        sku: normSku(x?.sku),
        name: String(x?.name || '').trim(),
        uom: String(x?.uom || '').trim(),
        cost: Number(x?.cost ?? NaN),
        type: String(x?.type || '').trim(),
      }))
      .filter((x) => x.sku)
  }, [skuCatalog])

  const skuNameMap = useMemo(() => {
    const map = new Map()
    for (const it of catalog) {
      if (it?.sku && it?.name) map.set(it.sku, it.name)
    }
    return map
  }, [catalog])

  function suggestionsFor(inputSku) {
    const q = String(inputSku || '').trim().toLowerCase()
    if (!q) return catalog.slice(0, 8)
    return catalog
      .filter((x) => {
        const hay = `${x.sku} ${x.name} ${x.type} ${x.uom}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 8)
  }

  const preview = useMemo(() => {
    const cleanVendor = String(vendor || '').trim()
    const cleanLines = (Array.isArray(lines) ? lines : [])
      .map((l) => ({
        sku: normSku(l.sku),
        qty: Number(l.qty || 0),
        unitCost: money(l.unitCost),
        uom: String(l.uom || '').trim() || 'each',
      }))
      .filter((l) => l.sku)

    const total = cleanLines.reduce((s, l) => s + (Number(l.qty || 0) * Number(l.unitCost || 0)), 0)
    return { cleanVendor, lines: cleanLines, total: money(total) }
  }, [lines, vendor])

  function updateLine(i, patch) {
    setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  function addLine() {
    setLines((prev) => [...prev, { sku: '', qty: 1, unitCost: 0, uom: 'each' }])
  }

  function removeLine(i) {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function createPO() {
    if (!preview.cleanVendor) {
      alert(t('portal.inventory.po.missingVendor', 'Please enter vendor name'))
      return
    }
    const valid = preview.lines.filter((l) => l.sku && Number(l.qty) > 0)
    if (!valid.length) {
      alert(t('portal.inventory.po.missingLines', 'Please add at least 1 valid SKU line with qty > 0'))
      return
    }

    const po = await onCreatePO?.({
      salonId: salonId || 'global',
      vendor: preview.cleanVendor,
      note,
      lines: valid,
      performedBy,
    })

    if (po?.id) {
      setCreatedId(po.id)
      window.setTimeout(() => setCreatedId(''), 2400)
    }
  }

  return (
    <>
      {createdId ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, background: 'rgba(255,59,122,0.08)', borderColor: 'rgba(255,59,122,0.25)' }}>
          <div style={{ fontWeight: 950 }}>{t('portal.inventory.po.created', 'PO created')}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t('portal.inventory.po.createdId', 'ID: {{id}}').replace('{{id}}', createdId)}</div>
        </div>
      ) : null}

      <div className="portalGrid">
        <div className="card" style={{ padding: 14, background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)' }}>
          <div style={{ fontWeight: 900, marginBottom: 10, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Store size={16} /> {t('portal.inventory.po.vendor', 'Vendor')}
          </div>
          <input className="input" placeholder={t('portal.inventory.po.vendorPlaceholder', 'Vendor name')} value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>{t('portal.inventory.po.vendorHint', 'Add vendor info + invoice reference.')}</div>
        </div>

        <div className="card" style={{ padding: 14, background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)' }}>
          <div style={{ fontWeight: 900, marginBottom: 10, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Receipt size={16} /> {t('portal.inventory.po.notes', 'Notes')}
          </div>
          <textarea className="input" style={{ minHeight: 92, resize: 'vertical' }} placeholder={t('portal.inventory.po.notesPlaceholder', 'Notes (optional)')} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>{t('portal.inventory.po.notesHint', 'ERP will add received quantities to inventory.')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginTop: 14, background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('portal.inventory.po.preview', 'Preview')}</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          {t('portal.inventory.po.previewHint', 'Don’t remember SKU? Type the item name (or SKU) and pick from suggestions.')}
        </div>

        <div className="portalTable" style={{ overflow: 'visible' }}>
          <div className="portalTableHead" style={{ gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.5fr' }}>
            <div>{t('portal.inventory.po.sku', 'SKU')}</div>
            <div>{t('portal.inventory.po.qty', 'Qty')}</div>
            <div>{t('portal.inventory.po.unitCost', 'Unit cost')}</div>
            <div>{t('portal.inventory.po.lineTotal', 'Line total')}</div>
            <div></div>
          </div>

          {lines.map((l, idx) => {
            const qty = Number(l.qty || 0)
            const unit = money(l.unitCost)
            const suggestions = openSkuIdx === idx ? suggestionsFor(l.sku) : []
            const resolvedName = skuNameMap.get(normSku(l.sku)) || ''
            return (
              <div key={idx} className="portalTableRow" style={{ gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.5fr', overflow: 'visible' }}>
                <div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      value={l.sku}
                      onChange={(e) => {
                        updateLine(idx, { sku: e.target.value })
                        setOpenSkuIdx(idx)
                      }}
                      onFocus={() => setOpenSkuIdx(idx)}
                      onBlur={() => window.setTimeout(() => setOpenSkuIdx(-1), 120)}
                      placeholder={t('portal.inventory.po.skuPlaceholder', 'SKU or name...')}
                      autoComplete="off"
                    />

                    {openSkuIdx === idx && suggestions.length ? (
                      <div
                        className="card"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: 'calc(100% + 6px)',
                          zIndex: 50,
                          padding: 8,
                          background: '#111',
                          borderColor: 'rgba(255,255,255,0.14)',
                          maxHeight: 220,
                          overflow: 'auto',
                        }}
                      >
                        {suggestions.map((s) => (
                          <button
                            key={s.sku}
                            type="button"
                            className="chip"
                            style={{
                              width: '100%',
                              justifyContent: 'space-between',
                              marginBottom: 6,
                              textAlign: 'left',
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const nextPatch = { sku: s.sku }
                              if (s.uom && !String(l.uom || '').trim()) nextPatch.uom = s.uom
                              if (!Number.isFinite(Number(l.unitCost)) || Number(l.unitCost || 0) <= 0) {
                                if (Number.isFinite(s.cost) && s.cost > 0) nextPatch.unitCost = s.cost
                              }
                              updateLine(idx, nextPatch)
                              setOpenSkuIdx(-1)
                            }}
                          >
                            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 950 }}>{s.sku}</span>
                              <span className="muted" style={{ fontSize: 12 }}>{s.name || t('portal.common.none', '—')}{s.type ? ` • ${s.type}` : ''}{s.uom ? ` • ${s.uom}` : ''}</span>
                            </span>
                            <span className="muted" style={{ fontSize: 12 }}>{Number.isFinite(s.cost) ? `$${money(s.cost).toFixed(2)}` : ''}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {resolvedName ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {resolvedName}
                    </div>
                  ) : null}
                </div>
                <div>
                  <input className="input" type="number" step="1" min="0" value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} />
                </div>
                <div>
                  <input className="input" type="number" step="0.01" min="0" value={l.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })} />
                </div>
                <div style={{ fontWeight: 900 }}>${money(qty * unit).toFixed(2)}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn" type="button" onClick={() => removeLine(idx)} title={t('portal.inventory.po.remove', 'Remove')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}

          {!lines.length ? <div className="muted" style={{ padding: 10 }}>{t('portal.inventory.po.none', 'Add at least 1 line.')}</div> : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
          <div className="muted">{t('portal.inventory.po.total', 'Total: ${{amount}}').replace('{{amount}}', preview.total.toFixed(2))}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" type="button" onClick={addLine}>
              <Plus size={16} />
              {t('portal.inventory.po.addLine', 'Add line')}
            </button>
            <button className="btn btn-primary" type="button" onClick={createPO}>
              {t('portal.inventory.po.create', 'Create PO')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
