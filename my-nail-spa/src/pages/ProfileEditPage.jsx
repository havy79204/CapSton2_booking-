import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { User, Lock, MapPin, Plus, Trash2, Edit3, Check } from 'lucide-react'
import api from '../lib/api'
import '../styles/ProfileEditPage.css'

export function ProfileEditPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('info')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // Basic Info Form
  const [basicInfo, setBasicInfo] = useState({
    name: '',
    email: '',
    phone: ''
  })

  // Password Form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Addresses
  const [addresses, setAddresses] = useState([])
  const [editingAddress, setEditingAddress] = useState(null)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [addressForm, setAddressForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    country: 'Vietnam',
    isDefault: false
  })

  useEffect(() => {
    loadUserData()
  }, [])

  async function loadUserData() {
    try {
      setLoading(true)
      const [userRes, addressesRes] = await Promise.all([
        api.me(),
        api.getAddresses().catch(() => ({ items: [] }))
      ])
      
      setBasicInfo({
        name: userRes.user?.name || '',
        email: userRes.user?.email || '',
        phone: userRes.user?.phone || ''
      })
      
      setAddresses(addressesRes.items || [])
    } catch (err) {
      console.error('Error loading user data:', err)
      setMessage({ type: 'error', text: 'Failed to load user data' })
    } finally {
      setLoading(false)
    }
  }

  function handleBasicInfoChange(e) {
    const { name, value } = e.target
    setBasicInfo(prev => ({ ...prev, [name]: value }))
  }

  function handlePasswordChange(e) {
    const { name, value } = e.target
    setPasswordForm(prev => ({ ...prev, [name]: value }))
  }

  function handleAddressChange(e) {
    const { name, value, type, checked } = e.target
    setAddressForm(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }))
  }

  async function handleSaveBasicInfo(e) {
    e.preventDefault()
    setMessage({ type: '', text: '' })
    
    try {
      setLoading(true)
      await api.updateMe(basicInfo)
      await auth.refresh()
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile' })
    } finally {
      setLoading(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    if (passwordForm.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }

    try {
      setLoading(true)
      await api.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setMessage({ type: 'success', text: 'Password changed successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to change password' })
    } finally {
      setLoading(false)
    }
  }

  function handleNewAddress() {
    setEditingAddress(null)
    setShowAddressForm(true)
    setAddressForm({
      name: '',
      phone: '',
      address: '',
      city: '',
      country: 'Vietnam',
      isDefault: addresses.length === 0
    })
  }

  function handleEditAddress(address) {
    setEditingAddress(address.id)
    setShowAddressForm(true)
    setAddressForm({
      name: address.name || '',
      phone: address.phone || '',
      address: address.address || '',
      city: address.city || '',
      country: address.country || 'Vietnam',
      isDefault: address.isDefault || false
    })
  }

  function handleCancelEditAddress() {
    setEditingAddress(null)
    setShowAddressForm(false)
    setAddressForm({
      name: '',
      phone: '',
      address: '',
      city: '',
      country: 'Vietnam',
      isDefault: false
    })
  }

  async function handleSaveAddress(e) {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (!addressForm.name || !addressForm.phone || !addressForm.address) {
      setMessage({ type: 'error', text: 'Please fill in required fields (Name, Phone, Address)' })
      return
    }

    try {
      setLoading(true)
      
      if (editingAddress) {
        // Update existing address
        await api.updateAddress(editingAddress, addressForm)
        setMessage({ type: 'success', text: 'Address updated successfully!' })
      } else {
        // Create new address
        await api.createAddress(addressForm)
        setMessage({ type: 'success', text: 'Address added successfully!' })
      }

      // Reload addresses
      const addressesRes = await api.getAddresses()
      setAddresses(addressesRes.items || [])
      setShowAddressForm(false)
      handleCancelEditAddress()
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save address' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteAddress(addressId) {
    if (!confirm('Are you sure you want to delete this address?')) return

    setMessage({ type: '', text: '' })

    try {
      setLoading(true)
      await api.deleteAddress(addressId)
      const addressesRes = await api.getAddresses()
      setAddresses(addressesRes.items || [])
      setMessage({ type: 'success', text: 'Address deleted successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete address' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSetDefaultAddress(addressId) {
    setMessage({ type: '', text: '' })

    try {
      setLoading(true)
      await api.setDefaultAddress(addressId)
      const addressesRes = await api.getAddresses()
      setAddresses(addressesRes.items || [])
      setMessage({ type: 'success', text: 'Default address updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to set default address' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profileEditPage">
      <div className="container">
        <div className="profileEditHeader">
          <button className="btn btn-outline" onClick={() => navigate('/profile')}>
            ← Back to Profile
          </button>
          <h1>Edit Profile</h1>
        </div>

        {message.text && (
          <div className={`message message-${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="profileEditContainer">
          {/* Tabs */}
          <div className="profileEditTabs">
            <button
              className={`profileEditTab ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              <User size={20} />
              <span>Basic Info</span>
            </button>
            <button
              className={`profileEditTab ${activeTab === 'password' ? 'active' : ''}`}
              onClick={() => setActiveTab('password')}
            >
              <Lock size={20} />
              <span>Password</span>
            </button>
            <button
              className={`profileEditTab ${activeTab === 'addresses' ? 'active' : ''}`}
              onClick={() => setActiveTab('addresses')}
            >
              <MapPin size={20} />
              <span>Addresses</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="profileEditContent">
            {/* Basic Info Tab */}
            {activeTab === 'info' && (
              <form onSubmit={handleSaveBasicInfo} className="profileEditForm">
                <h2>Basic Information</h2>
                
                <div className="formGroup">
                  <label htmlFor="name">Full Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={basicInfo.name}
                    onChange={handleBasicInfoChange}
                    required
                  />
                </div>

                <div className="formGroup">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={basicInfo.email}
                    onChange={handleBasicInfoChange}
                    required
                  />
                </div>

                <div className="formGroup">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={basicInfo.phone}
                    onChange={handleBasicInfoChange}
                    placeholder="e.g., +1 234 567 8900"
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            )}

            {/* Password Tab */}
            {activeTab === 'password' && (
              <form onSubmit={handleChangePassword} className="profileEditForm">
                <h2>Change Password</h2>

                <div className="formGroup">
                  <label htmlFor="currentPassword">Current Password *</label>
                  <input
                    type="password"
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordChange}
                    required
                  />
                </div>

                <div className="formGroup">
                  <label htmlFor="newPassword">New Password *</label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                    required
                    minLength={6}
                  />
                  <small>Minimum 6 characters</small>
                </div>

                <div className="formGroup">
                  <label htmlFor="confirmPassword">Confirm New Password *</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            )}

            {/* Addresses Tab */}
            {activeTab === 'addresses' && (
              <div className="addressesSection">
                <div className="addressesHeader">
                  <h2>My Addresses</h2>
                  {!showAddressForm && addresses.length > 0 && (
                    <button className="btn btnAddAddress" onClick={handleNewAddress}>
                      <Plus size={16} />
                      Add New Address
                    </button>
                  )}
                </div>

                {/* Address Form (New or Edit) */}
                {(showAddressForm || addresses.length === 0) && (
                  <form onSubmit={handleSaveAddress} className="addressForm">
                    <h3>{editingAddress ? 'Edit Address' : 'New Address'}</h3>

                    <div className="formRow">
                      <div className="formGroup">
                        <label htmlFor="addressName">Full Name *</label>
                        <input
                          type="text"
                          id="addressName"
                          name="name"
                          value={addressForm.name}
                          onChange={handleAddressChange}
                          placeholder="Ngô Nguyễn Thủy Linh"
                          required
                        />
                      </div>

                      <div className="formGroup">
                        <label htmlFor="addressPhone">Phone Number *</label>
                        <input
                          type="tel"
                          id="addressPhone"
                          name="phone"
                          value={addressForm.phone}
                          onChange={handleAddressChange}
                          placeholder="+84786756561"
                          required
                        />
                      </div>
                    </div>

                    <div className="formGroup">
                      <label htmlFor="address">Address *</label>
                      <input
                        type="text"
                        id="address"
                        name="address"
                        value={addressForm.address}
                        onChange={handleAddressChange}
                        placeholder="K19/10 Hà Huy Tập 1"
                        required
                      />
                    </div>

                    <div className="formRow">
                      <div className="formGroup">
                        <label htmlFor="city">City</label>
                        <input
                          type="text"
                          id="city"
                          name="city"
                          value={addressForm.city}
                          onChange={handleAddressChange}
                          placeholder="Đà Nẵng"
                        />
                      </div>

                      <div className="formGroup">
                        <label htmlFor="country">Country</label>
                        <select
                          id="country"
                          name="country"
                          value={addressForm.country}
                          onChange={handleAddressChange}
                        >
                          <option value="Vietnam">Vietnam</option>
                          <option value="USA">USA</option>
                          <option value="UK">UK</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="formGroup">
                      <label className="checkboxLabel">
                        <input
                          type="checkbox"
                          name="isDefault"
                          checked={addressForm.isDefault}
                          onChange={handleAddressChange}
                        />
                        <span>Set as default address</span>
                      </label>
                    </div>

                    <div className="formActions">
                      <button type="submit" className="btn btnSaveAddress" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Address'}
                      </button>
                      {editingAddress && (
                        <button type="button" className="btn btn-outline" onClick={handleCancelEditAddress}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {/* Address List */}
                {addresses.length > 0 && !showAddressForm && (
                  <div className="addressList">
                    {addresses.map(address => (
                      <div key={address.id} className={`addressCard ${address.isDefault ? 'default' : ''}`}>
                        <div className="addressCardHeader">
                          <div className="addressCardTitle">
                            <MapPin size={18} />
                            <strong>{address.name}</strong>
                            {address.isDefault && <span className="badge badge-primary">Default</span>}
                          </div>
                          <div className="addressCardActions">
                            <button
                              className="addressActionBtn"
                              onClick={() => handleEditAddress(address)}
                              title="Edit"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              className="addressActionBtn"
                              onClick={() => handleDeleteAddress(address.id)}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                            {!address.isDefault && (
                              <button
                                className="addressActionBtn"
                                onClick={() => handleSetDefaultAddress(address.id)}
                                title="Set as default"
                              >
                                <Check size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="addressCardBody">
                          <p><strong>{address.name}</strong></p>
                          <p><strong>Phone:</strong> {address.phone}</p>
                          <p><strong>Address:</strong> {address.address}</p>
                          {address.city && <p><strong>City:</strong> {address.city}</p>}
                          {address.country && <p><strong>Country:</strong> {address.country}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {addresses.length === 0 && !showAddressForm && (
                  <div className="emptyState">
                    <MapPin size={64} strokeWidth={1.5} />
                    <p>No addresses saved yet</p>
                    <button className="btn btnAddAddress" onClick={handleNewAddress}>
                      <Plus size={16} />
                      Add Your First Address
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
