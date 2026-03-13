import { useState } from 'react';
import { 
  IoPerson, 
  IoMail, 
  IoCall, 
  IoCalendar,
  IoStar,
  IoCart,
  IoClose,
  IoCheckmarkCircle,
  IoLocationOutline,
  IoTimeOutline,
  IoCheckmarkDoneCircle,
  IoLockClosed,
  IoLocationSharp,
  IoAdd,
  IoTrash,
  IoCheckmark
} from 'react-icons/io5';
import {
  mockUsers,
  mockBookings,
  mockBookingServices,
  mockServices,
  mockOrders,
  mockOrderItems,
  mockProducts,
  mockProfileAddresses
} from '../lib/mockData';
import '../styles/ProfilePage.css';

const ProfileHeader = ({ user, onEditProfile, onManageAddresses }) => {
  const userBookings = mockBookings.filter(b => b.UserId === user.UserId);
  const userOrders = mockOrders.filter(o => o.UserId === user.UserId);
  
  const reviewsCount = userBookings.filter(b => b.Status === 'Completed').length;
  
  const now = new Date();
  const upcomingCount = userBookings.filter(b => {
    const bookingTime = new Date(b.BookingTime);
    return b.Status === 'Confirmed' && bookingTime > now;
  }).length;
  
  const pendingCount = userBookings.filter(b => b.Status === 'Pending').length;
  
  const inProgressCount = userBookings.filter(b => {
    const bookingTime = new Date(b.BookingTime);
    return b.Status === 'Confirmed' && bookingTime <= now && bookingTime > new Date(now.getTime() - 2 * 60 * 60 * 1000);
  }).length;
  
  const completedCount = userBookings.filter(b => b.Status === 'Completed').length;

  return (
    <section className="profile-header">
      <div className="profile-container">
        <div className="profile-left-card">
          <div className="profile-greeting">
            <IoPerson className="greeting-icon" />
            <h2>Hello, {user.Name.split(' ')[0]}!</h2>
          </div>
          <h3 className="profile-subtitle">Here's Your Booking & Order Summary</h3>
          
          <div className="summary-grid">
            <div className="summary-card upcoming">
              <div className="summary-icon">
                <IoCalendar />
              </div>
              <div className="summary-content">
                <h4>{upcomingCount}</h4>
                <p>Upcoming Booking</p>
                <span className="summary-subtitle">appointments</span>
              </div>
              <button className="view-all-link">View all</button>
            </div>
            
            <div className="summary-card pending">
              <div className="summary-icon">
                <IoTimeOutline />
              </div>
              <div className="summary-content">
                <h4>{pendingCount}</h4>
                <p>Pending</p>
                <span className="summary-subtitle">Waiting for confirmation</span>
              </div>
            </div>
            
            <div className="summary-card in-progress">
              <div className="summary-icon">
                <IoCheckmarkCircle />
              </div>
              <div className="summary-content">
                <h4>{inProgressCount}</h4>
                <p>In Progress</p>
                <span className="summary-subtitle">Waiting for confirmation</span>
              </div>
            </div>
            
            <div className="summary-card completed">
              <div className="summary-icon">
                <IoCheckmarkDoneCircle />
              </div>
              <div className="summary-content">
                <h4>{completedCount}</h4>
                <p>Completed</p>
                <span className="summary-subtitle">Total Bookings</span>
              </div>
            </div>
          </div>
        </div>
          <div className="user-profile-card">
            <div className="user-avatar">
              <img src="/public/Profiles/1.jpg" alt={user.Name} />
            </div>
            
            <h4 className="user-name">{user.Name}</h4>
            <p className="user-email">{user.Email}</p>
            
            <div className="profile-buttons">
              <button className="edit-profile-btn" onClick={onEditProfile}>
                <IoPerson /> Edit Profile
              </button>
              <button className="address-btn" onClick={onManageAddresses}>
                <IoLocationSharp /> Address
              </button>
            </div>
            
            <div className="user-stats">
              <div className="user-stat-item">
                <p className="stat-label">Bookings</p>
                <h5 className="stat-value">{userBookings.length}</h5>
              </div>
              
              <div className="user-stat-item">
                <p className="stat-label">Reviews</p>
                <h5 className="stat-value">{reviewsCount}</h5>
              </div>
              
              <div className="user-stat-item">
                <p className="stat-label">Orders</p>
                <h5 className="stat-value">{userOrders.length}</h5>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
};



const MyBookingSection = ({ userId }) => {
  const [activeTab, setActiveTab] = useState('Upcoming');
  
  const userBookings = mockBookings.filter(b => b.UserId === userId);
  
  const filteredBookings = userBookings.filter(booking => {
    const now = new Date();
    const bookingTime = new Date(booking.BookingTime);
    
    if (activeTab === 'Upcoming') {
      return booking.Status === 'Confirmed' && bookingTime > now;
    } else if (activeTab === 'Past') {
      return booking.Status === 'Completed' || (booking.Status === 'Confirmed' && bookingTime < now);
    } else if (activeTab === 'Cancelled') {
      return booking.Status === 'Cancelled';
    }
    return false;
  });

  const getBookingServices = (bookingId) => {
    const bookingServiceIds = mockBookingServices.filter(bs => bs.BookingId === bookingId);
    return bookingServiceIds.map(bs => {
      const service = mockServices.find(s => s.ServiceId === bs.ServiceId);
      return { ...service, price: bs.Price };
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'Confirmed': return 'status-confirmed';
      case 'Pending': return 'status-pending';
      case 'Completed': return 'status-completed';
      case 'Cancelled': return 'status-cancelled';
      default: return '';
    }
  };

  return (
    <section className="my-booking-section">
      <div className="section-container">
        <div className="section-header-row">
          <h2 className="section-title">My Booking</h2>
        </div>
        
        <div className="booking-tabs">
          <button 
            className={`tab-btn ${activeTab === 'Upcoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('Upcoming')}
          >
            Upcoming
          </button>
          <button 
            className={`tab-btn ${activeTab === 'Past' ? 'active' : ''}`}
            onClick={() => setActiveTab('Past')}
          >
            Past
          </button>
          <button 
            className={`tab-btn ${activeTab === 'Cancelled' ? 'active' : ''}`}
            onClick={() => setActiveTab('Cancelled')}
          >
            Cancelled
          </button>
        </div>
        
        <div className="booking-list">
          {filteredBookings.length === 0 ? (
            <div className="empty-state">
              <p>No {activeTab.toLowerCase()} bookings</p>
            </div>
          ) : (
            filteredBookings.map(booking => {
              const services = getBookingServices(booking.BookingId);
              
              return (
                <div key={booking.BookingId} className="booking-card">
                  <div className="booking-date">
                    <span className="date-day">{formatDate(booking.BookingTime).split(' ')[1]}</span>
                    <span className="date-month">{formatDate(booking.BookingTime).split(' ')[0]}</span>
                  </div>
                  
                  <div className="booking-image">
                    {services[0] && (
                      <img src={services[0].ImageUrl} alt={services[0].Name} />
                    )}
                  </div>
                  
                  <div className="booking-details">
                    <h3 className="booking-service-name">
                      {services.map(s => s.Name).join(', ')}
                    </h3>
                    <p className="booking-location">
                      <IoLocationOutline /> Hanover Nail
                    </p>
                    <div className="booking-rating">
                      {[1,2,3,4,5].map(star => (
                        <IoStar key={star} className="star" />
                      ))}
                    </div>
                  </div>
                  
                  <div className="booking-info">
                    <span className={`booking-status ${getStatusClass(booking.Status)}`}>
                      <IoCheckmarkCircle /> {booking.Status}
                    </span>
                    <p className="booking-time">{formatTime(booking.BookingTime)}</p>
                  </div>
                  
                  <div className="booking-user">
                    <img src="/public/Profiles/2.jpg" alt="Anna Kim" />
                    <span>Anna Kim</span>
                  </div>
                  
                  <div className="booking-actions">
                    {activeTab === 'Upcoming' && booking.Status === 'Confirmed' && (
                      <button className="action-btn reschedule">Reschedule</button>
                    )}
                    {activeTab === 'Past' && (
                      <button className="action-btn review">
                        <IoStar /> Review
                      </button>
                    )}
                    <button className="action-btn-icon">⋮</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};

const OrderTrackingSection = ({ userId }) => {
  const userOrders = mockOrders
    .filter(o => o.UserId === userId)
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  
  const getOrderItems = (orderId) => {
    const items = mockOrderItems.filter(oi => oi.OrderId === orderId);
    return items.map(item => {
      const product = mockProducts.find(p => p.ProductId === item.ProductId);
      return { ...item, product };
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'Delivered': return 'status-delivered';
      case 'Processing': return 'status-processing';
      case 'Shipped': return 'status-shipped';
      default: return '';
    }
  };

  return (
    <section className="order-tracking-section">
      <div className="section-container">
        <div className="section-header-row">
          <h2 className="section-title">Order Tracking</h2>
        </div>
        
        <div className="order-list">
          {userOrders.length === 0 ? (
            <div className="empty-state">
              <p>No orders yet</p>
            </div>
          ) : (
            userOrders.map(order => {
              const items = getOrderItems(order.OrderId);
              
              return (
                <div key={order.OrderId} className="order-card">
                  <div className="order-image">
                    {items[0] && items[0].product && (
                      <img src={items[0].product.ImageUrl} alt={items[0].product.Name} />
                    )}
                  </div>
                  
                  <div className="order-details">
                    <h3 className="order-id">#{order.OrderId}</h3>
                    <p className="order-items">
                      {items.map(item => 
                        `${item.product?.Name} x ${item.Quantity}`
                      ).join(', ')}
                    </p>
                  </div>
                  
                  <div className="order-status">
                    <span className={`status-badge ${getStatusClass(order.Status)}`}>
                      <IoCheckmarkCircle /> {order.Status}
                    </span>
                    <p className="order-date">{formatDate(order.CreatedAt)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};

const EditProfileModal = ({ user, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: user.Name,
    email: user.Email,
    phone: user.Phone || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button className="close-btn" onClick={onClose}>
            <IoClose />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="name">
              <IoPerson /> Full Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="email">
              <IoMail /> Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="phone">
              <IoCall /> Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="currentPassword">
              <IoLockClosed /> Current Password
            </label>
            <input
              type="password"
              id="currentPassword"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              placeholder="Enter current password"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="newPassword">
              <IoLockClosed /> New Password
            </label>
            <input
              type="password"
              id="newPassword"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="Enter new password"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">
              <IoLockClosed /> Confirm New Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm new password"
            />
          </div>
          
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-save">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddressesModal = ({ addresses, isOpen, onClose, onSave, onDelete, onSetDefault }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    label: '',
    fullName: '',
    phone: '',
    address: '',
    ward: '',
    district: '',
    city: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData, editingId);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      label: '',
      fullName: '',
      phone: '',
      address: '',
      ward: '',
      district: '',
      city: ''
    });
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleEdit = (address) => {
    setFormData(address);
    setEditingId(address.id);
    setShowAddForm(true);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-address" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>My Addresses</h2>
          <button className="close-btn" onClick={onClose}>
            <IoClose />
          </button>
        </div>
        
        <div className="modal-form">
          {!showAddForm ? (
            <>
              <button className="btn-add-address" onClick={() => setShowAddForm(true)}>
                <IoAdd /> Add New Address
              </button>
              
              <div className="addresses-list">
                {addresses.map((address) => (
                  <div key={address.id} className={`address-item ${address.isDefault ? 'default' : ''}`}>
                    <div className="address-header">
                      <div className="address-label-row">
                        <span className="address-label">{address.label}</span>
                        {address.isDefault && (
                          <span className="default-badge">
                            <IoCheckmark /> Default
                          </span>
                        )}
                      </div>
                      <div className="address-actions">
                        <button onClick={() => handleEdit(address)} className="btn-text">Edit</button>
                        {!address.isDefault && (
                          <button onClick={() => onDelete(address.id)} className="btn-text danger">
                            <IoTrash /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="address-details">
                      <p className="address-name">{address.fullName} | {address.phone}</p>
                      <p className="address-full">{address.address}</p>
                      <p className="address-location">{address.ward}, {address.district}, {address.city}</p>
                    </div>
                    {!address.isDefault && (
                      <button onClick={() => onSetDefault(address.id)} className="btn-set-default">
                        Set as Default
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="address-form">
              <h3>{editingId ? 'Edit Address' : 'New Address'}</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="label">Address Label *</label>
                  <input
                    type="text"
                    id="label"
                    name="label"
                    value={formData.label}
                    onChange={handleChange}
                    placeholder="e.g.: Home, Office"
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fullName">Full Name *</label>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Phone Number *</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="address">Street Address *</label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="House number, street name"
                  required
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ward">Ward *</label>
                  <input
                    type="text"
                    id="ward"
                    name="ward"
                    value={formData.ward}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="district">District *</label>
                  <input
                    type="text"
                    id="district"
                    name="district"
                    value={formData.district}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="city">City/Province *</label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={resetForm}>
                  Cancel
                </button>
                <button type="submit" className="btn-save">
                  {editingId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const ProfilePage = () => {
  const [user, setUser] = useState(mockUsers[0]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addresses, setAddresses] = useState(mockProfileAddresses);

  const handleSaveProfile = (profileData) => {
    setUser({ ...user, ...profileData });
    setShowEditModal(false);
    alert('Profile updated successfully!');
  };

  const handleEditProfile = () => {
    setShowEditModal(true);
  };

  const handleManageAddresses = () => {
    setShowAddressModal(true);
  };

  const handleSaveAddress = (addressData, editingId) => {
    if (editingId) {
      setAddresses(addresses.map(addr => 
        addr.id === editingId ? { ...addressData, id: editingId, isDefault: addr.isDefault } : addr
      ));
    } else {
      const newAddress = {
        ...addressData,
        id: Math.max(...addresses.map(a => a.id), 0) + 1,
        isDefault: addresses.length === 0
      };
      setAddresses([...addresses, newAddress]);
    }
  };

  const handleDeleteAddress = (id) => {
    if (window.confirm('Are you sure you want to delete this address?')) {
      setAddresses(addresses.filter(addr => addr.id !== id));
    }
  };

  const handleSetDefault = (id) => {
    setAddresses(addresses.map(addr => ({
      ...addr,
      isDefault: addr.id === id
    })));
  };

  return (
    <div className="profile-page">
      <ProfileHeader 
        user={user} 
        onEditProfile={handleEditProfile}
        onManageAddresses={handleManageAddresses}
      />
      
      <div className="profile-content">
        <div className="left-column">
          <MyBookingSection userId={user.UserId} />
        </div>
        
        <div className="right-column">
          <OrderTrackingSection userId={user.UserId} />
        </div>
      </div>
      
      <EditProfileModal
        user={user}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveProfile}
      />
      <AddressesModal
        addresses={addresses}
        isOpen={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        onSave={handleSaveAddress}
        onDelete={handleDeleteAddress}
        onSetDefault={handleSetDefault}
      />
    </div>
  );
};

export default ProfilePage;
