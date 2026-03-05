import { useEffect, useMemo } from 'react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useInventory } from '../../context/InventoryContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { POForm } from '../../components/inventory/POForm.jsx'
import { TransactionLogs } from '../../components/inventory/TransactionLogs.jsx'

export function OwnerExternalPOPage() {
  const auth = useAuth()
  const inventory = useInventory()
  const { t } = useI18n()
  const salonId = auth.user?.salonId || 'global'

  useEffect(() => {
    if (!salonId) return
    void inventory.loadItems({ salonId })
    if (salonId !== 'global') void inventory.loadItems({ salonId: 'global' })
    void inventory.loadTransactions({ salonId, limit: 300 })
  }, [inventory.loadItems, inventory.loadTransactions, salonId])

  const skuCatalog = useMemo(() => {
    if (!salonId) return []
    const salonItems = inventory.listItems({ salonId })
    const items = (Array.isArray(salonItems) ? salonItems : [])
    const fallback = !items.length && salonId !== 'global' ? inventory.listItems({ salonId: 'global' }) : []
    const all = [...items, ...(Array.isArray(fallback) ? fallback : [])]
    return all.map((it) => ({
      sku: it.sku,
      name: it.name,
      uom: it.uom,
      cost: it.cost,
      type: it.type,
    }))
  }, [inventory, salonId])

  const logs = useMemo(() => {
    if (!salonId) return []
    return inventory.listTransactions({ salonId, limit: 300 })
  }, [inventory, salonId])

  const performedBy = useMemo(() => {
    return {
      id: auth.user?.id || null,
      name: auth.user?.name || 'Owner',
      email: auth.user?.email || null,
      role: auth.user?.role || 'owner',
    }
  }, [auth.user?.email, auth.user?.id, auth.user?.name, auth.user?.role])

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.ownerExternalPO.title', 'External Purchase Order')}</h2>
        <div className="muted">{t('portal.ownerExternalPO.subtitle', 'Import stock from outside suppliers')}</div>
      </div>

      <POForm
        salonId={salonId}
        performedBy={performedBy}
        skuCatalog={skuCatalog}
        onCreatePO={(args) => inventory.createExternalPO(args)}
      />

      <TransactionLogs logs={logs} defaultReason="INBOUND_PO" skuCatalog={skuCatalog} />
    </>
  )
}
