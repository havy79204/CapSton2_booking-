import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import '../../styles/schedule.css'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import {
  IconCalendar,
  IconCevronLeft,
  IconCevronRight,
  IconClock,
  IconUsers,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

// --- Helper Functions ---
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

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseScheduleQueryState(search) {
  const params = new URLSearchParams(search)
  return {
    view: params.get('view') || 'week',
    date: params.get('date') || '',
    weekStart: params.get('weekStart') || '',
    modal: {
      isOpen: params.has('modal'),
      mode: params.get('modal') || 'add',
      staffId: params.get('modalStaffId') || '',
      date: params.get('modalDate') || '',
      oldDate: params.get('modalOldDate') || '',
      start: params.get('modalStart') || '08:00',
      end: params.get('modalEnd') || '17:00',
      oldLabel: params.get('modalOldLabel') || '',
    },
  }
}

function StaffAvatar({ initial }) {
  return <div className="portal-staffAvatar">{initial}</div>
}

function ShiftPill({ label, onClick }) {
  const [startText] = String(label || '').split('-').map((part) => part.trim())
  const startMinutes = parseTimeToMinutes(startText)
  const startHour = startMinutes === null ? 8 : Math.floor(startMinutes / 60)
  const toneClass = startHour < 12 ? 'portal-shiftPill--morning' : startHour < 16 ? 'portal-shiftPill--afternoon' : 'portal-shiftPill--evening'

  return (
    <div className={`portal-shiftPill ${toneClass}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <span className="portal-shiftPillIcon" aria-hidden="true">
        <IconClock />
      </span>
      {label}
    </div>
  )
}

export default function OwnerSchedulePage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [initialQuery] = useState(() => parseScheduleQueryState(location.search))
  const initialModal = initialQuery.modal

  const businessHours = useMemo(() => ({ openingHour: 8, closingHour: 20 }), [])
  const TIMELINE_START = businessHours.openingHour * 60
  const TIMELINE_END = businessHours.closingHour * 60
  const TIMELINE_DURATION = TIMELINE_END - TIMELINE_START

  const initialTodayIso = formatIsoDateLocal(new Date())
  const initialDefaultStart = minutesToTimeString(TIMELINE_START)
  const initialDefaultEnd = minutesToTimeString(TIMELINE_START + 240)
  const defaultShiftDuration = 240

  const [open, setOpen] = useState(initialModal.isOpen)
  const [weekStart, setWeekStart] = useState(
    initialQuery.weekStart ||
      (initialQuery.date ? getWeekStartFromIsoDate(initialQuery.date) : '') ||
      getWeekStartFromIsoDate(initialTodayIso)
  )
  const [viewMode, setViewMode] = useState(initialQuery.view || 'week')
  const [selectedDate, setSelectedDate] = useState(initialQuery.date || '')

  const [form, setForm] = useState({
    staffId: initialModal.staffId || '',
    date: initialModal.date || '',
    oldDate: initialModal.oldDate || '',
    start: initialModal.start || initialDefaultStart,
    end: initialModal.end || initialDefaultEnd,
    isEditing: initialModal.mode === 'edit',
    oldLabel: initialModal.mode === 'edit' ? (initialModal.oldLabel || '') : '',
  })

  const [weekRange, setWeekRange] = useState(null)
  const [columns, setColumns] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [formError, setFormError] = useState('')

  // --- API Logic ---
  async function refreshSchedule(nextWeekStart) {
    try {
      const qs = nextWeekStart ? `?weekStart=${encodeURIComponent(nextWeekStart)}` : ''
      const data = await api.get(`/api/owner/schedule${qs}`)
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
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) refreshSchedule(weekStart)
    })
    return () => {
      cancelled = true
    }
  }, [weekStart])

  const staffOptions = useMemo(() => staffRows.map((s) => ({ id: s.staffId, name: s.name })), [staffRows])
  const staffWorking = staffRows.length
  const totalShifts = staffRows.reduce(
    (sum, s) => sum + (s.shifts ? Object.values(s.shifts) : []).reduce((a, list) => a + list.length, 0),
    0,
  )

  const quickSelectOptions = useMemo(() => {
    return [
      { label: 'Morning', start: minutesToTimeString(businessHours.openingHour * 60), end: minutesToTimeString(12 * 60) },
      { label: 'Afternoon', start: minutesToTimeString(12 * 60), end: minutesToTimeString(16 * 60) },
      { label: 'Evening', start: minutesToTimeString(16 * 60), end: minutesToTimeString(businessHours.closingHour * 60) },
    ]
  }, [businessHours])

  const columnsWithIso = useMemo(() => {
    return (columns || []).map((column, index) => ({
      ...column,
      isoDate: isIsoDateString(column?.isoDate) ? column.isoDate : addDaysToIsoDate(weekStart, index),
    }))
  }, [columns, weekStart])

  function normalizeFormDateForApi(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (isIsoDateString(raw)) return raw
    const matchColumn = columnsWithIso.find((column) => column.date === raw)
    return matchColumn?.isoDate || ''
  }

  // --- URL Sync Effect ---
  useEffect(() => {
    const params = new URLSearchParams()
    if (viewMode && viewMode !== 'week') params.set('view', viewMode)
    if (selectedDate) params.set('date', selectedDate)
    if (weekStart) params.set('weekStart', weekStart)

    if (open) {
      params.set('modal', form.isEditing ? 'edit' : 'add')
      if (form.staffId) params.set('modalStaffId', form.staffId)
      if (form.date) params.set('modalDate', form.date)
      if (form.oldDate && form.isEditing) params.set('modalOldDate', form.oldDate)
      if (form.start) params.set('modalStart', form.start)
      if (form.end) params.set('modalEnd', form.end)
      if (form.oldLabel && form.isEditing) params.set('modalOldLabel', form.oldLabel)
    }

    const newSearch = params.toString()
    const newUrl = newSearch ? `?${newSearch}` : location.pathname
    if (newUrl !== location.pathname + location.search) {
      navigate(newUrl, { replace: true })
    }
  }, [open, form, viewMode, selectedDate, weekStart, location.pathname, location.search, navigate])

  function navigateSchedule(direction) {
    const step = Number(direction || 0)
    if (!step) return

    const baseSelectedDate = isIsoDateString(selectedDate)
      ? selectedDate
      : (columnsWithIso[0]?.isoDate || weekStart || initialTodayIso)

    if (viewMode === 'day') {
      const nextSelectedDate = addDaysToIsoDate(baseSelectedDate, step)
      if (!nextSelectedDate) return

      setSelectedDate(nextSelectedDate)

      const nextWeekStart = getWeekStartFromIsoDate(nextSelectedDate)
      if (nextWeekStart && nextWeekStart !== weekStart) {
        setWeekStart(nextWeekStart)
      }
      return
    }

    const baseWeekStart = isIsoDateString(weekStart)
      ? weekStart
      : getWeekStartFromIsoDate(baseSelectedDate)
    const nextWeekStart = addDaysToIsoDate(baseWeekStart, step * 7)
    if (!nextWeekStart) return

    setWeekStart(nextWeekStart)

    if (isIsoDateString(selectedDate)) {
      const nextSelectedDate = addDaysToIsoDate(selectedDate, step * 7)
      if (nextSelectedDate) setSelectedDate(nextSelectedDate)
    }
  }

  function close() {
    setOpen(false)
    setFormError('')
    setForm({
      staffId: '',
      date: initialTodayIso,
      oldDate: '',
      start: initialDefaultStart,
      end: initialDefaultEnd,
      isEditing: false,
      oldLabel: '',
    })
  }

  // --- Handle Delete Shift ---
  async function onDeleteShift() {
    if (!form.staffId || !form.date || !form.oldLabel) {
      setFormError('Missing shift information. Please reopen the shift and try again.')
      return
    }
    if (!window.confirm('Are you sure you want to delete this shift?')) return
    try {
      setFormError('')
      const normalizedDate = normalizeFormDateForApi(form.date)
      if (!normalizedDate) {
        setFormError('Delete failed: Invalid date format.')
        return
      }
      await api.delete('/api/owner/schedule/shifts', {
        staffId: form.staffId,
        date: normalizeFormDateForApi(form.oldDate || form.date) || normalizedDate,
        label: form.oldLabel,
      })
      await refreshSchedule(weekStart)
      close()
    } catch (err) {
      setFormError(`Delete failed: ${err.message || 'System error'}`)
      console.error(err)
    }
  }

  // --- Handle Add/Edit Shift ---
  async function onSubmit(e) {
    e.preventDefault()
    if (!form.staffId || !form.date) {
      setFormError('Please select staff and date.')
      return
    }
    try {
      setFormError('')
      const normalizedDate = normalizeFormDateForApi(form.date)
      if (!normalizedDate) {
        setFormError('Operation failed: Invalid date format.')
        return
      }
      await api.post('/api/owner/schedule/shifts', {
        staffId: form.staffId,
        date: normalizedDate,
        oldDate: form.oldDate,
        start: form.start,
        end: form.end,
        oldLabel: form.oldLabel,
      })
      await refreshSchedule(weekStart)
      close()
    } catch (err) {
      setFormError(`Operation failed: ${err.message || 'System error'}`)
      console.error(err)
    }
  }

  // --- Day Timeline Rows ---
  const dayColumn = viewMode === 'day' ? (columnsWithIso.find((c) => c.isoDate === selectedDate) || columnsWithIso[0]) : null
  const dayColumnDate = dayColumn?.date || ''
  const dayColumnIsoDate = dayColumn?.isoDate || ''

  const dayStaffRows = useMemo(() => {
    if (viewMode !== 'day' || !dayColumnDate) return []
    return staffRows.map((s) => {
      const shiftList = s.shifts[dayColumnDate] || []
      return {
        ...s,
        dayShifts: shiftList,
      }
    })
  }, [viewMode, dayColumnDate, staffRows])

  return (
    <div className="schedule-page portal-cardInner">

      {/* --- Modal --- */}
      <PortalModal
        open={open}
        title={form.isEditing ? 'Edit Work Shift' : 'Add New Work Shift'}
        onClose={close}
        modalClassName="schedule-shiftModal"
        bodyClassName="schedule-shiftModalBody"
        footerClassName="schedule-shiftModalFooter"
        footer={
          <>
            {form.isEditing && (
              <button type="button" className="portal-modalBtn" style={{ color: 'red', marginRight: 'auto' }} onClick={onDeleteShift}>
                Delete
              </button>
            )}
            <button type="button" className="portal-modalBtn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form="shift-form" className="portal-modalBtn portal-modalBtnPrimary">
              {form.isEditing ? 'Save Changes' : 'Add Shift'}
            </button>
          </>
        }
      >
        <form id="shift-form" onSubmit={onSubmit} className="schedule-shiftForm">
          <label className="portal-field">
            <span className="portal-label">Staff</span>
            <input
              type="text"
              className="portal-input"
              placeholder="Search staff..."
              list="staffList"
              value={form.staffId ? staffOptions.find((s) => s.id === form.staffId)?.name || '' : ''}
              onChange={(e) => {
                const found = staffOptions.find((s) => s.name === e.target.value)
                setForm((p) => ({ ...p, staffId: found?.id || '' }))
              }}
              disabled={form.isEditing}
            />
            <datalist id="staffList">
              {staffOptions.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </label>

          <label className="portal-field">
            <span className="portal-label">Date</span>
            <div className="portal-inputWithIcon">
              <input
                type="date"
                className="portal-input"
                value={form.date}
                onChange={(e) => {
                  setForm((p) => ({ ...p, date: e.target.value }))
                }}
              />
            </div>
          </label>

          <div className="portal-modalGrid2">
            <label className="portal-field">
              <span className="portal-label">Start Time</span>
              <div className="portal-inputWithIcon">
                <input
                  className="portal-input"
                  type="time"
                  value={form.start}
                  onChange={(e) => {
                    if (formError) setFormError('')
                    setForm((p) => ({ ...p, start: e.target.value }))
                  }}
                />
              </div>
            </label>

            <label className="portal-field">
              <span className="portal-label">End Time</span>
              <div className="portal-inputWithIcon">
                <input
                  className="portal-input"
                  type="time"
                  value={form.end}
                  onChange={(e) => {
                    if (formError) setFormError('')
                    setForm((p) => ({ ...p, end: e.target.value }))
                  }}
                />
              </div>
            </label>
          </div>

          {/* --- Quick Select Buttons --- */}
          {!form.isEditing && (
            <div className="schedule-shiftSuggestions" style={{ marginTop: 16 }}>
              <span className="portal-label">Shift Suggestions</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {quickSelectOptions.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={`portal-quickSelectBtn ${form.start === opt.start && form.end === opt.end ? 'is-active' : ''}`}
                    onClick={() => {
                      setForm((p) => ({ ...p, start: opt.start, end: opt.end }))
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formError && (
            <div className="schedule-shiftFormError" role="alert" aria-live="polite">
              {formError}
            </div>
          )}
        </form>
      </PortalModal>

      {/* --- KPI SECTION --- */}
      <div className="schedule-page portal-grid3" style={{ marginTop: 18 }}>
        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'rgba(37, 99, 235, 0.10)', '--mini-fg': 'var(--info)' }}>
              <IconUsers />
            </div>
            <div>
              <div className="portal-miniKpiLabel">Working Staff</div>
              <div className="portal-miniKpiValue">{staffWorking}</div>
            </div>
          </div>
        </PortalCard>
        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'var(--success-soft)', '--mini-fg': 'var(--success)' }}>
              <IconClock />
            </div>
            <div>
              <div className="portal-miniKpiLabel">Total Shifts This Week</div>
              <div className="portal-miniKpiValue">{totalShifts}</div>
            </div>
          </div>
        </PortalCard>
        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'rgba(124, 58, 237, 0.10)', '--mini-fg': 'var(--purple)' }}>
              <IconCalendar />
            </div>
            <div>
              <div className="portal-miniKpiLabel">Tổng số Lịch hẹn</div>
              <div className="portal-miniKpiValue">{staffRows.reduce((sum, s) => sum + Object.keys(s.shifts).length, 0)}</div>
            </div>
          </div>
        </PortalCard>
      </div>

      {/* --- Unified Control Bar --- */}
      <PortalCard className="portal-weekNavCard">
        <div className="portal-weekNavControls">
          <div className="portal-weekNavLeft">
            <div className="portal-weekRangeRow">
              <button type="button" className="portal-outlineBtn portal-outlineBtnIcon-only" onClick={() => navigateSchedule(-1)} title={viewMode === 'day' ? 'Previous Day' : 'Previous Week'}>
                <IconCevronLeft />
              </button>
              <button type="button" className="portal-outlineBtn portal-outlineBtnIcon-only" onClick={() => navigateSchedule(1)} title={viewMode === 'day' ? 'Next Day' : 'Next Week'}>
                <IconCevronRight />
              </button>
            </div>

            <div className="portal-viewSwitchGroup">
              <button
                type="button"
                className={`portal-outlineBtn ${viewMode === 'day' ? 'is-active' : ''}`}
                onClick={() => {
                  setViewMode('day')
                  setSelectedDate(dayColumnIsoDate || columnsWithIso[0]?.isoDate || initialTodayIso)
                }}
              >
                Day
              </button>
              <button
                type="button"
                className={`portal-outlineBtn ${viewMode === 'week' ? 'is-active' : ''}`}
                onClick={() => {
                  setViewMode('week')
                }}
              >
                Week
              </button>
            </div>
          </div>

          <div className="portal-weekNavCenterCard">
            <div className="portal-weekRange">{weekRange?.from ? `${weekRange.from} - ${weekRange.to}` : '—'}</div>

            <div className="portal-weekLabel">{weekRange?.weekLabel || ''}</div>
            <input
              type="date"
              className="portal-input portal-weekNavDateInput portal-weekPickerUnderLabel"
              value={selectedDate || weekStart || initialTodayIso}
              onChange={(e) => {
                const nextDate = e.target.value
                setSelectedDate(nextDate)
                const nextWeekStart = getWeekStartFromIsoDate(nextDate)
                if (nextWeekStart) {
                  setWeekStart(nextWeekStart)
                }
              }}
            />
          </div>

          <div className="portal-weekNavRight">
            <button
              type="button"
              className="portal-primaryBtn"
              onClick={() => {
                setForm({
                  staffId: '',
                  date: initialTodayIso,
                  oldDate: '',
                  start: initialDefaultStart,
                  end: initialDefaultEnd,
                  isEditing: false,
                  oldLabel: '',
                })
                setOpen(true)
              }}
            >
              <span className="portal-btnPlus" aria-hidden="true" />
              Add Shift
            </button>
          </div>
        </div>
      </PortalCard>

      {/* --- WEEK VIEW --- */}
      {viewMode === 'week' && (
        <PortalCard title="Weekly Work Schedule" className="portal-scheduleCard">
          <div className="portal-scheduleWrap">
            <table className="portal-scheduleTable">
              <thead>
                <tr>
                  <th className="portal-scheduleTh portal-scheduleThStaff">Staff</th>
                  {columnsWithIso.map((c) => (
                    <th key={c.date} className="portal-scheduleTh">
                      <div className="portal-scheduleDay">{c.day}</div>
                      <div className="portal-scheduleDate">{c.date}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffRows.map((s) => (
                  <tr key={s.staffId || s.name}>
                    <td className="portal-scheduleTd portal-scheduleTdStaff">
                      <div className="portal-staffCell">
                        <StaffAvatar initial={s.initial} />
                        <div className="portal-staffMeta">
                          <div className="portal-staffName">{s.name}</div>
                          <div className="portal-staffRole">{s.role}</div>
                        </div>
                      </div>
                    </td>
                    {columnsWithIso.map((c) => {
                      const shiftList = s.shifts[c.date] || []
                      return (
                        <td key={`${s.staffId || s.name}-${c.date}`} className="portal-scheduleTd">
                          <div className="portal-shiftStack">
                            {shiftList.length > 0 ? (
                              shiftList.map((label, idx) => (
                                <ShiftPill
                                  key={idx}
                                  label={label}
                                  onClick={() => {
                                    const parts = label.split('-').map((t) => t.trim())
                                    setForm({
                                      staffId: s.staffId,
                                      date: c.isoDate || '',
                                      oldDate: c.isoDate || '',
                                      start: parts[0] || '08:00',
                                      end: parts[1] || '17:00',
                                      isEditing: true,
                                      oldLabel: label,
                                    })
                                    setOpen(true)
                                  }}
                                />
                              ))
                            ) : (
                              <div
                                className="portal-off"
                                onClick={() => {
                                  setForm({
                                    staffId: s.staffId,
                                    date: c.isoDate || '',
                                    oldDate: '',
                                    start: initialDefaultStart,
                                    end: initialDefaultEnd,
                                    isEditing: false,
                                    oldLabel: '',
                                  })
                                  setOpen(true)
                                }}
                              >
                                Off
                              </div>
                            )}
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

      {/* --- DAY VIEW (Timeline) --- */}
      {viewMode === 'day' && dayColumnDate && dayStaffRows.length > 0 && (
        <PortalCard title={`Daily Schedule - ${dayColumnDate}`} className="portal-dayTimelineCard">
          <div className="portal-dayTimeline">
            {/* Timeline header with ticks */}
            <div className="portal-dayTimelineHeader">
              <div className="portal-dayTimelineLabel" style={{ width: '120px' }}>
                Time
              </div>
              <div className="portal-dayTimelineScale">
                {Array.from({ length: businessHours.closingHour - businessHours.openingHour + 1 }).map((_, idx) => {
                  const hour = businessHours.openingHour + idx
                  const percent = ((hour * 60 - TIMELINE_START) / TIMELINE_DURATION) * 100
                  const edgeClass = idx === 0 ? 'is-first' : idx === businessHours.closingHour - businessHours.openingHour ? 'is-last' : ''
                  return (
                    <div key={hour} className={`portal-dayTimelineTick ${edgeClass}`.trim()} style={{ left: `${percent}%` }}>
                      <span>{String(hour).padStart(2, '0')}:00</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Staff rows with shift blocks */}
            {dayStaffRows.map((s) => {
              return (
                <div key={s.staffId} className="portal-dayTimelineRow">
                  <div className="portal-dayTimelineLabel" style={{ width: '120px' }}>
                    <div className="portal-staffCell" style={{ gap: 6 }}>
                      <StaffAvatar initial={s.initial} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="portal-staffName" style={{ fontSize: '12px' }}>
                          {s.name}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className="portal-dayTimelineBlocks"
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const clickX = Math.min(Math.max(e.clientX - rect.left, 0), rect.width)
                      const ratio = rect.width > 0 ? clickX / rect.width : 0
                      const rawStart = TIMELINE_START + ratio * TIMELINE_DURATION
                      const roundedStart = Math.round(rawStart / 30) * 30
                      const safeStart = Math.max(TIMELINE_START, Math.min(roundedStart, TIMELINE_END - 60))
                      const safeEnd = Math.min(safeStart + defaultShiftDuration, TIMELINE_END)

                      setForm({
                        staffId: s.staffId,
                        date: dayColumnIsoDate || initialTodayIso,
                        oldDate: '',
                        start: minutesToTimeString(safeStart),
                        end: minutesToTimeString(safeEnd),
                        isEditing: false,
                        oldLabel: '',
                      })
                      setOpen(true)
                    }}
                  >
                    {s.dayShifts.map((label, idx) => {
                      const parts = label.split('-').map((t) => t.trim())
                      const startMin = parseTimeToMinutes(parts[0])
                      const endMin = parseTimeToMinutes(parts[1])
                      if (startMin === null || endMin === null) return null
                      const leftPercent = ((startMin - TIMELINE_START) / TIMELINE_DURATION) * 100
                      const widthPercent = ((endMin - startMin) / TIMELINE_DURATION) * 100
                      const startHour = Math.floor(startMin / 60)
                      const shiftType = startHour < 12 ? 'morning' : startHour < 16 ? 'afternoon' : 'evening'
                      return (
                        <div
                          key={idx}
                          className={`portal-dayTimelineBlock portal-shiftBlock-${shiftType}`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                          }}
                          onClick={() => {
                            setForm({
                              staffId: s.staffId,
                              date: dayColumnIsoDate,
                              oldDate: dayColumnIsoDate,
                              start: parts[0],
                              end: parts[1],
                              isEditing: true,
                              oldLabel: label,
                            })
                            setOpen(true)
                          }}
                        >
                          {label}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </PortalCard>
      )}
    </div>
  )
}