import { useMemo, useState } from 'react'
import { History, Filter } from 'lucide-react'

import { useI18n } from '../../context/I18nContext.jsx'

function normSku(sku) {
  return String(sku || '')
    .trim()
    .replace(/\s+/g, '-')
    .toUpperCase()
}

function fmtAt(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso || '—'
    return d.toLocaleString()
  } catch {
    return iso || '—'
  }
}

export function TransactionLogs({ logs, defaultReason = 'All', skuCatalog } = {}) {
  const { t } = useI18n()
  const [reason, setReason] = useState(defaultReason)
  const [q, setQ] = useState('')

  const skuNameMap = useMemo(() => {
    const map = new Map()
    const list = Array.isArray(skuCatalog) ? skuCatalog : []
    for (const it of list) {
      const sku = normSku(it?.sku)
      if (!sku) continue
      const name = String(it?.name || '').trim()
      if (name) map.set(sku, name)
    }
    return map
  }, [skuCatalog])

  const filtered = useMemo(() => {
    const list = Array.isArray(logs) ? logs : []
    const qq = String(q || '').trim().toLowerCase()
    return list.filter((t) => {
      if (reason !== 'All' && String(t.reason || '') !== reason) return false
      if (!qq) return true
      const hay = `${t.sku} ${t.reason} ${t.refId || ''} ${t.vendor || ''} ${t.note || ''} ${t.performedBy?.email || ''} ${t.performedBy?.name || ''}`.toLowerCase()
      return hay.includes(qq)
    })
  }, [logs, q, reason])

  const summary = useMemo(() => {
    const inbound = filtered.filter((t) => Number(t.qtyDelta || 0) > 0).reduce((s, t) => s + Number(t.qtyDelta || 0), 0)
    const outbound = filtered.filter((t) => Number(t.qtyDelta || 0) < 0).reduce((s, t) => s + Math.abs(Number(t.qtyDelta || 0)), 0)
    return { inbound, outbound }
  }, [filtered])

  return (
    <div className="card" style={{ padding: 14, marginTop: 14, background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)' }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 950, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <span className="badge"><History size={14} /></span>
          {t('portal.inventory.tx.title', 'Transaction History')}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {t('portal.inventory.tx.summary', 'In: {{inbound}} • Out: {{outbound}} • Rows: {{rows}}')
            .replace('{{inbound}}', summary.inbound.toFixed(2))
            .replace('{{outbound}}', summary.outbound.toFixed(2))
            .replace('{{rows}}', filtered.length)}
        </div>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="badge"><Filter size={14} /> {t('portal.inventory.tx.filter', 'Filter')}</span>
        <select className="input" style={{ maxWidth: 260 }} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="All">{t('portal.inventory.tx.all', 'All')}</option>
          <option value="INBOUND_PO">{t('portal.inventory.tx.inbound', 'INBOUND_PO')}</option>
          <option value="RETAIL_SALE">{t('portal.inventory.tx.retail', 'RETAIL_SALE')}</option>
          <option value="SERVICE_CONSUMPTION">{t('portal.inventory.tx.service', 'SERVICE_CONSUMPTION')}</option>
          <option value="ADJUSTMENT">{t('portal.inventory.tx.adjustment', 'ADJUSTMENT')}</option>
        </select>
        <input className="input" style={{ maxWidth: 320 }} placeholder={t('portal.inventory.tx.search', 'Search SKU / ref / note')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="portalTable" style={{ background: 'transparent' }}>
        <div className="portalTableHead" style={{ gridTemplateColumns: '1.2fr 1.1fr 0.6fr 1.1fr 1.2fr 1fr' }}>
          <div>{t('portal.inventory.tx.when', 'When')}</div>
          <div>{t('portal.inventory.tx.item', 'Item')}</div>
          <div>{t('portal.inventory.tx.qty', 'Qty')}</div>
          <div>{t('portal.inventory.tx.ref', 'Ref / Vendor')}</div>
          <div>{t('portal.inventory.tx.notes', 'Notes')}</div>
          <div>{t('portal.inventory.tx.by', 'By')}</div>
        </div>

        {filtered.map((tx) => {
          const qd = Number(tx.qtyDelta || 0)
          const color = qd >= 0 ? 'rgba(150,255,200,0.92)' : 'rgba(255,140,160,0.92)'
          const sku = normSku(tx.sku)
          const name = skuNameMap.get(sku) || ''
          return (
            <div
              key={tx.id}
              className="portalTableRow"
              style={{ gridTemplateColumns: '1.2fr 1.1fr 0.6fr 1.1fr 1.2fr 1fr' }}
            >
              <div style={{ fontWeight: 900 }}>{fmtAt(tx.at)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sku || t('portal.common.none', '—')}</div>
                <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name || t('portal.common.none', '—')}
                </div>
              </div>
              <div style={{ fontWeight: 950, color }}>{qd >= 0 ? `+${qd}` : `${qd}`}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tx.refId ? `#${tx.refId}` : t('portal.common.none', '—')}
                  {tx.vendor ? ` • ${tx.vendor}` : ''}
                </div>
                <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tx.reason || t('portal.common.none', '—')}
                </div>
              </div>
              <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {String(tx.note || '').trim() || t('portal.common.none', '—')}
              </div>
              <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx.performedBy?.email || tx.performedBy?.name || tx.performedBy?.role || t('portal.common.none', '—')}
              </div>
            </div>
          )
        })}

        {!filtered.length ? <div className="muted" style={{ padding: 14 }}>{t('portal.inventory.tx.none', 'No transactions yet.')}</div> : null}
      </div>

      {filtered.length ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          {t('portal.inventory.tx.tip', 'Tip: use the filter above to focus on one transaction type.')}
        </div>
      ) : null}
    </div>
  )
}
