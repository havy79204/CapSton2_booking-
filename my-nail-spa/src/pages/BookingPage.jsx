import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CalendarCheck,
  CalendarDays,
  Clock,
  MapPin,
  Scissors,
  Star,
  User,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useBookings } from '../context/BookingContext'
import { api } from '../lib/api'
import { addDaysISO } from '../lib/dates'
import { useI18n } from '../context/I18nContext.jsx'
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
  const { t } = useI18n()

  const [salons, setSalons] = useState([])
  const [profiles, setProfiles] = useState([])
  const [availability] = useState({})
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
  const [timeSlot, setTimeSlot] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('pay_at_store')
  const [giftCode, setGiftCode] = useState('')
  const [giftApplied, setGiftApplied] = useState(0)
  const [giftMessage, setGiftMessage] = useState('')
  const [applyingGift, setApplyingGift] = useState(false)
  const [customer, setCustomer] = useState(() => ({ name: auth.user?.name || '', phone: '' }))
  const [confirmed, setConfirmed] = useState(null)
  const [activeDeals, setActiveDeals] = useState([])

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
  }

  async function submit() {
    if (!salonId) return alert(t('site.booking.selectSalon', 'Please select a salon'))
    if (!selectedServices.length) return alert(t('site.booking.selectService', 'Please select at least one service'))
    if (!timeSlot) return alert(t('site.booking.selectTime', 'Please select a time'))
    if (technicianId !== 'auto' && isSlotBlockedForTech(timeSlot)) return alert(t('site.booking.techUnavailable', 'Technician is unavailable'))
    if (!customer.name.trim()) return alert(t('site.booking.namePrompt', 'Please enter your name'))

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
        throw new Error(t('site.booking.noPaymentUrl', 'Payment URL not returned'))
      }

      const record = await bookings.create(payload)
      setConfirmed({ ...record, paymentMethod })
      setGiftApplied(0)
      setGiftCode('')
      setTimeSlot('')
    } catch (err) {
      alert(err?.message || t('site.booking.failed', 'Booking failed'))
    }
  }

  async function applyGift() {
    const code = giftCode.trim();
    if (!code) return setGiftMessage(t('site.booking.gift.enter', 'Enter a code'));
    if (!pricing.totalBeforeGift) return setGiftMessage(t('site.booking.gift.select', 'Select services first'));
    setApplyingGift(true);
    setGiftMessage('');
    // Try Gift Card first (ignore errors and fallthrough to promotions)
    try {
      const res = await api.checkGiftCardByTitle(code, pricing.totalBeforeGift);
      const applied = Number(res?.applied || 0);
      if (applied > 0) {
        setGiftApplied(applied);
        setGiftMessage(t('site.booking.gift.applied', 'Applied {{amount}}').replace('{{amount}}', formatUsd(applied)));
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
        setGiftMessage(t('site.booking.gift.applied', 'Applied {{amount}}').replace('{{amount}}', formatUsd(discount)) + ` (${promo.promotion.title})`);
      } else {
        setGiftApplied(0);
        setGiftMessage(t('site.booking.gift.none', 'No remaining balance or invalid code'));
      }
    } catch (err) {
      setGiftApplied(0);
      setGiftMessage(err?.message || t('site.booking.gift.error', 'Gift card or promotion error'));
    } finally {
      setApplyingGift(false);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('site.booking.title', 'Booking')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <CalendarCheck size={16} />
            {t('site.booking.subtitle', 'Schedule your appointment')}
          </div>
        </div>

        <div className="grid twoCol bookingLayout">
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.booking.section.select', 'Select salon & services')}</h3>

            <div style={{ display: 'grid', gap: 10 }}>
              <label>
                <div className="searchLabel">
                  <MapPin size={16} /> {t('site.booking.salon', 'Salon')}
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
                  <option value="">{t('site.booking.salonPlaceholder', '-- Select a salon --')}</option>
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
                  <Scissors size={16} /> {t('site.booking.services', 'Services')}
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
                  }) : <div className="muted">{t('site.booking.servicesEmpty', 'Select a salon to see services.')}</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>
                  <div className="searchLabel">
                    <CalendarDays size={16} /> {t('site.booking.date', 'Date')}
                  </div>
                  <select className="input" value={dateISO} onChange={(e) => { setDateISO(e.target.value); setTimeSlot(''); }}>
                    {dateOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label>
                  <div className="searchLabel">
                    <User size={16} /> {t('site.booking.technician', 'Technician')}
                  </div>
                  <select className="input" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} disabled={!salon}>
                    <option value="auto">{t('site.booking.techAuto', 'Technician Auto (auto-assign)')}</option>
                    {(salon?.technicians ?? []).map((tech) => (
                      <option key={tech.id} value={tech.id}>{tech.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <div className="searchLabel">
                  <Clock size={16} /> {t('site.booking.times', 'Available times')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                  {timeSlots().map((slot) => {
                    const blocked = technicianId === 'auto' ? isSlotUnavailableForAuto(slot) : isSlotBlockedForTech(slot)
                    const disabled = takenTimes.has(slot) || !salon || blocked
                    const active = timeSlot === slot
                    return (
                      <button
                        key={slot}
                        className="btn"
                        onClick={() => setTimeSlot(slot)}
                        disabled={disabled}
                        title={blocked ? t('site.booking.timeBlockedTitle', 'Technician is busy at this time') : undefined}
                        style={{
                          opacity: disabled ? 0.4 : 1,
                          borderColor: active ? 'rgba(255,255,255,0.26)' : blocked ? 'rgba(239,68,68,0.5)' : undefined,
                          background: active ? 'rgba(255,255,255,0.12)' : blocked ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                          padding: '10px 12px',
                          color: blocked ? '#fca5a5' : undefined,
                        }}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.booking.confirm.title', 'Confirmation')}</h3>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="row">
                <span className="muted">{t('site.booking.confirm.duration', 'Duration')}</span>
                <strong>{pricing.duration} min</strong>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">{t('site.booking.confirm.subtotal', 'Subtotal')}</span>
                <strong>{formatUsd(pricing.subtotal)}</strong>
              </div>
              
              {pricing.discount > 0 && (
                 <div className="row" style={{ marginTop: 8, color: '#22c55e' }}>
                   <span className="muted" style={{ color: '#22c55e' }}>{t('site.booking.confirm.discount', 'Discount')}</span>
                   <strong>-{formatUsd(pricing.discount)}</strong>
                 </div>
              )}
              {pricing.appliedDeals.map((d, i) => (
                 <div key={i} className="row" style={{ marginTop: 2, fontSize: 13, color: '#22c55e' }}>
                   <span className="muted" style={{ color: '#22c55e', fontStyle: 'italic' }}>&nbsp; &nbsp; {d.title}</span>
                 </div>
              ))}

              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">{t('site.booking.confirm.gift', 'Gift card')}</span>
                <strong>-{formatUsd(giftApplied)}</strong>
              </div>
              <div className="row" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <span style={{ fontWeight: 900 }}>{t('site.booking.confirm.total', 'Total due')}</span>
                <span style={{ fontWeight: 900, fontSize: 18 }}>{formatUsd(netPrice)}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <div className="card" style={{ padding: 10, boxShadow: 'none' }}>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" placeholder={t('site.booking.gift.placeholder', 'Gift card code')} value={giftCode} onChange={(e) => setGiftCode(e.target.value)} />
                  <button className="btn" onClick={applyGift} disabled={applyingGift || !pricing.totalBeforeGift}>
                    {applyingGift ? t('site.booking.gift.checking', 'Checking…') : t('site.booking.gift.apply', 'Apply')}
                  </button>
                </div>
                {giftMessage && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{giftMessage}</div>}
              </div>

              <input className="input" placeholder={t('site.booking.namePlaceholder', 'Your name')} value={customer.name} onChange={(e) => setCustomer((p) => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder={t('site.booking.phonePlaceholder', 'Phone number')} value={customer.phone} onChange={(e) => setCustomer((p) => ({ ...p, phone: e.target.value }))} />

              <label>
                <div className="searchLabel">{t('site.booking.paymentLabel', 'Payment method')}</div>
                <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="pay_at_store">{t('site.booking.payAtStore', 'Pay at store')}</option>
                  <option value="online">{t('site.booking.payOnline', 'Pay online')}</option>
                </select>
              </label>

              <button className="btn btn-primary" onClick={submit}>{t('site.booking.bookNow', 'Book now')}</button>

              {confirmed && (
                <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(34,197,94,0.4)' }}>
                  <div style={{ fontWeight: 900, color: '#22c55e' }}>{t('site.booking.confirmed', 'Booking confirmed!')}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{confirmed.salonName} · {confirmed.dateISO} · {confirmed.timeSlot}</div>
                </div>
              )}
            </div>
            
            <div style={{ marginTop: 16 }}>
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/bookings/history')}>
                {t('site.booking.viewBookings', 'View your bookings')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}