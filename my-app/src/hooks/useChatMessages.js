import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useCatMessages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastViewedAt, setLastViewedAt] = useState(localStorage.getItem('chatLastViewedAt') || new Date(0).toISOString())

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get('/api/customer/chat/messages')
      setMessages(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      setError(err?.message || 'Failed to load chat messages')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  // Mark chat as viewed when component mounts
  const markAsViewed = useCallback(() => {
    const now = new Date().toISOString()
    setLastViewedAt(now)
    localStorage.setItem('chatLastViewedAt', now)
  }, [])

  // Calculate unread count (messages from shop received after last viewed time)
  const unreadCount = messages.filter((item) => {
    if (item.sender === 'user') return false // Exclude own messages
    const createdAt = new Date(item.createdAt || 0)
    const lastViewed = new Date(lastViewedAt)
    return createdAt > lastViewed
  }).length

  return {
    messages,
    unreadCount,
    loading,
    error,
    refresh,
    markAsViewed,
  }
}
