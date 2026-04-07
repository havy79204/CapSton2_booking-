import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import {
  IconMail,
  IconPhone,
} from '../../components/Layout portal/PortalIcons.jsx'
import '../../styles/customers.css'
import { IoCheckmarkCircle } from 'react-icons/io5'

function initialOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

function mapBookingStatusClass(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('confirm')) return 'status-confirmed'
  if (s.includes('pending')) return 'status-pending'
  if (s.includes('complete')) return 'status-completed'
  if (s.includes('cancel')) return 'status-cancelled'
  return ''
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

function mapOrderStatusClass(status) {
  const normalized = normalizeOrderStatus(status)
  if (normalized === 'Completed') return 'status-delivered'
  if (normalized === 'Shipping') return 'status-shipped'
  if (normalized === 'Cancelled' || normalized === 'Failed') return 'status-cancelled'
  return 'status-processing'
}

function getAccountStatus(lastVisitDateString, isDisabled) {
  // If manually disabled, return inactive
  if (isDisabled) {
    return { status: 'Inactive', color: '#dc3545', icon: '✕' }
  }

  // If never visited, return inactive
  if (!lastVisitDateString || lastVisitDateString === 'Never' || lastVisitDateString === '') {
    return { status: 'Inactive', color: '#dc3545', icon: '✕' }
  }

  // Parse the date (assuming format like "10/3/2026" or "DD/MM/YYYY")
  try {
    const parts = String(lastVisitDateString).split('/')
    if (parts.length < 3) {
      return { status: 'Inactive', color: '#dc3545', icon: '✕' }
    }
    
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1 // JS months are 0-indexed
    const year = parseInt(parts[2], 10)
    
    const lastVisitDate = new Date(year, month, day)
    const now = new Date()
    const daysDifference = Math.floor((now - lastVisitDate) / (1000 * 60 * 60 * 24))
    
    // If last visit is within 90 days, mark as active
    if (daysDifference <= 90) {
      return { status: 'Active', color: '#28a745', icon: '✓' }
    } else {
      return { status: 'Inactive', color: '#dc3545', icon: '✕' }
    }
  } catch {
    return { status: 'Unknown', color: '#6c757d', icon: '?' }
  }
}

export default function OwnerCustomerDetailPage() {
  const navigate = useNavigate()
  const { customerId } = useParams()
  const [customer, setCustomer] = useState(null)
  const [bookings, setBookings] = useState([])
  const [orders, setOrders] = useState([])
  const [activeBookingTab, setActiveBookingTab] = useState('All')
  const [activeOrderTab, setActiveOrderTab] = useState('All')
  const [isAccountDisabled, setIsAccountDisabled] = useState(false)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
  })
  const [openEdit, setOpenEdit] = useState(false)

  useEffect(() => {
    if (customerId) {
      api
        .get(`/api/owner/customers/${customerId}`)
        .then((data) => {
          setCustomer(data)
          setForm({
            name: data.name || '',
            phone: data.phone || '',
            email: data.email || '',
          })
          // Initialize account disabled flag from DB status when available
          if (data && data.status) {
            const s = String(data.status || '').toLowerCase()
            setIsAccountDisabled(s === 'inactive' || s === 'deleted')
          }
        })
        .catch((err) => {
          console.error('Failed to load customer:', err)
          api
            .get('/api/owner/customers')
            .then((data) => {
              const found = Array.isArray(data) ? data.find((c) => c.id === customerId || c.email === customerId) : null
              if (found) {
                setCustomer(found)
                setForm({
                  name: found.name || '',
                  phone: found.phone || '',
                  email: found.email || '',
                })
                if (found && found.status) {
                  const s = String(found.status || '').toLowerCase()
                  setIsAccountDisabled(s === 'inactive' || s === 'deleted')
                }
              }
            })
            .catch((e) => console.error('Failed to load customers list:', e))
        })

      api
        .get(`/api/owner/customers/${customerId}/bookings`)
        .then((data) => {
            if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) console.debug('OwnerCustomerDetail: bookings count', Array.isArray(data) ? data.length : 0)
            setBookings(Array.isArray(data) ? data : [])
          })
        .catch((err) => {
          console.warn('Failed to load bookings:', err.message)
          setBookings([])
        })

      api
        .get(`/api/owner/customers/${customerId}/orders`)
        .then((data) => {
            if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) console.debug('OwnerCustomerDetail: orders count', Array.isArray(data) ? data.length : 0)
            setOrders(Array.isArray(data) ? data : [])
          })
        .catch((err) => {
          console.warn('Failed to load orders:', err.message)
          setOrders([])
        })
    }
  }, [customerId])

  function closeEdit() {
    setOpenEdit(false)
  }

  function openEditForm() {
    setOpenEdit(true)
  }

  async function toggleAccountStatus() {
    const newDisabled = !isAccountDisabled
    // Optimistic UI update
    setIsAccountDisabled(newDisabled)

    if (!customer?.id) return

    try {
      const statusValue = newDisabled ? 'Inactive' : 'Active'
      await api.put(`/api/owner/customers/${customer.id}`, { status: statusValue })
      const updated = await api.get(`/api/owner/customers/${customer.id}`)
      setCustomer(updated)
      if (updated && updated.status) {
        const s = String(updated.status || '').toLowerCase()
        setIsAccountDisabled(s === 'inactive' || s === 'deleted')
      }
    } catch (err) {
      console.error('Failed to toggle account status:', err)
      // Revert optimistic UI change on error
      setIsAccountDisabled(!newDisabled)
    }
  }

  async function onSubmitEdit(e) {
    e.preventDefault()
    if (!form.name) return

    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
      }

      if (customer?.id) {
        await api.put(`/api/owner/customers/${customer.id}`, payload)
        window.dispatchEvent(new CustomEvent('portal:success-modal', { 
          detail: { message: 'Customer updated successfully', title: 'Completed' } 
        }));
        const updated = await api.get(`/api/owner/customers/${customer.id}`)
        setCustomer(updated)
      }

      closeEdit()
    } catch (err) {
      console.error(err)
    }
  }

  // Compute account status: prefer DB `customer.status` when available,
  // otherwise fall back to last-visit heuristic (getAccountStatus).
  const accountStatus = useMemo(() => {
    if (customer && customer.status) {
      const s = String(customer.status || '').trim().toLowerCase()
      if (s === 'active') {
        return { status: 'Active', color: '#28a745', icon: '✓' }
      }
      if (s === 'inactive' || s === 'deleted') {
        return { status: 'Inactive', color: '#dc3545', icon: '✕' }
      }
      // Unknown explicit status: show as provided string
      return { status: String(customer.status || ''), color: '#6c757d', icon: '?' }
    }

    return getAccountStatus(customer?.last, isAccountDisabled)
  }, [customer, isAccountDisabled])

  const filteredBookings = useMemo(() => {
    const now = new Date()
    return bookings.filter((booking) => {
      const status = String(booking.Status || '').toLowerCase()
      const time = booking.BookingTime ? new Date(booking.BookingTime) : new Date()
      if (activeBookingTab === 'All') return true
      if (activeBookingTab === 'Past') return status.includes('complete') || time < now
      return status.includes('cancel')
    })
  }, [bookings, activeBookingTab])

  const filteredOrders = useMemo(() => {
    if (activeOrderTab === 'All') return orders
    return orders.filter((order) => normalizeOrderStatus(order.Status) === activeOrderTab)
  }, [orders, activeOrderTab])

  if (!customer) {
    return (
      <div className="portal-detailsPage">
        <button className="portal-back-btn" onClick={() => navigate('/portals/owner/customers')}>
          ← Back
        </button>
        <div className="portal-loadingBox">Loading customer details...</div>
      </div>
    )
  }

  return (
    <div className="portal-detailsPage">
      <div className="portal-headerTop">
        <button className="portal-back-btn" onClick={() => navigate('/portals/owner/customers')}>
          ← Back to Customers
        </button>
      </div>

      <PortalModal
        open={openEdit}
        title="Edit Customer"
        onClose={closeEdit}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeEdit}>
              Cancel
            </button>
            <button type="submit" form="edit-customer-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save Changes
            </button>
          </>
        }
      >
        <form id="edit-customer-form" onSubmit={onSubmitEdit}>
          <label className="portal-field">
            <span className="portal-label">Full name</span>
            <input
              className="portal-input"
              placeholder="Enter full name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">Phone number</span>
            <input
              className="portal-input"
              placeholder="Enter phone number"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">Email</span>
            <input
              className="portal-input"
              placeholder="Enter email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </label>
        </form>
      </PortalModal>

      <div className="portal-detailsContainer">
        {/* Header Section */}
        <div className="portal-detailsPageHeader">
          <div className="portal-detailsPageAvatar" aria-hidden="true">
            {initialOf(customer.name)}
          </div>

          <div className="portal-detailsPageInfo">
            <h1 className="portal-detailsPageName">{customer.name}</h1>
            <p className="portal-detailsPageEmail">{customer.email}</p>
          </div>

          <button type="button" className="portal-primaryBtn" onClick={openEditForm}>
            Edit Customer
          </button>
        </div>

        {/* Info Sections */}
        <div className="portal-detailsGrid">
          {/* Contact Information */}
          <div className="portal-detailsSection">
            <h2 className="portal-detailsSectionHeader">Contact Information</h2>

            <div className="portal-detailsInfoBox">
              <div className="portal-infoPair">
                <span className="portal-infoIcon" aria-hidden="true">
                  <IconPhone />
                </span>
                <div className="portal-infoContent">
                  <span className="portal-infoLabel">Phone Number</span>
                  <span className="portal-infoValue">{customer.phone || 'N/A'}</span>
                </div>
              </div>

              <div className="portal-infoPair">
                <span className="portal-infoIcon" aria-hidden="true">
                  <IconMail />
                </span>
                <div className="portal-infoContent">
                  <span className="portal-infoLabel">Email Address</span>
                  <span className="portal-infoValue">{customer.email}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="portal-detailsSection">
            <h2 className="portal-detailsSectionHeader">Customer Statistics</h2>

            <div className="portal-statsGrid">
              <div className="portal-statCard">
                <div className="portal-statLabel">Total Visits</div>
                <div className="portal-statValue">{customer.visits || 0}</div>
              </div>
              <div className="portal-statCard">
                <div className="portal-statLabel">Last Visit</div>
                <div className="portal-statValue">{customer.last || 'Never'}</div>
              </div>
              <div className="portal-statCard">
                <div className="portal-statLabel">Order Tracking</div>
                <div className="portal-statValue">{orders.length || 0}</div>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '12px', backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>Account Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px', color: accountStatus.color }}>
                    {accountStatus.icon}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: accountStatus.color }}>
                    {accountStatus.status}
                  </span>
                </div>
              </div>
              <button 
                type="button" 
                className="portal-ghostBtn"
                onClick={toggleAccountStatus}
                style={{ padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
              >
                {isAccountDisabled ? 'Reactivate' : 'Disable'}
              </button>
            </div>
          </div>
        </div>

        {/* My Booking Section */}
        <div className="portal-bookingSection">
          <div className="portal-sectionHeaderRow">
            <h2 className="portal-sectionTitle">My Booking</h2>
          </div>

          <div className="portal-bookingTabs">
            <button
              className={`portal-tabBtn ${activeBookingTab === 'All' ? 'active' : ''}`}
              onClick={() => setActiveBookingTab('All')}
            >
              All Service Booking
            </button>
            <button
              className={`portal-tabBtn ${activeBookingTab === 'Past' ? 'active' : ''}`}
              onClick={() => setActiveBookingTab('Past')}
            >
              Past
            </button>
            <button
              className={`portal-tabBtn ${activeBookingTab === 'Cancelled' ? 'active' : ''}`}
              onClick={() => setActiveBookingTab('Cancelled')}
            >
              Cancelled
            </button>
          </div>

          <div className="portal-bookingList">
            {filteredBookings.length === 0 ? (
              <div className="portal-emptyState">No {activeBookingTab.toLowerCase()} bookings</div>
            ) : (
              filteredBookings.map((booking) => {
                const date = booking.BookingTime ? new Date(booking.BookingTime) : new Date()
                const serviceNames = (booking.Services || []).map((s) => s.ServiceName).filter(Boolean).join(', ')
                return (
                  <div key={booking.BookingId} className="portal-bookingListCard">
                    <div className="portal-bookingDate">
                      <span className="portal-dateDay">{date.getDate()}</span>
                      <span className="portal-dateMonth">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                    </div>
                    <div className="portal-bookingDetailsBox">
                      <h3 className="portal-bookingServiceName">
                        {serviceNames || booking.BookingId}
                      </h3>
                      <p className="portal-bookingLocation">NIOM&CE</p>
                    </div>
                    <div className="portal-bookingStatusBox">
                      <span className={`portal-bookingStatus ${mapBookingStatusClass(booking.Status)}`}>
                        <IoCheckmarkCircle /> {booking.Status}
                      </span>
                      <p className="portal-bookingTime">{date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Order Tracking Section */}
        <div className="portal-orderSection">
          <div className="portal-sectionHeaderRow">
            <h2 className="portal-sectionTitle">Order Tracking</h2>
          </div>

          <div className="portal-orderTabs">
            <button
              className={`portal-tabBtn ${activeOrderTab === 'All' ? 'active' : ''}`}
              onClick={() => setActiveOrderTab('All')}
            >
              All
            </button>
            <button
              className={`portal-tabBtn ${activeOrderTab === 'Pending' ? 'active' : ''}`}
              onClick={() => setActiveOrderTab('Pending')}
            >
              Pending
            </button>
            <button
              className={`portal-tabBtn ${activeOrderTab === 'Processing' ? 'active' : ''}`}
              onClick={() => setActiveOrderTab('Processing')}
            >
              Processing
            </button>
            <button
              className={`portal-tabBtn ${activeOrderTab === 'Shipping' ? 'active' : ''}`}
              onClick={() => setActiveOrderTab('Shipping')}
            >
              Shipping
            </button>
            <button
              className={`portal-tabBtn ${activeOrderTab === 'Completed' ? 'active' : ''}`}
              onClick={() => setActiveOrderTab('Completed')}
            >
              Completed
            </button>
            <button
              className={`portal-tabBtn ${activeOrderTab === 'Cancelled' ? 'active' : ''}`}
              onClick={() => setActiveOrderTab('Cancelled')}
            >
              Cancelled
            </button>
            <button
              className={`portal-tabBtn ${activeOrderTab === 'Failed' ? 'active' : ''}`}
              onClick={() => setActiveOrderTab('Failed')}
            >
              Failed
            </button>
          </div>

          <div className="portal-orderList">
            {filteredOrders.length === 0 ? (
              <div className="portal-emptyState">No orders</div>
            ) : (
              filteredOrders.map((order, orderIdx) => {
                const id = String(order.OrderId || order.orderId || order.Id || order.id || '').trim()
                const displayId = id ? `#${id}` : `#${orderIdx + 1}`
                return (
                  <div key={id || orderIdx} className="portal-orderListCard">
                    <div className="portal-orderDetailsBox">
                      <h3 className="portal-orderId">{displayId}</h3>

                      <div className="portal-orderItems" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(order.Items || []).map((item, idx) => (
                          <div key={`${id || orderIdx}-${idx}`} className="portal-orderItem">
                            <span style={{ fontWeight: 600 }}>{item.ProductName || item.Name || 'Item'}</span>
                            <span style={{ marginLeft: 8, color: '#666' }}>x {item.Quantity || 1}</span>
                          </div>
                        ))}
                        {order.Items && order.Items.length === 0 ? (
                          <div className="portal-orderItem">No items</div>
                        ) : null}
                      </div>

                      <p className="portal-orderPayment">Payment: {order.PaymentStatus || order.Payment || 'N/A'}</p>
                    </div>
                    <div className="portal-orderStatusBox">
                      <span className={`portal-orderStatusBadge ${mapOrderStatusClass(order.Status)}`}>
                        <IoCheckmarkCircle /> {normalizeOrderStatus(order.Status)}
                      </span>
                      <p className="portal-orderDate">
                        {order.CreatedAt ? new Date(order.CreatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
