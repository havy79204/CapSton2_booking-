import { useMemo, useState } from 'react'
import { AlertTriangle, Save, SlidersHorizontal } from 'lucide-react'

function money(n) {
  const x = Number(n || 0)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

function keyOf(item) {
  return `${item.salonId || 'global'}::${item.sku}`
}

export function InventoryTable({
  items,
  salonId,
  onUpsertItem,
  onAdjustStock,
  performedBy,
} = {}) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [onlyLow, setOnlyLow] = useState(false)
  const [edits, setEdits] = useState({})
  const [qtyEdits, setQtyEdits] = useState({})

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    const list = Array.isArray(items) ? items : []
    return list
      .filter((it) => {
        if (salonId && String(it.salonId || '') !== String(salonId) && String(it.salonId || '') !== 'global') return false
        if (typeFilter !== 'All' && String(it.type || '') !== typeFilter.toLowerCase()) return false
        if (onlyLow && !(Number(it.qtyOnHand || 0) <= Number(it.minStock || 0))) return false
        if (!q) return true
        const hay = `${it.sku} ${it.name} ${it.type} ${it.uom}`.toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        const aa = `${a.type}:${a.sku}`
        const bb = `${b.type}:${b.sku}`
        return aa < bb ? -1 : 1
      })
  }, [items, onlyLow, query, salonId, typeFilter])

  const stockValue = useMemo(() => {
    return filtered.reduce((sum, it) => sum + Number(it.qtyOnHand || 0) * Number(it.cost || 0), 0)
  }, [filtered])

  function getEdit(it) {
    const k = keyOf(it)
    return edits[k] || {
      name: it.name,
      type: it.type,
      uom: it.uom,
      cost: it.cost,
      salePrice: it.salePrice,
      minStock: it.minStock,
    }
  }

  function setEdit(it, patch) {
    const k = keyOf(it)
    setEdits((prev) => ({
      ...prev,
      [k]: { ...getEdit(it), ...patch },
    }))
  }

  function getQty(it) {
    const k = keyOf(it)
    if (qtyEdits[k] !== undefined) return qtyEdits[k]
    return it.qtyOnHand
  }

  function saveRow(it) {
    const e = getEdit(it)
    const desiredQty = Number(getQty(it) ?? it.qtyOnHand ?? 0)
    const currentQty = Number(it.qtyOnHand || 0)
    const delta = Math.round((desiredQty - currentQty) * 1000) / 1000

    onUpsertItem?.({
      salonId: it.salonId,
      sku: it.sku,
      name: String(e.name || '').trim() || it.sku,
      type: e.type,
      uom: String(e.uom || '').trim() || 'each',
      cost: money(e.cost),
      salePrice: e.salePrice === '' ? null : e.salePrice === null ? null : money(e.salePrice),
      minStock: Number(e.minStock || 0),
    })

    if (delta) {
      onAdjustStock?.({
        salonId: it.salonId,
        sku: it.sku,
        qtyDelta: delta,
        reason: 'ADJUSTMENT',
        note: 'Manual stock adjustment',
        performedBy,
      })
    }

    const k = keyOf(it)
    setEdits((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })
    setQtyEdits((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })
  }

  return (
    <div className="card" style={{ padding: 14, background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 950, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <span className="badge"><SlidersHorizontal size={14} /></span>
          Inventory
        </div>
        <div className="muted" style={{ fontSize: 13 }}>Stock value (cost): ${money(stockValue).toFixed(2)}</div>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search SKU / name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input" style={{ maxWidth: 180 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="All">All types</option>
          <option value="pro">Pro supplies</option>
          <option value="retail">Retail products</option>
        </select>
        <label className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
          Low stock only
        </label>
      </div>

      <div className="portalTable" style={{ background: 'transparent' }}>
        <div className="portalTableHead" style={{ gridTemplateColumns: '1.2fr 1.4fr 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr' }}>
          <div>SKU</div>
          <div>Name</div>
          <div>Type</div>
          <div>UoM</div>
          <div>On hand</div>
          <div>Cost</div>
          <div>Sale</div>
          <div>Min</div>
          <div></div>
        </div>

        {filtered.map((it) => {
          const e = getEdit(it)
          const low = Number(it.qtyOnHand || 0) <= Number(it.minStock || 0)
          const k = keyOf(it)

          return (
            <div
              key={k}
              className="portalTableRow"
              style={{
                gridTemplateColumns: '1.2fr 1.4fr 0.7fr 0.6fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr',
                background: low ? 'rgba(255,59,122,0.08)' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 950, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                {low ? <AlertTriangle size={14} style={{ color: 'rgba(255,59,122,0.9)' }} /> : null}
                {it.sku}
              </div>
              <div>
                <input className="input" value={e.name} onChange={(ev) => setEdit(it, { name: ev.target.value })} />
              </div>
              <div>
                <select className="input" value={e.type} onChange={(ev) => setEdit(it, { type: ev.target.value })}>
                  <option value="pro">pro</option>
                  <option value="retail">retail</option>
                </select>
              </div>
              <div>
                <input className="input" value={e.uom} onChange={(ev) => setEdit(it, { uom: ev.target.value })} />
              </div>
              <div>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  value={getQty(it)}
                  onChange={(ev) => setQtyEdits((prev) => ({ ...prev, [k]: ev.target.value }))}
                />
              </div>
              <div>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={e.cost}
                  onChange={(ev) => setEdit(it, { cost: ev.target.value })}
                />
              </div>
              <div>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={e.salePrice ?? ''}
                  onChange={(ev) => setEdit(it, { salePrice: ev.target.value })}
                  placeholder="—"
                />
              </div>
              <div>
                <input
                  className="input"
                  type="number"
                  step="1"
                  value={e.minStock}
                  onChange={(ev) => setEdit(it, { minStock: ev.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" type="button" onClick={() => saveRow(it)}>
                  <Save size={16} style={{ marginRight: 8 }} />
                  Save
                </button>
              </div>
            </div>
          )
        })}

        {!filtered.length ? <div className="muted" style={{ padding: 14 }}>No items found.</div> : null}
      </div>
    </div>
  )
}
