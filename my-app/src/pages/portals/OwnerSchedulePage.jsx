import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import '../../styles/schedule.css'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import ConfirmDeleteModal from '../../components/Layout portal/ConfirmDeleteModal.jsx'
import {
  IconCalendar,
  IconCevronLeft,
  IconCevronRight,
  IconClock,
  IconUsers,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api, resolveApiImageUrl } from '../../lib/api.js'

function emitPortalToast({ type, message, timeoutMs }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('portal:toast', {
      detail: { type, message, timeoutMs },
    })
  )
}

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

function normalizeTimeToken(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const asMinutes = parseTimeToMinutes(raw)
  if (asMinutes !== null) return minutesToTimeString(asMinutes)

  const asHour = Number(raw)
  if (Number.isFinite(asHour) && asHour >= 0 && asHour <= 23) {
    return minutesToTimeString(Math.trunc(asHour) * 60)
  }

  return ''
}

function normalizeScheduleEndTime(value) {
  const normalized = normalizeTimeToken(value)
  if (!normalized) return ''
  return normalized === '12:00' ? '13:00' : normalized
}

function resolveShiftKeywordRange(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null

  if (normalized.includes('morning') || normalized.includes('sáng') || normalized.includes('sang')) {
    return { start: '08:00', end: '13:00' }
  }
  if (normalized.includes('afternoon') || normalized.includes('chiều') || normalized.includes('chieu')) {
    return { start: '13:00', end: '16:00' }
  }
  if (normalized.includes('evening') || normalized.includes('tối') || normalized.includes('toi')) {
    return { start: '16:00', end: '20:00' }
  }
  if (normalized.includes('full') || normalized.includes('all day') || normalized.includes('cả ngày') || normalized.includes('ca ngay')) {
    return { start: '08:00', end: '20:00' }
  }

  return null
}

function extractShiftRange(value, fallbackStart = '', fallbackEnd = '') {
  const text = String(value || '').trim()
  const rangeMatch = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
  if (rangeMatch) {
    const start = normalizeTimeToken(rangeMatch[1])
    const end = normalizeScheduleEndTime(rangeMatch[2])
    if (start && end) return { start, end }
  }

  const fromKeyword = resolveShiftKeywordRange(text)
  if (fromKeyword) return fromKeyword

  const start = normalizeTimeToken(fallbackStart)
  const end = normalizeScheduleEndTime(fallbackEnd)
  if (start && end) return { start, end }

  return null
}

function formatShiftRangeLabel(range) {
  if (!range?.start || !range?.end) return ''
  return `${range.start} - ${normalizeScheduleEndTime(range.end)}`
}

function parseHourFromSetting(value, fallback) {
  const minutes = parseTimeToMinutes(value)
  if (minutes === null) return fallback
  const hour = Math.floor(minutes / 60)
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return fallback
  return hour
}

function getWeekdayKey(isoDate) {
  const d = parseIsoDateLocal(isoDate)
  if (!d) return 'mon'
  const day = d.getDay()
  if (day === 1) return 'mon'
  if (day === 2) return 'tue'
  if (day === 3) return 'wed'
  if (day === 4) return 'thu'
  if (day === 5) return 'fri'
  if (day === 6) return 'sat'
  return 'sun'
}

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function normalizeShiftSuggestion(option) {
  const start = normalizeTimeToken(option?.start)
  const end = normalizeScheduleEndTime(option?.end)
  if (!start || !end) return null
  return {
    ...option,
    start,
    end,
    label: `${start} - ${end}`,
  }
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
      start: params.get('modalStart') || '',
      end: params.get('modalEnd') || '',
      oldLabel: params.get('modalOldLabel') || '',
    },
  }
}

function StaffAvatar({ initial, avatarUrl, name }) {
  const src = resolveApiImageUrl(avatarUrl)
  if (src) {
    return (
      <div className="portal-staffAvatar">
        <img src={src} alt={name || 'Staff'} />
      </div>
    )
  }
  return <div className="portal-staffAvatar">{initial}</div>
}

function ShiftPill({ label, onClick }) {
  // label can be a string or an object containing metadata
  const raw = label || ''
  let display = String(raw)
  let note = ''
  let status = 'normal'
  let startText = ''
  let endText = ''
  if (typeof raw === 'object') {
    display = raw.Label || raw.label || raw.time || String(raw)
    note = raw.Note || raw.note || ''
    status = raw.Status || raw.status || 'normal'
    startText = raw.StartHour || raw.startHour || (display || '').split('-')[0]?.trim()
    endText = raw.EndHour || raw.endHour || (display || '').split('-')[1]?.trim()
    // If this is an approved leave record, render as Off (red) regardless of time
    const sLower = String(status || '').toLowerCase()
    if (sLower === 'approved' || sLower === 'pending') {
      // show Off as friendly label, keep original display in tooltip
      display = raw.Label || raw.label || 'Off'
    }
  } else {
    display = String(raw)
    startText = display.split('-')[0]?.trim()
    endText = display.split('-')[1]?.trim()
    if (/REQUESTED/i.test(display) || /leave-request/i.test(display)) status = 'Pending'
    if (/\bLEAVE\b/i.test(display) && !/REQUESTED/i.test(display)) status = 'Approved'
  }

  const range = extractShiftRange(display, startText, endText)
  const rangeLabel = formatShiftRangeLabel(range)

  const startMinutes = parseTimeToMinutes(range?.start || startText)
  const startHour = startMinutes === null ? (Number(startText) || 8) : Math.floor(startMinutes / 60)
  const toneClass = startHour < 12 ? 'portal-shiftPill--morning' : startHour < 16 ? 'portal-shiftPill--afternoon' : 'portal-shiftPill--evening'

  const pending = String(status).toLowerCase() === 'pending'
  const approved = String(status).toLowerCase() === 'approved'
  const isLeave = pending || approved

  const classes = [
    'portal-shiftPill',
    isLeave ? 'portal-shiftPill--leave' : toneClass,
    pending ? 'border-2 border-dashed border-yellow-400 relative' : '',
    approved ? 'bg-red-600 text-white cursor-not-allowed' : '',
  ].join(' ')

  let friendlyLabel = rangeLabel || display
  if (isLeave) {
    friendlyLabel = rangeLabel ? `${rangeLabel} Off` : `${display} Off`
  }

  return (
    <div className={classes} onClick={approved ? undefined : onClick} style={{ cursor: approved ? 'default' : 'pointer' }} title={note || ''}>
      <span className="portal-shiftPillIcon" aria-hidden="true">
        <IconClock />
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {friendlyLabel}
        {pending ? <span style={{ fontSize: 12 }} aria-hidden>⚠️</span> : null}
      </span>
    </div>
  )
}

function detectShiftMeta(item) {
  if (!item) return { status: 'normal', label: String(item || '') }
  if (typeof item === 'object') {
    const availabilityId = item.AvailabilityId || item.availabilityId || (item.meta && (item.meta.availabilityId || item.meta.AvailabilityId))
    const startHour = item.StartHour || (item.meta && item.meta.startHour) || ''
    const endHour = item.EndHour || (item.meta && item.meta.endHour) || ''
    const fallbackRange = formatShiftRangeLabel(extractShiftRange('', startHour, endHour))
    return {
      status: item.Status || item.status || 'normal',
      label: item.Label || item.label || item.time || fallbackRange || String(item),
      note: item.Note || item.note || '',
      availabilityId,
      startHour,
      endHour,
    }
  }
  const s = String(item)
  if (/REQUESTED/i.test(s) || /leave-request/i.test(s)) return { status: 'Pending', label: s, note: s }
  if (/\bLEAVE\b/i.test(s) && !/REQUESTED/i.test(s)) return { status: 'Approved', label: s, note: s }
  return { status: 'normal', label: s, note: '' }
}

export default function OwnerSchedulePage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [initialQuery] = useState(() => parseScheduleQueryState(location.search))
  const initialModal = initialQuery.modal

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
        const map = (await api.get('/api/owner/settings')) || {}
        const defaultOpeningHour = parseHourFromSetting(map.ScheduleOpenTime || map.SalonOpenTime, 8)
        const defaultClosingHour = parseHourFromSetting(map.ScheduleCloseTime || map.SalonCloseTime, 20)

        const buildHours = (openKey, closeKey) => {
          const openingHour = parseHourFromSetting(map[openKey], defaultOpeningHour)
          const closingHour = parseHourFromSetting(map[closeKey], defaultClosingHour)
          const safeCloseHour = closingHour > openingHour ? closingHour : Math.min(openingHour + 1, 23)
          return { openingHour, closingHour: safeCloseHour }
        }

        if (!cancelled) {
          setScheduleHoursByDay({
            mon: buildHours('ScheduleMonOpenTime', 'ScheduleMonCloseTime'),
            tue: buildHours('ScheduleTueOpenTime', 'ScheduleTueCloseTime'),
            wed: buildHours('ScheduleWedOpenTime', 'ScheduleWedCloseTime'),
            thu: buildHours('ScheduleThuOpenTime', 'ScheduleThuCloseTime'),
            fri: buildHours('ScheduleFriOpenTime', 'ScheduleFriCloseTime'),
            sat: buildHours('ScheduleSatOpenTime', 'ScheduleSatCloseTime'),
            sun: buildHours('ScheduleSunOpenTime', 'ScheduleSunCloseTime'),
          })
        }
      } catch (err) {
        console.error(err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const [open, setOpen] = useState(initialModal.isOpen)
  const [weekStart, setWeekStart] = useState(
    initialQuery.weekStart ||
      (initialQuery.date ? getWeekStartFromIsoDate(initialQuery.date) : '') ||
      getWeekStartFromIsoDate(initialTodayIso)
  )
  const [viewMode, setViewMode] = useState(initialQuery.view || 'week')
  const [selectedDate, setSelectedDate] = useState(initialQuery.date || '')

  const getHoursForDate = useCallback((isoDate) => {
    const weekdayKey = getWeekdayKey(isoDate || initialTodayIso)
    return scheduleHoursByDay[weekdayKey] || { openingHour: 8, closingHour: 20 }
  }, [initialTodayIso, scheduleHoursByDay])

  function getDefaultShiftWindow(isoDate) {
    const hours = getHoursForDate(isoDate)
    const startMin = hours.openingHour * 60
    const endLimit = hours.closingHour * 60
    const endMin = Math.min(startMin + defaultShiftDuration, endLimit)
    const safeEndMin = endMin > startMin ? endMin : Math.min(startMin + 60, startMin + defaultShiftDuration)
    return {
      start: minutesToTimeString(startMin),
      end: normalizeScheduleEndTime(minutesToTimeString(safeEndMin)),
    }
  }

  const initialModalDefaults = getDefaultShiftWindow(initialModal.date || selectedDate || initialTodayIso)

  const [form, setForm] = useState({
    staffId: initialModal.staffId || '',
    date: initialModal.date || '',
    oldDate: initialModal.oldDate || '',
    start: initialModal.start || initialModalDefaults.start,
    end: initialModal.end || initialModalDefaults.end,
    isEditing: initialModal.mode === 'edit',
    oldLabel: initialModal.mode === 'edit' ? (initialModal.oldLabel || '') : '',
    availabilityId: '',
  })

  const [weekRange, setWeekRange] = useState(null)
  const [columns, setColumns] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [formError, setFormError] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

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

  const selectedBusinessHours = useMemo(() => {
    const baseDate = selectedDate || initialTodayIso
    return getHoursForDate(baseDate)
  }, [selectedDate, initialTodayIso, getHoursForDate])

  const quickSelectOptions = useMemo(() => {
    const quickStart = selectedBusinessHours.openingHour * 60
    const quickEnd = selectedBusinessHours.closingHour * 60
    const firstStart = Math.max(quickStart, 8 * 60)
    const firstEnd = Math.min(quickEnd, 12 * 60)
    const secondStart = Math.max(quickStart, 13 * 60)
    const secondEnd = Math.min(quickEnd, 16 * 60)
    const thirdStart = Math.max(quickStart, 16 * 60)
    const thirdEnd = Math.min(quickEnd, 20 * 60)

    return [
      { label: `${minutesToTimeString(firstStart)} - ${minutesToTimeString(firstEnd)}`, start: minutesToTimeString(firstStart), end: minutesToTimeString(firstEnd) },
      { label: `${minutesToTimeString(secondStart)} - ${minutesToTimeString(secondEnd)}`, start: minutesToTimeString(secondStart), end: minutesToTimeString(secondEnd) },
      { label: `${minutesToTimeString(thirdStart)} - ${minutesToTimeString(thirdEnd)}`, start: minutesToTimeString(thirdStart), end: minutesToTimeString(thirdEnd) },
    ]
      .map((opt) => normalizeShiftSuggestion(opt))
      .filter((opt) => opt && parseTimeToMinutes(opt.start) < parseTimeToMinutes(opt.end))
  }, [selectedBusinessHours])

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
    const defaults = getDefaultShiftWindow(selectedDate || initialTodayIso)
    setOpen(false)
    setDeleteConfirmOpen(false)
    setFormError('')
    setForm({
      staffId: '',
      date: initialTodayIso,
      oldDate: '',
      start: defaults.start,
      end: defaults.end,
      isEditing: false,
      oldLabel: '',
      availabilityId: '',
    })
  }

  function requestDeleteShift() {
    if (!form.staffId || !form.date || !form.oldLabel) {
      setFormError('Missing shift information. Please reopen the shift and try again.')
      emitPortalToast({ type: 'error', message: 'Missing shift information. Please reopen and try again.' })
      return
    }
    setDeleteConfirmOpen(true)
  }

  // --- Handle Delete Shift ---
  async function onDeleteShift() {
    if (!form.staffId || !form.date || !form.oldLabel) {
      setFormError('Missing shift information. Please reopen the shift and try again.')
      emitPortalToast({ type: 'error', message: 'Missing shift information. Please reopen and try again.' })
      return
    }
    try {
      setDeleteConfirmOpen(false)
      setFormError('')
      const normalizedDate = normalizeFormDateForApi(form.date)
      if (!normalizedDate) {
        setFormError('Delete failed: Invalid date format.')
        emitPortalToast({ type: 'error', message: 'Delete failed: Invalid date format.' })
        return
      }
      const payload = {
        staffId: form.staffId,
        date: normalizeFormDateForApi(form.oldDate || form.date) || normalizedDate,
        label: form.oldLabel,
      }
      if (form.availabilityId) payload.availabilityId = form.availabilityId
      const deleteResult = await api.delete('/api/owner/schedule/shifts', payload)
      if (!deleteResult || Number(deleteResult.deleted || 0) <= 0) {
        throw new Error('Delete failed: Shift not found or already deleted.')
      }
      await refreshSchedule(weekStart)
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Shift deleted successfully.', title: 'Completed' } 
      }))
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
      emitPortalToast({ type: 'error', message: 'Please select staff and date.' })
      return
    }
    try {
      setFormError('')
      const normalizedDate = normalizeFormDateForApi(form.date)
      if (!normalizedDate) {
        setFormError('Operation failed: Invalid date format.')
        emitPortalToast({ type: 'error', message: 'Operation failed: Invalid date format.' })
        return
      }
      await api.post('/api/owner/schedule/shifts', {
        staffId: form.staffId,
        date: normalizedDate,
        oldDate: form.oldDate,
        start: form.start,
        end: normalizeScheduleEndTime(form.end),
        oldLabel: form.oldLabel,
      })
      await refreshSchedule(weekStart)
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: form.isEditing ? 'Shift updated successfully.' : 'Shift created successfully.', title: 'Completed' } 
      }))
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

  const dayShiftBounds = useMemo(() => {
    if (!dayColumnDate) return { min: null, max: null }
    let min = null
    let max = null

    for (const staff of staffRows) {
      const shifts = staff?.shifts?.[dayColumnDate] || []
      for (const label of shifts) {
        const parts = String(label || '').split('-').map((t) => t.trim())
        const startMin = parseTimeToMinutes(parts[0])
        const endMin = parseTimeToMinutes(parts[1])
        if (startMin === null || endMin === null) continue
        min = min === null ? startMin : Math.min(min, startMin)
        max = max === null ? endMin : Math.max(max, endMin)
      }
    }

    return { min, max }
  }, [dayColumnDate, staffRows])

  const dayConfiguredHours = getHoursForDate(dayColumnIsoDate || selectedDate || initialTodayIso)
  const configuredStart = dayConfiguredHours.openingHour * 60
  const configuredEnd = dayConfiguredHours.closingHour * 60
  const TIMELINE_START = dayShiftBounds.min === null ? configuredStart : Math.min(configuredStart, dayShiftBounds.min)
  const TIMELINE_END = dayShiftBounds.max === null ? configuredEnd : Math.max(configuredEnd, dayShiftBounds.max)
  const TIMELINE_DURATION = Math.max(60, TIMELINE_END - TIMELINE_START)

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
              <button type="button" className="portal-modalBtn" style={{ color: 'red', marginRight: 'auto' }} onClick={requestDeleteShift}>
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
                    setForm((p) => ({ ...p, end: normalizeScheduleEndTime(e.target.value) }))
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
                      setForm((p) => ({ ...p, start: opt.start, end: normalizeScheduleEndTime(opt.end) }))
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

      <ConfirmDeleteModal
        open={deleteConfirmOpen}
        title="Confirm delete"
        message="Are you sure you want to delete this shift?"
        detail="This action cannot be undone."
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={onDeleteShift}
      />

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
              <div className="portal-miniKpiLabel">Total Appointments</div>
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
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="portal-outlineBtn"
                title="Attendance report"
                onClick={() => navigate('/portals/owner/attendance-report')}
              >
                Report
              </button>
            
            <button
              type="button"
              className="portal-primaryBtn"
              onClick={() => {
                const defaults = getDefaultShiftWindow(initialTodayIso)
                setForm({
                  staffId: '',
                  date: initialTodayIso,
                  oldDate: '',
                  start: defaults.start,
                  end: defaults.end,
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
        </div>
      </PortalCard>

      {/* Pending requests now handled on separate page: /portal/pending-requests */}

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
                        <StaffAvatar initial={s.initial} avatarUrl={s.avatarUrl} name={s.name} />
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
                              shiftList.map((label, idx) => {
                                const meta = detectShiftMeta(label)
                                return (
                                  <ShiftPill
                                    key={idx}
                                    label={label}
                                    onClick={() => {
                                      if (String(meta.status).toLowerCase() === 'approved') return
                                      const selectedRange = extractShiftRange(meta.label, meta.startHour, meta.endHour)
                                      const defaults = getDefaultShiftWindow(c.isoDate || initialTodayIso)
                                      setForm({
                                        staffId: s.staffId,
                                        date: c.isoDate || '',
                                        oldDate: c.isoDate || '',
                                        start: selectedRange?.start || defaults.start,
                                        end: selectedRange?.end || defaults.end,
                                        isEditing: true,
                                        oldLabel: meta.label,
                                        availabilityId: meta.availabilityId || '',
                                      })
                                      setOpen(true)
                                    }}
                                  />
                                )
                              })
                            ) : (
                              <div
                                className="portal-off"
                                onClick={() => {
                                  const defaults = getDefaultShiftWindow(c.isoDate || initialTodayIso)
                                  setForm({
                                    staffId: s.staffId,
                                    date: c.isoDate || '',
                                    oldDate: '',
                                    start: defaults.start,
                                    end: defaults.end,
                                    isEditing: false,
                                        oldLabel: '',
                                        availabilityId: '',
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
                {Array.from({ length: Math.floor(TIMELINE_DURATION / 60) + 1 }).map((_, idx) => {
                  const hour = Math.floor((TIMELINE_START / 60) + idx)
                  const percent = ((hour * 60 - TIMELINE_START) / TIMELINE_DURATION) * 100
                  const edgeClass = idx === 0 ? 'is-first' : idx === Math.floor(TIMELINE_DURATION / 60) ? 'is-last' : ''
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
                      <StaffAvatar initial={s.initial} avatarUrl={s.avatarUrl} name={s.name} />
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
                        end: normalizeScheduleEndTime(minutesToTimeString(safeEnd)),
                        isEditing: false,
                          oldLabel: '',
                          availabilityId: '',
                      })
                      setOpen(true)
                    }}
                  >
                    {s.dayShifts.map((label, idx) => {
                      const meta = detectShiftMeta(label)
                      const selectedRange = extractShiftRange(meta.label, meta.startHour, meta.endHour)
                      const startMin = parseTimeToMinutes(selectedRange?.start)
                      const endMin = parseTimeToMinutes(selectedRange?.end)
                      if (startMin === null || endMin === null) return null
                      const leftPercent = ((startMin - TIMELINE_START) / TIMELINE_DURATION) * 100
                      const widthPercent = ((endMin - startMin) / TIMELINE_DURATION) * 100
                      const startHour = Math.floor(startMin / 60)
                      const shiftType = startHour < 12 ? 'morning' : startHour < 16 ? 'afternoon' : 'evening'
                      const pending = String(meta.status).toLowerCase() === 'pending'
                      const approved = String(meta.status).toLowerCase() === 'approved'
                      const blockClass = approved ? 'bg-gray-200 text-gray-500' : pending ? 'border-2 border-dashed border-red-400' : `portal-shiftBlock-${shiftType}`
                      return (
                        <div
                          key={idx}
                          className={`portal-dayTimelineBlock ${blockClass}`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            cursor: approved ? 'default' : 'pointer',
                          }}
                          onClick={() => {
                            if (approved) return
                            setForm({
                              staffId: s.staffId,
                              date: dayColumnIsoDate,
                              oldDate: dayColumnIsoDate,
                              start: selectedRange?.start || '',
                              end: selectedRange?.end || '',
                              isEditing: true,
                              oldLabel: meta.label,
                              availabilityId: meta.availabilityId || '',
                            })
                            setOpen(true)
                          }}
                          title={meta.note || ''}
                        >
                          {approved ? 'Time Off' : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {selectedRange ? formatShiftRangeLabel(selectedRange) : meta.label}
                              {pending ? <span style={{ fontSize: 12 }} aria-hidden>⚠️</span> : null}
                            </span>
                          )}
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