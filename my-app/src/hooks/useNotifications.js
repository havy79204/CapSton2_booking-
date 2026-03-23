import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get('/api/customer/notifications')
      setNotifications(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      setError(err?.message || 'Failed to load notifications')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  // Calculate unread count
  const unreadCount = notifications.filter((item) => !item.read).length

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
  }
}
