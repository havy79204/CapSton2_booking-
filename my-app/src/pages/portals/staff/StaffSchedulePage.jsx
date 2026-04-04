import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import '../../../styles/schedule.css'
import PortalCard from '../../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../../components/Layout portal/PortalModal.jsx'
import { IconCalendar, IconCevronLeft, IconCevronRight, IconClock, IconUsers } from '../../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../../lib/api.js'

function parseIsoDateLocal(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function formatIsoDateLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysToIsoDate(isoDate, days) {
  const base = parseIsoDateLocal(isoDate)
  if (!base) return ''
  base.setDate(base.getDate() + Number(days || 0))
  return formatIsoDateLocal(base)
}

function getWeekStartFromIsoDate(isoDate) {
  const date = parseIsoDateLocal(isoDate)
  if (!date) return ''
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  const weekStart = new Date(date.setDate(diff))
  return formatIsoDateLocal(weekStart)
}

function parseTimeToMinutes(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseHourFromSetting(value, fallback) {
  const minutes = parseTimeToMinutes(value)
  if (minutes === null) return fallback
  const hour = Math.floor(minutes / 60)
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return fallback
  return hour
}

export default function StaffSchedulePage() {
  const location = useLocation()
  const navigate = useNavigate()

  const initialTodayIso = formatIsoDateLocal(new Date())
  const [scheduleHoursByDay, setScheduleHoursByDay] = useState({
    mon: { openingHour: 8, closingHour: 20 },
    tue: { openingHour: 8, closingHour: 20 },
    wed: { openingHour: 8, closingHour: 20 },
    thu: { openingHour: 8, closingHour: 20 },
    fri: { openingHour: 8, closingHour: 20 },
    sat: { openingHour: 8, closingHour: 20 },
    sun: { openingHour: 8, closingHour: 20 },
  })
  const defaultShiftDuration = 240

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = (await api.get('/api/staff/settings')) || {}
        const defaultOpeningHour = parseHourFromSetting(map.ScheduleOpenTime || map.SalonOpenTime, 8)
        const defaultClosingHour = parseHourFromSetting(map.ScheduleCloseTime || map.SalonCloseTime, 20)
        if (!cancelled) {
          setScheduleHoursByDay({
            mon: { openingHour: defaultOpeningHour, closingHour: defaultClosingHour },
            tue: { openingHour: defaultOpeningHour, closingHour: defaultClosingHour },
            wed: { openingHour: defaultOpeningHour, closingHour: defaultClosingHour },
            thu: { openingHour: defaultOpeningHour, closingHour: defaultClosingHour },
            fri: { openingHour: defaultOpeningHour, closingHour: defaultClosingHour },
            sat: { openingHour: defaultOpeningHour, closingHour: defaultClosingHour },
            sun: { openingHour: defaultOpeningHour, closingHour: defaultClosingHour },
          })
        }
      } catch (err) {
        console.error(err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const [open, setOpen] = useState(false)
  const [weekStart, setWeekStart] = useState(getWeekStartFromIsoDate(initialTodayIso))
  const [viewMode, setViewMode] = useState('week')
  const [selectedDate, setSelectedDate] = useState('')
  const [form, setForm] = useState({ staffId: '', date: '', start: '08:00', end: '12:00', isEditing: false })
  const [weekRange, setWeekRange] = useState(null)
  const [columns, setColumns] = useState([])
  const [staffRows, setStaffRows] = useState([])

  async function refreshSchedule(nextWeekStart) {
    try {
      const qs = nextWeekStart ? `?weekStart=${encodeURIComponent(nextWeekStart)}` : ''
      const data = await api.get(`/api/staff/schedule${qs}`)
      if (data && typeof data === 'object') {
        if (data.weekRange) setWeekRange(data.weekRange)
        if (Array.isArray(data.columns)) setColumns(data.columns)
        if (Array.isArray(data.staffRows)) setStaffRows(data.staffRows)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (!weekStart) return
    refreshSchedule(weekStart)
  }, [weekStart])

  const staffWorking = staffRows.length
  const totalShifts = staffRows.reduce((sum, s) => sum + (s.shifts ? Object.values(s.shifts).reduce((a, list) => a + list.length, 0) : 0), 0)

  const columnsWithIso = useMemo(() => {
    return (columns || []).map((column, index) => ({
      ...column,
      isoDate: column?.isoDate || addDaysToIsoDate(weekStart, index),
    }))
  }, [columns, weekStart])

  function navigateSchedule(direction) {
    const step = Number(direction || 0)
    if (!step) return
    const baseWeekStart = weekStart || getWeekStartFromIsoDate(initialTodayIso)
    const nextWeekStart = addDaysToIsoDate(baseWeekStart, step * 7)
    if (!nextWeekStart) return
    setWeekStart(nextWeekStart)
  }

  function close() {
    setOpen(false)
    setForm({ staffId: '', date: '', start: '08:00', end: '12:00', isEditing: false })
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.staffId || !form.date) {
      alert('Please select staff and date.')
      return
    }
    try {
      await api.post('/api/staff/schedule/shifts', {
        staffId: form.staffId,
        date: form.date,
        start: form.start,
        end: form.end,
      })
      await refreshSchedule(weekStart)
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: form.isEditing ? 'Shift updated successfully.' : 'Shift created successfully.', title: 'Completed' } 
      }))
      close()
    } catch (err) {
      alert(`Operation failed: ${err.message || 'System error'}`)
    }
  }

  return (
    <div className="schedule-page portal-cardInner">
      <PortalModal open={open} title={form.isEditing ? 'Edit Work Shift' : 'Add New Work Shift'} onClose={close}
        footer={<>
          <button type="button" className="portal-modalBtn" onClick={close}>Cancel</button>
          <button type="submit" form="shift-form" className="portal-modalBtn portal-modalBtnPrimary">{form.isEditing ? 'Save Changes' : 'Add Shift'}</button>
        </>}>
        <form id="shift-form" onSubmit={onSubmit} className="schedule-shiftForm">
          <label className="portal-field">
            <span className="portal-label">Staff</span>
            <select className="portal-select" value={form.staffId} onChange={(e) => setForm((p) => ({ ...p, staffId: e.target.value }))}>
              <option value="">Select staff</option>
              {staffRows.map((s) => <option key={s.staffId} value={s.staffId}>{s.name}</option>)}
            </select>
          </label>
          <label className="portal-field">
            <span className="portal-label">Date</span>
            <input type="date" className="portal-input" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          </label>
          <div className="portal-modalGrid2">
            <label className="portal-field"><span className="portal-label">Start Time</span><input type="time" className="portal-input" value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} /></label>
            <label className="portal-field"><span className="portal-label">End Time</span><input type="time" className="portal-input" value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} /></label>
          </div>
        </form>
      </PortalModal>

      <div className="schedule-page portal-grid3" style={{ marginTop: 18 }}>
        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'rgba(37, 99, 235, 0.10)', '--mini-fg': 'var(--info)' }}><IconUsers /></div>
            <div><div className="portal-miniKpiLabel">Working Staff</div><div className="portal-miniKpiValue">{staffWorking}</div></div>
          </div>
        </PortalCard>
        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'var(--success-soft)', '--mini-fg': 'var(--success)' }}><IconClock /></div>
            <div><div className="portal-miniKpiLabel">Total Shifts This Week</div><div className="portal-miniKpiValue">{totalShifts}</div></div>
          </div>
        </PortalCard>
        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'rgba(124, 58, 237, 0.10)', '--mini-fg': 'var(--purple)' }}><IconCalendar /></div>
            <div><div className="portal-miniKpiLabel">Week</div><div className="portal-miniKpiValue">{weekRange?.weekLabel || '-'}</div></div>
          </div>
        </PortalCard>
      </div>

      <PortalCard className="portal-weekNavCard">
        <div className="portal-weekNavControls">
          <div className="portal-weekNavLeft">
            <div className="portal-weekRangeRow">
              <button type="button" className="portal-outlineBtn portal-outlineBtnIcon-only" onClick={() => navigateSchedule(-1)}><IconCevronLeft /></button>
              <button type="button" className="portal-outlineBtn portal-outlineBtnIcon-only" onClick={() => navigateSchedule(1)}><IconCevronRight /></button>
            </div>
            <div className="portal-viewSwitchGroup">
              <button type="button" className={`portal-outlineBtn ${viewMode === 'week' ? 'is-active' : ''}`} onClick={() => setViewMode('week')}>Week</button>
            </div>
          </div>
          <div className="portal-weekNavCenterCard">
            <div className="portal-weekRange">{weekRange?.from ? `${weekRange.from} - ${weekRange.to}` : '—'}</div>
          </div>
          <div className="portal-weekNavRight">
            <button type="button" className="portal-primaryBtn" onClick={() => { setForm({ staffId: '', date: initialTodayIso, start: '08:00', end: '12:00', isEditing: false }); setOpen(true); }}>+ Add Shift</button>
          </div>
        </div>
      </PortalCard>

      {viewMode === 'week' && (
        <PortalCard title="Weekly Work Schedule" className="portal-scheduleCard">
          <div className="portal-scheduleWrap">
            <table className="portal-scheduleTable">
              <thead>
                <tr>
                  <th className="portal-scheduleTh portal-scheduleThStaff">Staff</th>
                  {columnsWithIso.map((c) => <th key={c.date} className="portal-scheduleTh"><div className="portal-scheduleDay">{c.day}</div><div className="portal-scheduleDate">{c.date}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {staffRows.map((s) => (
                  <tr key={s.staffId || s.name}>
                    <td className="portal-scheduleTd portal-scheduleTdStaff">
                      <div className="portal-staffCell">
                        <div className="portal-staffAvatar">{s.name?.[0] || '?'}</div>
                        <div className="portal-staffMeta"><div className="portal-staffName">{s.name}</div><div className="portal-staffRole">{s.role}</div></div>
                      </div>
                    </td>
                    {columnsWithIso.map((c) => {
                      const shiftList = s.shifts[c.date] || []
                      return (
                        <td key={`${s.staffId || s.name}-${c.date}`} className="portal-scheduleTd">
                          <div className="portal-shiftStack">
                            {shiftList.length > 0 ? shiftList.map((label, idx) => (
                              <div key={idx} className="portal-shiftPill" onClick={() => { setForm({ staffId: s.staffId, date: c.isoDate, start: label.split('-')[0].trim(), end: label.split('-')[1].trim(), isEditing: true }); setOpen(true); }}>
                                <span className="portal-shiftPillIcon"><IconClock /></span>{label}
                              </div>
                            )) : <div className="portal-off">-</div>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>
      )}
    </div>
  )
}
