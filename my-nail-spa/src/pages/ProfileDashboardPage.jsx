import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CalendarCheck, Edit2, Package, Star, Calendar, Clock, CheckCircle } from 'lucide-react'
import api from '../lib/api'

export function ProfileDashboardPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [activeBookingTab, setActiveBookingTab] = useState('upcoming')
  const [stats, setStats] = useState({
    upcoming: 0,
    pending: 0,
    inProgress: 0,
    completed: 0
  })
  const [bookings, setBookings] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfileData()
  }, [])

  async function loadProfileData() {
    try {
      setLoading(true)
      const [statsRes, bookingsRes, ordersRes] = await Promise.all([
        api.getProfileStats().catch(err => {
          console.error('Error loading stats:', err)
          return { upcoming: 0, pending: 0, inProgress: 0, completed: 0 }
        }),
        api.getProfileBookings().catch(err => {
          console.error('Error loading bookings:', err)
          return { items: [] }
        }),
        api.getProfileOrders().catch(err => {
          console.error('Error loading orders:', err)
          return { items: [] }
        })
      ])
      console.log('Stats:', statsRes)
      console.log('Bookings:', bookingsRes)
      console.log('Orders:', ordersRes)
      setStats(statsRes || { upcoming: 0, pending: 0, inProgress: 0, completed: 0 })
      setBookings(Array.isArray(bookingsRes?.items) ? bookingsRes.items : Array.isArray(bookingsRes) ? bookingsRes : [])
      setOrders(Array.isArray(ordersRes?.items) ? ordersRes.items : Array.isArray(ordersRes) ? ordersRes : [])
    } catch (err) {
      console.error('Error loading profile data:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleBookNewService() {
    navigate('/salons')
  }

  function handleEditProfile() {
    navigate('/profile/edit')
  }

  function formatDate(dateString) {
    const date = new Date(dateString)
    return {
      day: date.getDate(),
      month: date.toLocaleDateString('en', { month: 'short' })
    }
  }

  function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  function getStatusBadge(status) {
    const statusMap = {
      confirmed: 'success',
      pending: 'warning',
      completed: 'success',
      cancelled: 'danger',
      processing: 'warning',
      delivered: 'success'
    }
    return statusMap[status?.toLowerCase()] || 'secondary'
  }

  const filteredBookings = bookings.filter(b => {
    if (activeBookingTab === 'upcoming') return ['confirmed', 'pending'].includes(b.status?.toLowerCase())
    if (activeBookingTab === 'past') return ['completed'].includes(b.status?.toLowerCase())
    if (activeBookingTab === 'cancelled') return ['cancelled'].includes(b.status?.toLowerCase())
    return true
  })

  if (loading) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <p>Loading profile...</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#faf8f6', minHeight: '100vh', paddingTop: 80, paddingBottom: 40 }}>
      <div className="container">
        <div className="profileContainer" style={{ maxWidth: 1400, margin: '0 auto' }}>
          {/* Left Section */}
          <div className="profileMainSection">
            {/* Welcome Header */}
            <div className="profileWelcome">
              <div className="profileWelcomeIcon">👋</div>
              <div>
                <h2 className="profileWelcomeTitle">Hello, {auth.user?.name?.split(' ')[0] || 'User'}!</h2>
                <p className="profileWelcomeSubtitle">Here's Your <strong>Booking & Order</strong> Summary</p>
              </div>
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={handleBookNewService}>
                <CalendarCheck size={16} style={{ marginRight: 8 }} />
                Book New Service
              </button>
            </div>

            {/* Stats Cards */}
            <div className="profileStats">
              <div className="profileStatCard profileStatUpcoming">
                <div className="profileStatIcon">
                  <Calendar size={20} />
                </div>
                <div className="profileStatContent">
                  <div className="profileStatTitle">Upcoming Booking</div>
                  <div className="profileStatNumber">{stats.upcoming}</div>
                  <div className="profileStatLabel">appointments</div>
                </div>
                <button className="profileStatButton" onClick={() => setActiveBookingTab('upcoming')}>View all</button>
              </div>

              <div className="profileStatCard profileStatPending">
                <div className="profileStatIcon">
                  <Clock size={20} />
                </div>
                <div className="profileStatContent">
                  <div className="profileStatTitle">Pending</div>
                  <div className="profileStatNumber">{stats.pending}</div>
                  <div className="profileStatLabel">Waiting for confirmation</div>
                </div>
              </div>

              <div className="profileStatCard profileStatProgress">
                <div className="profileStatIcon">
                  <Package size={20} />
                </div>
                <div className="profileStatContent">
                  <div className="profileStatTitle">In Progress</div>
                  <div className="profileStatNumber">{stats.inProgress}</div>
                  <div className="profileStatLabel">Orders processing</div>
                </div>
              </div>

              <div className="profileStatCard profileStatCompleted">
                <div className="profileStatIcon">
                  <CheckCircle size={20} />
                </div>
                <div className="profileStatContent">
                  <div className="profileStatTitle">Completed</div>
                  <div className="profileStatNumber">{stats.completed}</div>
                  <div className="profileStatLabel">Total Bookings</div>
                </div>
              </div>
            </div>

            {/* My Booking Section */}
            <div className="profileSection">
              <div className="profileSectionHeader">
                <h3>My Booking</h3>
                <button className="btn btn-link" onClick={() => navigate('/booking-history')}>View all →</button>
              </div>

              <div className="profileBookingTabs">
                <button 
                  className={`profileBookingTab ${activeBookingTab === 'upcoming' ? 'active' : ''}`}
                  onClick={() => setActiveBookingTab('upcoming')}
                >
                  Upcoming
                </button>
                <button 
                  className={`profileBookingTab ${activeBookingTab === 'past' ? 'active' : ''}`}
                  onClick={() => setActiveBookingTab('past')}
                >
                  Past
                </button>
                <button 
                  className={`profileBookingTab ${activeBookingTab === 'cancelled' ? 'active' : ''}`}
                  onClick={() => setActiveBookingTab('cancelled')}
                >
                  Cancelled
                </button>
              </div>

              <div className="profileBookingList">
                {filteredBookings.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                    No bookings found
                  </div>
                ) : (
                  filteredBookings.map(booking => {
                    const dateInfo = formatDate(booking.bookingDate)
                    return (
                      <div key={booking.id} className="profileBookingItem">
                        <div className="profileBookingDate">
                          <div className="profileBookingDateDay">{dateInfo.day}</div>
                          <div className="profileBookingDateMonth">{dateInfo.month}</div>
                        </div>
                        <div className="profileBookingThumb">
                          <img src={booking.serviceImage || 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=100'} alt={booking.serviceName} />
                        </div>
                        <div className="profileBookingInfo">
                          <div className="profileBookingTime">{formatTime(booking.bookingDate)}</div>
                          <div className="profileBookingService">{booking.serviceName}</div>
                          <div className="profileBookingSalon">📍 {booking.salonName}</div>
                          {booking.rating && (
                            <div className="profileBookingRating">{'⭐'.repeat(booking.rating)}</div>
                          )}
                        </div>
                        <div className="profileBookingStatus">
                          <span className={`badge badge-${getStatusBadge(booking.status)}`}>
                            {booking.status}
                          </span>
                        </div>
                        <div className="profileBookingCustomer">
                          <img src={booking.customerAvatar || 'https://i.pravatar.cc/40?img=1'} alt={booking.customerName} />
                          <span>{booking.customerName || auth.user?.name}</span>
                        </div>
                        <div className="profileBookingActions">
                          <button className="btn btn-sm" onClick={() => navigate(`/booking/${booking.id}`)}>View</button>
                          <button className="btn btn-sm">•••</button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Section - User Card & Order Tracking */}
          <div className="profileSideSection">
            {/* User Profile Card */}
            <div className="profileUserCard">
              <div className="profileUserAvatar">
                <img src={auth.user?.avatar || 'https://i.pravatar.cc/150?img=5'} alt={auth.user?.name || 'User'} />
              </div>
              <h3 className="profileUserName">{auth.user?.name || 'User Name'}</h3>
              <p className="profileUserEmail">{auth.user?.email || 'user@email.com'}</p>
              <button className="btn btn-outline" style={{ width: '100%', marginTop: 16 }} onClick={handleEditProfile}>
                <Edit2 size={16} style={{ marginRight: 8 }} />
                Edit Profile
              </button>

              {/* Stats Tabs */}
              <div className="profileUserStats">
                <div className="profileUserStat">
                  <div className="profileUserStatLabel">Bookings</div>
                  <div className="profileUserStatValue">{bookings.length}</div>
                </div>
                <div className="profileUserStat">
                  <div className="profileUserStatLabel">Reviews</div>
                  <div className="profileUserStatValue">{bookings.filter(b => b.rating).length}</div>
                </div>
                <div className="profileUserStat">
                  <div className="profileUserStatLabel">Orders</div>
                  <div className="profileUserStatValue">{orders.length}</div>
                </div>
              </div>
            </div>

            {/* Order Tracking */}
            <div className="profileSection">
              <div className="profileSectionHeader">
                <h3>Order Tracking</h3>
                <button className="btn btn-link" onClick={() => navigate('/orders')}>View all →</button>
              </div>

              <div className="profileOrderList">
                {orders.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
                    No orders yet
                  </div>
                ) : (
                  orders.slice(0, 5).map(order => (
                    <div key={order.id} className="profileOrderItem">
                      <div className="profileOrderThumb">
                        <img src={order.productImage || 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=60'} alt={order.productName} />
                      </div>
                      <div className="profileOrderInfo">
                        <div className="profileOrderNumber">#{order.orderNumber}</div>
                        <div className="profileOrderDesc">{order.productName}</div>
                        <div className="profileOrderDate">{new Date(order.orderDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                      <span className={`badge badge-${getStatusBadge(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
