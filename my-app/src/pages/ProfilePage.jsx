import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IoAdd,
  IoCalendar,
  IoCall,
  IoCart,
  IoCheckmark,
  IoCheckmarkCircle,
  IoCheckmarkDoneCircle,
  IoClose,
  IoLocationOutline,
  IoLocationSharp,
  IoLockClosed,
  IoMail,
  IoPerson,
  IoStar,
  IoTimeOutline,
  IoTrash,
} from 'react-icons/io5'
import { api, resolveApiImageUrl } from '../lib/api'
import PortalModal from '../components/Layout portal/PortalModal.jsx'
import { notifyAuthMeUpdated } from '../hooks/useAuthMe'
import { useAuthMe } from '../hooks/useAuthMe'
import {
  useCustomerAddresses,
  useCustomerBookings,
  useCustomerOrders,
  useCustomerContext,
} from '../hooks/useCustomerCommerce'
import '../styles/ProfilePage.css'

function mapBookingStatusClass(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('confirm')) return 'status-confirmed'
  if (s.includes('pending')) return 'status-pending'
  if (s.includes('complete')) return 'status-completed'
  if (s.includes('cancel')) return 'status-cancelled'
  return ''
}

function mapOrderStatusClass(status) {
  const normalized = normalizeOrderStatus(status)
  if (normalized === 'Completed') return 'status-delivered'
  if (normalized === 'Shipping') return 'status-shipped'
  if (normalized === 'Cancelled' || normalized === 'Failed') return 'status-cancelled'
  return 'status-processing'
}

function normalizeOrderStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return 'Pending'
  if (s === 'pending') return 'Pending'
  if (s === 'processing') return 'Processing'
  if (s === 'shipping' || s === 'shipped' || s === 'delivering' || s === 'in transit') return 'Shipping'
  if (s === 'completed' || s === 'complete' || s === 'delivered') return 'Completed'
  if (s === 'cancelled' || s === 'cancelled') return 'Cancelled'
  if (s === 'failed') return 'Failed'
  return String(status || '').trim() || 'Pending'
}

function isCStatus(status) {
  // treat 'pending' as cancellable (previously 'C')
  return String(status || '').trim().toLowerCase() === 'pending'
}

const ProfileHeader = ({ user, bookings, orders, onEditProfile, onManageAddresses, reviewsCount }) => {
  const now = new Date()
  const upcomingCount = bookings.filter((b) => {
    const t = new Date(b.BookingTime)
    return (String(b.Status || '').toLowerCase().includes('confirm') || String(b.Status || '').toLowerCase().includes('pending')) && t > now
  }).length

  const pendingCount = bookings.filter((b) => String(b.Status || '').toLowerCase().includes('pending')).length
  const inProgressCount = bookings.filter((b) => String(b.Status || '').toLowerCase().includes('progress')).length
  const completedCount = bookings.filter((b) => String(b.Status || '').toLowerCase().includes('complete')).length
  // Use provided reviewsCount (from API) when available; otherwise fall back to completed bookings
  const reviewsValue = Number(reviewsCount ?? completedCount)

  const avatarBaseSrc = resolveApiImageUrl(user?.avatarUrl)
  const avatarSrc = avatarBaseSrc
    ? `${avatarBaseSrc}${avatarBaseSrc.includes('?') ? '&' : '?'}v=${user?._avatarVersion || 1}`
    : '/Profiles/1.jpg'

  return (
    <section className="profile-header">
      <div className="profile-container">
        <div className="profile-left-card">
          <div className="profile-greeting">
            <IoPerson className="greeting-icon" />
            <h2>Hello, {String(user?.name || user?.Name || 'Customer').split(' ')[0]}!</h2>
          </div>
          <h3 className="profile-subtitle">Here is your booking and order summary</h3>

          <div className="summary-grid">
            <div className="summary-card upcoming">
              <div className="summary-icon"><IoCalendar /></div>
              <div className="summary-content"><h4>{upcomingCount}</h4><p>Upcoming Booking</p><span className="summary-subtitle">appointments</span></div>
            </div>
            <div className="summary-card pending">
              <div className="summary-icon"><IoTimeOutline /></div>
              <div className="summary-content"><h4>{pendingCount}</h4><p>Pending</p><span className="summary-subtitle">Waiting for confirmation</span></div>
            </div>
            <div className="summary-card in-progress">
              <div className="summary-icon"><IoCheckmarkCircle /></div>
              <div className="summary-content"><h4>{inProgressCount}</h4><p>In Progress</p><span className="summary-subtitle">Current services</span></div>
            </div>
            <div className="summary-card completed">
              <div className="summary-icon"><IoCheckmarkDoneCircle /></div>
              <div className="summary-content"><h4>{completedCount}</h4><p>Completed</p><span className="summary-subtitle">Total Bookings</span></div>
            </div>
          </div>
        </div>

        <div className="user-profile-card">
          <div className="user-avatar"><img src={avatarSrc} alt={user?.name || user?.Name || 'Customer'} /></div>
          <h4 className="user-name">{user?.name || user?.Name || '-'}</h4>
          <p className="user-email">{user?.email || user?.Email || '-'}</p>

          <div className="profile-buttons">
            <button className="edit-profile-btn" onClick={onEditProfile}><IoPerson /> Edit Profile</button>
            <button className="address-btn" onClick={onManageAddresses}><IoLocationSharp /> Address</button>
          </div>

          <div className="user-stats">
            <div className="user-stat-item"><p className="stat-label">Bookings</p><h5 className="stat-value">{bookings.length}</h5></div>
            <div className="user-stat-item"><p className="stat-label">Reviews</p><h5 className="stat-value">{reviewsValue}</h5></div>
            <div className="user-stat-item"><p className="stat-label">Orders</p><h5 className="stat-value">{orders.length}</h5></div>
          </div>
        </div>
      </div>
    </section>
  )
}

const MyBookingSection = ({ bookings, onCancelBooking, onRateBooking, cancellingBookingId, initialTab = 'All' }) => {
  const [activeTab, setActiveTab] = useState(initialTab)
  const navigate = useNavigate()

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const status = String(booking.Status || '').toLowerCase()
      if (activeTab === 'All') return true
      if (activeTab === 'Completed') return status.includes('complete') || status.includes('done')
      if (activeTab === 'Pending') return status.includes('pending') || status.includes('wait')
      if (activeTab === 'Booked') return status.includes('book') || status.includes('confirm')
      if (activeTab === 'Cancelled') return status.includes('cancel')
      return true
    })
  }, [bookings, activeTab])

  const isCompleted = (status) => {
    const s = String(status || '').toLowerCase()
    return s.includes('complete') || s.includes('done')
  }

  return (
    <section className="my-booking-section">
      <div className="section-container">
        <div className="section-header-row">
          <h2 className="section-title">My Booking</h2>
          <button className="view-all-btn" onClick={() => navigate('/bookings')}>
            View Booking History
          </button>
        </div>

        <div className="booking-tabs">
          <button className={`tab-btn ${activeTab === 'All' ? 'active' : ''}`} onClick={() => setActiveTab('All')}>All Service Booking</button>
          <button className={`tab-btn ${activeTab === 'Completed' ? 'active' : ''}`} onClick={() => setActiveTab('Completed')}>Completed</button>
          <button className={`tab-btn ${activeTab === 'Pending' ? 'active' : ''}`} onClick={() => setActiveTab('Pending')}>Pending</button>
          <button className={`tab-btn ${activeTab === 'Booked' ? 'active' : ''}`} onClick={() => setActiveTab('Booked')}>Booked</button>
          <button className={`tab-btn ${activeTab === 'Cancelled' ? 'active' : ''}`} onClick={() => setActiveTab('Cancelled')}>Cancelled</button>
        </div>

        <div className="booking-list">
          {filteredBookings.length === 0 ? (
            <div className="empty-state"><p>No {activeTab.toLowerCase()} bookings</p></div>
          ) : (
            filteredBookings.map((booking) => {
              const firstService = booking.Services?.[0]
              const date = new Date(booking.BookingTime)
              return (
                <div key={booking.BookingId} className="booking-card">
                  <div className="booking-date">
                    <span className="date-day">{date.getDate()}</span>
                    <span className="date-month">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                  </div>
                  <div className="booking-image">
                    {firstService?.ImageUrl ? <img src={resolveApiImageUrl(firstService.ImageUrl)} alt={firstService.ServiceName || 'Service'} /> : <img src="/OurServices/Manicure.jpg" alt="Service" />}
                  </div>
                  <div className="booking-details">
                    <h3 className="booking-service-name">{(booking.Services || []).map((s) => s.ServiceName).filter(Boolean).join(', ') || booking.BookingId}</h3>
                    <p className="booking-location"><IoLocationOutline /> NIOM&CE</p>
                    <div className="booking-rating">{[1, 2, 3, 4, 5].map((i) => <IoStar key={i} className="star" />)}</div>
                  </div>
                  <div className="booking-info">
                    <span className={`booking-status ${mapBookingStatusClass(booking.Status)}`}><IoCheckmarkCircle /> {booking.Status}</span>
                    <p className="booking-time">{date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className="booking-action-buttons">
                      {isCompleted(booking.Status) ? (
                        <button
                          className="action-btn rate"
                          onClick={() => onRateBooking?.(booking)}
                        >
                          Rate Service
                        </button>
                      ) : isCStatus(booking.Status) ? (
                        <button
                          className="action-btn cancel"
                          onClick={() => onCancelBooking?.(booking)}
                          disabled={cancellingBookingId === booking.BookingId}
                        >
                          {cancellingBookingId === booking.BookingId ? 'Cancelling...' : 'Cancel Booking'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}

const OrderTrackingSection = ({ orders, onCancelOrder, cancellingOrderId }) => {
  const navigate = useNavigate()
  const [activeOrderTab, setActiveOrderTab] = useState('All')

  const filteredOrders = useMemo(() => {
    if (activeOrderTab === 'All') return orders

    return orders.filter((order) => normalizeOrderStatus(order.Status) === activeOrderTab)
  }, [orders, activeOrderTab])

  return (
    <section className="order-tracking-section">
      <div className="section-container">
        <div className="section-header-row">
          <h2 className="section-title">Order Tracking</h2>
          <button className="view-all-btn" onClick={() => navigate('/orders')}>View Order History</button>
        </div>

        <div className="order-status-tabs" role="tablist" aria-label="Order status filter">
          <button type="button" className={`tab-btn ${activeOrderTab === 'All' ? 'active' : ''}`} onClick={() => setActiveOrderTab('All')}>All</button>
          <button type="button" className={`tab-btn ${activeOrderTab === 'Pending' ? 'active' : ''}`} onClick={() => setActiveOrderTab('Pending')}>Pending</button>
          <button type="button" className={`tab-btn ${activeOrderTab === 'Processing' ? 'active' : ''}`} onClick={() => setActiveOrderTab('Processing')}>Processing</button>
          <button type="button" className={`tab-btn ${activeOrderTab === 'Shipping' ? 'active' : ''}`} onClick={() => setActiveOrderTab('Shipping')}>Shipping</button>
          <button type="button" className={`tab-btn ${activeOrderTab === 'Completed' ? 'active' : ''}`} onClick={() => setActiveOrderTab('Completed')}>Completed</button>
          <button type="button" className={`tab-btn ${activeOrderTab === 'Cancelled' ? 'active' : ''}`} onClick={() => setActiveOrderTab('Cancelled')}>Cancelled</button>
          <button type="button" className={`tab-btn ${activeOrderTab === 'Failed' ? 'active' : ''}`} onClick={() => setActiveOrderTab('Failed')}>Failed</button>
        </div>

        <div className="order-list">
          {filteredOrders.length === 0 ? (
            <div className="empty-state"><p>No orders yet</p></div>
          ) : (
            filteredOrders.map((order) => {
              const firstItem = order.Items?.[0]
              return (
                <div key={order.OrderId} className="order-card">
                  <div className="order-image">
                    {firstItem?.ImageUrl ? <img src={resolveApiImageUrl(firstItem.ImageUrl)} alt={firstItem.ProductName || order.OrderId} /> : <img src="/Products/1.jpg" alt="Product" />}
                  </div>

                  <div className="order-details">
                    <h3 className="order-id">#{order.OrderId}</h3>
                    <p className="order-items">{(order.Items || []).map((item) => `${item.ProductName} x ${item.Quantity}`).join(', ')}</p>
                    <p className="order-items">Payment: {order.PaymentStatus}</p>
                  </div>

                  <div className="order-status">
                    <span className={`status-badge ${mapOrderStatusClass(order.Status)}`}><IoCheckmarkCircle /> {normalizeOrderStatus(order.Status)}</span>
                    <p className="order-date">{new Date(order.CreatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    {isCStatus(order.Status) ? (
                      <button
                        className="action-btn cancel"
                        onClick={() => onCancelOrder?.(order)}
                        disabled={cancellingOrderId === order.OrderId}
                      >
                        {cancellingOrderId === order.OrderId ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}

const EditProfileModal = ({ user, isOpen, onClose, onSave, saving }) => {
  const [formData, setFormData] = useState(() => ({
    name: user?.name || user?.Name || '',
    email: user?.email || user?.Email || '',
    phone: user?.phone || user?.Phone || '',
    avatarUrl: user?.avatarUrl || user?.AvatarUrl || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    avatarDataUrl: '',
    avatarFileName: '',
  }))

  if (!isOpen) return null

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const isSupported = /^image\/(png|jpeg|jpg)$/i.test(file.type)
    if (!isSupported) {
      alert('Only PNG/JPG images are supported')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Avatar file is too large (max 2MB)')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl) return
      setFormData((prev) => ({
        ...prev,
        avatarDataUrl: dataUrl,
        avatarFileName: file.name,
      }))
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button className="close-btn" onClick={onClose}><IoClose /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="name"><IoPerson /> Full Name</label>
            <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label htmlFor="email"><IoMail /> Email</label>
            <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label htmlFor="phone"><IoCall /> Phone Number</label>
            <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label htmlFor="avatarUrl"><IoPerson /> Avatar URL</label>
            <input type="text" id="avatarUrl" name="avatarUrl" value={formData.avatarUrl} onChange={handleChange} placeholder="https://... or /uploads/avatars/..." />
            <div className="avatar-upload-row">
              <label className="btn-upload-avatar" htmlFor="avatarFileInput">Coose image from device</label>
              <input id="avatarFileInput" type="file" accept="image/png,image/jpeg" onChange={handleAvatarFileChange} className="avatar-file-input" />
              {formData.avatarFileName ? <span className="avatar-upload-name">{formData.avatarFileName}</span> : null}
            </div>
            {formData.avatarDataUrl ? (
              <div className="avatar-preview-box">
                <img src={formData.avatarDataUrl} alt="Avatar preview" />
              </div>
            ) : null}
          </div>

          <div className="form-group">
            <label htmlFor="currentPassword"><IoLockClosed /> Current Password</label>
            <input type="password" id="currentPassword" name="currentPassword" value={formData.currentPassword} onChange={handleChange} placeholder="Enter current password" />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword"><IoLockClosed /> New Password</label>
            <input type="password" id="newPassword" name="newPassword" value={formData.newPassword} onChange={handleChange} placeholder="Enter new password" />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword"><IoLockClosed /> Confirm New Password</label>
            <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm new password" />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const AddressesModal = ({
  addresses,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onSetDefault,
  saving,
}) => {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    addressLine: '',
    city: '',
    country: '',
    isDefault: false,
  })

  if (!isOpen) return null

  const resetForm = () => {
    setFormData({ fullName: '', phoneNumber: '', addressLine: '', city: '', country: '', isDefault: false })
    setShowAddForm(false)
    setEditingId(null)
  }

  const handleEdit = (address) => {
    setFormData({
      fullName: address.FullName || '',
      phoneNumber: address.PhoneNumber || '',
      addressLine: address.AddressLine || '',
      city: address.City || '',
      country: address.Country || '',
      isDefault: Boolean(address.IsDefault),
    })
    setEditingId(address.AddressId)
    setShowAddForm(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData, editingId)
    resetForm()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-address" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>My Addresses</h2>
          <button className="close-btn" onClick={onClose}><IoClose /></button>
        </div>

        <div className="modal-form">
          {!showAddForm ? (
            <>
              <button className="btn-add-address" onClick={() => setShowAddForm(true)}>
                <IoAdd /> Add New Address
              </button>

              <div className="addresses-list">
                {addresses.map((address) => (
                  <div key={address.AddressId} className={`address-item ${address.IsDefault ? 'default' : ''}`}>
                    <div className="address-header">
                      <div className="address-label-row">
                        <span className="address-label">{address.FullName}</span>
                        {address.IsDefault ? (
                          <span className="default-badge"><IoCheckmark /> Default</span>
                        ) : null}
                      </div>
                      <div className="address-actions">
                        <button onClick={() => handleEdit(address)} className="btn-text">Edit</button>
                        {!address.IsDefault ? (
                          <button onClick={() => onDelete(address.AddressId)} className="btn-text danger"><IoTrash /> Delete</button>
                        ) : null}
                      </div>
                    </div>
                    <div className="address-details">
                      <p className="address-name">{address.FullName} | {address.PhoneNumber}</p>
                      <p className="address-full">{address.AddressLine}</p>
                      <p className="address-location">{address.City}, {address.Country}</p>
                    </div>
                    {!address.IsDefault ? (
                      <button onClick={() => onSetDefault(address.AddressId)} className="btn-set-default" disabled={saving}>
                        Set as Default
                      </button>
                    ) : null}
                  </div>
                ))}
                {addresses.length === 0 ? <div className="empty-state"><p>No addresses yet</p></div> : null}
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="address-form">
              <h3>{editingId ? 'Edit Address' : 'New Address'}</h3>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fullName">Full Name *</label>
                  <input type="text" id="fullName" name="fullName" value={formData.fullName} onChange={(e) => setFormData((p) => ({ ...p, fullName: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label htmlFor="phoneNumber">Phone Number *</label>
                  <input type="tel" id="phoneNumber" name="phoneNumber" value={formData.phoneNumber} onChange={(e) => setFormData((p) => ({ ...p, phoneNumber: e.target.value }))} required />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="addressLine">Street Address *</label>
                <input type="text" id="addressLine" name="addressLine" value={formData.addressLine} onChange={(e) => setFormData((p) => ({ ...p, addressLine: e.target.value }))} required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="city">City *</label>
                  <input type="text" id="city" name="city" value={formData.city} onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label htmlFor="country">Country *</label>
                  <input type="text" id="country" name="country" value={formData.country} onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))} required />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="isDefault">
                  <input type="checkbox" id="isDefault" checked={formData.isDefault} onChange={(e) => setFormData((p) => ({ ...p, isDefault: e.target.checked }))} /> Set as default
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Saving...' : (editingId ? 'Update' : 'Add')}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const ProfilePage = () => {
  const { me: authMe } = useAuthMe()
  const { context, loading: contextLoading, error: contextError, refresh: refreshContext } = useCustomerContext()
  const {
    bookings,
    loading: bookingsLoading,
    error: bookingsError,
    cancelBooking,
  } = useCustomerBookings(100)
  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    cancelOrder,
  } = useCustomerOrders(100)
  const {
    addresses,
    loading: addressesLoading,
    error: addressesError,
    busy: addressesBusy,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
  } = useCustomerAddresses()

  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [cancelBookingConfirmOpen, setCancelBookingConfirmOpen] = useState(false)
  const [bookingToCancel, setBookingToCancel] = useState(null)
  const [cancelOrderConfirmOpen, setCancelOrderConfirmOpen] = useState(false)
  const [orderToCancel, setOrderToCancel] = useState(null)
  const [ratingModalOpen, setRatingModalOpen] = useState(false)
  const [bookingToRate, setBookingToRate] = useState(null)
  const [rating, setRating] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [me, setMe] = useState(null)
  const [userReviewsCount, setUserReviewsCount] = useState(null)
  const [cancellingBookingId, setCancellingBookingId] = useState('')
  const [cancellingOrderId, setCancellingOrderId] = useState('')
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [resultMessage, setResultMessage] = useState('')
  const [resultTitle, setResultTitle] = useState('')
  const user = me || authMe || context?.user || null
  const bookingTabFromUrl = (() => {
    const query = new URLSearchParams(window.location.search)
    const tab = String(query.get('bookingTab') || '').trim().toLowerCase()
    if (tab === 'past') return 'Past'
    if (tab === 'cancelled') return 'Cancelled'
    if (tab === 'all') return 'All'
    return 'All'
  })()

  useEffect(() => {
    let cancelled = false
    const loadMyReviews = async () => {
      try {
        if (!user) return
        const data = await api.get('/api/homepage/reviews/me')
        if (cancelled) return
        // api returns array of reviews as data
        setUserReviewsCount(Array.isArray(data) ? data.length : 0)
      } catch  {
        if (!cancelled) setUserReviewsCount(0)
      }
    }
    loadMyReviews()
    return () => { cancelled = true }
  }, [user])

  const loading = contextLoading || bookingsLoading || ordersLoading || addressesLoading
  const error = contextError || bookingsError || ordersError || addressesError

  const handleSaveProfile = async (profileData) => {
    try {
      setSavingProfile(true)

      if (profileData.newPassword || profileData.confirmPassword || profileData.currentPassword) {
        if (!profileData.currentPassword || !profileData.newPassword) {
          alert('Please provide current and new password')
          return
        }
        if (profileData.newPassword !== profileData.confirmPassword) {
          alert('Confirm password does not match')
          return
        }
      }

      let avatarUrl = profileData.avatarUrl
      if (profileData.avatarDataUrl) {
        const avatarRes = await api.post('/api/auth/me/avatar', {
          dataUrl: profileData.avatarDataUrl,
        })
        avatarUrl = avatarRes?.avatarUrl || avatarRes?.AvatarUrl || avatarUrl
      }

      const updatedMe = await api.put('/api/auth/me', {
        name: profileData.name,
        email: profileData.email,
        phone: profileData.phone,
        avatarUrl,
      })

      if (profileData.newPassword) {
        await api.put('/api/auth/me/password', {
          currentPassword: profileData.currentPassword,
          newPassword: profileData.newPassword,
        })
      }

      const nextMe = { ...updatedMe, _avatarVersion: Date.now() }
      setMe(nextMe)
      notifyAuthMeUpdated(nextMe)
      await refreshContext().catch(() => {})
      setShowEditModal(false)
      alert('Profile updated successfully!')
    } catch (err) {
      alert(err?.message || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSaveAddress = async (addressData, editingId) => {
    try {
      if (editingId) {
        await updateAddress(editingId, addressData)
      } else {
        await createAddress(addressData)
      }
      await refreshContext().catch(() => {})
    } catch (err) {
      alert(err?.message || 'Failed to save address')
    }
  }

  const handleDeleteAddress = async (id) => {
    if (!window.confirm('Are you sure you want to delete this address?')) return
    try {
      await deleteAddress(id)
      await refreshContext().catch(() => {})
    } catch (err) {
      alert(err?.message || 'Failed to delete address')
    }
  }

  const handleSetDefault = async (id) => {
    try {
      await setDefaultAddress(id)
      await refreshContext().catch(() => {})
    } catch (err) {
      alert(err?.message || 'Failed to set default address')
    }
  }

  const handleCancelBooking = async (booking) => {
    if (!booking?.BookingId) return
    if (!isCStatus(booking?.Status)) {
      alert('Only pending bookings can be cancelled')
      return
    }
    setBookingToCancel(booking)
    setCancelBookingConfirmOpen(true)
  }

  const confirmCancelBooking = async () => {
    if (!bookingToCancel?.BookingId) return
    const bookingId = bookingToCancel.BookingId
    try {
      setCancellingBookingId(bookingId)
      await cancelBooking(bookingId)
      setCancelBookingConfirmOpen(false)
      setBookingToCancel(null)
    } catch (err) {
      alert(err?.message || 'Failed to cancel booking')
    } finally {
      setCancellingBookingId('')
    }
  }

  const cancelCancelBooking = () => {
    setCancelBookingConfirmOpen(false)
    setBookingToCancel(null)
  }

  const handleCancelOrder = async (order) => {
    if (!order?.OrderId) return
    if (!isCStatus(order?.Status)) {
      alert('Only pending orders can be cancelled')
      return
    }
    setOrderToCancel(order)
    setCancelOrderConfirmOpen(true)
  }

  const confirmCancelOrder = async () => {
    if (!orderToCancel?.OrderId) return
    const orderId = orderToCancel.OrderId
    try {
      setCancellingOrderId(orderId)
      await cancelOrder(orderId)
      setCancelOrderConfirmOpen(false)
      setOrderToCancel(null)
    } catch (err) {
      alert(err?.message || 'Failed to cancel order')
    } finally {
      setCancellingOrderId('')
    }
  }

  const cancelCancelOrder = () => {
    setCancelOrderConfirmOpen(false)
    setOrderToCancel(null)
  }

  const openRatingModal = (booking) => {
    setBookingToRate(booking)
    setRating(5)
    setRatingComment('')
    setRatingModalOpen(true)
  }

  const closeRatingModal = () => {
    setRatingModalOpen(false)
    setBookingToRate(null)
    setRating(5)
    setRatingComment('')
  }

  const submitRating = async () => {
    if (!bookingToRate?.BookingId) return
    try {
      setSubmittingRating(true)
      const payload = {
        bookingId: bookingToRate.BookingId,
        rating: Number(rating),
        comment: ratingComment.trim(),
      }
      await api.post('/api/customer/bookings/rating', payload)
      closeRatingModal()
      setResultTitle('Successfully!')
      setResultMessage('Thank you for your review!')
      setResultModalOpen(true)
    } catch (err) {
      setResultTitle('Error')
      setResultMessage(err?.message || 'Failed to submit rating')
      setResultModalOpen(true)
    } finally {
      setSubmittingRating(false)
    }
  }

  if (loading) return <div className="loading">Loading profile...</div>
  if (error) return <div className="error">{error}</div>
  if (!user) return <div className="error">User not found</div>

  return (
    <div className="profile-page">
      <ProfileHeader
        user={user}
        bookings={bookings}
        orders={orders}
        onEditProfile={() => setShowEditModal(true)}
        onManageAddresses={() => setShowAddressModal(true)}
        reviewsCount={userReviewsCount}
      />

      <div className="profile-content">
        <div className="left-column">
          <MyBookingSection
            bookings={bookings}
            onCancelBooking={handleCancelBooking}
            onRateBooking={openRatingModal}
            cancellingBookingId={cancellingBookingId}
            initialTab={bookingTabFromUrl}
          />
        </div>
        <div className="right-column">
          <OrderTrackingSection
            orders={orders}
            onCancelOrder={handleCancelOrder}
            cancellingOrderId={cancellingOrderId}
          />
        </div>
      </div>

      <EditProfileModal
        key={`${showEditModal}-${user?.userId || user?.UserId || 'user'}`}
        user={user}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveProfile}
        saving={savingProfile}
      />

      <AddressesModal
        addresses={addresses}
        isOpen={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        onSave={handleSaveAddress}
        onDelete={handleDeleteAddress}
        onSetDefault={handleSetDefault}
        saving={addressesBusy}
      />

      <PortalModal
        open={cancelBookingConfirmOpen}
        title="Cancel Booking"
        onClose={cancelCancelBooking}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={cancelCancelBooking}>
              Back
            </button>
            <button 
              type="button" 
              className="portal-modalBtn portal-modalBtnPrimary" 
              onClick={confirmCancelBooking}
              disabled={cancellingBookingId === bookingToCancel?.BookingId}
              style={{ backgroundColor: cancellingBookingId === bookingToCancel?.BookingId ? '#ccc' : '#e74c3c' }}
            >
              {cancellingBookingId === bookingToCancel?.BookingId ? 'Cancelling...' : 'Cancel Booking'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '15px', color: '#1f2937', marginBottom: '12px', lineHeight: '1.5', fontWeight: '500' }}>
          Are you sure you want to cancel this booking?
        </p>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0' }}>
          This action cannot be undone.
        </p>
      </PortalModal>

      <PortalModal
        open={cancelOrderConfirmOpen}
        title="Cancel Order"
        onClose={cancelCancelOrder}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={cancelCancelOrder}>
              Back
            </button>
            <button 
              type="button" 
              className="portal-modalBtn portal-modalBtnPrimary" 
              onClick={confirmCancelOrder}
              disabled={cancellingOrderId === orderToCancel?.OrderId}
              style={{ backgroundColor: cancellingOrderId === orderToCancel?.OrderId ? '#ccc' : '#e74c3c' }}
            >
              {cancellingOrderId === orderToCancel?.OrderId ? 'Cancelling...' : 'Cancel Order'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '15px', color: '#1f2937', marginBottom: '12px', lineHeight: '1.5', fontWeight: '500' }}>
          Are you sure you want to cancel this order?
        </p>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0' }}>
          This action cannot be undone.
        </p>
      </PortalModal>

      <PortalModal
        open={ratingModalOpen}
        title="Rate Service"
        onClose={closeRatingModal}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeRatingModal}>
              Cancel
            </button>
            <button 
              type="button" 
              className="portal-modalBtn portal-modalBtnPrimary" 
              onClick={submitRating}
              disabled={submittingRating}
            >
              {submittingRating ? 'Submitting...' : 'Submit Review'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Your Rating
            </label>
            <div style={{ display: 'flex', gap: '8px', fontSize: '28px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setRating(star)}
                  style={{
                    cursor: 'pointer',
                    color: star <= rating ? '#fbbf24' : '#d1d5db',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Your Comment (Optional)
            </label>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Share your experience with this service..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        </div>
      </PortalModal>

      <PortalModal
        open={resultModalOpen}
        title={resultTitle}
        onClose={() => setResultModalOpen(false)}
      >
        <p style={{ 
          fontSize: '15px', 
          color: '#1f2937', 
          marginBottom: '12px', 
          lineHeight: '1.6',
          fontWeight: '500'
        }}>
          {resultMessage}
        </p>
      </PortalModal>
    </div>
  )
}

export default ProfilePage
