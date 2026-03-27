import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  IoCalendarOutline,
  IoCardOutline,
  IoCheckmarkCircleOutline,
  IoPersonOutline,
  IoTicketOutline,
} from 'react-icons/io5'
import { useServices } from '../hooks/useHomepage'
import {
  useCustomerBookings,
  useCustomerContext,
  useCustomerStaff,
} from '../hooks/useCustomerCommerce'
import PortalModal from '../components/Layout portal/PortalModal.jsx'
import { api } from '../lib/api'
import '../styles/BookingPage.css'

function buildTimeSlots() {
  const slots = []
  for (let hour = 9; hour <= 19; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`)
    if (hour !== 19) slots.push(`${String(hour).padStart(2, '0')}:30`)
  }
  return slots
}

const BookingPage = () => {

  const mapBookingStatus = (s) => {
    const st = String(s || '').trim().toLowerCase()
    if (!st) return 'Unknown'
    if (st === 'completed' || st === 'done') return 'Completed'
    if (st === 'booked') return 'Booked'
    if (st === 'pending') return 'Pending'
    if (st === 'cancel' || st === 'cancelled') return 'Cancelled'
    return st.charAt(0).toUpperCase() + st.slice(1)
  }

  const isCompleted = (status) => {
    const value = String(status || '').trim().toLowerCase()
    return value.includes('complete') || value.includes('confirm') || value.includes('done')
  }

  const location = useLocation()
  const selectedServiceIdFromState = location.state?.serviceId

  const { services: apiServices, loading: servicesLoading, error: servicesError } = useServices()
  const { context, loading: contextLoading, error: contextError } = useCustomerContext()

  const [activeCategory, setActiveCategory] = useState('All')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedTime, setSelectedTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [giftCode, setGiftCode] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('store')
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [serviceSelections, setServiceSelections] = useState([])
  const [completionModalOpen, setCompletionModalOpen] = useState(false)
  const [bookingToComplete, setBookingToComplete] = useState(null)
  const [completingBookingId, setCompletingBookingId] = useState(null)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [resultMessage, setResultMessage] = useState('')
  const [resultTitle, setResultTitle] = useState('')

  // Test modal rendering - uncomment to debug
  useEffect(() => {
    // setCompletionModalOpen(true)
    // setBookingToComplete({ BookingId: 'TEST-001', BookingTime: new Date().toISOString(), Status: 'Completed' })
  }, [])

  const selectedServiceIdsForStaff = useMemo(() => {
    return serviceSelections
      .filter((service) => Number(service.quantity || 0) > 0)
      .map((service) => String(service.ServiceId || '').trim())
      .filter(Boolean)
  }, [serviceSelections])

  const { staffs, loading: staffLoading, error: staffError } = useCustomerStaff(selectedServiceIdsForStaff)
  const {
    bookings,
    loading: bookingsLoading,
    error: bookingsError,
    createBooking,
  } = useCustomerBookings(5)

  const services = useMemo(() => (Array.isArray(apiServices) ? apiServices : []), [apiServices])

  useEffect(() => {
    if (!services.length) {
      setServiceSelections([])
      return
    }

    setServiceSelections((prev) => {
      const prevMap = new Map(prev.map((item) => [String(item.ServiceId), item]))
      return services.map((service) => {
        const saved = prevMap.get(String(service.ServiceId))
        if (saved) return { ...saved, ...service }

        return {
          ...service,
          quantity: String(service.ServiceId) === String(selectedServiceIdFromState) ? 1 : 0,
        }
      })
    })
  }, [services, selectedServiceIdFromState])

  const categories = useMemo(() => {
    const seen = new Set()
    const names = ['All']
    for (const service of serviceSelections) {
      const name = String(service.CategoryName || '').trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
    return names
  }, [serviceSelections])

  const availableTimeSlots = useMemo(() => buildTimeSlots(), [])

  const filteredServices = useMemo(() => {
    return serviceSelections.filter((service) => {
      if (activeCategory === 'All') return true
      return String(service.CategoryName || '') === activeCategory
    })
  }, [serviceSelections, activeCategory])

  const selectedServiceItems = useMemo(() => {
    return serviceSelections.filter((service) => Number(service.quantity || 0) > 0)
  }, [serviceSelections])

  const isReturningCustomer = Array.isArray(bookings) && bookings.length > 0
  const selectedStaff = (Array.isArray(staffs) ? staffs : []).find((staff) => String(staff.StaffId) === String(selectedStaffId)) || null
  const selectedTechnician = selectedServiceItems.length === 0
    ? 'Our Specialist Team'
    : (!isReturningCustomer
      ? 'Assigned automatically for new customers'
      : (selectedStaff?.Name || 'Please choose a specialist'))

  const subtotal = selectedServiceItems.reduce(
    (sum, service) => sum + Number(service.Price || 0) * Number(service.quantity || 0),
    0,
  )

  const totalDuration = selectedServiceItems.reduce(
    (sum, service) => sum + Number(service.DurationMinutes || 0) * Number(service.quantity || 0),
    0,
  )

  const discount = giftCode.trim() ? Math.min(5, subtotal * 0.1) : 0
  const total = Math.max(subtotal - discount, 0)

  const defaultAddress = context?.defaultAddress || null
  const currentUser = context?.user || null

  const changeServiceQuantity = (serviceId, delta) => {
    setServiceSelections((prev) => prev.map((service) => {
      if (String(service.ServiceId) !== String(serviceId)) return service
      const nextQuantity = Number(service.quantity || 0) + delta
      if (nextQuantity < 0 || nextQuantity > 5) return service
      return { ...service, quantity: nextQuantity }
    }))
  }

  const handleBookNow = async () => {
    if (selectedServiceItems.length === 0) {
      alert('Please select at least one service.')
      return
    }

    if (isReturningCustomer && !selectedStaffId) {
      alert('Please choose a specialist before booking.')
      return
    }

    try {
      setSubmitting(true)
      await createBooking({
        date: selectedDate,
        time: selectedTime,
        notes,
        paymentMethod,
        giftCode,
        staffId: isReturningCustomer ? selectedStaffId : null,
        serviceItems: selectedServiceItems.map((service) => ({
          serviceId: service.ServiceId,
          quantity: Number(service.quantity || 1),
          staffId: isReturningCustomer ? selectedStaffId : null,
        })),
      })
      setResultTitle('Successfully!')
      setResultMessage('Your booking request has been submitted. We will contact you soon!')
      setResultModalOpen(true)
      setNotes('')
      setGiftCode('')
      if (!isReturningCustomer) setSelectedStaffId('')
      setServiceSelections((prev) => prev.map((service) => ({ ...service, quantity: 0 })))
    } catch (err) {
      setResultTitle('Error')
      setResultMessage(err?.message || 'Failed to submit booking request')
      setResultModalOpen(true)
    } finally {
      setSubmitting(false)
    }
  }

  const openCompletionModal = (booking) => {
    setBookingToComplete(booking)
    setCompletionModalOpen(true)
  }

  const closeCompletionModal = () => {
    setCompletionModalOpen(false)
    setBookingToComplete(null)
    setCompletingBookingId(null)
  }

  const confirmBookingCompletion = async () => {
    if (!bookingToComplete) return

    try {
      setCompletingBookingId(bookingToComplete.BookingId)
      // Update booking status to Completed
      await api.put(`/appointments/${bookingToComplete.BookingId}`, {
        status: 'Completed'
      })
      setResultTitle('Successfully!')
      setResultMessage('Booking has been confirmed as completed. Thank you!')
      setResultModalOpen(true)
      closeCompletionModal()
      // Refresh bookings list after 2 seconds
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err) {
      setResultTitle('Error')
      setResultMessage(err?.message || 'Failed to mark booking as completed')
      setResultModalOpen(true)
    } finally {
      setCompletingBookingId(null)
    }
  }

  if (servicesLoading || contextLoading || staffLoading || bookingsLoading) {
    return <div className="loading">Loading booking data...</div>
  }

  if (servicesError || contextError || staffError || bookingsError) {
    return <div className="error">{servicesError || contextError || staffError || bookingsError}</div>
  }

  return (
    <section className="booking-page">
      <div className="booking-container">
        <div className="booking-page-head">
          <h1>BOOK YOUR APPOINTMENT</h1>
          <p>Create booking directly from the salon database</p>
        </div>

        <div className="booking-grid">
          <div className="booking-left-panel">
            <div className="booking-card">
              <div className="booking-card-title">
                <span className="step-dot">1</span>
                <h3>Select salon and services</h3>
              </div>

              <div className="booking-inline-section">
                <label><IoPersonOutline /> Technician</label>
                <div className="info-row">
                  {selectedServiceItems.length === 0 ? (
                    <div>
                      <strong>Our Specialist Team</strong>
                      <p>Coose services first to continue</p>
                    </div>
                  ) : !isReturningCustomer ? (
                    <div>
                      <strong>Auto assignment for new customers</strong>
                      <p>System will assign available specialist automatically</p>
                    </div>
                  ) : (
                    <div className="staff-picker-block">
                      <strong>Coose your specialist</strong>
                      <select
                        className="staff-select"
                        value={selectedStaffId}
                        onChange={(event) => setSelectedStaffId(event.target.value)}
                      >
                        <option value="">-- Select specialist --</option>
                        {(Array.isArray(staffs) ? staffs : []).map((staff) => (
                          <option key={staff.StaffId} value={staff.StaffId}>
                            {staff.Name}{staff.Specialty ? ` - ${staff.Specialty}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="booking-inline-section">
                <label><IoCheckmarkCircleOutline /> Services</label>

                <div className="category-tabs">
                  {categories.map((category) => (
                    <button
                      key={category}
                      className={`category-btn ${activeCategory === category ? 'active' : ''}`}
                      onClick={() => setActiveCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                <div className="services-list-box">
                  {filteredServices.map((service) => (
                    <div key={service.ServiceId} className="service-line">
                      <div className="service-line-info">
                        <strong>{service.Name}</strong>
                        <p>{service.DurationMinutes} min</p>
                      </div>

                      <div className="service-line-actions">
                        <div className="service-qty">
                          <button onClick={() => changeServiceQuantity(service.ServiceId, -1)}>-</button>
                          <span>{service.quantity}</span>
                          <button onClick={() => changeServiceQuantity(service.ServiceId, 1)}>+</button>
                        </div>
                        <span className="service-price-chip">From ${Number(service.Price || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="booking-card">
              <div className="booking-inline-section">
                <label><IoCalendarOutline /> Schedule</label>
                <div className="schedule-controls">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </div>

                <p className="times-title">Available times</p>
                <div className="time-grid">
                  {availableTimeSlots.map((slot) => (
                    <button
                      key={slot}
                      className={`time-btn ${selectedTime === slot ? 'active' : ''}`}
                      onClick={() => setSelectedTime(slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>

                <textarea
                  rows="4"
                  placeholder="Add note for booking"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>
          </div>

          <aside className="booking-right-panel">
            <div className="booking-card sticky-card">
              <div className="booking-card-title">
                <span className="step-dot">2</span>
                <h3>Confirmation</h3>
              </div>

              <div className="mini-summary">
                <strong>{currentUser?.Name || 'Customer'}</strong>
                <p>
                  {defaultAddress
                    ? `${defaultAddress.AddressLine}, ${defaultAddress.City}, ${defaultAddress.Country}`
                    : 'No default address'}
                </p>
              </div>

              <div className="confirm-row-grid">
                <div className="confirm-row-item">
                  <label><IoCalendarOutline /> Date and Time</label>
                  <span>{selectedDate} at {selectedTime}</span>
                </div>
                <div className="confirm-row-item">
                  <label><IoPersonOutline /> Technician</label>
                  <span>{selectedTechnician}</span>
                </div>
              </div>

              <div className="info-inputs">
                <input type="text" value={currentUser?.Phone || ''} readOnly placeholder="Your phone" />
                <input type="text" value={currentUser?.Name || ''} readOnly placeholder="Your name" />
              </div>

              <div className="booking-summary-box">
                <h4>Booking Summary</h4>
                <div className="summary-services">
                  <div className="summary-head">
                    <span>Services</span>
                    <span>Duration</span>
                    <span>Price</span>
                  </div>
                  {selectedServiceItems.length === 0 ? (
                    <p className="summary-empty">No service selected</p>
                  ) : (
                    selectedServiceItems.map((service) => (
                      <div className="summary-service-row" key={service.ServiceId}>
                        <span>{service.Name}{service.quantity > 1 ? ` x${service.quantity}` : ''}</span>
                        <span>{Number(service.DurationMinutes || 0) * Number(service.quantity || 0)} min</span>
                        <span>${(Number(service.Price || 0) * Number(service.quantity || 0)).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="total-lines">
                  <div><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  <div><span>Duration</span><span>{totalDuration} min</span></div>
                </div>

                <div className="gift-row-booking">
                  <input
                    type="text"
                    placeholder="Enter Gift code..."
                    value={giftCode}
                    onChange={(event) => setGiftCode(event.target.value)}
                  />
                  <button type="button">Apply</button>
                </div>

                <div className="discount-row">
                  <span><IoTicketOutline /> Sale</span>
                  <span>-${discount.toFixed(2)}</span>
                </div>

                <div className="booking-total-row">
                  <strong>Total</strong>
                  <strong>${total.toFixed(2)}</strong>
                </div>
              </div>

              <div className="payment-methods-box">
                <h4>Payment method</h4>
                <label className={`payment-booking-option ${paymentMethod === 'store' ? 'active' : ''}`}>
                  <span><IoCardOutline /> Pay at Store</span>
                  <input
                    type="radio"
                    checked={paymentMethod === 'store'}
                    onChange={() => setPaymentMethod('store')}
                  />
                </label>
                <label className={`payment-booking-option ${paymentMethod === 'online' ? 'active' : ''}`}>
                  <span><IoCardOutline /> Pay online</span>
                  <input
                    type="radio"
                    checked={paymentMethod === 'online'}
                    onChange={() => setPaymentMethod('online')}
                  />
                </label>
              </div>

              <button className="book-now-btn-main" onClick={handleBookNow} disabled={submitting}>
                <IoCalendarOutline /> {submitting ? 'Booking...' : 'Book Now'}
              </button>
              
               <div className="booking-card" style={{ marginTop: 10 }}>
              <h3>Recent Bookings</h3>
              {(Array.isArray(bookings) ? bookings : []).length === 0 ? (
                <p className="summary-empty">No bookings yet.</p>
              ) : (
                <div className="summary-services">
                  {bookings.map((booking) => (
                    <div key={booking.BookingId} className="summary-service-row">
                      <span>{booking.BookingId}</span>
                      <span>{new Date(booking.BookingTime).toLocaleString()}</span>
                      <span>{mapBookingStatus(booking.Status || booking.status)}</span>
                      {isCompleted(booking.Status || booking.status) && (
                        <button
                          className="booking-complete-btn"
                          onClick={() => openCompletionModal(booking)}
                          disabled={completingBookingId === booking.BookingId}
                        >
                          {completingBookingId === booking.BookingId ? 'Confirming...' : 'Confirm Completion'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </aside>
        </div>
      </div>

      <PortalModal
        open={completionModalOpen}
        title="Confirm Booking Completion"
        onClose={closeCompletionModal}
        footer={
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={closeCompletionModal}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                background: 'white',
                color: '#6b7280',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmBookingCompletion}
              disabled={completingBookingId !== null}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: '#10b981',
                color: 'white',
                cursor: completingBookingId ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                opacity: completingBookingId ? 0.6 : 1,
              }}
            >
              {completingBookingId ? 'Confirming...' : 'Confirm Completion'}
            </button>
          </div>
        }
      >
        <p style={{ marginBottom: '16px', color: '#1f2937', lineHeight: '1.5' }}>
          Are you sure you want to mark this booking as completed?
        </p>
        {bookingToComplete && (
          <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: '4px', marginBottom: '16px' }}>
            <p style={{ fontSize: '0.9rem', color: '#047857', margin: '4px 0' }}>
              <strong>Booking ID:</strong> {bookingToComplete.BookingId}
            </p>
            <p style={{ fontSize: '0.9rem', color: '#047857', margin: '4px 0' }}>
              <strong>Time:</strong> {new Date(bookingToComplete.BookingTime).toLocaleString()}
            </p>
            <p style={{ fontSize: '0.9rem', color: '#047857', margin: '4px 0' }}>
              <strong>Status:</strong> {mapBookingStatus(bookingToComplete.Status || bookingToComplete.status)}
            </p>
          </div>
        )}
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
    </section>
  )
}

export default BookingPage
