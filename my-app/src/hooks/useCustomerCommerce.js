import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

function toMessage(err, fallback) {
  return err?.message || fallback
}

export function useCustomerContext() {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get('/api/customer/context')
      setContext(data)
      return data
    } catch (err) {
      setError(toMessage(err, 'Failed to load customer context'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  return { context, loading, error, refresh }
}

export function useCustomerStaff(serviceIds = []) {
  const [staffs, setStaffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const normalizedServiceIds = useMemo(() => {
    return Array.isArray(serviceIds)
      ? [...new Set(serviceIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : []
  }, [serviceIds])

  const queryString = normalizedServiceIds.length
    ? `?serviceIds=${encodeURIComponent(normalizedServiceIds.join(','))}`
    : ''

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get(`/api/customer/staff${queryString}`)
      setStaffs(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      setError(toMessage(err, 'Failed to load staff list'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  return { staffs, loading, error, refresh }
}

export function useCustomerBookings(limit = 20) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get(`/api/customer/bookings?limit=${limit}`)
      setBookings(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      setError(toMessage(err, 'Failed to load bookings'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [limit])

  const createBooking = useCallback(async (payload) => {
    const created = await api.post('/api/customer/bookings', payload || {})
    await refresh().catch(() => {})
    return created
  }, [refresh])

  const cancelBooking = useCallback(async (bookingId) => {
    const cancelled = await api.post(`/api/customer/bookings/${bookingId}/cancel`, {})
    await refresh().catch(() => {})
    return cancelled
  }, [refresh])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  return {
    bookings,
    loading,
    error,
    refresh,
    createBooking,
    cancelBooking,
  }
}

export function useCustomerOrders(limit = 20) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get(`/api/customer/orders?limit=${limit}`)
      setOrders(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      setError(toMessage(err, 'Failed to load orders'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const cancelOrder = useCallback(async (orderId) => {
    const cancelled = await api.post(`/api/customer/orders/${orderId}/cancel`, {})
    await refresh().catch(() => {})
    return cancelled
  }, [refresh])

  return { orders, loading, error, refresh, cancelOrder }
}

export function useCustomerAddresses() {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get('/api/customer/addresses')
      setAddresses(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      setError(toMessage(err, 'Failed to load addresses'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const runMutation = useCallback(async (fn) => {
    try {
      setBusy(true)
      setError(null)
      const data = await fn()
      setAddresses(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      setError(toMessage(err, 'Address action failed'))
      throw err
    } finally {
      setBusy(false)
    }
  }, [])

  const createAddress = useCallback((payload) => {
    return runMutation(() => api.post('/api/customer/addresses', payload || {}))
  }, [runMutation])

  const updateAddress = useCallback((addressId, payload) => {
    return runMutation(() => api.put(`/api/customer/addresses/${addressId}`, payload || {}))
  }, [runMutation])

  const deleteAddress = useCallback((addressId) => {
    return runMutation(() => api.del(`/api/customer/addresses/${addressId}`))
  }, [runMutation])

  const setDefaultAddress = useCallback((addressId) => {
    return runMutation(() => api.post(`/api/customer/addresses/${addressId}/default`, {}))
  }, [runMutation])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  return {
    addresses,
    loading,
    error,
    busy,
    refresh,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
  }
}

export function useCustomerCart() {
  const [cart, setCart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get('/api/customer/cart')
      setCart(data)
      return data
    } catch (err) {
      setError(toMessage(err, 'Failed to load cart'))
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const runMutation = useCallback(async (fn) => {
    try {
      setBusy(true)
      setError(null)
      const data = await fn()
      setCart(data)
      return data
    } catch (err) {
      setError(toMessage(err, 'Cart action failed'))
      throw err
    } finally {
      setBusy(false)
    }
  }, [])

  const addItem = useCallback((payload) => {
    return runMutation(async () => api.post('/api/customer/cart/items', payload || {}))
  }, [runMutation])

  const updateItem = useCallback((cartItemId, payload) => {
    return runMutation(async () => api.put(`/api/customer/cart/items/${cartItemId}`, payload || {}))
  }, [runMutation])

  const removeItem = useCallback((cartItemId) => {
    return runMutation(async () => api.del(`/api/customer/cart/items/${cartItemId}`))
  }, [runMutation])

  const clearItems = useCallback(() => {
    return runMutation(async () => api.del('/api/customer/cart/items'))
  }, [runMutation])

  const checkout = useCallback(async (payload) => {
    try {
      setBusy(true)
      setError(null)
      const result = await api.post('/api/customer/cart/checkout', payload || {})
      await refresh().catch(() => {})
      return result
    } catch (err) {
      setError(toMessage(err, 'Checkout failed'))
      throw err
    } finally {
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  return {
    cart,
    loading,
    error,
    busy,
    refresh,
    addItem,
    updateItem,
    removeItem,
    clearItems,
    checkout,
  }
}
