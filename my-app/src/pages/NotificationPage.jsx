import { useEffect, useMemo, useState } from 'react';
import {
  IoCalendarOutline,
  IoBagCheckOutline,
  IoCheckmarkDoneCircleOutline,
  IoTimeOutline,
  IoCloseCircleOutline,
  IoCubeOutline
} from 'react-icons/io5';
import { api } from '../lib/api.js';
import '../styles/NotificationPage.css';

const NotificationPage = () => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatTime = (dateValue) => {
    const date = new Date(dateValue);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getBookingIcon = (status) => {
    const key = String(status || '').toLowerCase();
    if (key === 'confirmed') return <IoCheckmarkDoneCircleOutline className="notification-item-icon booking confirmed" />;
    if (key === 'C' || key === 'booked') return <IoTimeOutline className="notification-item-icon booking C" />;
    if (key === 'completed') return <IoCalendarOutline className="notification-item-icon booking completed" />;
    if (key === 'cancelled' || key === 'canceled') return <IoCloseCircleOutline className="notification-item-icon booking cancelled" />;
    return <IoCalendarOutline className="notification-item-icon booking" />;
  };

  const getOrderIcon = () => <IoBagCheckOutline className="notification-item-icon order" />;

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const query = activeFilter !== 'all' ? `?type=${encodeURIComponent(activeFilter)}` : '';
      const data = await api.get(`/api/customer/notifications${query}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Unable to load notifications');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [activeFilter]);

  const bookingNotifications = useMemo(() => items.filter((x) => x.type === 'booking'), [items]);
  const orderNotifications = useMemo(() => items.filter((x) => x.type === 'order'), [items]);

  const allNotifications = useMemo(() => (
    [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  ), [items]);

  const filteredNotifications = allNotifications.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.type === activeFilter;
  });

  const unreadCount = allNotifications.filter((item) => !item.read).length;

  const markAllRead = async () => {
    try {
      await api.post('/api/customer/notifications/read', {});
      await loadNotifications();
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Unable to mark as read');
    }
  };

  const toggleRead = async (item) => {
    try {
      await api.post(`/api/customer/notifications/${encodeURIComponent(item.id)}/read`, {
        read: !item.read
      });
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, read: !item.read } : x)));
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Unable to update read status');
    }
  };

  return (
    <section className="notification-page">
      <div className="notification-container">
        <div className="notification-head">
          <div className="notification-title-group">
            <h1>Notifications</h1>
            <p>{unreadCount} unread notifications</p>
          </div>
          <button className="mark-read-btn" onClick={markAllRead}>Mark all as read</button>
        </div>

        {error ? <div className="notification-error">{error}</div> : null}

        <div className="notification-filter-tabs">
          <button
            className={`notification-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All ({allNotifications.length})
          </button>
          <button
            className={`notification-filter-btn ${activeFilter === 'booking' ? 'active' : ''}`}
            onClick={() => setActiveFilter('booking')}
          >
            Booking ({bookingNotifications.length})
          </button>
          <button
            className={`notification-filter-btn ${activeFilter === 'order' ? 'active' : ''}`}
            onClick={() => setActiveFilter('order')}
          >
            Orders ({orderNotifications.length})
          </button>
        </div>

        <div className="notification-list">
          {loading ? (
            <div className="notification-empty">
              <IoCubeOutline />
              <p>Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="notification-empty">
              <IoCubeOutline />
              <p>No notifications</p>
            </div>
          ) : (
            filteredNotifications.map((item) => (
              <article
                className={`notification-item ${item.read ? 'read' : 'unread'}`}
                key={item.id}
                onClick={() => toggleRead(item)}
              >
                <div className="notification-item-left">
                  {item.type === 'booking' ? getBookingIcon(item.status) : getOrderIcon()}
                </div>
                <div className="notification-item-content">
                  <div className="notification-item-top">
                    <h3>{item.title}</h3>
                    <span>{formatTime(item.createdAt)}</span>
                  </div>
                  <p>{item.message}</p>
                </div>
                {!item.read && <span className="unread-dot" />}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default NotificationPage;