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
      alert('Booking request submitted successfully!')
      setNotes('')
      setGiftCode('')
      if (!isReturningCustomer) setSelectedStaffId('')
      setServiceSelections((prev) => prev.map((service) => ({ ...service, quantity: 0 })))
    } catch (err) {
      alert(err?.message || 'Failed to create booking')
    } finally {
      setSubmitting(false)
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
                      <span>{booking.Status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

export default BookingPage
