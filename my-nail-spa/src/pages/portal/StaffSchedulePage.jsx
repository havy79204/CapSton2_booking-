import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Save, Wand2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { useSchedule, DEFAULT_END_HOUR, DEFAULT_START_HOUR, makeEmptySlots } from '../../context/ScheduleContext.jsx'
import { startOfWeekISO, addDaysISO, formatWeekRange } from '../../lib/dates'
import { WeeklyCalendar } from '../../components/WeeklyCalendar.jsx'

export function StaffSchedulePage() {
  const auth = useAuth()
  const user = auth.user
  const { t } = useI18n()

  const schedule = useSchedule()

  const thisWeek = useMemo(() => startOfWeekISO(new Date()), [])
  const nextWeek = useMemo(() => addDaysISO(thisWeek, 7), [thisWeek])
  const [weekStartISO, setWeekStartISO] = useState(thisWeek)

  const startHour = DEFAULT_START_HOUR
  const endHour = DEFAULT_END_HOUR
  const hours = Math.max(1, endHour - startHour)

  useEffect(() => {
    if (!user?.id) return
    void schedule.loadAvailability({ weekStartISO, staffId: user.id, startHour, endHour })
    if (user?.salonId) void schedule.loadShifts({ weekStartISO, salonId: user.salonId })
  }, [endHour, schedule.loadAvailability, schedule.loadShifts, startHour, user?.id, user?.salonId, weekStartISO])

  // Lightweight polling so shifts assigned by owner show up without reload.
  useEffect(() => {
    if (!user?.salonId) return undefined
    const t = setInterval(() => {
      void schedule.loadShifts({ weekStartISO, salonId: user.salonId, force: true })
    }, 8000)
    return () => clearInterval(t)
  }, [schedule.loadShifts, user?.salonId, weekStartISO])

  const slots = useMemo(() => {
    if (!user?.id) return makeEmptySlots(startHour, endHour)
    // slots now represent BUSY times (true = cannot work)
    return schedule.getAvailability(weekStartISO, user.id, startHour, endHour)
  }, [endHour, schedule, startHour, user, weekStartISO])

  const shifts = useMemo(() => {
    const salonId = user?.salonId
    if (!salonId || !user?.id) return []
    return schedule
      .listShifts(weekStartISO, salonId)
      .filter((s) => s.staffId === user.id)
  }, [schedule, user, weekStartISO])

  const events = useMemo(() => {
    return shifts.map((s) => ({
      id: s.id,
      dayIndex: s.dayIndex,
      startHour: s.startHour,
      durationHours: s.durationHours,
      title: 'Shift',
      subtitle: s.note || t('portal.staffSchedule.assignedByOwner', 'Assigned by owner'),
      meta: `${String(s.startHour).padStart(2, '0')}:00 • ${s.durationHours}h`,
      bg: 'linear-gradient(135deg, rgba(79,200,180,0.28), rgba(79,160,200,0.22))',
      border: 'rgba(79,200,180,0.35)',
      onClick: () => {
        alert('Shift details are read-only in the demo.')
      },
    }))
  }, [shifts])

  function toggleSlot({ dayIndex, hour }) {
    if (!user?.id) return
    const hourIndex = hour - startHour
    if (hourIndex < 0 || hourIndex >= hours) return
    const idx = dayIndex * hours + hourIndex
    const next = slots.slice()
    next[idx] = !next[idx]
    schedule.setAvailability(weekStartISO, user.id, next)
  }

  function fillTemplate(kind) {
    if (!user?.id) return
    const next = makeEmptySlots(startHour, endHour)
    const mark = (dayIndex, fromH, toH) => {
      for (let h = fromH; h < toH; h += 1) {
        const hourIndex = h - startHour
        if (hourIndex < 0 || hourIndex >= hours) continue
        next[dayIndex * hours + hourIndex] = true
      }
    }

    if (kind === 'weekday') {
      // Mon-Fri 10-18
      for (let d = 0; d < 5; d += 1) mark(d, 10, 18)
    }
    if (kind === 'weekend') {
      // Sat-Sun 11-17
      mark(5, 11, 17)
      mark(6, 11, 17)
    }
    if (kind === 'clear') {
      // no-op, already empty
    }

    schedule.setAvailability(weekStartISO, user.id, next)
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.staffSchedule.title', 'My Schedule')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <CalendarClock size={16} />
          {t('portal.staffSchedule.subtitle', 'Technician: {{name}}').replace('{{name}}', auth.user?.name || t('portal.common.none', '—'))}
        </div>
      </div>

      <div className="weekWrap">
        <div className="card" style={{ padding: 14 }}>
          <div className="weekToolbar">
            <div className="badge"><Save size={14} /></div>
            <div style={{ fontWeight: 950 }}>{t('portal.staffSchedule.busyTitle', 'Busy times (cannot work)')}</div>
            <select className="input" value={weekStartISO} onChange={(e) => setWeekStartISO(e.target.value)} style={{ maxWidth: 260 }}>
              <option value={thisWeek}>{t('portal.ownerSchedule.thisWeek', 'This week')} · {formatWeekRange(thisWeek)}</option>
              <option value={nextWeek}>{t('portal.ownerSchedule.nextWeek', 'Next week')} · {formatWeekRange(nextWeek)}</option>
            </select>
            <div className="weekLegend">
              <span><span className="weekLegendDot" style={{ background: 'rgba(239,68,68,0.85)' }} />{t('portal.staffSchedule.legend.busy', 'Busy (cannot work)')}</span>
              <span><span className="weekLegendDot" style={{ background: 'rgba(255,255,255,0.22)' }} />{t('portal.staffSchedule.legend.free', 'Free')}</span>
              <span><span className="weekLegendDot" style={{ background: 'rgba(79,200,180,0.9)' }} />{t('portal.staffSchedule.legend.shift', 'Assigned shift')}</span>
            </div>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={() => fillTemplate('weekday')}>
              <Wand2 size={16} style={{ marginRight: 8 }} />{t('portal.staffSchedule.block.weekday', 'Block weekdays 10–18')}
            </button>
            <button className="btn" type="button" onClick={() => fillTemplate('weekend')}>
              <Wand2 size={16} style={{ marginRight: 8 }} />{t('portal.staffSchedule.block.weekend', 'Block weekends 11–17')}
            </button>
            <button className="btn" type="button" onClick={() => fillTemplate('clear')}>
              {t('portal.staffSchedule.block.clear', 'Clear')}
            </button>
            <div className="muted" style={{ fontSize: 13 }}>{t('portal.staffSchedule.hint', 'Click cells to mark when you cannot work.')}</div>
          </div>
        </div>

        <WeeklyCalendar
          startHour={startHour}
          endHour={endHour}
          availabilitySlots={slots}
          onCellClick={toggleSlot}
          events={events}
          weekStartISO={weekStartISO}
          slotVariant="busy"
        />

        <div className="portalTable card" style={{ marginTop: 0 }}>
          <div className="portalTableHead">
            <div>{t('portal.staffSchedule.table.item', 'Item')}</div>
            <div>{t('portal.staffSchedule.table.week', 'Week')}</div>
            <div>{t('portal.staffSchedule.table.status', 'Status')}</div>
            <div>{t('portal.staffSchedule.table.note', 'Note')}</div>
          </div>
          <div className="portalTableRow">
            <div style={{ fontWeight: 950 }}>{t('portal.staffSchedule.table.busySaved', 'Busy schedule submitted')}</div>
            <div className="muted">{formatWeekRange(weekStartISO)}</div>
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <CheckCircle2 size={14} />
              <span className="badge">{t('portal.common.saved', 'Saved!')}</span>
            </div>
            <div className="muted">{t('portal.staffSchedule.table.ownerHint', 'Owner can now avoid these hours when assigning shifts.')}</div>
          </div>
        </div>
      </div>
    </>
  )
}
