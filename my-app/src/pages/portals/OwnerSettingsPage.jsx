import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import TimeInputGroup from '../../components/TimeInputGroup.jsx'
import PromotionItem from '../../components/PromotionItem.jsx'
import '../../styles/settings.css'
import {
  IconClock,
  IconDollar,
  IconBell,
  IconStore,
  IconSettings,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api, showPortalToast } from '../../lib/api.js'

function PortalSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`portal-switch ${checked ? 'on' : ''}`.trim()}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="portal-switchKnob" aria-hidden="true" />
    </button>
  )
}

function parseBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback
  const s = String(v).toLowerCase().trim()
  return s === 'true' || s === '1' || s === 'yes'
}

function parseNumber(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function parseNullableNumber(v, fallback = 0) {
  if (v === '' || v === null || v === undefined) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}



const WEEKDAY_FIELDS = [
  { key: 'mon', label: 'Monday', openKey: 'ScheduleMonOpenTime', closeKey: 'ScheduleMonCloseTime' },
  { key: 'tue', label: 'Tuesday', openKey: 'ScheduleTueOpenTime', closeKey: 'ScheduleTueCloseTime' },
  { key: 'wed', label: 'Wednesday', openKey: 'ScheduleWedOpenTime', closeKey: 'ScheduleWedCloseTime' },
  { key: 'thu', label: 'Thursday', openKey: 'ScheduleThuOpenTime', closeKey: 'ScheduleThuCloseTime' },
  { key: 'fri', label: 'Friday', openKey: 'ScheduleFriOpenTime', closeKey: 'ScheduleFriCloseTime' },
  { key: 'sat', label: 'Saturday', openKey: 'ScheduleSatOpenTime', closeKey: 'ScheduleSatCloseTime' },
  { key: 'sun', label: 'Sunday', openKey: 'ScheduleSunOpenTime', closeKey: 'ScheduleSunCloseTime' },
]

export default function OwnerSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const allowedTabs = new Set(['salon', 'booking', 'promotion', 'schedule', 'notify', 'security'])
  const initialTab = allowedTabs.has(searchParams.get('tab')) ? searchParams.get('tab') : 'salon'
  const [tab, setTab] = useState(initialTab)

  const [salon, setSalon] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    taxCode: '',
    description: '',
  })

  const [bookingRules, setBookingRules] = useState({
    slotMinutes: 30,
    advanceWindowDays: 30,
    cancelHours: 4,
    maxBookingsPerDay: 8,
    requireDeposit: false,
    depositPercent: 0,
    allowWalkIn: true,
    commissionTiers: [
      { threshold: 500000, rate: 10 },
      { threshold: 2000000, rate: 15 },
    ],
  })

  const [promotion, setPromotion] = useState({
    enabled: false,
    isStackable: false,
    allowCustomerApply: true,
    promotions: [],
  })

  const [schedule, setSchedule] = useState({
    openTime: '08:00',
    closeTime: '20:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    weekdays: {
      mon: { openTime: '08:00', closeTime: '20:00' },
      tue: { openTime: '08:00', closeTime: '20:00' },
      wed: { openTime: '08:00', closeTime: '20:00' },
      thu: { openTime: '08:00', closeTime: '20:00' },
      fri: { openTime: '08:00', closeTime: '20:00' },
      sat: { openTime: '08:00', closeTime: '20:00' },
      sun: { openTime: '08:00', closeTime: '20:00' },
    },
  })

  const [notify, setNotify] = useState({
    newAppt: true,
    lowStock: true,
    newReview: true,
    dailyReport: false,
    email: true,
  })

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('Confirm action')
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmSuccessTitle, setConfirmSuccessTitle] = useState('Completed')
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState('Action completed successfully.')
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeTitle, setCompleteTitle] = useState('Completed')
  const [completeMessage, setCompleteMessage] = useState('Action completed successfully.')

  function openConfirm({ title, message, action, successTitle, successMessage }) {
    setConfirmTitle(title || 'Confirm action')
    setConfirmMessage(message || 'Do you want to continue?')
    setConfirmAction(() => action)
    setConfirmSuccessTitle(successTitle || 'Completed')
    setConfirmSuccessMessage(successMessage || 'Action completed successfully.')
    setConfirmOpen(true)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmAction(null)
  }

  function closeComplete() {
    setCompleteOpen(false)
  }

  async function runConfirmedAction() {
    if (typeof confirmAction !== 'function') {
      closeConfirm()
      return
    }
    const action = confirmAction
    closeConfirm()
    try {
      const resultMessage = await action()
      setCompleteTitle(confirmSuccessTitle || 'Completed')
      setCompleteMessage(
        typeof resultMessage === 'string' && resultMessage.trim()
          ? resultMessage
          : (confirmSuccessMessage || 'Action completed successfully.')
      )
      setCompleteOpen(true)
    } catch (err) {
      console.error(err)
      showPortalToast({ type: 'error', message: err?.message || 'Action failed.' })
    }
  }

  async function loadSettings() {
    const map = (await api.get('/api/owner/settings')) || {}

    setSalon({
      name: map.SalonName || '',
      phone: map.SalonPhone || '',
      email: map.SalonEmail || '',
      address: map.SalonAddress || '',
      website: map.SalonWebsite || '',
      taxCode: map.SalonTaxCode || '',
      description: map.SalonDescription || '',
    })

    setBookingRules({
      slotMinutes: parseNumber(map.BookingSlotMinutes, 30),
      advanceWindowDays: parseNumber(map.BookingAdvanceWindowDays, 30),
      cancelHours: parseNumber(map.BookingCancelHours, 4),
      maxBookingsPerDay: parseNumber(map.BookingMaxPerDay, 8),
      requireDeposit: parseBool(map.BookingRequireDeposit, false),
      depositPercent: parseNumber(map.BookingDepositPercent, 0),
      allowWalkIn: parseBool(map.BookingAllowWalkIn, true),
      commissionTiers: (() => {
        if (Array.isArray(map.CommissionTiers) && map.CommissionTiers.length > 0) {
          const tiers = map.CommissionTiers.map(t => {
            const thres = parseNumber(t.threshold || t.commissionTierLow, 0)
            const rateValue = parseNumber(t.rate || t.commissionRateLow, 0)
            const finalRate = rateValue > 1 ? rateValue : rateValue * 100
            return { threshold: thres, rate: finalRate }
          }).sort((a, b) => a.threshold - b.threshold)
          return tiers
        } else if (String(map.CommissionSource || '').trim() === 'policyTable') {
          return []
        } else {
          const fallback = [
            { threshold: parseNumber(map.CommissionTierLow, 500000), rate: parseNumber(map.CommissionRateLow, 0.10) * 100 },
          ]
          if (map.CommissionTierHigh !== null && map.CommissionTierHigh !== undefined) {
            fallback.push({
              threshold: parseNumber(map.CommissionTierHigh, 2000000),
              rate: parseNumber(map.CommissionRateHigh, 0.15) * 100,
            })
          }
          return fallback
        }
      })(),
    })

    setPromotion({
      enabled: parseBool(map.PromotionEnabled, false),
      isStackable: parseBool(map.PromotionIsStackable, false),
      allowCustomerApply: parseBool(map.PromotionAllowCustomerApply, true),
      promotions: map.Promotions && Array.isArray(map.Promotions) ? map.Promotions : 
                   map.PromotionCode ? [{
                     id: 'default',
                     title: map.PromotionTitle || '',
                     code: map.PromotionCode || '',
                     discountType: 'percentage',
                     value: parseNumber(map.PromotionDiscountPct, 0),
                     startDate: map.PromotionStart || '',
                     endDate: map.PromotionEnd || '',
                     isActive: parseBool(map.PromotionEnabled, false),
                     maxUses: null,
                     maxUsesPerUser: null,
                   }] : [],
    })

    setSchedule({
      openTime: map.ScheduleOpenTime || map.SalonOpenTime || '08:00',
      closeTime: map.ScheduleCloseTime || map.SalonCloseTime || '20:00',
      breakStart: map.ScheduleBreakStart || '12:00',
      breakEnd: map.ScheduleBreakEnd || '13:00',
      weekdays: WEEKDAY_FIELDS.reduce((acc, item) => {
        acc[item.key] = {
          openTime: map[item.openKey] || map.ScheduleOpenTime || map.SalonOpenTime || '08:00',
          closeTime: map[item.closeKey] || map.ScheduleCloseTime || map.SalonCloseTime || '20:00',
        }
        return acc
      }, {}),
    })

    setNotify({
      newAppt: parseBool(map.NotifyNewAppt, true),
      lowStock: parseBool(map.NotifyLowStock, true),
      newReview: parseBool(map.NotifyNewReview, true),
      dailyReport: parseBool(map.NotifyDailyReport, false),
      email: parseBool(map.NotifyEmail, true),
    })
  }

  async function updateSettings(updates) {
    await api.put('/api/owner/settings', { updates })
  }

  async function handleNotifyToggle(stateKey, settingKey, value) {
    const prevValue = Boolean(notify[stateKey])
    setNotify((p) => ({ ...p, [stateKey]: value }))
    try {
      await updateSettings({ [settingKey]: value })
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Notification setting updated.', title: 'Completed' } 
      }))
    } catch (err) {
      console.error(err)
      setNotify((p) => ({ ...p, [stateKey]: prevValue }))
      showPortalToast({ type: 'error', message: err?.message || 'Failed to update notification setting.' })
    }
  }

  async function saveAndRefresh(updates, message) {
    try {
      await updateSettings(updates)
      await loadSettings()
      return message || 'Saved successfully.'
    } catch (err) {
      console.error(err)
      showPortalToast({ type: 'error', message: err?.message || 'Save failed.' })
      throw err
    }
  }

  // Schedule validation
  function validateScheduleTimes() {
    const errors = {}

    if (schedule.openTime >= schedule.closeTime) {
      errors.closeTime = 'Closing time must be after opening time'
    }

    if (schedule.breakStart && schedule.breakEnd) {
      if (schedule.breakStart >= schedule.breakEnd) {
        errors.breakEnd = 'Break end time must be after break start time'
      }
      if (schedule.breakStart < schedule.openTime) {
        errors.breakStart = 'Break must start after opening time'
      }
      if (schedule.breakEnd > schedule.closeTime) {
        errors.breakEnd = 'Break must end before closing time'
      }
    }

    return errors
  }

  // Promotion validation
  function validatePromotions() {
    const errors = {}
    
    if (!promotion.promotions || promotion.promotions.length === 0) {
      errors.empty = 'At least one promotion is required'
      return errors
    }

    const codes = new Set()
    promotion.promotions.forEach((promo, idx) => {
      if (!promo.code || promo.code.trim() === '') {
        errors[`promo-${idx}-code`] = 'Code is required'
      } else if (codes.has(promo.code)) {
        errors[`promo-${idx}-code`] = 'Promotion code must be unique'
      } else {
        codes.add(promo.code)
      }
    })

    return errors
  }

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('tab', tab)
    setSearchParams(params, { replace: true })
  }, [tab, setSearchParams])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        await loadSettings()
      } catch (err) {
        if (mounted) console.error(err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="portal-settings settings-page">
      <div className="portal-settingsTabs">
        <div className="portal-seg" role="tablist" aria-label="Settings tabs">
          <button
            type="button"
            className={`portal-segBtn ${tab === 'salon' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'salon'}
            onClick={() => setTab('salon')}
          >
            Salon Info
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'booking' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'booking'}
            onClick={() => setTab('booking')}
          >
            Booking Rules
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'promotion' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'promotion'}
            onClick={() => setTab('promotion')}
          >
            Promotion Settings
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'schedule' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'schedule'}
            onClick={() => setTab('schedule')}
          >
            Schedule Settings
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'notify' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'notify'}
            onClick={() => setTab('notify')}
          >
            Notifications
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'security' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'security'}
            onClick={() => setTab('security')}
          >
            Security
          </button>
        </div>
      </div>

      {tab === 'salon' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconStore />
            </span>
            <h2 className="portal-settingsSectionText">Salon Info</h2>
          </div>

          <div className="portal-formGrid2">
            <label className="portal-field">
              <span className="portal-label">Salon name</span>
              <input className="portal-input" value={salon.name} onChange={(e) => setSalon((p) => ({ ...p, name: e.target.value }))} />
            </label>

            <label className="portal-field">
              <span className="portal-label">Phone number</span>
              <input className="portal-input" value={salon.phone} onChange={(e) => setSalon((p) => ({ ...p, phone: e.target.value }))} />
            </label>

            <label className="portal-field">
              <span className="portal-label">Email</span>
              <input className="portal-input" value={salon.email} onChange={(e) => setSalon((p) => ({ ...p, email: e.target.value }))} />
            </label>

            <label className="portal-field">
              <span className="portal-label">Website</span>
              <input className="portal-input" value={salon.website} onChange={(e) => setSalon((p) => ({ ...p, website: e.target.value }))} placeholder="https://example.com" />
            </label>
          </div>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Address</span>
            <input className="portal-input" value={salon.address} onChange={(e) => setSalon((p) => ({ ...p, address: e.target.value }))} />
          </label>


          <label className="portal-field portal-fieldFull">
            <span className="portal-label">About salon</span>
            <textarea
              className="portal-input portal-textarea"
              value={salon.description}
              onChange={(e) => setSalon((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe services, specialties, and brand tone..."
            />
          </label>

          <div className="portal-formActions">
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={() => {
                openConfirm({
                  title: 'Save salon information',
                  message: 'Do you want to save salon profile changes?',
                  action: () => saveAndRefresh(
                    {
                      SalonName: salon.name,
                      SalonPhone: salon.phone,
                      SalonEmail: salon.email,
                      SalonAddress: salon.address,
                      SalonWebsite: salon.website,
                      SalonTaxCode: salon.taxCode,
                      SalonDescription: salon.description,
                    },
                    'Salon information saved.'
                  ),
                })
              }}
            >
              Save changes
            </button>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'booking' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconSettings />
            </span>
            <h2 className="portal-settingsSectionText">Booking Rules</h2>
          </div>

          <div className="portal-formGrid2">
            <label className="portal-field">
              <span className="portal-label">Time slot (minutes)</span>
              <input
                className="portal-input"
                type="number"
                min="5"
                step="5"
                value={bookingRules.slotMinutes}
                onChange={(e) => setBookingRules((p) => ({ ...p, slotMinutes: Number(e.target.value || 0) }))}
              />
            </label>

            <label className="portal-field">
              <span className="portal-label">Advance booking window (days)</span>
              <input
                className="portal-input"
                type="number"
                min="1"
                value={bookingRules.advanceWindowDays}
                onChange={(e) => setBookingRules((p) => ({ ...p, advanceWindowDays: Number(e.target.value || 0) }))}
              />
            </label>

            <label className="portal-field">
              <span className="portal-label">Cancellation cutoff (hours)</span>
              <input
                className="portal-input"
                type="number"
                min="0"
                value={bookingRules.cancelHours}
                onChange={(e) => setBookingRules((p) => ({ ...p, cancelHours: Number(e.target.value || 0) }))}
              />
            </label>

            <label className="portal-field">
              <span className="portal-label">Max bookings per staff/day</span>
              <input
                className="portal-input"
                type="number"
                min="1"
                value={bookingRules.maxBookingsPerDay}
                onChange={(e) => setBookingRules((p) => ({ ...p, maxBookingsPerDay: Number(e.target.value || 0) }))}
              />
            </label>
          </div>

          <div className="portal-settingsList" role="list">
            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Allow walk-in bookings</div>
                <div className="portal-settingsRowSub">Permit same-day bookings without pre-booking.</div>
              </div>
              <PortalSwitch
                label="Allow walk-in bookings"
                checked={bookingRules.allowWalkIn}
                onChange={(v) => setBookingRules((p) => ({ ...p, allowWalkIn: v }))}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Require deposit</div>
                <div className="portal-settingsRowSub">Collect a deposit before confirming appointments.</div>
              </div>
              <PortalSwitch
                label="Require deposit"
                checked={bookingRules.requireDeposit}
                onChange={(v) => setBookingRules((p) => ({ ...p, requireDeposit: v }))}
              />
            </div>
          </div>

          {bookingRules.requireDeposit ? (
            <label className="portal-field portal-fieldFull" style={{ marginTop: 10 }}>
              <span className="portal-label">Deposit percentage (%)</span>
              <input
                className="portal-input"
                type="number"
                min="0"
                max="100"
                value={bookingRules.depositPercent}
                onChange={(e) => setBookingRules((p) => ({ ...p, depositPercent: Number(e.target.value || 0) }))}
              />
            </label>
          ) : null}

          <div style={{ marginTop: 20 }} className="portal-formDivider">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Staff Commission Tiers</h3>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
              Configure commission by monthly staff revenue.
            </p>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              Revenue below the first tier threshold applies 0% commission.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bookingRules.commissionTiers && bookingRules.commissionTiers.length > 0 ? (
              bookingRules.commissionTiers.map((tier, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
                  <label className="portal-field" style={{ margin: 0 }}>
                    <span className="portal-label">Minimum revenue for tier {idx + 1}</span>
                    <input
                      className="portal-input"
                      type="number"
                      min="0"
                      step="100000"
                      value={tier.threshold ?? ''}
                      onChange={(e) => {
                        const nextValue = e.target.value
                        const newTiers = [...bookingRules.commissionTiers]
                        newTiers[idx] = {
                          ...tier,
                          threshold: nextValue === '' ? '' : Number(nextValue),
                        }
                        setBookingRules((p) => ({ ...p, commissionTiers: newTiers }))
                      }}
                    />
                  </label>

                  <label className="portal-field" style={{ margin: 0 }}>
                    <span className="portal-label">Tier {idx + 1} rate (%)</span>
                    <input
                      className="portal-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={tier.rate ?? ''}
                      onChange={(e) => {
                        const nextValue = e.target.value
                        const newTiers = [...bookingRules.commissionTiers]
                        newTiers[idx] = {
                          ...tier,
                          rate: nextValue === '' ? '' : Number(nextValue),
                        }
                        setBookingRules((p) => ({ ...p, commissionTiers: newTiers }))
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className="portal-tierDeleteBtn"
                    disabled={bookingRules.commissionTiers.length <= 1}
                    onClick={() => {
                      const newTiers = bookingRules.commissionTiers.filter((_, i) => i !== idx)
                      setBookingRules((p) => ({ ...p, commissionTiers: newTiers }))
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : null}
          </div>

          <button
            type="button"
            className="portal-tierAddBtn"
            onClick={() => {
              const baseThresholds = bookingRules.commissionTiers.map((t) => parseNullableNumber(t.threshold, 0))
              const newThreshold = Math.max(0, ...baseThresholds) + 1000000
              setBookingRules((p) => ({
                ...p,
                commissionTiers: [...p.commissionTiers, { threshold: newThreshold, rate: 10 }],
              }))
            }}
          >
            + Add Tier
          </button>

          <div className="portal-formActions">
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={() => {
                if (bookingRules.slotMinutes < 5 || bookingRules.advanceWindowDays < 1 || bookingRules.maxBookingsPerDay < 1) {
                  showPortalToast({ type: 'error', message: 'Please review booking rule values before saving.' })
                  return
                }
                if (bookingRules.requireDeposit && (bookingRules.depositPercent < 0 || bookingRules.depositPercent > 100)) {
                  showPortalToast({ type: 'error', message: 'Deposit percentage must be between 0 and 100.' })
                  return
                }

                openConfirm({
                  title: 'Save booking rules',
                  message: 'Apply these booking rule changes?',
                  action: () => {
                    // Validate tiers
                    if (!bookingRules.commissionTiers || bookingRules.commissionTiers.length === 0) {
                      throw new Error('At least one commission tier is required.')
                    }
                    const normalizedTiers = bookingRules.commissionTiers.map((t) => ({
                      threshold: parseNullableNumber(t.threshold, 0),
                      rate: parseNullableNumber(t.rate, 0),
                    }))
                    const sortedTiers = [...normalizedTiers].sort((a, b) => a.threshold - b.threshold)
                    for (let i = 0; i < sortedTiers.length; i++) {
                      if (sortedTiers[i].threshold < 0) {
                        throw new Error(`Tier ${i + 1} threshold must be greater than or equal to 0.`)
                      }
                      if (sortedTiers[i].rate < 0 || sortedTiers[i].rate > 100) {
                        throw new Error(`Tier ${i + 1} rate must be between 0 and 100.`)
                      }
                    }
                    
                    return saveAndRefresh(
                      {
                        BookingSlotMinutes: bookingRules.slotMinutes,
                        BookingAdvanceWindowDays: bookingRules.advanceWindowDays,
                        BookingCancelHours: bookingRules.cancelHours,
                        BookingMaxPerDay: bookingRules.maxBookingsPerDay,
                        BookingAllowWalkIn: bookingRules.allowWalkIn,
                        BookingRequireDeposit: bookingRules.requireDeposit,
                        BookingDepositPercent: bookingRules.depositPercent,
                        CommissionTiers: sortedTiers.map(t => ({
                          threshold: t.threshold,
                          rate: t.rate / 100,
                        })),
                        // Backward compatibility: save first tier as Low, second as High
                        CommissionTierLow: sortedTiers[0].threshold,
                        CommissionRateLow: sortedTiers[0].rate / 100,
                        CommissionTierHigh: sortedTiers.length > 1 ? sortedTiers[1].threshold : null,
                        CommissionRateHigh: sortedTiers.length > 1 ? sortedTiers[1].rate / 100 : null,
                      },
                      'Booking rules saved.'
                    )
                  },
                })
              }}
            >
              Save changes
            </button>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'promotion' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconDollar />
            </span>
            <h2 className="portal-settingsSectionText">Promotion Settings</h2>
          </div>

          <div className="portal-settingsRow" role="listitem" style={{ marginBottom: 14 }}>
            <div>
              <div className="portal-settingsRowTitle">Enable promotions</div>
              <div className="portal-settingsRowSub">Apply discount campaigns in booking and checkout flow.</div>
            </div>
            <PortalSwitch
              label="Enable promotions"
              checked={promotion.enabled}
              onChange={(v) => setPromotion((p) => ({ ...p, enabled: v }))}
            />
          </div>

          {promotion.enabled ? (
            <>
              <div className="portal-settingsDivider" role="separator" />

              <div className="portal-settingsRow" role="listitem" style={{ marginBottom: 14 }}>
                <div>
                  <div className="portal-settingsRowTitle">Allow combining promotions</div>
                  <div className="portal-settingsRowSub">Enable applying multiple promotions to a single booking (stackable).</div>
                </div>
                <PortalSwitch
                  label="Allow combining promotions"
                  checked={promotion.isStackable}
                  onChange={(v) => setPromotion((p) => ({ ...p, isStackable: v }))}
                />
              </div>

              <div className="portal-settingsRow" role="listitem" style={{ marginBottom: 14 }}>
                <div>
                  <div className="portal-settingsRowTitle">Allow customers to apply codes</div>
                  <div className="portal-settingsRowSub">Let customers enter promotion codes during booking.</div>
                </div>
                <PortalSwitch
                  label="Allow customers to apply codes"
                  checked={promotion.allowCustomerApply}
                  onChange={(v) => setPromotion((p) => ({ ...p, allowCustomerApply: v }))}
                />
              </div>

              <div className="portal-settingsDivider" role="separator" />

              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>Active Promotions</h3>
                
                {promotion.promotions && promotion.promotions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                    {promotion.promotions.map((promo, idx) => (
                      <PromotionItem
                        key={idx}
                        promotion={promo}
                        index={idx}
                        onChange={(updated) => {
                          const newPromotions = [...promotion.promotions]
                          newPromotions[idx] = updated
                          setPromotion((p) => ({ ...p, promotions: newPromotions }))
                        }}
                        onRemove={() => {
                          const newPromotions = promotion.promotions.filter((_, i) => i !== idx)
                          setPromotion((p) => ({ ...p, promotions: newPromotions }))
                        }}
                        showRemove={promotion.promotions.length > 1}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#666', background: '#f5f5f5', borderRadius: '8px', marginBottom: '16px' }}>
                    No promotions added yet. Click "Add Promotion" to create one.
                  </div>
                )}

                <button
                  type="button"
                  className="portal-outlineBtn"
                  onClick={() => {
                    const newPromotion = {
                      id: Date.now().toString(),
                      title: '',
                      code: '',
                      discountType: 'percentage',
                      value: '',
                      startDate: '',
                      endDate: '',
                      isActive: true,
                      maxUses: null,
                      maxUsesPerUser: null,
                    }
                    setPromotion((p) => ({
                      ...p,
                      promotions: [...(p.promotions || []), newPromotion],
                    }))
                  }}
                  style={{ marginBottom: '16px' }}
                >
                  + Add Promotion
                </button>
              </div>

              <div className="portal-formActions">
                <button
                  type="button"
                  className="portal-primaryBtn portal-primaryBtnCompact"
                  onClick={() => {
                    const errors = validatePromotions()
                    if (Object.keys(errors).length > 0) {
                      showPortalToast({ type: 'error', message: 'Please fix promotion errors before saving.' })
                      return
                    }

                    openConfirm({
                      title: 'Save promotion settings',
                      message: 'Do you want to apply these promotion settings?',
                      action: () => saveAndRefresh(
                        {
                          PromotionEnabled: promotion.enabled,
                          PromotionIsStackable: promotion.isStackable,
                          PromotionAllowCustomerApply: promotion.allowCustomerApply,
                          Promotions: promotion.promotions.map((p) => ({
                            title: p.title,
                            code: p.code,
                            discountType: p.discountType,
                            value: p.value,
                            startDate: p.startDate,
                            endDate: p.endDate,
                            isActive: p.isActive,
                            maxUses: p.maxUses,
                            maxUsesPerUser: p.maxUsesPerUser,
                          })),
                        },
                        'Promotion settings saved.'
                      ),
                    })
                  }}
                >
                  Save changes
                </button>
              </div>
            </>
          ) : null}
        </PortalCard>
      ) : null}

      {tab === 'schedule' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconClock />
            </span>
            <h2 className="portal-settingsSectionText">Schedule Settings</h2>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>General Working Hours</h3>

            <div className="portal-workingHoursGrid">
              <TimeInputGroup
                label="Opening Time"
                value={schedule.openTime}
                onChange={(value) => setSchedule((p) => ({ ...p, openTime: value }))}
                required
                error={validateScheduleTimes().closeTime && schedule.openTime >= schedule.closeTime ? 'Opening time must be before closing time' : null}
              />

              <TimeInputGroup
                label="Closing Time"
                value={schedule.closeTime}
                onChange={(value) => setSchedule((p) => ({ ...p, closeTime: value }))}
                required
                error={validateScheduleTimes().closeTime}
                hideIcon={true}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px', padding: '14px', background: 'linear-gradient(135deg, rgba(139, 111, 55, 0.03) 0%, rgba(243, 229, 189, 0.05) 100%)', borderRadius: '12px', border: '1px solid rgba(139, 111, 55, 0.1)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>Break Time (Optional)</h3>
            {schedule.breakStart && schedule.breakEnd ? (
              <div className="portal-workingHoursGrid">
                <TimeInputGroup
                  label="Break Start"
                  value={schedule.breakStart}
                  onChange={(value) => setSchedule((p) => ({ ...p, breakStart: value }))}
                  error={validateScheduleTimes().breakStart}
                  hint="When does the break start?"
                />

                <TimeInputGroup
                  label="Break End"
                  value={schedule.breakEnd}
                  onChange={(value) => setSchedule((p) => ({ ...p, breakEnd: value }))}
                  error={validateScheduleTimes().breakEnd}
                  hint="When does the break end?"
                  hideIcon={true}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="enableBreak"
                  checked={!!(schedule.breakStart && schedule.breakEnd)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSchedule((p) => ({
                        ...p,
                        breakStart: '12:00',
                        breakEnd: '13:00',
                      }))
                    }
                  }}
                />
                <label htmlFor="enableBreak" style={{ fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  Add break time
                </label>
              </div>
            )}
          </div>

          <div className="portal-settingsDivider" role="separator" />
          <div className="portal-settingsWeekdayHeader">Working hours by weekday</div>
          <div className="portal-settingsWeekdayHint">
            Updating hours only affects new schedules from now onward. Existing shifts remain unchanged and will still be displayed.
          </div>
          <div className="portal-settingsList portal-settingsWeekdayList" role="list">
            {WEEKDAY_FIELDS.map((item) => {
              const value = schedule.weekdays?.[item.key] || { openTime: schedule.openTime, closeTime: schedule.closeTime }
              return (
                <div className="portal-settingsRow portal-settingsWeekdayRow" role="listitem" key={item.key}>
                  <div className="portal-settingsRowTitle">{item.label}</div>
                  <div className="portal-settingsWeekdayTimeRange">
                    <input
                      className="portal-input portal-settingsWeekdayInput"
                      type="time"
                      value={value.openTime}
                      onChange={(e) =>
                        setSchedule((p) => ({
                          ...p,
                          weekdays: {
                            ...(p.weekdays || {}),
                            [item.key]: {
                              ...(p.weekdays?.[item.key] || {}),
                              openTime: e.target.value,
                            },
                          },
                        }))
                      }
                    />
                    <span className="portal-settingsWeekdaySeparator">-</span>
                    <input
                      className="portal-input portal-settingsWeekdayInput"
                      type="time"
                      value={value.closeTime}
                      onChange={(e) =>
                        setSchedule((p) => ({
                          ...p,
                          weekdays: {
                            ...(p.weekdays || {}),
                            [item.key]: {
                              ...(p.weekdays?.[item.key] || {}),
                              closeTime: e.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="portal-formActions">
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={() => {
                const errors = validateScheduleTimes()
                if (Object.keys(errors).length > 0) {
                  showPortalToast({ type: 'error', message: Object.values(errors)[0] })
                  return
                }

                openConfirm({
                  title: 'Save schedule settings',
                  message: 'Do you want to update salon working schedule?',
                  action: () => saveAndRefresh(
                    (() => {
                      const weekdayUpdates = WEEKDAY_FIELDS.reduce((acc, item) => {
                        const value = schedule.weekdays?.[item.key] || {}
                        acc[item.openKey] = value.openTime || schedule.openTime
                        acc[item.closeKey] = value.closeTime || schedule.closeTime
                        return acc
                      }, {})
                      return {
                        ScheduleOpenTime: schedule.openTime,
                        ScheduleCloseTime: schedule.closeTime,
                        ScheduleBreakStart: schedule.breakStart,
                        ScheduleBreakEnd: schedule.breakEnd,
                        SalonOpenTime: schedule.openTime,
                        SalonCloseTime: schedule.closeTime,
                        ...weekdayUpdates,
                      }
                    })(),
                    'Schedule settings saved.'
                  ),
                })
              }}
            >
              Save changes
            </button>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'notify' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconBell />
            </span>
            <h2 className="portal-settingsSectionText">Notification Settings</h2>
          </div>

          <div className="portal-settingsList" role="list">
            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">New appointments</div>
                <div className="portal-settingsRowSub">Get notified when a new appointment is created.</div>
              </div>
              <PortalSwitch
                label="New appointments"
                checked={notify.newAppt}
                onChange={(v) => handleNotifyToggle('newAppt', 'NotifyNewAppt', v)}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Low stock alerts</div>
                <div className="portal-settingsRowSub">Notify when products are running low.</div>
              </div>
              <PortalSwitch
                label="Low stock alerts"
                checked={notify.lowStock}
                onChange={(v) => handleNotifyToggle('lowStock', 'NotifyLowStock', v)}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">New reviews</div>
                <div className="portal-settingsRowSub">Get notified when a new review is posted.</div>
              </div>
              <PortalSwitch
                label="New reviews"
                checked={notify.newReview}
                onChange={(v) => handleNotifyToggle('newReview', 'NotifyNewReview', v)}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Daily reports</div>
                <div className="portal-settingsRowSub">Receive end-of-day revenue reports.</div>
              </div>
              <PortalSwitch
                label="Daily reports"
                checked={notify.dailyReport}
                onChange={(v) => handleNotifyToggle('dailyReport', 'NotifyDailyReport', v)}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Email notifications</div>
                <div className="portal-settingsRowSub">Send notifications by email.</div>
              </div>
              <PortalSwitch
                label="Email notifications"
                checked={notify.email}
                onChange={(v) => handleNotifyToggle('email', 'NotifyEmail', v)}
              />
            </div>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'security' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconSettings />
            </span>
            <h2 className="portal-settingsSectionText">Security</h2>
          </div>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Current password</span>
            <input
              className="portal-input"
              type="password"
              value={security.currentPassword}
              onChange={(e) => setSecurity((p) => ({ ...p, currentPassword: e.target.value }))}
            />
          </label>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">New password</span>
            <input
              className="portal-input"
              type="password"
              value={security.newPassword}
              onChange={(e) => setSecurity((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </label>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Confirm new password</span>
            <input
              className="portal-input"
              type="password"
              value={security.confirmPassword}
              onChange={(e) => setSecurity((p) => ({ ...p, confirmPassword: e.target.value }))}
            />
          </label>

          <div className="portal-settingsDivider" role="separator" />

          <div className="portal-settingsActions">
            <button
              type="button"
              className="portal-outlineBtn"
              onClick={() => {
                setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' })
                window.dispatchEvent(new CustomEvent('portal:success-modal', { 
                  detail: { message: 'Password form has been cleared.', title: 'Completed' } 
                }))
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={async () => {
                if (!security.currentPassword || !security.newPassword || !security.confirmPassword) {
                  showPortalToast({ type: 'error', message: 'Please fill in all password fields.' })
                  return
                }
                if (security.newPassword !== security.confirmPassword) {
                  showPortalToast({ type: 'error', message: 'New password and confirmation do not match.' })
                  return
                }

                openConfirm({
                  title: 'Change password',
                  message: 'Confirm password update for your account?',
                  successTitle: 'Password Updated',
                  successMessage: 'Password changed successfully.',
                  action: async () => {
                    await api.put('/api/auth/me/password', {
                      currentPassword: security.currentPassword,
                      newPassword: security.newPassword,
                    })
                    setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' })
                  },
                })
              }}
            >
              Change password
            </button>
          </div>
        </PortalCard>
      ) : null}

      <PortalModal
        open={confirmOpen}
        title={confirmTitle}
        variant="confirm"
        onClose={closeConfirm}
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="portal-outlineBtn" onClick={closeConfirm}>Cancel</button>
            <button type="button" className="portal-primaryBtn portal-primaryBtnCompact" onClick={runConfirmedAction}>Confirm</button>
          </div>
        )}
      >
        <p style={{ margin: 0 }}>{confirmMessage}</p>
      </PortalModal>

      <PortalModal
        open={completeOpen}
        title={completeTitle}
        variant="success"
        onClose={closeComplete}
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="portal-primaryBtn portal-primaryBtnCompact" onClick={closeComplete}>OK</button>
          </div>
        )}
      >
        <p style={{ margin: 0 }}>{completeMessage}</p>
      </PortalModal>
    </div>
  )
}
