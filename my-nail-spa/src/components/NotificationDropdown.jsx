import { Bell, X, Check, Calendar, Tag, Package } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function NotificationDropdown({ isOpen, onClose, notifications = [] }) {
  const navigate = useNavigate()
  
  if (!isOpen) return null

  function handleViewAll() {
    onClose()
    navigate('/notifications')
  }

  function getNotificationIcon(type) {
    switch(type) {
      case 'booking':
        return <Calendar size={18} />
      case 'promotion':
        return <Tag size={18} />
      case 'order':
        return <Package size={18} />
      default:
        return <Bell size={18} />
    }
  }

  return (
    <div className="notificationDropdown">
      <div className="notificationHeader">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} />
          <strong>Notifications</strong>
        </div>
        <button className="closeBtn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="notificationList">
        {notifications.length === 0 ? (
          <div className="notificationEmpty">
            <Bell size={32} style={{ opacity: 0.3 }} />
            <p>No notifications</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div 
              key={notif.id} 
              className={`notificationItem ${!notif.read ? 'unread' : ''}`}
            >
              <div className="notificationIcon">
                {getNotificationIcon(notif.type)}
              </div>
              <div className="notificationContent">
                <div className="notificationTitle">
                  {notif.title}
                  {!notif.read && <span className="unreadDot"></span>}
                </div>
                <div className="notificationMessage">{notif.message}</div>
                <div className="notificationTime">{notif.time}</div>
              </div>
              {!notif.read && (
                <button className="markReadBtn" title="Mark as read">
                  <Check size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="notificationFooter">
          <button className="linkBtn" onClick={handleViewAll}>
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}
