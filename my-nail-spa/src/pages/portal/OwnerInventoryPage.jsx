import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useInventory } from '../../context/InventoryContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { InventoryTable } from '../../components/inventory/InventoryTable.jsx'
import { OrdersPanel } from '../../components/portal/OrdersPanel.jsx'
import { ProductsManager } from '../../components/portal/ProductsManager.jsx'

export function OwnerInventoryPage() {
  const auth = useAuth()
  const salonId = auth.user?.salonId
  const inventory = useInventory()
  const { t } = useI18n()

  useEffect(() => {
    if (!salonId) return
    void inventory.loadItems({ salonId })
    void inventory.loadTransactions({ salonId, limit: 300 })
  }, [inventory.loadItems, inventory.loadTransactions, salonId])

  const [searchParams, setSearchParams] = useSearchParams()

  const urlTab = useMemo(() => {
    const raw = String(searchParams.get('tab') || '').trim().toLowerCase()
    if (raw === 'orders') return 'orders'
    if (raw === 'products') return 'products'
    return 'inventory'
  }, [searchParams])

  const [tab, setTab] = useState(urlTab)

  useEffect(() => {
    setTab(urlTab)
  }, [urlTab])

  function setTabAndUrl(next) {
    setTab(next)
    setSearchParams({ tab: next }, { replace: true })
  }

  const performedBy = useMemo(() => {
    return {
      id: auth.user?.id || null,
      name: auth.user?.name || 'Owner',
      email: auth.user?.email || null,
      role: auth.user?.role || 'owner',
    }
  }, [auth.user?.email, auth.user?.id, auth.user?.name, auth.user?.role])

  const items = useMemo(() => {
    if (!salonId) return []
    return inventory.listItems({ salonId })
  }, [inventory, salonId])

  if (!salonId) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900 }}>{t('portal.ownerInventory.noSalon', 'No salon assigned')}</div>
        <div className="muted" style={{ marginTop: 8 }}>
          {t('portal.ownerInventory.noSalonHint', "This owner account doesn't have a salonId.")}
        </div>
      </div>
    )
  }

  return (
    <>

      <div className="card" style={{ padding: 12, marginBottom: 14, background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className={tab === 'inventory' ? 'chip chipActive' : 'chip'} onClick={() => setTabAndUrl('inventory')}>
            {t('portal.ownerInventory.tabs.inventory', 'ERP Inventory')}
          </button>
          <button type="button" className={tab === 'orders' ? 'chip chipActive' : 'chip'} onClick={() => setTabAndUrl('orders')}>
            {t('portal.ownerInventory.tabs.orders', 'Orders')}
          </button>
          <button type="button" className={tab === 'products' ? 'chip chipActive' : 'chip'} onClick={() => setTabAndUrl('products')}>
            {t('portal.ownerInventory.tabs.products', 'Shop products')}
          </button>
          <div style={{ flex: 1 }} />
          <div className="muted" style={{ fontSize: 13, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Sparkles size={16} />
            {t('portal.ownerInventory.badge', 'Dark-mode ERP')}
          </div>
        </div>
      </div>

      {tab === 'inventory' ? (
        <InventoryTable
          items={items}
          salonId={salonId}
          performedBy={performedBy}
          onUpsertItem={(it) => inventory.upsertItem(it)}
          onAdjustStock={(args) => inventory.adjustStock(args)}
        />
      ) : null}

      {tab === 'orders' ? <OrdersPanel salonId={salonId} /> : null}

      {tab === 'products' ? (
        <ProductsManager
          salonId={salonId}
          reloadToken={inventory}
          inventoryItems={items}
        />
      ) : null}
    </>
  )
}
