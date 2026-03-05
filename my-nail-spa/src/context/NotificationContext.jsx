import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const NotificationContext = createContext()

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  async function loadNotifications() {
    const list = await api.listNotifications()
    console.log('Fetched notifications:', list)
    if (!Array.isArray(list)) return

    setNotifications(list)

    const count = list.filter(n => !n.IsRead && n.isRead !== true).length
    setUnreadCount(count)
  }

  useEffect(() => {
    loadNotifications()

    // polling 10s (đủ dùng cho project)
    const interval = setInterval(loadNotifications, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        reloadNotifications: loadNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}