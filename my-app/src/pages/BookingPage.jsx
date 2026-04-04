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
import { formatVnd } from '../lib/currency'
import '../styles/BookingPage.css'

function parseTimeToMinutes(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function minutesToTime(value) {
  const hh = Math.floor(value / 60)
  const mm = value % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function getWeekdayKey(dateIso) {
  const d = new Date(String(dateIso || '').trim())
  if (Number.isNaN(d.getTime())) return null
  const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return map[d.getDay()] || null
}

function formatPromotionType(promotion) {
  const type = String(promotion?.discountType || '').toLowerCase()
  const value = Number(promotion?.value || 0)
  if (type === 'percentage') return `${value}% off`
  if (type === 'fixed') return `${formatVnd(value)} off`
  return 'Promotion'
}

function buildTimeSlots({ openTime, closeTime, slotMinutes, breakStart, breakEnd }) {
  const open = parseTimeToMinutes(openTime)
  const close = parseTimeToMinutes(closeTime)
  const breakStartMin = parseTimeToMinutes(breakStart)
  const breakEndMin = parseTimeToMinutes(breakEnd)
  const slot = Math.max(5, Number(slotMinutes) || 30)

  if (open === null || close === null || open >= close) return []

  const slots = []
  for (let minute = open; minute < close; minute += slot) {
    const inBreak =
      breakStartMin !== null &&
      breakEndMin !== null &&
      breakStartMin < breakEndMin &&
      minute >= breakStartMin &&
      minute < breakEndMin

    if (!inBreak) slots.push(minutesToTime(minute))
  }

  return slots
}

function isTimeSlotPassed(slotTime, selectedDate) {
  const today = new Date().toISOString().slice(0, 10)
  const isToday = selectedDate === today
  
  if (!isToday) return false
  
  const now = new Date()
  const currentHour = String(now.getHours()).padStart(2, '0')
  const currentMinute = String(now.getMinutes()).padStart(2, '0')
  const currentTime = `${currentHour}:${currentMinute}`
  
  const slotMin = parseTimeToMinutes(slotTime)
  const currMin = parseTimeToMinutes(currentTime)
  
  return currMin >= slotMin
}

function isTimeSlotBooked(slotTime, totalDuration, bookedSlots = []) {
  if (!Array.isArray(bookedSlots) || bookedSlots.length === 0) return false

  const slotMin = parseTimeToMinutes(slotTime)
  const slotEndMin = slotMin + totalDuration

  return bookedSlots.some((booking) => {
    const bookingStartMin = parseTimeToMinutes(booking.startTime)
    const bookingEndMin = parseTimeToMinutes(booking.endTime)

    // Check if there's any overlap between the selected time slot and the booked time
    return bookingStartMin < slotEndMin && bookingEndMin > slotMin
  })
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
  const [promoMessage, setPromoMessage] = useState('')
  const [appliedPromotion, setAppliedPromotion] = useState(null)
  const selectedServiceIdsForStaff = useMemo(() => {
    return serviceSelections
      .filter((service) => Number(service.quantity || 0) > 0)
      .map((service) => String(service.ServiceId || '').trim())
      .filter(Boolean)
  }, [serviceSelections])

  const { staffs, loading: staffLoading, error: staffError } = useCustomerStaff(selectedServiceIdsForStaff, selectedDate)
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

  const bookingSettings = context?.bookingSettings || {}
  const promotionEnabled = Boolean(bookingSettings.promotionEnabled)
  const allowCustomerApply = bookingSettings.promotionAllowCustomerApply !== false

  const selectedDayKey = useMemo(() => getWeekdayKey(selectedDate), [selectedDate])
  const daySchedule = selectedDayKey ? bookingSettings?.weekdays?.[selectedDayKey] : null
  const effectiveOpenTime = daySchedule?.openTime || bookingSettings.openTime || '08:00'
  const effectiveCloseTime = daySchedule?.closeTime || bookingSettings.closeTime || '20:00'

  const availableTimeSlots = useMemo(
    () => buildTimeSlots({
      openTime: effectiveOpenTime,
      closeTime: effectiveCloseTime,
      slotMinutes: bookingSettings.slotMinutes || 30,
      breakStart: bookingSettings.breakStart,
      breakEnd: bookingSettings.breakEnd,
    }),
    [
      effectiveOpenTime,
      effectiveCloseTime,
      bookingSettings.slotMinutes,
      bookingSettings.breakStart,
      bookingSettings.breakEnd,
    ],
  )

  useEffect(() => {
    if (!availableTimeSlots.length) {
      setSelectedTime('')
      return
    }
    if (!availableTimeSlots.includes(selectedTime)) {
      setSelectedTime(availableTimeSlots[0])
    }
  }, [availableTimeSlots, selectedTime])

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
    ? 'Choose services first'
    : (selectedStaff?.Name || 'Please choose a specialist')

  useEffect(() => {
    if (!selectedServiceItems.length) {
      if (selectedStaffId) setSelectedStaffId('')
      return
    }

    const hasSelectedStaffInList = (Array.isArray(staffs) ? staffs : [])
      .some((staff) => String(staff.StaffId) === String(selectedStaffId))

    if (selectedStaffId && !hasSelectedStaffInList) {
      setSelectedStaffId('')
    }
  }, [selectedServiceItems, staffs, selectedStaffId])

  const subtotal = selectedServiceItems.reduce(
    (sum, service) => sum + Number(service.Price || 0) * Number(service.quantity || 0),
    0,
  )

  const totalDuration = selectedServiceItems.reduce(
    (sum, service) => sum + Number(service.DurationMinutes || 0) * Number(service.quantity || 0),
    0,
  )

  const discount = useMemo(() => {
    if (!appliedPromotion) return 0
    const value = Number(appliedPromotion.value || 0)
    if (!Number.isFinite(value) || value <= 0) return 0

    if (String(appliedPromotion.discountType || '').toLowerCase() === 'percentage') {
      return Math.min(subtotal, (subtotal * Math.min(100, value)) / 100)
    }

    return Math.min(subtotal, value)
  }, [appliedPromotion, subtotal])
  const total = Math.max(subtotal - discount, 0)

  const defaultAddress = context?.defaultAddress || null
  const currentUser = context?.user || null

  const availablePromotions = useMemo(() => {
    const list = Array.isArray(bookingSettings.promotions) ? bookingSettings.promotions : []
    const now = new Date()

    return list.filter((promo) => {
      if (!promo || promo.isActive === false) return false
      const code = String(promo.code || '').trim()
      if (!code) return false

      const start = promo.startDate ? new Date(promo.startDate) : null
      const end = promo.endDate ? new Date(promo.endDate) : null
      if (start && !Number.isNaN(start.getTime()) && now < start) return false
      if (end && !Number.isNaN(end.getTime())) {
        const inclusiveEnd = new Date(end)
        inclusiveEnd.setHours(23, 59, 59, 999)
        if (now > inclusiveEnd) return false
      }

      return true
    })
  }, [bookingSettings.promotions])

  const applyPromotionCode = () => {
    const code = String(giftCode || '').trim()
    setPromoMessage('')

    if (!code) {
      setAppliedPromotion(null)
      setPromoMessage('Please enter a promotion code.')
      return
    }

    if (!promotionEnabled) {
      setAppliedPromotion(null)
      setPromoMessage('Promotions are currently disabled by salon settings.')
      return
    }

    if (!allowCustomerApply) {
      setAppliedPromotion(null)
      setPromoMessage('This salon does not allow customers to apply promotion codes.')
      return
    }

    const matched = availablePromotions.find(
      (promo) => String(promo.code || '').trim().toUpperCase() === code.toUpperCase(),
    )

    if (!matched) {
      setAppliedPromotion(null)
      setPromoMessage('Invalid or expired promotion code.')
      return
    }

    setAppliedPromotion(matched)
    setGiftCode(String(matched.code || '').trim())
    const programName = String(matched.title || '').trim() || String(matched.code || '').trim()
    setPromoMessage(`Applied: ${programName} (${formatPromotionType(matched)}).`)
  }

  const pickPromotionSuggestion = (promo) => {
    const nextCode = String(promo?.code || '').trim()
    if (!nextCode) return
    setGiftCode(nextCode)
    setAppliedPromotion(null)
    setPromoMessage('')
  }

  const changeServiceQuantity = (serviceId, delta) => {
    setServiceSelections((prev) => prev.map((service) => {
      if (String(service.ServiceId) !== String(serviceId)) return service
      const nextQuantity = Number(service.quantity || 0) + delta
      if (nextQuantity < 0 || nextQuantity > 5) return service
      return { ...service, quantity: nextQuantity }
    }))
  }

  const checkBookingConflict = () => {
    if (!isReturningCustomer || !selectedStaffId) return null

    const [selectedHour, selectedMinute] = selectedTime.split(':').map(Number)
    const selectedStartMinutes = selectedHour * 60 + selectedMinute
    const selectedEndMinutes = selectedStartMinutes + totalDuration

    const conflictingBookings = (Array.isArray(bookings) ? bookings : []).filter((booking) => {
      const bookingDate = booking.BookingDate || booking.date
      const bookingTime = booking.BookingTime || booking.time
      const bookingStaffId = booking.StaffId || booking.staffId

      if (String(bookingDate).slice(0, 10) !== selectedDate) return false
      if (String(bookingStaffId) !== String(selectedStaffId)) return false

      const [bookingHour, bookingMinute] = String(bookingTime).split(':').slice(0, 2).map(Number)
      const bookingStartMinutes = bookingHour * 60 + bookingMinute
      const bookingDuration = Number(booking.TotalDurationMinutes || booking.totalDuration || 30)
      const bookingEndMinutes = bookingStartMinutes + bookingDuration

      return selectedStartMinutes < bookingEndMinutes && selectedEndMinutes > bookingStartMinutes
    })

    return conflictingBookings.length > 0 ? conflictingBookings : null
  }

  const handleBookNow = async () => {
    if (selectedServiceItems.length === 0) {
      alert('Please select at least one service.')
      return
    }

    if (!selectedServiceItems.length) {
      alert('Please select at least one service.')
      return
    }

    if (!selectedStaffId) {
      alert('Please choose a specialist before booking.')
      return
    }

    const conflicts = checkBookingConflict()
    if (conflicts) {
      setResultTitle('Time Conflict')
      setResultMessage(`The selected specialist is not available at this time. Please choose another time or specialist.`)
      setResultModalOpen(true)
      return
    }

    if (!selectedTime) {
      alert('Please choose an available booking time.')
      return
    }

    try {
      setSubmitting(true)
      const result = await createBooking({
        date: selectedDate,
        time: selectedTime,
        notes,
        paymentMethod,
        giftCode: allowCustomerApply ? giftCode : '',
        staffId: selectedStaffId || null,
        serviceItems: selectedServiceItems.map((service) => ({
          serviceId: service.ServiceId,
          quantity: Number(service.quantity || 1),
          staffId: selectedStaffId || null,
        })),
      })

      if (paymentMethod === 'online' && result?.PaymentUrl) {
        window.location.href = result.PaymentUrl
        return
      }

      setResultTitle('Successfully!')
      setResultMessage('Your booking request has been submitted. We will contact you soon!')
      setResultModalOpen(true)
      setNotes('')
      setGiftCode('')
      setAppliedPromotion(null)
      setPromoMessage('')
      setSelectedStaffId('')
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
                      <p>Choose services first to continue</p>
                    </div>
                  ) : (
                    <div className="staff-picker-block">
                      <strong>Choose your specialist</strong>
                      <p>Only specialists matching selected services are shown.</p>
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
                        <span className="service-price-chip">From {formatVnd(service.Price || 0)}</span>
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
                {effectiveOpenTime && effectiveCloseTime ? (
                  <p className="times-title" style={{ marginTop: 0 }}>
                    Working hours: {effectiveOpenTime} - {effectiveCloseTime}
                  </p>
                ) : null}
                <div className="time-grid">
                  {availableTimeSlots.map((slot) => {
                    const isPassed = isTimeSlotPassed(slot, selectedDate)
                    const isBooked = isReturningCustomer && selectedStaff 
                      ? isTimeSlotBooked(slot, totalDuration, selectedStaff?.BookedSlots || [])
                      : false
                    const isDisabled = isPassed || isBooked
                    
                    return (
                      <button
                        key={slot}
                        className={`time-btn ${selectedTime === slot ? 'active' : ''} ${isDisabled ? 'disabled' : ''} ${isBooked ? 'booked' : ''}`}
                        onClick={() => !isDisabled && setSelectedTime(slot)}
                        disabled={isDisabled}
                        title={
                          isPassed 
                            ? 'This time has already passed' 
                            : isBooked 
                            ? 'This specialist is not available at this time'
                            : ''
                        }
                      >
                        {slot}
                      </button>
                    )
                  })}
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
                        <span>{formatVnd((Number(service.Price || 0) * Number(service.quantity || 0)))}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="total-lines">
                  <div><span>Subtotal</span><span>{formatVnd(subtotal)}</span></div>
                  <div><span>Duration</span><span>{totalDuration} min</span></div>
                </div>

                <div className="gift-row-booking">
                  {promotionEnabled && allowCustomerApply ? (
                    <>
                      <input
                        type="text"
                        placeholder="Enter promotion code..."
                        value={giftCode}
                        onChange={(event) => {
                          setGiftCode(event.target.value)
                          setAppliedPromotion(null)
                          if (promoMessage) setPromoMessage('')
                        }}
                      />
                      <button type="button" onClick={applyPromotionCode}>Apply</button>
                    </>
                  ) : promotionEnabled ? (
                    <div className="summary-empty">This salon has disabled customer promotion codes.</div>
                  ) : (
                    <div className="summary-empty">Promotions are currently disabled by salon settings.</div>
                  )}
                </div>

                {promotionEnabled && allowCustomerApply && availablePromotions.length > 0 ? (
                  <div className="booking-promoSuggest">
                    <div className="booking-promoSuggestTitle">Available programs</div>
                    <div className="booking-promoSuggestList">
                      {availablePromotions.map((promo, idx) => {
                        const code = String(promo.code || '').trim()
                        const name = String(promo.title || '').trim() || code
                        return (
                          <button
                            key={`${code}-${idx}`}
                            type="button"
                            className={`booking-promoSuggestItem ${giftCode.trim().toUpperCase() === code.toUpperCase() ? 'active' : ''}`}
                            onClick={() => pickPromotionSuggestion(promo)}
                            title={`Use code ${code}`}
                          >
                            <span className="booking-promoSuggestName">{name}</span>
                            <span className="booking-promoSuggestMeta">{formatPromotionType(promo)} • {code}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {promoMessage ? <p className="summary-empty" style={{ marginTop: 8 }}>{promoMessage}</p> : null}

                <div className="discount-row">
                  <span><IoTicketOutline /> Sale</span>
                  <span>- {formatVnd(discount)}</span>
                </div>

                {appliedPromotion ? (
                  <div className="booking-appliedPromo">
                    <div className="booking-appliedPromoTitle">
                      Program: {String(appliedPromotion.title || '').trim() || String(appliedPromotion.code || '').trim()}
                    </div>
                    <div className="booking-appliedPromoMeta">
                      Type: {formatPromotionType(appliedPromotion)}
                    </div>
                  </div>
                ) : null}

                <div className="booking-total-row">
                  <strong>Total</strong>
                  <strong>{formatVnd(total)}</strong>
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
