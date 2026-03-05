/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api as serverApi } from '../lib/api'
import { useAuth } from './AuthContext'
import { useI18n } from './I18nContext'

// Always use server-backed cart (database persistence)
const CartContext = createContext(null)

function normalizeCartItem(item) {
  const productId = item?.productId ?? item?.id
  return {
    productId: productId,
    qty: Math.max(1, Number(item.qty ?? 1) || 1),
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => [])
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  
  // Need access to AuthContext to detect logout
  // Note: We cannot use useAuth() here if CartProvider is not nested inside AuthProvider?
  // Actually in main.jsx: AuthProvider -> BookingProvider -> CartProvider. So it is safe to useAuth().
  // However, avoid circular deps. We just need to know if token changed to null?
  // Let's rely on the "logout" action in AuthContext to clear the cookie, OR we watch for user changes here.
  
  // Clear any legacy localStorage cart keys to avoid stale client-only state
  useEffect(() => {
    try {
      localStorage.removeItem('cart')
      localStorage.removeItem('serverCartId')
    } catch {
      // ignore (e.g., SSR or private mode)
    }
  }, [])
  const [cartId, setCartId] = useState('')

  // helper: read cookie by name
  function readCookie(name) {
    try {
      const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
      return m ? decodeURIComponent(m.pop()) : ''
    } catch {
      return ''
    }
  }

  // Hydrate cart from server on mount
  useEffect(() => {
    let alive = true
    async function hydrateFromServer() {
      try {
        // prefer in-memory cartId, then cookie
        let sid = cartId || readCookie('serverCartId') || ''
        if (!sid) {
          // create a new server cart and let backend set cookie
          let payload = {}
          // Only fetch user info if already logged in (to avoid 401 errors in console)
          if (user) {
            if (user.id) payload.userId = user.id
            if (user.email) payload.customerEmail = user.email
          }
          const cr = await serverApi.createCart(payload)
          sid = cr?.cart?.CartId || cr?.cart?.cartId || ''
        }
        if (!sid) return
        setCartId(sid)
        const r = await serverApi.getCartItems(sid)
        if (!alive) return
        const arr = Array.isArray(r?.items) ? r.items : []
        const mapped = arr.map((it) => ({ productId: it.ProductId, qty: Number(it.Qty) || 1 }))
        setItems(mapped.map(normalizeCartItem))
      } catch {
        // ignore
      }
    }
    hydrateFromServer()
    return () => {
      alive = false
    }
  }, [cartId, user])

  const client = useMemo(() => {
    // Helper: fetch current user details to link cart
    async function getUserPayload() {
      // Use user from AuthContext instead of calling API to avoid 401 errors
      if (user && (user.id || user.email)) {
        return { userId: user.id || null, customerEmail: user.email || null }
      }
      return {}
    }

    // Helper: ensure server cart exists, is linked to user, and return valid ID
    async function ensureServerCart() {
      let currentId = cartId || readCookie('serverCartId')
      let payload = {}
      try {
          payload = await getUserPayload()
      } catch (e) { /* ignore */ }

      // If we have a candidate ID, ask server to Upsert (Create/Update) it
      if (currentId) {
        payload.cartId = currentId
      }

      try {
        const r = await serverApi.createCart(payload)
        const newSid = r?.cart?.CartId || r?.cart?.cartId || ''
        if (newSid) {
          if (newSid !== cartId) setCartId(newSid)

          // Refresh/Set cookie
          const opts = 'path=/; max-age=2592000; SameSite=Lax'
          document.cookie = `serverCartId=${newSid}; ${opts}`
          return newSid
        }
      } catch (err) {
        console.warn('Initial createCart failed, retrying with clean payload', err)
        // fallback: create new PURE anonymous cart if upsert failed
        // This handles cases where payload (User ID) might be invalid or recent DB changes
        try {
            const cleanPayload = { status: 'active' }
            const r2 = await serverApi.createCart(cleanPayload)
            const sid2 = r2?.cart?.CartId || r2?.cart?.cartId || ''
            if (sid2) {
                setCartId(sid2)
                const opts = 'path=/; max-age=2592000; SameSite=Lax'
                document.cookie = `serverCartId=${sid2}; ${opts}`
                return sid2
            }
        } catch (e2) { 
            console.error('Fatal: Could not create anonymous cart', e2)
        }
      }
      return currentId || ''
    }

    return {
      items,
      async add(productId, qty = 1) {
        if (!user) {
          if (confirm(t('cart.loginRequired'))) {
            navigate('/login')
          }
          return
        }

        let sid = ''
        try {
            sid = await ensureServerCart()
        } catch (e) {
            console.error("ensureServerCart threw", e)
        }
        
        if (!sid) return
        try {
          await serverApi.addCartItem(sid, { productId, qty })
          const r = await serverApi.getCartItems(sid)
          const arr = Array.isArray(r?.items) ? r.items : []
          setItems(arr.map((it) => normalizeCartItem({ productId: it.ProductId, qty: Number(it.Qty) || 1 })))
        } catch (err) {
          console.error('Failed to add cart item', err)
          // Retry once with hard reset if 404
          if (err.status === 404) {
             setCartId('')
             document.cookie = 'serverCartId=; Max-Age=0; path=/;'
             const newSid = await ensureServerCart()
             if (newSid) {
                 await serverApi.addCartItem(newSid, { productId, qty })
                 const r2 = await serverApi.getCartItems(newSid)
                 setItems((r2?.items || []).map((it) => normalizeCartItem({ productId: it.ProductId, qty: Number(it.Qty) || 1 })))
             }
          }
        }
      },
      async setQty(productId, qty) {
        const sid = await ensureServerCart()
        if (!sid) return
        try {
          const r = await serverApi.getCartItems(sid)
          const serverItems = Array.isArray(r?.items) ? r.items : []
          const matches = serverItems.filter((it) => String(it.ProductId) === String(productId))
          for (const it of matches) {
            await serverApi.deleteCartItem(sid, it.CartItemId || it.cartItemId || it.id)
          }
          if (qty > 0) {
            await serverApi.addCartItem(sid, { productId, qty })
          }
          const updated = await serverApi.getCartItems(sid)
          const arr2 = Array.isArray(updated?.items) ? updated.items : []
          setItems(arr2.map((it) => normalizeCartItem({ productId: it.ProductId, qty: Number(it.Qty) || 1 })))
        } catch {
          // ignore
        }
      },
      async remove(productId) {
        const sid = await ensureServerCart()
        if (!sid) return
        try {
          const r = await serverApi.getCartItems(sid)
          const serverItems = Array.isArray(r?.items) ? r.items : []
          const matches = serverItems.filter((it) => String(it.ProductId) === String(productId))
          for (const it of matches) {
            await serverApi.deleteCartItem(sid, it.CartItemId || it.cartItemId || it.id)
          }
          const updated = await serverApi.getCartItems(sid)
          const arr2 = Array.isArray(updated?.items) ? updated.items : []
          setItems(arr2.map((it) => normalizeCartItem({ productId: it.ProductId, qty: Number(it.Qty) || 1 })))
        } catch {
          // ignore
        }
      },
      async clear() {
        const sid = await ensureServerCart()
        if (!sid) return
        try {
          const r = await serverApi.getCartItems(sid)
          const serverItems = Array.isArray(r?.items) ? r.items : []
          for (const it of serverItems) {
            await serverApi.deleteCartItem(sid, it.CartItemId || it.cartItemId || it.id)
          }
          setItems([])
        } catch {
          // ignore
        }
      },
      count() {
        return items.reduce((sum, x) => sum + (Number(x.qty) || 0), 0)
      },
    }
  }, [items, cartId, user, navigate, t])

  return <CartContext.Provider value={client}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
