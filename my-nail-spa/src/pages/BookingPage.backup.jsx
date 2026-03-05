import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  Clock,
  MapPin,
  Minus,
  Phone,
  Plus,
  Scissors,
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

function estimateDuration(selectedIds, services) {
  if (!Array.isArray(selectedIds) || !selectedIds.length) return 60
  return selectedIds.reduce((sum, id) => {
    const svc = services.find((s) => s.id === id)
    return sum + (svc?.durationMin ?? 0)
  }, 0) || 60
}

function estimatePrice(selectedIds, services) {
  if (!Array.isArray(selectedIds) || !selectedIds.length) return 0
  return selectedIds.reduce((sum, id) => {
    const svc = services.find((s) => s.id === id)
    return sum + (svc?.price ?? 0)
  }, 0)
}

export default function BookingPage() {
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
  const [timeSlot, setTimeSlot] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('pay_at_store')
  const [giftCode, setGiftCode] = useState('')
  const [giftApplied, setGiftApplied] = useState(0)
  const [giftMessage, setGiftMessage] = useState('')
  const [applyingGift, setApplyingGift] = useState(false)
  const [customer, setCustomer] = useState(() => ({ name: auth.user?.name || '', phone: auth.user?.phone || '', note: '' }))
  const [confirmed, setConfirmed] = useState(null)
  const [activeDeals, setActiveDeals] = useState([])

  // Load time slot availability when salon, date, technician, or services change
  useEffect(() => {
    let alive = true
    
    if (!salonId || !dateISO) {
      setAvailability({})
      return undefined
    }

    // Need at least one service selected to get accurate duration
    if (!selectedServices.length) {
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

  // Load deals for selected salon
  useEffect(() => {
    let alive = true
    if (!salonId) {
      setActiveDeals([])
      return undefined
    }
    // Specific profile fetch to get dailyDeals and giftCards
    api.getSalonProfile(salonId)
      .then((res) => {
        if (!alive) return
        const deals = res?.item?.dailyDeals || []
        setActiveDeals(deals.filter(d => d.active))
      })
      .catch(() => {
        if (!alive) return
        setActiveDeals([])
      })
    return () => {
      alive = false
    }
  }, [salonId])

  const pricing = useMemo(() => {
    const duration = estimateDuration(selectedServices, servicesForSalon)
    const subtotal = estimatePrice(selectedServices, servicesForSalon)
    
    // Calculate discounts
    let discount = 0
    const appliedDeals = []

    // Only apply if we have services selected.
    // If we have time-based deals, we specifically need timeSlot.
    // If date-based, we need dateISO.
    if (selectedServices.length > 0 && activeDeals.length > 0) {
      if (dateISO) {
        const dateObj = new Date(dateISO)
        const dayOfWeek = dateObj.getDay() // 0=Sun, 1=Mon...
        // Map JS day (0-6) to deal day (usually 1-7 or string Mon-Sun in policies, but let's check JSON schema).
        // schema from conversation: "Mon", "Tue" etc.
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const currentDayStr = days[dayOfWeek]

        for (const serviceId of selectedServices) {
          const svc = servicesForSalon.find(s => s.id === serviceId)
          if (!svc) continue
          
          const price = svc.price || 0
          
          // Find best deal for this service
          let bestDealAmt = 0
          let bestDealRef = null

          for (const deal of activeDeals) {
            try {
              if (!deal.notes) continue
              const rules = JSON.parse(deal.notes)
              
              // 1. Valid Date Range
              if (rules.startDate && dateISO < rules.startDate) continue
              if (rules.endDate && dateISO > rules.endDate) continue
              
              // 2. Days of Week
              if (Array.isArray(rules.daysOfWeek) && rules.daysOfWeek.length > 0) {
                if (!rules.daysOfWeek.includes(currentDayStr)) continue
              }

              // 3. Time Slot (Happy Hour)
              if (rules.startTime || rules.endTime) {
                if (!timeSlot) continue // Cannot apply if time not selected
                const slotMins = toMinutes(timeSlot)
                if (rules.startTime && slotMins < toMinutes(rules.startTime)) continue
                if (rules.endTime && slotMins > toMinutes(rules.endTime)) continue
              }

              // 4. Service Specific
              if (Array.isArray(rules.serviceTypeIds) && rules.serviceTypeIds.length > 0) {
                if (!rules.serviceTypeIds.includes(serviceId)) continue
              }

              // Calculate
              let amt = 0
              if (rules.discountType === 'percent') {
                amt = price * (Number(rules.discountValue) / 100)
              } else if (rules.discountType === 'fixed') {
                amt = Number(rules.discountValue)
              }
              
              // Cap at price
              if (amt > price) amt = price
              
              if (amt > bestDealAmt) {
                bestDealAmt = amt
                bestDealRef = deal
              }
            } catch {
              // ignore invalid json
            }
          }

          if (bestDealAmt > 0) {
            discount += bestDealAmt
            // Aggregate deal names
            if (bestDealRef) {
              const existing = appliedDeals.find(d => d.id === bestDealRef.id)
              if (existing) existing.amount += bestDealAmt
              else appliedDeals.push({ id: bestDealRef.id, title: bestDealRef.title, amount: bestDealAmt })
            }
          }
        }
      }
    }

    return { 
      duration, 
      subtotal, 
      discount, 
      appliedDeals, 
      totalBeforeGift: Math.max(0, subtotal - discount) 
    }
  }, [selectedServices, servicesForSalon, activeDeals, dateISO, timeSlot])

  const netPrice = useMemo(() => Math.max(0, pricing.totalBeforeGift - giftApplied), [giftApplied, pricing.totalBeforeGift])


  const bookingDurationMins = useCallback((booking) => {
    if (!booking?.serviceIds?.length || !servicesForSalon.length) return 60
    return booking.serviceIds.reduce((sum, sid) => {
      const svc = servicesForSalon.find((s) => s.id === sid)
      return sum + (svc?.durationMin ?? 0)
    }, 0) || 60
  }, [servicesForSalon])

  // Use availability data from API instead of local calculation
  const availableSlots = useMemo(() => {
    return availability?.availableSlots || []
  }, [availability])

  const unavailableSlots = useMemo(() => {
    const slots = availability?.unavailableSlots || []
    return new Set(slots)
  }, [availability])

  function isSlotAvailable(slot) {
    // When loading, disable all slots
    if (availabilityLoading) return false
    
    // If no services selected, disable all slots
    if (!selectedServices.length) return false
    
    // Check if slot is in available list
    return availableSlots.includes(slot)
  }

  const isTechFreeAt = useCallback((techId, slot, durationMin) => {
    const start = toMinutes(slot)
    const end = start + durationMin
    const day = bookings.forSalonOnDay(salonId, dateISO)
    return !day.some((b) => {
      if (b.technicianId !== techId) return false
      if (!b.timeSlot) return false
      const bStart = toMinutes(b.timeSlot)
      const bEnd = bStart + bookingDurationMins(b)
      return start < bEnd && end > bStart
    })
  }, [bookingDurationMins, bookings, dateISO, salonId])


  const takenTimes = useMemo(() => {
    if (!salonId) return new Set()
    const day = bookings.forSalonOnDay(salonId, dateISO)
    return new Set(day.map((b) => b.timeSlot).filter(Boolean))
  }, [bookings, salonId, dateISO])

  function isSlotUnavailableForAuto(slot) {
    if (!salon) return true
    const duration = pricing.duration || 30
    const staff = salon.technicians || []
    for (const techObj of staff) {
      const avail = availability[techObj.id]
      if (avail && avail.allowedSlots && avail.allowedSlots.size > 0 && !avail.allowedSlots.has(slot)) continue
      if (!isTechFreeAt(techObj.id, slot, duration)) continue
      return false
    }
    return true
  }


  const techBusy = useMemo(() => {
    if (!salonId || !technicianId || technicianId === 'auto') return []
    const day = bookings.forSalonOnDay(salonId, dateISO)
    return day.filter((b) => (b.technicianId && b.technicianId === technicianId))
  }, [bookings, salonId, dateISO, technicianId]);

  // Removed unused variable alternativeTechs

  function isSlotBlockedForTech(slot) {
    if (!salon || technicianId === 'auto') return false
    const avail = availability[technicianId]
    if (avail && avail.allowedSlots && avail.allowedSlots.size > 0 && !avail.allowedSlots.has(slot)) return true
    const start = toMinutes(slot)
    const end = start + (pricing.duration || 30)
    return techBusy.some((b) => {
      if (!b.timeSlot) return false
      const bStart = toMinutes(b.timeSlot)
      const bEnd = bStart + bookingDurationMins(b)
      return start < bEnd && end > bStart
    })
  }

  function toggleService(id) {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
    // Reset time slot when services change as availability will change
    setTimeSlot('')
  }

  function updateServiceQuantity(serviceId, delta) {
    setServiceQuantities(prev => {
      const current = prev[serviceId] || 0
      const newQty = Math.max(0, current + delta)
      
      if (newQty === 0) {
        const { [serviceId]: _, ...rest } = prev
        // Remove from selected services
        setSelectedServices(curr => curr.filter(id => id !== serviceId))
        return rest
      } else {
        // Add to selected services if not already there
        if (!selectedServices.includes(serviceId)) {
          setSelectedServices(curr => [...curr, serviceId])
        }
        return { ...prev, [serviceId]: newQty }
      }
    })
    // Reset time slot when services change
    setTimeSlot('')
  }

  const serviceTabs = ['All', 'Manicures', 'Pedicures', 'Nail Enhancements', 'Other']

  const filteredServices = useMemo(() => {
    if (serviceActiveTab === 'All') return servicesForSalon
    return servicesForSalon.filter(svc => {
      const category = String(svc.category || '').toLowerCase()
      const tab = serviceActiveTab.toLowerCase()
      return category.includes(tab) || tab.includes(category)
    })
  }, [servicesForSalon, serviceActiveTab])

  async function submit() {
    if (!salonId) return alert('Please select a salon')
    if (!selectedServices.length) return alert('Please select at least one service')
    if (!timeSlot) return alert('Please select a time')
    
    // Re-check availability before submitting to prevent race conditions
    try {
      const freshAvailability = await api.getTimeSlotAvailability({
        salonId,
        dateISO,
        technicianId: technicianId === 'auto' ? undefined : technicianId,
        serviceIds: selectedServices
      })
      
      if (!freshAvailability?.availableSlots?.includes(timeSlot)) {
        alert('The selected time slot is no longer available. Please choose another time.')
        // Refresh availability display
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
        technicianName: technicianId === 'auto' ? 'Auto-assign' : salon?.technicians?.find((tObj) => tObj.id === technicianId)?.name || 'Any',
        serviceIds: selectedServices,
        totalPrice: netPrice,
        customerName: customer.name,
        customerPhone: customer.phone,
        paymentMethod,
        giftCode: giftCode.trim() || undefined,
        note: pricing.appliedDeals.length ? `Discounts: ${pricing.appliedDeals.map(d => d.title).join(', ')}` : undefined,
        returnUrl: `${window.location.origin}/payment/vnpay-return`,
      }

      if (paymentMethod === 'online') {
        const resp = await api.createBookingVnpayPayment(payload)
        if (resp?.paymentUrl) return window.location.href = resp.paymentUrl
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
    const code = giftCode.trim();
    if (!code) return setGiftMessage('Enter a code');
    if (!pricing.totalBeforeGift) return setGiftMessage('Select services first');
    setApplyingGift(true);
    setGiftMessage('');
    // Try Gift Card first (ignore errors and fallthrough to promotions)
    try {
      const res = await api.checkGiftCardByTitle(code, pricing.totalBeforeGift);
      const applied = Number(res?.applied || 0);
      if (applied > 0) {
        setGiftApplied(applied);
        setGiftMessage('Applied {{amount}}'.replace('{{amount}}', formatUsd(applied)));
        return;
      }
    } catch  {
      // ignore and try promotion next
    }

    // Try Promotion
    try {
      const promoRes = await fetch('/api/promotions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, salonId, total: pricing.totalBeforeGift }),
      });
      if (!promoRes.ok) throw new Error('Promotion not found');
      const promo = await promoRes.json();
      const discount = Number(promo.discount || 0);
      if (discount > 0) {
        setGiftApplied(discount);
        setGiftMessage('Applied {{amount}}'.replace('{{amount}}', formatUsd(discount)) + ` (${promo.promotion.title})`);
      } else {
        setGiftApplied(0);
        setGiftMessage('No remaining balance or invalid code');
      }
    } catch (err) {
      setGiftApplied(0);
      setGiftMessage(err?.message || 'Gift card or promotion error');
    } finally {
      setApplyingGift(false);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>Booking</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <CalendarCheck size={16} />
            Schedule your appointment
          </div>
        </div>

        <div className="grid twoCol bookingLayout">
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Select salon & services</h3>

            <div style={{ display: 'grid', gap: 10 }}>
              <label>
                <div className="searchLabel">
                  <MapPin size={16} /> Salon
                </div>
                <select
                  className="input"
                  value={salonId}
                  onChange={(e) => {
                    setSalonId(e.target.value)
                    setSelectedServices([])
                    setTimeSlot('')
                  }}
                >
                  <option value="">-- Select a salon --</option>
                  {salons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              {salon && (
                <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div className="row">
                    <div>
                      <div style={{ fontWeight: 900 }}>{salon.name}</div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                        {salon.tagline} · {salon.address}
                      </div>
                    </div>
                    <div className="badge">
                      <Star size={14} /> {salon.rating} · {salon.reviews}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="searchLabel">
                  <Scissors size={16} /> Services
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                  {servicesForSalon.length ? servicesForSalon.map((svc) => {
                    const active = selectedServices.includes(svc.id)
                    return (
                      <button
                        key={svc.id}
                        className="chip"
                        onClick={() => toggleService(svc.id)}
                        style={{
                          background: active ? 'linear-gradient(135deg, rgba(255,59,122,0.22), rgba(255,122,69,0.18))' : undefined,
                          borderColor: active ? 'rgba(255,255,255,0.24)' : undefined,
                        }}
                      >
                        {svc.name} · {formatUsd(svc.price)}
                      </button>
                    )
                  }) : <div className="muted">Select a salon to see services.</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>
                  <div className="searchLabel">
                    <CalendarDays size={16} /> Date
                  </div>
                  <select className="input" value={dateISO} onChange={(e) => { setDateISO(e.target.value); setTimeSlot(''); }}>
                    {dateOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label>
                  <div className="searchLabel">
                    <User size={16} /> Technician
                  </div>
                  <select className="input" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} disabled={!salon}>
                    <option value="auto">Technician Auto (auto-assign)</option>
                    {(salon?.technicians ?? []).map((tech) => (
                      <option key={tech.id} value={tech.id}>{tech.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <div className="searchLabel">
                  <Clock size={16} /> Available times
                  {availabilityLoading && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>(Loading...)</span>}
                  {!selectedServices.length && !availabilityLoading && (
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>(Select services first)</span>
                  )}
                </div>
                
                {/* Time slot legend */}
                {selectedServices.length > 0 && !availabilityLoading && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, marginBottom: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(34,197,94,0.3)', border: '1px solid #22c55e' }} />
                      <span className="muted">Selected</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }} />
                      <span className="muted">Available</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)', opacity: 0.4 }} />
                      <span className="muted">Unavailable</span>
                    </div>
                  </div>
                )}
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                  {timeSlots().map((slot) => {
                    const available = isSlotAvailable(slot)
                    const active = timeSlot === slot
                    const disabled = !available || !salon || availabilityLoading
                    
                    return (
                      <button
                        key={slot}
                        className="btn timeSlotBtn"
                        onClick={() => available && setTimeSlot(slot)}
                        disabled={disabled}
                        title={
                          !selectedServices.length ? 'Select services first' :
                          availabilityLoading ? 'Loading availability...' :
                          !available ? 'Not available - already booked or outside working hours' : 
                          'Click to select this time'
                        }
                        style={{
                          opacity: disabled ? 0.4 : 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          borderColor: active ? '#22c55e' : !available ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)',
                          background: active 
                            ? 'rgba(34,197,94,0.2)' 
                            : !available 
                            ? 'rgba(239,68,68,0.12)' 
                            : 'rgba(255,255,255,0.06)',
                          padding: '10px 14px',
                          color: active ? '#22c55e' : !available ? '#fca5a5' : undefined,
                          fontWeight: active ? 600 : 400,
                          minWidth: '70px',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
                
                {selectedServices.length > 0 && availableSlots.length === 0 && !availabilityLoading && (
                  <div className="card" style={{ padding: 12, marginTop: 12, boxShadow: 'none', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <div style={{ fontSize: 13, color: '#fca5a5' }}>
                      No available time slots for the selected date and services. 
                      Try selecting a different date or technician.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Confirmation</h3>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="row">
                <span className="muted">Duration</span>
                <strong>{pricing.duration} min</strong>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Subtotal</span>
                <strong>{formatUsd(pricing.subtotal)}</strong>
              </div>
              
              {pricing.discount > 0 && (
                 <div className="row" style={{ marginTop: 8, color: '#22c55e' }}>
                   <span className="muted" style={{ color: '#22c55e' }}>Discount</span>
                   <strong>-{formatUsd(pricing.discount)}</strong>
                 </div>
              )}
              {pricing.appliedDeals.map((d, i) => (
                 <div key={i} className="row" style={{ marginTop: 2, fontSize: 13, color: '#22c55e' }}>
                   <span className="muted" style={{ color: '#22c55e', fontStyle: 'italic' }}>&nbsp; &nbsp; {d.title}</span>
                 </div>
              ))}

              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Gift card</span>
                <strong>-{formatUsd(giftApplied)}</strong>
              </div>
              <div className="row" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <span style={{ fontWeight: 900 }}>Total due</span>
                <span style={{ fontWeight: 900, fontSize: 18 }}>{formatUsd(netPrice)}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <div className="card" style={{ padding: 10, boxShadow: 'none' }}>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" placeholder="Gift card code" value={giftCode} onChange={(e) => setGiftCode(e.target.value)} />
                  <button className="btn" onClick={applyGift} disabled={applyingGift || !pricing.totalBeforeGift}>
                    {applyingGift ? 'Checking…' : 'Apply'}
                  </button>
                </div>
                {giftMessage && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{giftMessage}</div>}
              </div>

              <input className="input" placeholder="Your name" value={customer.name} onChange={(e) => setCustomer((p) => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder="Phone number" value={customer.phone} onChange={(e) => setCustomer((p) => ({ ...p, phone: e.target.value }))} />

              <label>
                <div className="searchLabel">Payment method</div>
                <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="pay_at_store">Pay at store</option>
                  <option value="online">Pay online</option>
                </select>
              </label>

              <button className="btn btn-primary" onClick={submit}>Book now</button>

              {confirmed && (
                <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(34,197,94,0.4)' }}>
                  <div style={{ fontWeight: 900, color: '#22c55e' }}>Booking confirmed!</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{confirmed.salonName} · {confirmed.dateISO} · {confirmed.timeSlot}</div>
                </div>
              )}
            </div>
            
            <div style={{ marginTop: 16 }}>
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/bookings/history')}>
                View your bookings
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}