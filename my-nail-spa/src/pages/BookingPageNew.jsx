import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Minus,
  Phone,
  Plus,
  Scissors,
  SquareCheck,
  StickyNote,
  Star,
  User,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBookings } from '../context/BookingContext'
import { api } from '../lib/api'
import { addDaysISO } from '../lib/dates'
import { formatUsd } from '../lib/money'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatDateDisplay(isoDate) {
  const [year, month, day] = isoDate.split('-')
  return `${day}-${month}-${year}`
}

function toMinutes(time) {
  const [h, m] = String(time || '').split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

function timeSlots(start = '09:00', end = '19:00', stepMinutes = 30) {
  const results = []
  let cursor = toMinutes(start)
  const limit = toMinutes(end)
  while (cursor <= limit) {
    const h = String(Math.floor(cursor / 60)).padStart(2, '0')
    const m = String(cursor % 60).padStart(2, '0')
    results.push(`${h}:${m}`)
    cursor += stepMinutes
  }
  return results
}

function estimateDuration(selectedIds, services, quantities) {
  if (!Array.isArray(selectedIds) || !selectedIds.length) return 60
  return selectedIds.reduce((sum, id) => {
    const svc = services.find((s) => s.id === id)
    const qty = quantities[id] || 1
    return sum + ((svc?.durationMin ?? 0) * qty)
  }, 0) || 60
}

function estimatePrice(selectedIds, services, quantities) {
  if (!Array.isArray(selectedIds) || !selectedIds.length) return 0
  return selectedIds.reduce((sum, id) => {
    const svc = services.find((s) => s.id === id)
    const qty = quantities[id] || 1
    return sum + ((svc?.price ?? 0) * qty)
  }, 0)
}

export default function BookingPageNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preSalon = searchParams.get('salonId') || ''

  const auth = useAuth()
  const bookings = useBookings()

  const [salons, setSalons] = useState([])
  const [profiles, setProfiles] = useState([])
  const [availability, setAvailability] = useState({})
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [salonId, setSalonId] = useState(preSalon)

  // Load salons + profiles
  useEffect(() => {
    let alive = true
    api
      .listSalons()
      .then((r) => {
        if (!alive) return
        setSalons(Array.isArray(r?.items) ? r.items : [])
      })
      .catch(() => {
        if (!alive) return
        setSalons([])
      })

    api
      .listSalonProfiles()
      .then((r) => {
        if (!alive) return
        setProfiles(Array.isArray(r?.items) ? r.items : [])
      })
      .catch(() => {
        if (!alive) return
        setProfiles([])
      })

    return () => {
      alive = false
    }
  }, [])

  const profileBySalonId = useMemo(() => {
    const map = {}
    for (const p of profiles) {
      if (p?.salonId) map[p.salonId] = p
    }
    return map
  }, [profiles])

  const salonItems = useMemo(() => {
    return salons.map((s) => {
      const p = profileBySalonId?.[s.id]
      return {
        ...s,
        name: p?.name || s.name,
        address: p?.address || s.address,
        logo: p?.avatarImageUrl || p?.logoUrl || s.logo,
      }
    })
  }, [profileBySalonId, salons])

  const salon = useMemo(
    () => salonItems.find((s) => s.id === salonId) || null,
    [salonId, salonItems],
  )

  const [servicesForSalon, setServicesForSalon] = useState([])

  useEffect(() => {
    let alive = true
    if (!salonId) {
      setServicesForSalon([])
      return undefined
    }
    api
      .listSalonServices(salonId)
      .then((r) => {
        if (!alive) return
        setServicesForSalon(Array.isArray(r?.items) ? r.items : [])
      })
      .catch(() => {
        if (!alive) return
        setServicesForSalon([])
      })
    return () => {
      alive = false
    }
  }, [salonId])

  const dateOptions = useMemo(() => {
    const start = todayISO()
    return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))
  }, [])

  const [dateISO, setDateISO] = useState(dateOptions[0])
  const [technicianId, setTechnicianId] = useState('auto')
  const [selectedServices, setSelectedServices] = useState([])
  const [serviceQuantities, setServiceQuantities] = useState({}) // { serviceId: quantity }
  const [serviceActiveTab, setServiceActiveTab] = useState('All')
  const [servicePage, setServicePage] = useState(1)
  const [timeSlot, setTimeSlot] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('pay_at_store')
  const [giftCode, setGiftCode] = useState('')
  const [giftApplied, setGiftApplied] = useState(0)
  const [giftMessage, setGiftMessage] = useState('')
  const [applyingGift, setApplyingGift] = useState(false)
  const [customer, setCustomer] = useState(() => ({ 
    name: auth.user?.name || '', 
    phone: auth.user?.phone || '', 
    note: '' 
  }))
  const [confirmed, setConfirmed] = useState(null)

  // Load time slot availability
  useEffect(() => {
    let alive = true
    
    if (!salonId || !dateISO || !selectedServices.length) {
      setAvailability({})
      return undefined
    }

    setAvailabilityLoading(true)
    
    api.getTimeSlotAvailability({
      salonId,
      dateISO,
      technicianId: technicianId === 'auto' ? undefined : technicianId,
      serviceIds: selectedServices
    })
      .then((res) => {
        if (!alive) return
        setAvailability(res || {})
      })
      .catch((err) => {
        if (!alive) return
        console.error('Failed to load availability:', err)
        setAvailability({})
      })
      .finally(() => {
        if (!alive) return
        setAvailabilityLoading(false)
      })

    return () => {
      alive = false
    }
  }, [salonId, dateISO, technicianId, selectedServices])

  const pricing = useMemo(() => {
    const duration = estimateDuration(selectedServices, servicesForSalon, serviceQuantities)
    const subtotal = estimatePrice(selectedServices, servicesForSalon, serviceQuantities)
    
    return { 
      duration, 
      subtotal, 
      discount: 0, 
      appliedDeals: [], 
      totalBeforeGift: subtotal 
    }
  }, [selectedServices, servicesForSalon, serviceQuantities])

  const netPrice = useMemo(() => 
    Math.max(0, pricing.totalBeforeGift - giftApplied), 
    [giftApplied, pricing.totalBeforeGift]
  )

  const availableSlots = useMemo(() => {
    return availability?.availableSlots || []
  }, [availability])

  function isSlotAvailable(slot) {
    if (availabilityLoading) return false
    if (!selectedServices.length) return false
    return availableSlots.includes(slot)
  }

  function updateServiceQuantity(serviceId, delta) {
    setServiceQuantities(prev => {
      const current = prev[serviceId] || 0
      const newQty = Math.max(0, current + delta)
      
      if (newQty === 0) {
        const { [serviceId]: _, ...rest } = prev
        setSelectedServices(curr => curr.filter(id => id !== serviceId))
        return rest
      } else {
        // Use functional update to avoid stale closure
        setSelectedServices(curr => {
          if (!curr.includes(serviceId)) {
            return [...curr, serviceId]
          }
          return curr
        })
        return { ...prev, [serviceId]: newQty }
      }
    })
    setTimeSlot('')
  }

  const serviceTabs = ['All', 'Manicures', 'Pedicures', 'Nail Enhancements', 'Other']

  const filteredServices = useMemo(() => {
    if (serviceActiveTab === 'All') return servicesForSalon
    return servicesForSalon.filter(svc => {
      const category = String(svc.category || '').toLowerCase()
      const tab = serviceActiveTab.toLowerCase()
      return category.includes(tab.replace(/ /g, ''))
    })
  }, [servicesForSalon, serviceActiveTab])

  const SERVICES_PER_PAGE = 10
  const paginatedServices = useMemo(() => {
    const start = (servicePage - 1) * SERVICES_PER_PAGE
    return filteredServices.slice(start, start + SERVICES_PER_PAGE)
  }, [filteredServices, servicePage])

  const totalPages = Math.ceil(filteredServices.length / SERVICES_PER_PAGE)

  async function submit() {
    if (!salonId) return alert('Please select a salon')
    if (!selectedServices.length) return alert('Please select at least one service')
    if (!timeSlot) return alert('Please select a time')
    
    // Re-check availability
    try {
      const freshAvailability = await api.getTimeSlotAvailability({
        salonId,
        dateISO,
        technicianId: technicianId === 'auto' ? undefined : technicianId,
        serviceIds: selectedServices
      })
      
      if (!freshAvailability?.availableSlots?.includes(timeSlot)) {
        alert('The selected time slot is no longer available. Please choose another time.')
        setAvailability(freshAvailability || {})
        setTimeSlot('')
        return
      }
    } catch (err) {
      console.error('Failed to verify availability:', err)
      return alert('Failed to verify time slot availability. Please try again.')
    }
    
    if (!customer.name.trim()) return alert('Please enter your name')

    try {
      const payload = {
        salonId,
        salonName: salon?.name,
        dateISO,
        timeSlot,
        technicianId: technicianId === 'auto' ? null : technicianId,
        technicianName: technicianId === 'auto' 
          ? 'Auto-assign' 
          : salon?.technicians?.find((tObj) => tObj.id === technicianId)?.name || 'Any',
        serviceIds: selectedServices,
        totalPrice: netPrice,
        customerName: customer.name,
        customerPhone: customer.phone,
        paymentMethod,
        giftCode: giftCode.trim() || undefined,
        note: customer.note || undefined,
        returnUrl: `${window.location.origin}/payment/vnpay-return`,
      }

      if (paymentMethod === 'online') {
        const resp = await api.createBookingVnpayPayment(payload)
        if (resp?.paymentUrl) {
          window.location.href = resp.paymentUrl
          return
        }
        throw new Error('Payment URL not returned')
      }

      const record = await bookings.create(payload)
      setConfirmed({ ...record, paymentMethod })
      setGiftApplied(0)
      setGiftCode('')
      setTimeSlot('')
    } catch (err) {
      alert(err?.message || 'Booking failed')
    }
  }

  async function applyGift() {
    const code = giftCode.trim()
    if (!code) return setGiftMessage('Enter a code')
    if (!pricing.totalBeforeGift) return setGiftMessage('Select services first')
    
    setApplyingGift(true)
    setGiftMessage('')
    
    try {
      const res = await api.checkGiftCardByTitle(code, pricing.totalBeforeGift)
      const applied = Number(res?.applied || 0)
      if (applied > 0) {
        setGiftApplied(applied)
        setGiftMessage(`Applied ${formatUsd(applied)}`)
        return
      }
    } catch  {
      // ignore
    }

    setGiftApplied(0)
    setGiftMessage('Invalid gift code')
    setApplyingGift(false)
  }

  const selectedTech = useMemo(() => {
    if (technicianId === 'auto') {
      return { id: 'auto', name: 'Auto', avatar: null }
    }
    return salon?.technicians?.find(t => t.id === technicianId) || null
  }, [technicianId, salon])

  // Get selected services with quantities for summary
  const selectedServicesWithQty = useMemo(() => {
    // Deduplicate selectedServices just in case
    const uniqueIds = [...new Set(selectedServices)]
    
    return uniqueIds.map(sId => {
      const svc = servicesForSalon.find(s => s.id === sId)
      return {
        ...svc,
        quantity: serviceQuantities[sId] || 0
      }
    }).filter(s => s.quantity > 0)
  }, [selectedServices, servicesForSalon, serviceQuantities])

  return (
    <section className="section" style={{ background: '#FAF5F0', minHeight: '100vh' }}>
      <div className="container">
        {/* Header */}
        <div className="bookingPageHeader">
          <button className="backBtn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1>BOOK YOUR APPOINTMENT</h1>
          <p className="subtitle">Easily book your appointment online</p>
        </div>

        <div className="grid twoCol bookingLayout">
          {/* Left Panel - Step 1 */}
          <div className="card" style={{ padding: 24, background: 'white', borderRadius: 16 }}>
            <div className="bookingStep">
              <div className="stepBadge">1</div>
              <div className="stepTitle">Select salon & services</div>
            </div>

            {/* Salon Selection */}
            <div style={{ marginBottom: 20 }}>
              <label>
                <div className="searchLabel" style={{ marginBottom: 8 }}>
                  <MapPin size={16} /> Salon
                </div>
                {!salon ? (
                  <select
                    className="input"
                    value={salonId}
                    onChange={(e) => {
                      setSalonId(e.target.value)
                      setSelectedServices([])
                      setServiceQuantities({})
                      setTimeSlot('')
                    }}
                  >
                    <option value="">-- Select a salon --</option>
                    {salons.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    padding: 12, 
                    background: '#FAF5F0', 
                    borderRadius: 12 
                  }}>
                    {salon.logo && (
                      <img 
                        src={salon.logo} 
                        alt={salon.name}
                        style={{ 
                          width: 48, 
                          height: 48, 
                          borderRadius: 12, 
                          objectFit: 'cover' 
                        }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#2d1b24' }}>
                        {salon.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#6a5562', marginTop: 2 }}>
                        {salon.address}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Star size={12} fill="#FFB800" stroke="#FFB800" />
                        <span style={{ fontSize: 12, color: '#6a5562' }}>
                          {salon.rating || '5.0'} · {salon.reviews || 0} reviews
                        </span>
                      </div>
                    </div>
                    <button 
                      className="btn"
                      style={{ padding: '6px 16px', fontSize: 13 }}
                      onClick={() => {
                        setSalonId('')
                        setSelectedServices([])
                        setServiceQuantities({})
                        setTimeSlot('')
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}
              </label>
            </div>

            {/* Technician Selection */}
            <div style={{ marginBottom: 24 }}>
              <div className="searchLabel" style={{ marginBottom: 8 }}>
                <User size={16} /> Technician
              </div>
              {!salon ? (
                <div style={{ 
                  padding: 20, 
                  textAlign: 'center', 
                  background: '#f9f9f9', 
                  borderRadius: 12,
                  color: '#6a5562',
                  fontSize: 13
                }}>
                  Please select a salon first
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12, 
                  padding: 12, 
                  background: '#FAF5F0', 
                  borderRadius: 12 
                }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: '#C19A6B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600
                  }}>
                    {selectedTech?.name?.[0] || 'A'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#2d1b24' }}>
                      {selectedTech?.name || 'Auto'}
                    </div>
                    <div style={{ fontSize: 12, color: '#6a5562', marginTop: 2 }}>
                      {technicianId === 'auto' ? 'Auto-assign' : 'Staff Member'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Star size={12} fill="#FFB800" stroke="#FFB800" />
                      <span style={{ fontSize: 12, color: '#6a5562' }}>5.0</span>
                    </div>
                  </div>
                  <select
                    className="btn"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    value={technicianId}
                    onChange={(e) => {
                      setTechnicianId(e.target.value)
                      setTimeSlot('')
                    }}
                  >
                    <option value="auto">Auto</option>
                    {(salon?.technicians ?? []).map((tech) => (
                      <option key={tech.id} value={tech.id}>{tech.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Services */}
            <div style={{ marginBottom: 24 }}>
              <div className="searchLabel" style={{ marginBottom: 8 }}>
                <SquareCheck size={16} /> Services
              </div>
              {!salon ? (
                <div style={{ 
                  padding: 20, 
                  textAlign: 'center', 
                  background: '#f9f9f9', 
                  borderRadius: 12,
                  color: '#6a5562',
                  fontSize: 13
                }}>
                  Please select a salon first
                </div>
              ) : (
                <>
                  {/* Service Tabs */}
                  <div className="serviceTabs">
                    {serviceTabs.map(tab => (
                      <button
                        key={tab}
                        className={`serviceTab ${serviceActiveTab === tab ? 'active' : ''}`}
                        onClick={() => setServiceActiveTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Service List */}
                  <div style={{ minHeight: 300 }}>
                  {paginatedServices.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 32, color: '#6a5562' }}>
                      No services available in this category
                    </div>
                  )}
                  {paginatedServices.map(svc => {
                    const qty = serviceQuantities[svc.id] || 0
                    return (
                      <div key={svc.id} className="serviceListItem">
                        <div className="serviceInfo">
                          <h4>{svc.name}</h4>
                          <div className="duration">{svc.durationMin || 60} minutes</div>
                        </div>
                        <div className="serviceActions">
                          <div className="qtyControl">
                            <button 
                              className="qtyBtn"
                              onClick={() => updateServiceQuantity(svc.id, -1)}
                              disabled={qty === 0}
                            >
                              <Minus size={14} />
                            </button>
                            <div className="qtyDisplay">{qty}</div>
                            <button 
                              className="qtyBtn"
                              onClick={() => updateServiceQuantity(svc.id, 1)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <div className="priceTag">From {formatUsd(svc.price)}</div>
                          <button 
                            className="bookServiceBtn"
                            onClick={() => updateServiceQuantity(svc.id, 1)}
                          >
                            Book
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: 8, 
                    marginTop: 16,
                    paddingTop: 16,
                    borderTop: '1px solid rgba(194, 132, 81, 0.1)'
                  }}>
                    <button
                      onClick={() => setServicePage(p => Math.max(1, p - 1))}
                      disabled={servicePage === 1}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        background: 'transparent',
                        cursor: servicePage === 1 ? 'not-allowed' : 'pointer',
                        opacity: servicePage === 1 ? 0.3 : 1,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                      // Show first, last, current, and adjacent pages
                      if (
                        page === 1 || 
                        page === totalPages || 
                        page === servicePage ||
                        Math.abs(page - servicePage) === 1
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setServicePage(page)}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: page === servicePage ? '2px solid #C19A6B' : '1px solid rgba(194, 132, 81, 0.2)',
                              background: page === servicePage ? '#C19A6B' : 'white',
                              color: page === servicePage ? 'white' : '#2d1b24',
                              fontSize: 13,
                              fontWeight: page === servicePage ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {page}
                          </button>
                        )
                      } else if (
                        page === servicePage - 2 || 
                        page === servicePage + 2
                      ) {
                        return <span key={page} style={{ color: '#6a5562' }}>...</span>
                      }
                      return null
                    })}
                    
                    <button
                      onClick={() => setServicePage(p => Math.min(totalPages, p + 1))}
                      disabled={servicePage === totalPages}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        background: 'transparent',
                        cursor: servicePage === totalPages ? 'not-allowed' : 'pointer',
                        opacity: servicePage === totalPages ? 0.3 : 1,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
                </>
              )}
            </div>

            {/* Schedule Section */}
            <div>
              <div className="searchLabel" style={{ marginBottom: 12 }}>
                <Clock size={16} /> Schedule
              </div>
              {!salon ? (
                <div style={{ 
                  padding: 20, 
                  textAlign: 'center', 
                  background: '#f9f9f9', 
                  borderRadius: 12,
                  color: '#6a5562',
                  fontSize: 13
                }}>
                  Please select a salon first
                </div>
              ) : !selectedServices.length ? (
                <div style={{ 
                  padding: 20, 
                  textAlign: 'center', 
                  background: '#fff3cd', 
                  borderRadius: 12,
                  color: '#856404',
                  fontSize: 13
                }}>
                  Please select at least one service
                </div>
              ) : (
                <>
                  {/* Date Picker */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 14, fontWeight: 500, color: '#2d1b24', display: 'block', marginBottom: 8 }}>
                      Date
                    </label>
                    <select 
                      className="input" 
                      value={dateISO} 
                      onChange={(e) => { 
                        setDateISO(e.target.value)
                        setTimeSlot('')
                      }}
                    >
                      {dateOptions.map((d) => (
                        <option key={d} value={d}>{formatDateDisplay(d)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Available Times */}
                  <div>
                  <label style={{ fontSize: 14, fontWeight: 500, color: '#2d1b24', display: 'block', marginBottom: 8 }}>
                    Available times
                    {availabilityLoading && <span style={{ marginLeft: 8, fontSize: 12, color: '#6a5562' }}>(Loading...)</span>}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {timeSlots().map((slot) => {
                      const available = isSlotAvailable(slot)
                      const active = timeSlot === slot
                      const disabled = !available ||  availabilityLoading
                      
                      return (
                        <button
                          key={slot}
                          onClick={() => available && setTimeSlot(slot)}
                          disabled={disabled}
                          style={{
                            padding: '10px 8px',
                            borderRadius: 20,
                            border: active ? '2px solid #C19A6B' : '1px solid rgba(194, 132, 81, 0.2)',
                            background: active ? '#C19A6B' : disabled ? 'rgba(220,220,220,0.3)' : 'white',
                            color: active ? 'white' : disabled ? '#999' : '#2d1b24',
                            fontSize: 13,
                            fontWeight: active ? 600 : 400,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {slot}
                        </button>
                      )
                    })}
                  </div>
                  
                    {availableSlots.length === 0 && !availabilityLoading && (
                      <div style={{ 
                        marginTop: 12, 
                        padding: 12, 
                        background: '#fff3cd', 
                        borderRadius: 8,
                        fontSize: 13,
                        color: '#856404'
                      }}>
                        No available times. Try a different date or technician.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Step 2 */}
          <div className="card" style={{ padding: 24, background: 'white', borderRadius: 16 }}>
            <div className="bookingStep">
              <div className="stepBadge">2</div>
              <div className="stepTitle">Confirmation</div>
            </div>

            {/* Salon Info Summary */}
            {salon && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: 12, 
                background: '#FAF5F0', 
                borderRadius: 12,
                marginBottom: 20
              }}>
                {salon.logo && (
                  <img 
                    src={salon.logo} 
                    alt={salon.name}
                    style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#2d1b24' }}>
                    {salon.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6a5562', marginTop: 2 }}>
                    {salon.address}
                  </div>
                </div>
              </div>
            )}

            {/* Date & Time */}
            {(dateISO || timeSlot) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <CalendarDays size={14} style={{ color: '#6a5562' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2d1b24' }}>Date & Time</span>
                </div>
                <div style={{ fontSize: 13, color: '#6a5562', marginLeft: 22 }}>
                  {dateISO && formatDateDisplay(dateISO)}
                  {timeSlot && ` · ${timeSlot}`}
                </div>
              </div>
            )}

            {/* Technician */}
            {selectedTech && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <User size={14} style={{ color: '#6a5562' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2d1b24' }}>Technician</span>
                </div>
                <div style={{ fontSize: 13, color: '#6a5562', marginLeft: 22 }}>
                  {selectedTech.name}
                </div>
              </div>
            )}

            {/* Your Information */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#2d1b24', marginBottom: 12 }}>
                Your Information
              </div>
              
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6a5562' }} />
                  <input 
                    className="input" 
                    placeholder="Phone number..." 
                    value={customer.phone}
                    onChange={(e) => setCustomer(p => ({ ...p, phone: e.target.value }))}
                    style={{ paddingLeft: 40 }}
                  />
                </div>
                
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6a5562' }} />
                  <input 
                    className="input" 
                    placeholder="User name..." 
                    value={customer.name}
                    onChange={(e) => setCustomer(p => ({ ...p, name: e.target.value }))}
                    style={{ paddingLeft: 40 }}
                  />
                </div>
                
                <div style={{ position: 'relative' }}>
                  <StickyNote size={16} style={{ position: 'absolute', left: 12, top: 16, color: '#6a5562' }} />
                  <textarea 
                    className="input" 
                    placeholder="Add note (optional)" 
                    value={customer.note}
                    onChange={(e) => setCustomer(p => ({ ...p, note: e.target.value }))}
                    style={{ paddingLeft: 40, minHeight: 60, resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Booking Summary */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#2d1b24', marginBottom: 12 }}>
                Booking Summary
              </div>
              
              <table className="bookingSummaryTable">
                <thead>
                  <tr>
                    <th>Services</th>
                    <th style={{ textAlign: 'center' }}>Duration</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedServicesWithQty.map(svc => (
                    <tr key={svc.id}>
                      <td>
                        {svc.name}
                        {svc.quantity > 1 && ` x${svc.quantity}`}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {(svc.durationMin || 60) * svc.quantity} min
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {formatUsd((svc.price || 0) * svc.quantity)}
                      </td>
                    </tr>
                  ))}
                  {selectedServicesWithQty.length === 0 && (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', color: '#6a5562', fontStyle: 'italic' }}>
                        No services selected
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Subtotal */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '8px 0',
                borderTop: '1px solid rgba(194, 132, 81, 0.2)'
              }}>
                <span style={{ fontSize: 13, color: '#6a5562' }}>Subtotal</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2d1b24' }}>
                  {pricing.duration} hours
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2d1b24' }}>
                  {formatUsd(pricing.subtotal)}
                </span>
              </div>

              {/* Gift Code */}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <input 
                  className="input" 
                  placeholder="Enter Gift code" 
                  value={giftCode}
                  onChange={(e) => setGiftCode(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button 
                  className="btn"
                  onClick={applyGift}
                  disabled={applyingGift || !pricing.subtotal}
                  style={{ padding: '8px 16px', fontSize: 13 }}
                >
                  Apply
                </button>
              </div>
              {giftMessage && (
                <div style={{ fontSize: 12, color: giftApplied > 0 ? '#22c55e' : '#dc2626', marginTop: 4 }}>
                  {giftMessage}
                </div>
              )}

              {/* Sale */}
              {giftApplied > 0 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '8px 0',
                  fontSize: 13,
                  color: '#22c55e'
                }}>
                  <span>Sale</span>
                  <span fontWeight={600}>-{formatUsd(giftApplied)}</span>
                </div>
              )}

              {/* Total */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '12px 0',
                borderTop: '2px solid rgba(194, 132, 81, 0.3)',
                marginTop: 8
              }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#2d1b24' }}>Total</span>
                <span className="totalRow">{formatUsd(netPrice)}</span>
              </div>
            </div>

            {/* Payment Method */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#2d1b24', marginBottom: 8 }}>
                Payment method
              </div>
              <div className="paymentMethodGroup">
                <label className="radioOption">
                  <input 
                    type="radio" 
                    name="payment" 
                    value="pay_at_store"
                    checked={paymentMethod === 'pay_at_store'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <span style={{ fontSize: 13 }}>Pay at Store</span>
                </label>
                <label className="radioOption">
                  <input 
                    type="radio" 
                    name="payment" 
                    value="online"
                    checked={paymentMethod === 'online'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <span style={{ fontSize: 13 }}>Pay online</span>
                </label>
              </div>
            </div>

            {/* View Directions Button */}
            {salon && (
              <button 
                className="btn"
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  justifyContent: 'center', 
                  marginBottom: 12,
                  background: 'transparent',
                  border: '1px solid rgba(194, 132, 81, 0.3)',
                  color: '#6a5562'
                }}
                onClick={() => {
                  if (salon.address) {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.address)}`, '_blank')
                  }
                }}
              >
                <MapPin size={16} />
                <span>View directions</span>
              </button>
            )}

            {/* Book Now Button */}
            <button 
              className="bookNowBtn"
              onClick={submit}
              disabled={!salon || !selectedServices.length || !timeSlot || !customer.name}
            >
              <CalendarCheck size={18} />
              <span>Book Now</span>
            </button>

            {/* Confirmation Message */}
            {confirmed && (
              <div style={{ 
                marginTop: 16, 
                padding: 16, 
                background: '#d4edda', 
                border: '1px solid #c3e6cb',
                borderRadius: 12,
                textAlign: 'center'
              }}>
                <div style={{ fontWeight: 700, color: '#155724', marginBottom: 4 }}>
                  Booking confirmed!
                </div>
                <div style={{ fontSize: 13, color: '#155724' }}>
                  {confirmed.salonName} · {confirmed.dateISO} · {confirmed.timeSlot}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
