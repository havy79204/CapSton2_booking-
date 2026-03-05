/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { api as backendApi } from '../lib/api'

const InventoryContext = createContext(null)

export function InventoryProvider({ children }) {
  const [refresh, setRefresh] = useState(0)
  const [itemsBySalonKey, setItemsBySalonKey] = useState({})
  const [txBySalonKey, setTxBySalonKey] = useState({})
  const [loading, setLoading] = useState({ items: false, tx: false })
  const [error, setError] = useState(null)

  const salonKeyOf = useCallback((salonId) => {
    return String(salonId || 'global').trim() || 'global'
  }, [])

  const loadItems = useCallback(async ({ salonId } = {}) => {
    const salonKey = salonKeyOf(salonId)
    setLoading((p) => ({ ...p, items: true }))
    setError(null)
    try {
      const res = await backendApi.listInventoryItems({ salonKey })
      setItemsBySalonKey((prev) => ({ ...prev, [salonKey]: res?.items || [] }))
      return res?.items || []
    } catch (e) {
      setError(e)
      return []
    } finally {
      setLoading((p) => ({ ...p, items: false }))
    }
  }, [salonKeyOf])

  const loadTransactions = useCallback(async ({ salonId, limit } = {}) => {
    const salonKey = salonKeyOf(salonId)
    setLoading((p) => ({ ...p, tx: true }))
    setError(null)
    try {
      const res = await backendApi.listInventoryTransactions({ salonKey, limit })
      setTxBySalonKey((prev) => ({ ...prev, [salonKey]: res?.items || [] }))
      return res?.items || []
    } catch (e) {
      setError(e)
      return []
    } finally {
      setLoading((p) => ({ ...p, tx: false }))
    }
  }, [salonKeyOf])

  const api = useMemo(() => {
    void refresh

    return {
      bump() {
        setRefresh((x) => x + 1)
      },

      loading,
      error,

      loadItems,
      loadTransactions,

      listItems({ salonId } = {}) {
        const salonKey = salonKeyOf(salonId)
        return itemsBySalonKey[salonKey] || []
      },

      listTransactions({ salonId, limit } = {}) {
        void limit
        const salonKey = salonKeyOf(salonId)
        return txBySalonKey[salonKey] || []
      },

      async upsertItem(item) {
        const payload = {
          salonId: item?.salonId || 'global',
          sku: item?.sku,
          name: item?.name,
          type: item?.type,
          uom: item?.uom,
          cost: Number(item?.cost || 0),
          salePrice: item?.salePrice === null ? null : item?.salePrice === undefined ? undefined : Number(item?.salePrice || 0),
          minStock: Number(item?.minStock || 0),
        }
        const res = await backendApi.upsertInventoryItem(payload)
        setRefresh((x) => x + 1)
        await loadItems({ salonId: payload.salonId })
        return res?.item
      },

      async adjustStock(args) {
        const payload = {
          salonId: args?.salonId || 'global',
          sku: args?.sku,
          qtyDelta: Number(args?.qtyDelta || 0),
          reason: args?.reason || 'ADJUSTMENT',
          refId: args?.refId,
          vendor: args?.vendor,
          note: args?.note,
        }
        const res = await backendApi.createInventoryTransaction(payload)
        setRefresh((x) => x + 1)
        await Promise.all([
          loadItems({ salonId: payload.salonId }),
          loadTransactions({ salonId: payload.salonId, limit: 300 }),
        ])
        return res?.item
      },

      async createExternalPO(args) {
        const payload = {
          salonId: args?.salonId || 'global',
          vendor: args?.vendor,
          note: args?.note,
          lines: Array.isArray(args?.lines) ? args.lines : [],
        }
        const res = await backendApi.createExternalPO(payload)
        setRefresh((x) => x + 1)
        await Promise.all([
          loadItems({ salonId: payload.salonId }),
          loadTransactions({ salonId: payload.salonId, limit: 300 }),
        ])
        return res?.item
      },
    }
  }, [error, itemsBySalonKey, loadItems, loadTransactions, loading, refresh, salonKeyOf, txBySalonKey])

  return <InventoryContext.Provider value={api}>{children}</InventoryContext.Provider>
}

export function useInventory() {
  const ctx = useContext(InventoryContext)
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider')
  return ctx
}
