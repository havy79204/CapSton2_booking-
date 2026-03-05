import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CheckCheck, Trash2, Calendar, Tag, Package, Clock, Sparkles } from 'lucide-react'
import '../styles/NotificationsPage.css'

export function NotificationsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)

  function getNotificationIcon(type) {
    switch(type) {
      case 'booking':
        return <Calendar size={20} />
      case 'promotion':
        return <Tag size={20} />
      case 'order':
        return <Package size={20} />
      case 'reminder':
        return <Clock size={20} />
      default:
        return <Bell size={20} />
    }
  }

  useEffect(() => {
    let alive = true
    
    // TODO: Replace with actual API call
    // Mock data for now
    setTimeout(() => {
      if (!alive) return
      setNotifications([
        {
          id: 1,
          type: 'booking',
          title: 'Booking Confirmed',
          message: 'Your appointment at ZAny Kingston is confirmed for tomorrow at 2:00 PM',
          time: '2 hours ago',
          read: false,
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        {
          id: 2,
          type: 'promotion',
          title: 'Special Offer',
          message: '20% off on all services this weekend!',
          time: '5 hours ago',
          read: false,
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000)
        },
        {
          id: 3,
          type: 'order',
          title: 'Order Shipped',
          message: 'Your order #1234 has been shipped',
          time: '1 day ago',
          read: true,
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000)
        },
        {
          id: 4,
          type: 'reminder',
          title: 'Appointment Reminder',
          message: 'Your appointment is tomorrow at 10:00 AM',
          time: '2 days ago',
          read: true,
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        },
        {
          id: 5,
          type: 'promotion',
          title: 'New Product Launch',
          message: 'Check out our new nail polish collection!',
          time: '3 days ago',
          read: true,
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        }
      ])
      setLoading(false)
    }, 500)
    
    return () => {
      alive = false
    }
  }, [])

  function handleMarkAsRead(id) {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  function handleMarkAllAsRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  function handleDelete(id) {
    if (confirm('Are you sure you want to delete this notification?')) {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }
  }

  function handleDeleteAll() {
    if (confirm('Are you sure you want to delete all notifications?')) {
      setNotifications([])
    }
  }

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'all') return true
    if (activeTab === 'unread') return !n.read
    if (activeTab === 'read') return n.read
    return n.type === activeTab
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="notificationsPage">
      <div className="container">
        <div className="notificationsHeader">
          <div className="notificationsHeaderLeft">
            <button className="btn btn-outline" onClick={() => navigate(-1)}>
              ← Back
            </button>
            <div>
              <h1>Notifications</h1>
              {unreadCount > 0 && (
                <p className="notificationsSubtitle">{unreadCount} unread notification{unreadCount > 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
          <div className="notificationsHeaderActions">
            {unreadCount > 0 && (
              <button className="btn btn-outline" onClick={handleMarkAllAsRead}>
                <CheckCheck size={16} />
                Mark all as read
              </button>
            )}
            {notifications.length > 0 && (
              <button className="btn btn-outline" onClick={handleDeleteAll}>
                <Trash2 size={16} />
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="notificationsContainer">
          {/* Tabs */}
          <div className="notificationsTabs">
            <button
              className={`notificationsTab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <span>All</span>
              <span className="tabCount">{notifications.length}</span>
            </button>
            <button
              className={`notificationsTab ${activeTab === 'unread' ? 'active' : ''}`}
              onClick={() => setActiveTab('unread')}
            >
              <span>Unread</span>
              {unreadCount > 0 && <span className="tabCount unread">{unreadCount}</span>}
            </button>
            <button
              className={`notificationsTab ${activeTab === 'read' ? 'active' : ''}`}
              onClick={() => setActiveTab('read')}
            >
              <span>Read</span>
            </button>
            <div className="tabDivider"></div>
            <button
              className={`notificationsTab ${activeTab === 'booking' ? 'active' : ''}`}
              onClick={() => setActiveTab('booking')}
            >
              <Calendar size={16} />
              <span>Bookings</span>
            </button>
            <button
              className={`notificationsTab ${activeTab === 'promotion' ? 'active' : ''}`}
              onClick={() => setActiveTab('promotion')}
            >
              <Tag size={16} />
              <span>Promotions</span>
            </button>
            <button
              className={`notificationsTab ${activeTab === 'order' ? 'active' : ''}`}
              onClick={() => setActiveTab('order')}
            >
              <Package size={16} />
              <span>Orders</span>
            </button>
          </div>

          {/* Notifications List */}
          <div className="notificationsContent">
            {loading ? (
              <div className="notificationsLoading">
                <p>Loading notifications...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="notificationsEmpty">
                <Bell size={64} strokeWidth={1.5} />
                <h3>No notifications</h3>
                <p>You're all caught up! Check back later for updates.</p>
              </div>
            ) : (
              <div className="notificationsList">
                {filteredNotifications.map(notification => (
                  <div
                    key={notification.id}
                    className={`notificationCard ${!notification.read ? 'unread' : ''}`}
                  >
                    <div className="notificationIcon">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="notificationBody">
                      <div className="notificationTop">
                        <h3 className="notificationTitle">
                          {notification.title}
                          {!notification.read && <span className="unreadIndicator"></span>}
                        </h3>
                        <div className="notificationActions">
                          {!notification.read && (
                            <button
                              className="notificationActionBtn"
                              onClick={() => handleMarkAsRead(notification.id)}
                              title="Mark as read"
                            >
                              <Check size={16} />
                            </button>
                          )}
                          <button
                            className="notificationActionBtn danger"
                            onClick={() => handleDelete(notification.id)}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="notificationMessage">{notification.message}</p>
                      <div className="notificationMeta">
                        <span className="notificationTime">{notification.time}</span>
                        <span className={`notificationBadge ${notification.type}`}>
                          {notification.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
