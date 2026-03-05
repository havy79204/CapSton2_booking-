import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Eye, Loader2, Sparkles, Trash2, Users, Wand2 } from 'lucide-react'

import { api } from '../../lib/api'

import { useAuth } from '../../context/AuthContext.jsx'
import { useBookings } from '../../context/BookingContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { useSchedule, DEFAULT_END_HOUR, DEFAULT_START_HOUR } from '../../context/ScheduleContext.jsx'
import { WeeklyCalendar } from '../../components/WeeklyCalendar.jsx'
import { addDaysISO, formatWeekRange, parseHour, startOfWeekISO } from '../../lib/dates'

export function OwnerSchedulePage() {
  const auth = useAuth()
  const bookings = useBookings()
  const schedule = useSchedule()
  const { t } = useI18n()

  const salonId = auth.user?.salonId

  const thisWeek = useMemo(() => startOfWeekISO(new Date()), [])
  const nextWeek = useMemo(() => addDaysISO(thisWeek, 7), [thisWeek])
  const [weekStartISO, setWeekStartISO] = useState(thisWeek)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [durationHours, setDurationHours] = useState(2)
  const [showBookings, setShowBookings] = useState(true)
  const [aiState, setAiState] = useState({ status: 'idle', message: '' })

  const startHour = DEFAULT_START_HOUR
  const endHour = DEFAULT_END_HOUR

  useEffect(() => {
    if (!salonId) return
    void schedule.loadStaff(salonId)
  }, [salonId, schedule.loadStaff])

  useEffect(() => {
    if (!salonId) return
    void schedule.loadShifts({ weekStartISO, salonId })
  }, [salonId, schedule.loadShifts, weekStartISO])

  // Lightweight polling so owner sees updates without manual reload.
  useEffect(() => {
    if (!salonId) return undefined
    const t = setInterval(() => {
      void schedule.loadShifts({ weekStartISO, salonId, force: true })
    }, 8000)
    return () => clearInterval(t)
  }, [salonId, schedule.loadShifts, weekStartISO])

  const staff = useMemo(() => schedule.staffForSalon(salonId), [schedule, salonId])

  const selectedStaff = useMemo(() => {
    const id = selectedStaffId || staff[0]?.id
    return staff.find((s) => s.id === id) || null
  }, [selectedStaffId, staff])

  useEffect(() => {
    if (!selectedStaff?.id) return
    void schedule.loadAvailability({ weekStartISO, staffId: selectedStaff.id, startHour, endHour })
  }, [endHour, schedule.loadAvailability, selectedStaff?.id, startHour, weekStartISO])

  useEffect(() => {
    if (!selectedStaff?.id) return undefined
    const t = setInterval(() => {
      void schedule.loadAvailability({ weekStartISO, staffId: selectedStaff.id, startHour, endHour, force: true })
    }, 8000)
    return () => clearInterval(t)
  }, [endHour, schedule.loadAvailability, selectedStaff?.id, startHour, weekStartISO])

  const busySlots = useMemo(() => {
    if (!selectedStaff?.id) return null
    // slots represent BUSY times (true = cannot work)
    return schedule.getAvailability(weekStartISO, selectedStaff.id, startHour, endHour)
  }, [endHour, schedule, selectedStaff, startHour, weekStartISO])

  const shifts = useMemo(() => {
    if (!salonId) return []
    return schedule.listShifts(weekStartISO, salonId)
  }, [salonId, schedule, weekStartISO])

  const bookingEvents = useMemo(() => {
    if (!showBookings || !salonId) return []
    const start = weekStartISO
    const end = addDaysISO(weekStartISO, 6)
    const list = bookings.bookings.filter((b) => b.salonId === salonId && b.dateISO >= start && b.dateISO <= end)

    return list
      .map((b) => {
        const dayIndex = Math.max(0, Math.min(6, Math.floor((new Date(b.dateISO + 'T00:00:00') - new Date(weekStartISO + 'T00:00:00')) / (24 * 3600 * 1000))))
        const timeLabel = b.timeSlot || b.time
        const hour = parseHour(timeLabel)
        if (hour == null) return null
        if (hour < startHour || hour >= endHour) return null
        return {
          id: `booking-${b.id}`,
          dayIndex,
          startHour: hour,
          durationHours: 1,
          title: b.customerName || b.customer?.name || 'Booking',
          subtitle: b.technicianName ? `Tech: ${b.technicianName}` : 'Booking',
          meta: `${timeLabel || ''} • $${b.totalPrice || 0}`,
          bg: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))',
          border: 'rgba(255,255,255,0.14)',
          onClick: () => {
            alert(t('portal.ownerSchedule.bookingReadOnly', 'Booking details are read-only in the demo.'))
          },
        }
      })
      .filter(Boolean)
  }, [bookings.bookings, endHour, salonId, showBookings, startHour, weekStartISO])

  const shiftEvents = useMemo(() => {
    return shifts
      .filter((s) => !selectedStaff?.id || s.staffId === selectedStaff.id)
      .map((s) => ({
        id: s.id,
        dayIndex: s.dayIndex,
        startHour: s.startHour,
        durationHours: s.durationHours,
        title: s.staffName || 'Staff',
        subtitle: s.note || 'Manual shift',
        meta: `${String(s.startHour).padStart(2, '0')}:00 • ${s.durationHours}h`,
        bg: 'linear-gradient(135deg, rgba(79,200,180,0.28), rgba(79,160,200,0.22))',
        border: 'rgba(79,200,180,0.35)',
        onClick: () => {
          if (!salonId) return
          const ok = confirm(t('portal.ownerSchedule.removeConfirm', 'Remove this shift?'))
          if (!ok) return
          schedule.removeShift(weekStartISO, salonId, s.id)
        },
      }))
  }, [salonId, schedule, selectedStaff, shifts, weekStartISO])

  const events = useMemo(() => [...bookingEvents, ...shiftEvents], [bookingEvents, shiftEvents])

  const staffSummary = useMemo(() => {
    const countTrue = (arr) => arr.reduce((sum, v) => sum + (v ? 1 : 0), 0)
    const byStaff = new Map()
    for (const s of staff) {
      const avail = schedule.getAvailability(weekStartISO, s.id, startHour, endHour)
      byStaff.set(s.id, {
        busyHours: countTrue(avail),
        assignedHours: shifts
          .filter((x) => x.staffId === s.id)
          .reduce((sum, x) => sum + (x.durationHours || 0), 0),
      })
    }
    return byStaff
  }, [endHour, schedule, shifts, staff, startHour, weekStartISO])

  function overlaps(existing, start, duration) {
    const end = start + duration
    const aStart = existing.startHour
    const aEnd = existing.startHour + (existing.durationHours || 1)
    return !(end <= aStart || start >= aEnd)
  }

  function createShiftAt({ dayIndex, hour }) {
    if (!salonId) {
      alert(t('portal.ownerSchedule.missingSalon', 'Missing salon context'))
      return
    }
    const staffPick = selectedStaff || staff[0]
    if (!staffPick) {
      alert(t('portal.ownerSchedule.noStaffFound', 'No staff found for this salon (demo accounts).'))
      return
    }
    const start = hour
    const duration = Math.max(1, Number(durationHours) || 1)
    if (start < startHour || start + duration > endHour) return

    // Block adding shifts where staff marked busy.
    const hourIndex = start - startHour
    const hoursSpan = Math.max(1, endHour - startHour)
    const slotIdx = dayIndex * hoursSpan + hourIndex
    if (busySlots && busySlots[slotIdx]) {
      alert(t('portal.ownerSchedule.busySlot', 'This staff marked this slot as busy/unavailable. Pick another time.'))
      return
    }

    const exists = shifts
      .filter((s) => s.staffId === staffPick.id && s.dayIndex === dayIndex)
      .some((s) => overlaps(s, start, duration))
    if (exists) {
      alert(t('portal.ownerSchedule.overlap', 'Shift overlaps an existing shift for this staff.'))
      return
    }

    schedule.createShift(weekStartISO, salonId, {
      staffId: staffPick.id,
      staffName: staffPick.name,
      dayIndex,
      startHour: start,
      durationHours: duration,
      note: 'Manual shift',
    })
  }

  async function runAiGenerate() {
    if (!salonId) {
      alert(t('portal.ownerSchedule.missingSalon', 'Missing salon context'))
      return
    }
    setAiState({ status: 'running', message: t('portal.ownerSchedule.status.running', 'Generating schedule...') })
    try {
      await api.autoGenerateShifts({ weekStartISO })
      setAiState({ status: 'success', message: t('portal.ownerSchedule.status.success', 'AI schedule generated') })
      await schedule.loadShifts({ weekStartISO, salonId, force: true })
    } catch (err) {
      const msg = err?.message || t('portal.ownerSchedule.status.error', 'AI scheduling failed')
      setAiState({ status: 'error', message: msg })
      alert(msg)
    }
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.ownerSchedule.title', 'AI Scheduling')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Sparkles size={16} />
          {t('portal.ownerSchedule.subtitle', 'Weekly schedule (availability + manual assignment)')}
        </div>
      </div>

      <div className="weekWrap">
        <div className="card" style={{ padding: 14 }}>
          <div className="weekToolbar">
            <div className="badge"><CalendarClock size={14} /></div>
            <div style={{ fontWeight: 950 }}>{t('portal.ownerSchedule.week', 'Week')}</div>
            <select className="input" value={weekStartISO} onChange={(e) => setWeekStartISO(e.target.value)} style={{ maxWidth: 300 }}>
              <option value={thisWeek}>{t('portal.ownerSchedule.thisWeek', 'This week')} · {formatWeekRange(thisWeek)}</option>
              <option value={nextWeek}>{t('portal.ownerSchedule.nextWeek', 'Next week')} · {formatWeekRange(nextWeek)}</option>
            </select>

            <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.12)' }} />

            <div className="badge"><Users size={14} /></div>
            <select
              className="input"
              value={selectedStaff?.id || ''}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              style={{ maxWidth: 320 }}
            >
              {staff.length ? staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              )) : (
                <option value="">{t('portal.ownerSchedule.noStaffFound', 'No staff found for this salon (demo accounts).')}</option>
              )}
            </select>

            <select className="input" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} style={{ maxWidth: 160 }}>
              <option value={1}>1 {t('portal.ownerSchedule.duration', 'Duration')}</option>
              <option value={2}>2 {t('portal.ownerSchedule.duration', 'Duration')}</option>
              <option value={3}>3 {t('portal.ownerSchedule.duration', 'Duration')}</option>
              <option value={4}>4 {t('portal.ownerSchedule.duration', 'Duration')}</option>
            </select>

            <button
              className="btn btn-primary"
              type="button"
              onClick={runAiGenerate}
              disabled={aiState.status === 'running'}
            >
              {aiState.status === 'running' ? (
                <Loader2 size={16} className="spin" style={{ marginRight: 8 }} />
              ) : (
                <Wand2 size={16} style={{ marginRight: 8 }} />
              )}
              {aiState.status === 'running' ? t('portal.ownerSchedule.aiRunning', 'Generating…') : t('portal.ownerSchedule.ai', 'AI Scheduling')}
            </button>

            <button className="btn" type="button" onClick={() => setShowBookings((v) => !v)}>
              <Eye size={16} style={{ marginRight: 8 }} />
              {showBookings ? t('portal.ownerSchedule.hideBookings', 'Hide bookings') : t('portal.ownerSchedule.showBookings', 'Show bookings')}
            </button>
          </div>

            <div className="weekLegend" style={{ marginTop: 12 }}>
              <span><span className="weekLegendDot" style={{ background: 'rgba(239,68,68,0.85)' }} />{t('portal.ownerSchedule.legend.busy', 'Staff busy (cannot work)')}</span>
              <span><span className="weekLegendDot" style={{ background: 'rgba(79,200,180,0.9)' }} />{t('portal.ownerSchedule.legend.shift', 'Assigned shift')}</span>
              <span><span className="weekLegendDot" style={{ background: 'rgba(255,255,255,0.22)' }} />{t('portal.ownerSchedule.legend.booking', 'Booking')}</span>
              <span className="muted" style={{ fontSize: 13 }}>{t('portal.ownerSchedule.legend.hint', 'Click a free cell (no busy/red) to add a shift.')}</span>
            </div>

            {aiState.status !== 'idle' ? (
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {aiState.message}
              </div>
            ) : null}
        </div>

        <div className="weekTwoCol">
          <WeeklyCalendar
            startHour={startHour}
            endHour={endHour}
            availabilitySlots={busySlots}
            onCellClick={createShiftAt}
            events={events}
            weekStartISO={weekStartISO}
            slotVariant="busy"
          />

          <div className="weekSide">
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 950, marginBottom: 10 }}>{t('portal.ownerSchedule.sidebar.title', 'Staff overview')}</div>
              {staff.map((s) => {
                const info = staffSummary.get(s.id)
                const active = (selectedStaff?.id || staff[0]?.id) === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="btn"
                    onClick={() => setSelectedStaffId(s.id)}
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                      background: active ? 'rgba(255,255,255,0.08)' : undefined,
                    }}
                  >
                    <span style={{ fontWeight: 900 }}>{s.name}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {t('portal.ownerSchedule.sidebar.busy', 'Busy')}: {info?.busyHours ?? 0}h · {t('portal.ownerSchedule.sidebar.assigned', 'Assigned')}: {info?.assignedHours ?? 0}h
                    </span>
                  </button>
                )
              })}
              {!staff.length ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  {t('portal.ownerSchedule.sidebar.noStaff', 'No staff accounts found for this salon.')}
                </div>
              ) : null}
            </div>

            <div className="portalTable card">
              <div className="portalTableHead">
                <div>{t('portal.ownerSchedule.table.shift', 'Shift')}</div>
                <div>{t('portal.ownerSchedule.table.day', 'Day')}</div>
                <div>{t('portal.ownerSchedule.table.start', 'Start')}</div>
                <div>{t('portal.ownerSchedule.table.action', 'Action')}</div>
              </div>
              {shifts
                .filter((s) => !selectedStaff?.id || s.staffId === selectedStaff.id)
                .slice(0, 12)
                .map((s) => (
                  <div key={s.id} className="portalTableRow">
                    <div style={{ fontWeight: 950 }}>{s.staffName}</div>
                    <div className="muted">#{s.dayIndex + 1}</div>
                    <div className="muted">{String(s.startHour).padStart(2, '0')}:00 ({s.durationHours}h)</div>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (!salonId) return
                        schedule.removeShift(weekStartISO, salonId, s.id)
                      }}
                    >
                      <Trash2 size={16} style={{ marginRight: 8 }} />{t('portal.ownerSchedule.table.remove', 'Remove')}
                    </button>
                  </div>
                ))}
              {!shifts.length ? (
                <div className="portalTableRow">
                  <div className="muted">{t('portal.ownerSchedule.table.none', 'No shifts yet')}</div>
                  <div />
                  <div />
                  <div className="muted">{t('portal.ownerSchedule.table.addHint', 'Click on the calendar to add shifts')}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
