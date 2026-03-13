import { useMemo, useState } from 'react';
import {
  IoCalendarOutline,
  IoBagCheckOutline,
  IoCheckmarkDoneCircleOutline,
  IoTimeOutline,
  IoCloseCircleOutline,
  IoCubeOutline
} from 'react-icons/io5';
import {
  mockUsers,
  mockBookings,
  mockBookingServices,
  mockServices,
  mockOrders,
  mockOrderItems,
  mockProducts
} from '../lib/mockData';
import '../styles/NotificationPage.css';

const NotificationPage = () => {
  const currentUserId = mockUsers[0]?.UserId;

  const [activeFilter, setActiveFilter] = useState('all');
  const [readMap, setReadMap] = useState({});

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

  const bookingNotifications = useMemo(() => {
    const userBookings = mockBookings
      .filter((booking) => booking.UserId === currentUserId)
      .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

    return userBookings.map((booking) => {
      const bookingServiceRows = mockBookingServices.filter(
        (bookingService) => bookingService.BookingId === booking.BookingId
      );
      const serviceNames = bookingServiceRows
        .map((bookingService) => mockServices.find((service) => service.ServiceId === bookingService.ServiceId)?.Name)
        .filter(Boolean);

      const statusTextMap = {
        Confirmed: 'Đặt lịch thành công',
        Pending: 'Lịch hẹn đang chờ xác nhận',
        Completed: 'Dịch vụ đã hoàn thành',
        Cancelled: 'Lịch hẹn đã bị hủy'
      };

      const iconMap = {
        Confirmed: <IoCheckmarkDoneCircleOutline className="notification-item-icon booking confirmed" />,
        Pending: <IoTimeOutline className="notification-item-icon booking pending" />,
        Completed: <IoCalendarOutline className="notification-item-icon booking completed" />,
        Cancelled: <IoCloseCircleOutline className="notification-item-icon booking cancelled" />
      };

      return {
        id: `booking-${booking.BookingId}`,
        type: 'booking',
        title: statusTextMap[booking.Status] || 'Cập nhật lịch hẹn',
        message: `Dịch vụ: ${serviceNames.length > 0 ? serviceNames.join(', ') : 'Nail Service'} • Thời gian: ${formatTime(booking.BookingTime)}`,
        createdAt: booking.CreatedAt,
        status: booking.Status,
        icon: iconMap[booking.Status] || <IoCalendarOutline className="notification-item-icon booking" />
      };
    });
  }, [currentUserId]);

  const orderNotifications = useMemo(() => {
    const userOrders = mockOrders
      .filter((order) => order.UserId === currentUserId)
      .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

    return userOrders.map((order) => {
      const orderItems = mockOrderItems.filter((item) => item.OrderId === order.OrderId);
      const productNames = orderItems
        .map((item) => mockProducts.find((product) => product.ProductId === item.ProductId)?.Name)
        .filter(Boolean);

      const itemCount = orderItems.reduce((sum, item) => sum + item.Quantity, 0);

      const statusTextMap = {
        Delivered: 'Đặt hàng thành công',
        Processing: 'Đơn hàng đang xử lý',
        Shipped: 'Đơn hàng đang giao',
        Cancelled: 'Đơn hàng đã hủy'
      };

      return {
        id: `order-${order.OrderId}`,
        type: 'order',
        title: statusTextMap[order.Status] || 'Cập nhật đơn hàng',
        message: `${itemCount} sản phẩm • ${productNames.slice(0, 2).join(', ')}${productNames.length > 2 ? '...' : ''}`,
        createdAt: order.CreatedAt,
        status: order.Status,
        icon: <IoBagCheckOutline className="notification-item-icon order" />
      };
    });
  }, [currentUserId]);

  const allNotifications = useMemo(() => (
    [...bookingNotifications, ...orderNotifications]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  ), [bookingNotifications, orderNotifications]);

  const filteredNotifications = allNotifications.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.type === activeFilter;
  });

  const unreadCount = allNotifications.filter((item) => !readMap[item.id]).length;

  const markAllRead = () => {
    const nextMap = {};
    allNotifications.forEach((item) => {
      nextMap[item.id] = true;
    });
    setReadMap(nextMap);
  };

  const toggleRead = (notificationId) => {
    setReadMap((prev) => ({
      ...prev,
      [notificationId]: !prev[notificationId]
    }));
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
          {filteredNotifications.length === 0 ? (
            <div className="notification-empty">
              <IoCubeOutline />
              <p>No notifications</p>
            </div>
          ) : (
            filteredNotifications.map((item) => (
              <article
                className={`notification-item ${readMap[item.id] ? 'read' : 'unread'}`}
                key={item.id}
                onClick={() => toggleRead(item.id)}
              >
                <div className="notification-item-left">
                  {item.icon}
                </div>
                <div className="notification-item-content">
                  <div className="notification-item-top">
                    <h3>{item.title}</h3>
                    <span>{formatTime(item.createdAt)}</span>
                  </div>
                  <p>{item.message}</p>
                </div>
                {!readMap[item.id] && <span className="unread-dot" />}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default NotificationPage;