import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/staff.css'
import '../../styles/staff-specialty.css'
import '../../styles/global-buttons.css'
import {
  IconCalendar,
  IconDollar,
  IconSearch,
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

const ADD_STAFF_NAME_MAX_LENGTH = 150
const ADD_STAFF_PHONE_MAX_LENGTH = 15
const ADD_STAFF_EMAIL_MAX_LENGTH = 254
const ADD_STAFF_ADDRESS_MAX_LENGTH = 400
const ADD_STAFF_NAME_REGEX = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u
const ADD_STAFF_PHONE_REGEX = /^0(3|5|7|8|9)\d{8}$/
const ADD_STAFF_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STAFF_PERIOD_OPTIONS = new Set(['all', 'day', 'week', 'month', 'year'])
const STAFF_SORT_OPTIONS = new Set([
  'name_asc',
  'name_desc',
  'hours_asc',
  'hours_desc',
  'bookings_asc',
  'bookings_desc',
  'salary_asc',
  'salary_desc',
  'commission_asc',
  'commission_desc',
])

function normalizeInputText(value) {
  const cleaned = Array.from(String(value || ''))
    .filter((ch) => ch >= ' ' && ch !== '\u007F')
    .join('')
  return cleaned.replace(/\s+/g, ' ').trim()
}

function sanitizeInputText(value) {
  return normalizeInputText(value).replace(/[<>]/g, '')
}

function normalizeInputPhone(value) {
  const raw = String(value || '').replace(/[^\d+]/g, '').trim()
  if (!raw) return ''

  if (raw.startsWith('+84')) {
    return `0${raw.slice(3).replace(/\D/g, '')}`
  }

  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length === 11) {
    return `0${digits.slice(2)}`
  }

  return digits
}

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

function isBeforeToday(value) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return date.getTime() < now.getTime()
}

function validateAddStaffForm(formState) {
  const errors = {}

  const normalizedName = sanitizeInputText(formState?.name)
  const normalizedPhone = normalizeInputPhone(formState?.phone)
  const normalizedEmail = normalizeInputText(formState?.email).toLowerCase()
  const normalizedAddress = sanitizeInputText(formState?.address)
  const hireDate = String(formState?.hireDate || '').trim()

  if (!normalizedName) {
    errors.name = 'Full name is required.'
  } else if (normalizedName.length > ADD_STAFF_NAME_MAX_LENGTH) {
    errors.name = `Full name must be at most ${ADD_STAFF_NAME_MAX_LENGTH} characters.`
  } else if (!ADD_STAFF_NAME_REGEX.test(normalizedName)) {
    errors.name = 'Full name contains invalid characters.'
  }

  if (!normalizedPhone) {
    errors.phone = 'Phone number is required.'
  } else if (normalizedPhone.length > ADD_STAFF_PHONE_MAX_LENGTH) {
    errors.phone = `Phone number must be at most ${ADD_STAFF_PHONE_MAX_LENGTH} characters.`
  } else if (!ADD_STAFF_PHONE_REGEX.test(normalizedPhone)) {
    errors.phone = 'Phone number format is invalid.'
  }

  if (!normalizedEmail) {
    errors.email = 'Email is required.'
  } else if (normalizedEmail.length > ADD_STAFF_EMAIL_MAX_LENGTH) {
    errors.email = `Email must be at most ${ADD_STAFF_EMAIL_MAX_LENGTH} characters.`
  } else if (!ADD_STAFF_EMAIL_REGEX.test(normalizedEmail)) {
    errors.email = 'Email format is invalid.'
  }

  if (!hireDate) {
    errors.hireDate = 'Hire date is required.'
  } else if (!isIsoDateString(hireDate)) {
    errors.hireDate = 'Hire date format is invalid.'
  } else if (isBeforeToday(hireDate)) {
    errors.hireDate = 'Hire date cannot be earlier than today.'
  }

  if (!normalizedAddress) {
    errors.address = 'Address is required.'
  } else if (normalizedAddress.length > ADD_STAFF_ADDRESS_MAX_LENGTH) {
    errors.address = `Address must be at most ${ADD_STAFF_ADDRESS_MAX_LENGTH} characters.`
  }

  return {
    errors,
    payload: {
      name: normalizedName,
      phone: normalizedPhone,
      email: normalizedEmail,
      address: normalizedAddress,
      hireDate,
      status: 'Active',
      specialtyCategoryIds: Array.isArray(formState?.specialtyCategoryIds)
        ? formState.specialtyCategoryIds
        : [],
    },
  }
}

function validateDetailStaffForm(formState) {
  const errors = {}

  const normalizedName = sanitizeInputText(formState?.name)
  const normalizedPhone = normalizeInputPhone(formState?.phone)
  const normalizedEmail = normalizeInputText(formState?.email).toLowerCase()
  const normalizedAddress = sanitizeInputText(formState?.address)
  const hireDate = String(formState?.hireDate || '').trim()

  if (!normalizedAddress) {
    errors.address = 'Address is required.'
  } else if (normalizedAddress.length > ADD_STAFF_ADDRESS_MAX_LENGTH) {
    errors.address = `Address must be at most ${ADD_STAFF_ADDRESS_MAX_LENGTH} characters.`
  }

  if (!hireDate) {
    errors.hireDate = 'Hire date is required.'
  } else if (!isIsoDateString(hireDate)) {
    errors.hireDate = 'Hire date format is invalid.'
  }

  return {
    errors,
    payload: {
      name: normalizedName,
      phone: normalizedPhone,
      email: normalizedEmail,
      address: normalizedAddress,
      hireDate,
    },
  }
}

function initialsOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = (parts.length > 1 ? parts[parts.length - 1] : parts[0])?.[0] ?? ''
  return (first + last).toUpperCase()
}

function formatSpecialtyLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '0 ₫'
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} ₫`
}

function formatWorkingHours(value) {
  const hours = Number(value || 0)
  if (!Number.isFinite(hours) || hours <= 0) return '0.0h'
  return `${hours.toFixed(1)}h`
}

function todayDateInputValue() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateInputValue(value) {
  if (!value) return ''
  const text = String(value)
  const isoDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (isoDateMatch) return isoDateMatch[1]

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function OwnerStaffPage() {
  const PAGE_SIZE = 10
  const STAFF_FETCH_SIZE = 1000
  const navigate = useNavigate()
  const location = useLocation()
  const closingDetailRef = useRef(false)
  const initialUrlStateRef = useRef(null)

  const parseListStateFromSearch = useCallback((search) => {
    const params = new URLSearchParams(search)
    const keyword = String(params.get('keyword') || '').trim()
    const periodRaw = String(params.get('period') || '').trim().toLowerCase()
    const period = STAFF_PERIOD_OPTIONS.has(periodRaw) ? periodRaw : 'all'

    const dateRaw = String(params.get('date') || '').trim()
    const date = isIsoDateString(dateRaw) ? dateRaw : todayDateInputValue()

    const sortByRaw = String(params.get('sortBy') || '').trim()
    const sortByValue = STAFF_SORT_OPTIONS.has(sortByRaw) ? sortByRaw : 'name_asc'

    const pageRaw = Number.parseInt(String(params.get('page') || ''), 10)
    const pageValue = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1

    return {
      keyword,
      period,
      date,
      sortBy: sortByValue,
      currentPage: pageValue,
    }
  }, [])

  if (!initialUrlStateRef.current) {
    initialUrlStateRef.current = parseListStateFromSearch(location.search)
  }
  const [open, setOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailMode, setDetailMode] = useState('view')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [staffMembers, setStaffMembers] = useState([])
  const [staffSummary, setStaffSummary] = useState({ totalStaff: 0, totalBookings: 0, totalSalary: 0 })
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffError, setStaffError] = useState('')
  const [specialtyCategories, setSpecialtyCategories] = useState([])
  const [query, setQuery] = useState(() => initialUrlStateRef.current?.keyword || '')
  const [debouncedQuery, setDebouncedQuery] = useState(() => initialUrlStateRef.current?.keyword || '')
  const [timePeriod, setTimePeriod] = useState(() => initialUrlStateRef.current?.period || 'all')
  const [selectedDate, setSelectedDate] = useState(() => initialUrlStateRef.current?.date || todayDateInputValue())
  const [sortBy, setSortBy] = useState(() => initialUrlStateRef.current?.sortBy || 'name_asc')
  const [currentPage, setCurrentPage] = useState(() => initialUrlStateRef.current?.currentPage || 1)

  function getSortDirection(field) {
    if (sortBy === `${field}_asc`) return 'asc'
    if (sortBy === `${field}_desc`) return 'desc'
    return null
  }

  function setSortField(field, direction) {
    setSortBy(`${field}_${direction}`)
    setCurrentPage(1)
  }

  function toggleSortField(field) {
    const currentDirection = getSortDirection(field)
    const nextDirection = currentDirection === 'asc' ? 'desc' : 'asc'
    setSortField(field, nextDirection)
  }

  function renderSortButton(field, label) {
    const direction = getSortDirection(field)
    return (
      <button
        type="button"
        className="staff-sortToggle"
        aria-label={`Toggle sort ${label}`}
        onClick={() => toggleSortField(field)}
      >
        <span className={`staff-sortTriangle up ${direction === 'asc' ? 'is-active' : ''}`} aria-hidden="true" />
        <span className={`staff-sortTriangle down ${direction === 'desc' ? 'is-active' : ''}`} aria-hidden="true" />
      </button>
    )
  }

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    hireDate: todayDateInputValue(),
    specialtyCategoryIds: [],
  })
  const [formErrors, setFormErrors] = useState({})
  const [, setFormSubmitError] = useState('')

  const [detailForm, setDetailForm] = useState({
    name: '',
    phone: '',
    email: '',
    avatarUrl: '',
    address: '',
    hireDate: '',
    status: 'Active',
    specialtyCategoryIds: [],
  })
  const [detailErrors, setDetailErrors] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false,
    member: null,
    closeAfterDelete: false,
  })

  const fetchStaffMembers = useCallback(async (signal) => {
    const params = new URLSearchParams({
      period: timePeriod,
      date: selectedDate,
      keyword: debouncedQuery.trim(),
      page: '1',
      pageSize: String(STAFF_FETCH_SIZE),
      sortBy,
    })
    const staffData = await api.get(`/api/owner/staff?${params.toString()}`, { signal })
    return staffData && typeof staffData === 'object' ? staffData : {}
  }, [timePeriod, selectedDate, debouncedQuery, sortBy, STAFF_FETCH_SIZE])

  const loadStaffMembers = useCallback(async (signal) => {
    setStaffLoading(true)
    setStaffError('')

    try {
      const payload = await fetchStaffMembers(signal)
      setStaffMembers(Array.isArray(payload.items) ? payload.items : [])
      setStaffSummary(payload.summary && typeof payload.summary === 'object'
        ? {
          totalStaff: Number(payload.summary.totalStaff || 0),
          totalBookings: Number(payload.summary.totalBookings || 0),
          totalSalary: Number(payload.summary.totalSalary || 0),
        }
        : { totalStaff: 0, totalBookings: 0, totalSalary: 0 })
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error(err)
      setStaffError(err?.message || 'Unable to load staff')
      setStaffMembers([])
      setStaffSummary({ totalStaff: 0, totalBookings: 0, totalSalary: 0 })
    } finally {
      setStaffLoading(false)
    }
  }, [fetchStaffMembers])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const next = parseListStateFromSearch(location.search)
    setQuery((prev) => (prev === next.keyword ? prev : next.keyword))
    setDebouncedQuery((prev) => (prev === next.keyword ? prev : next.keyword))
    setTimePeriod((prev) => (prev === next.period ? prev : next.period))
    setSelectedDate((prev) => (prev === next.date ? prev : next.date))
    setSortBy((prev) => (prev === next.sortBy ? prev : next.sortBy))
    setCurrentPage((prev) => (prev === next.currentPage ? prev : next.currentPage))
  }, [location.search, parseListStateFromSearch])

  useEffect(() => {
    const currentParams = new URLSearchParams(location.search)
    const currentStaffId = String(currentParams.get('staffId') || '').trim()

    const nextParams = new URLSearchParams()
    nextParams.set('keyword', debouncedQuery.trim())
    nextParams.set('period', timePeriod)
    nextParams.set('date', selectedDate)
    nextParams.set('sortBy', sortBy)
    nextParams.set('page', String(Math.max(1, Number(currentPage || 1))))
    if (currentStaffId) nextParams.set('staffId', currentStaffId)

    const currentSearch = currentParams.toString()
    const nextSearch = nextParams.toString()
    if (currentSearch === nextSearch) return

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    )
  }, [debouncedQuery, timePeriod, selectedDate, sortBy, currentPage, location.pathname, location.search, navigate])

  useEffect(() => {
    const controller = new AbortController()
    loadStaffMembers(controller.signal)
    return () => controller.abort()
  }, [loadStaffMembers])

  useEffect(() => {
    api.get('/api/owner/staff/skill-categories')
      .then((categoryData) => {
        if (Array.isArray(categoryData)) {
          setSpecialtyCategories(
            categoryData
              .map((x) => ({ id: String(x.id || '').trim(), name: String(x.name || '').trim() }))
              .filter((x) => x.id)
          )
        }
      })
      .catch((err) => console.error(err))
  }, [])

  function close() {
    setOpen(false)
    setFormErrors({})
    setFormSubmitError('')
  }

  function openAddModal() {
    setForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      hireDate: todayDateInputValue(),
      specialtyCategoryIds: [],
    })
    setFormErrors({})
    setFormSubmitError('')
    setOpen(true)
  }

  function updateAddFormField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFormErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
    setFormSubmitError('')
  }

  const setDetailStaffIdInUrl = useCallback((staffId) => {
    const params = new URLSearchParams(location.search)
    const normalizedId = String(staffId || '').trim()

    if (normalizedId) {
      params.set('staffId', normalizedId)
    } else {
      params.delete('staffId')
    }

    const nextSearch = params.toString()
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    )
  }, [location.pathname, location.search, navigate])

  const closeDetail = useCallback(() => {
    closingDetailRef.current = true
    setDetailStaffIdInUrl('')
    setDetailOpen(false)
    setDetailLoading(false)
    setSelectedStaff(null)
    setDetailMode('view')
    setDetailErrors({})
  }, [setDetailStaffIdInUrl])

  const openDetail = useCallback(async (member, mode = 'view') => {
    if (!member?.id) return
    setDetailStaffIdInUrl(member.id)
    setDetailLoading(true)
    setDetailMode(mode)
    setDetailOpen(true)
    setDetailErrors({})


    try {
      const detail = await api.get(`/api/owner/staff/${member.id}`)
      const source = detail && typeof detail === 'object' ? detail : member
      setSelectedStaff(source)
      setDetailForm({
        name: source.name || '',
        phone: source.phone || '',
        email: source.email || '',
        avatarUrl: source.avatarUrl || '',
        address: source.address || '',
        hireDate: formatDateInputValue(source.hireDate),
        status: source.status || 'Active',
        specialtyCategoryIds: Array.isArray(source.specialtyCategoryIds)
          ? source.specialtyCategoryIds.map((x) => String(x)).filter(Boolean)
          : [],
      })
    } catch (err) {
      console.error(err)
      setSelectedStaff(member)
      setDetailForm({
        name: member.name || '',
        phone: member.phone || '',
        email: member.email || '',
        avatarUrl: member.avatarUrl || '',
        address: member.address || '',
        hireDate: formatDateInputValue(member.hireDate),
        status: member.status || 'Active',
        specialtyCategoryIds: Array.isArray(member.specialtyCategoryIds)
          ? member.specialtyCategoryIds.map((x) => String(x)).filter(Boolean)
          : [],
      })
    } finally {
      setDetailLoading(false)
    }
  }, [setDetailStaffIdInUrl])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const staffIdFromUrl = String(params.get('staffId') || '').trim()
    if (!staffIdFromUrl) {
      closingDetailRef.current = false
      return
    }

    if (closingDetailRef.current) return

    const currentSelectedId = String(selectedStaff?.id || '').trim()
    if (detailOpen && currentSelectedId === staffIdFromUrl) return
    if (detailLoading) return

    const staffFromList = staffMembers.find((x) => String(x?.id || '').trim() === staffIdFromUrl)
    openDetail(staffFromList || { id: staffIdFromUrl }, 'view')
  }, [location.search, detailOpen, detailLoading, selectedStaff?.id, staffMembers, openDetail])

  function toggleCategoryInForm(categoryId) {
    setForm((prev) => {
      const id = String(categoryId || '').trim()
      if (!id) return prev
      const has = prev.specialtyCategoryIds.includes(id)
      return {
        ...prev,
        specialtyCategoryIds: has
          ? prev.specialtyCategoryIds.filter((x) => x !== id)
          : [...prev.specialtyCategoryIds, id],
      }
    })
  }

  function toggleCategoryInDetailForm(categoryId) {
    setDetailForm((prev) => {
      const id = String(categoryId || '').trim()
      if (!id) return prev
      const has = prev.specialtyCategoryIds.includes(id)
      return {
        ...prev,
        specialtyCategoryIds: has
          ? prev.specialtyCategoryIds.filter((x) => x !== id)
          : [...prev.specialtyCategoryIds, id],
      }
    })
  }

  function updateDetailFormField(field, value) {
    setDetailForm((prev) => ({ ...prev, [field]: value }))
    setDetailErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function renderSpecialtyPicker(selectedIds, onToggle, emptyText = 'No specialty categories found.', disabled = false, variantClassName = '') {
    if (specialtyCategories.length === 0) {
      return <div className="portal-pageSubtitle">{emptyText}</div>
    }

    return (
      <div className={`portal-specialtyPicker ${variantClassName} ${disabled ? 'is-readonly' : ''}`.trim()}>
        <div className="portal-specialtyGrid" role="group" aria-label="Specialty categories">
          {specialtyCategories.map((cat) => {
            const checked = selectedIds.includes(cat.id)
            const displayName = formatSpecialtyLabel(cat.name || cat.id)
            return (
              <label
                key={cat.id}
                className={`portal-specialtyChip ${checked ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(cat.id)}
                />
                <span>{displayName}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  async function onSubmit(e) {
    e.preventDefault()
    const { errors, payload } = validateAddStaffForm(form)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      setFormSubmitError('')
      return
    }

    try {
      setFormErrors({})
      setFormSubmitError('')
      await api.post('/api/owner/staff', payload)

      await loadStaffMembers()

      setForm({
        name: '',
        phone: '',
        email: '',
        address: '',
        hireDate: todayDateInputValue(),
        specialtyCategoryIds: [],
      })
      setFormErrors({})
      setFormSubmitError('')
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Staff added successfully', title: 'Completed' } 
      }))
      close()
    } catch (err) {
      console.error(err)
      setFormSubmitError(err?.message || 'Unable to add staff. Please check your input and try again.')
    }
  }

  function requestDeleteStaff(member, options = {}) {
    if (!member?.id) return
    setDeleteConfirm({
      open: true,
      member,
      closeAfterDelete: Boolean(options.closeAfterDelete),
    })
  }

  function closeDeleteConfirm() {
    setDeleteConfirm({
      open: false,
      member: null,
      closeAfterDelete: false,
    })
  }

  async function onDeleteStaff(member, options = {}) {
    if (!member?.id) return
    try {
      await api.delete(`/api/owner/staff/${member.id}`)
      await loadStaffMembers()
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Employee removal successful.', title: 'Completed' } 
      }))
      if (options.closeAfterDelete) {
        closeDetail()
      }
    } catch (err) {
      console.error(err)
    } finally {
      closeDeleteConfirm()
    }
  }

  async function onDetailSubmit(e) {
    e.preventDefault()
    if (!selectedStaff?.id || detailMode !== 'edit') return

    const { errors, payload } = validateDetailStaffForm(detailForm)
    if (Object.keys(errors).length > 0) {
      setDetailErrors(errors)
      return
    }

    try {
      setDetailErrors({})
      const sourceName = sanitizeInputText(selectedStaff?.name)
      const sourcePhone = normalizeInputPhone(selectedStaff?.phone)
      const sourceEmail = normalizeInputText(selectedStaff?.email).toLowerCase()
      const sourceAddress = sanitizeInputText(selectedStaff?.address)
      const sourceHireDate = formatDateInputValue(selectedStaff?.hireDate)
      const sourceSpecialtyIds = Array.isArray(selectedStaff?.specialtyCategoryIds)
        ? selectedStaff.specialtyCategoryIds.map((x) => String(x)).filter(Boolean).sort()
        : []
      const currentSpecialtyIds = Array.isArray(detailForm.specialtyCategoryIds)
        ? detailForm.specialtyCategoryIds.map((x) => String(x)).filter(Boolean).sort()
        : []

      const updatePayload = {}
      if (payload.name !== sourceName) updatePayload.name = payload.name
      if (payload.phone !== sourcePhone) updatePayload.phone = payload.phone
      if (payload.email !== sourceEmail) updatePayload.email = payload.email
      if (payload.address !== sourceAddress) updatePayload.address = payload.address
      if (payload.hireDate !== sourceHireDate) updatePayload.hireDate = payload.hireDate
      if (JSON.stringify(currentSpecialtyIds) !== JSON.stringify(sourceSpecialtyIds)) {
        updatePayload.specialtyCategoryIds = detailForm.specialtyCategoryIds
      }

      if (Object.keys(updatePayload).length === 0) {
        setDetailMode('view')
        return
      }

      await api.put(`/api/owner/staff/${selectedStaff.id}`, updatePayload)

      await loadStaffMembers()
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Staff updated successfully', title: 'Completed' } 
      }))
      await openDetail({ id: selectedStaff.id }, 'view')
    } catch (err) {
      console.error(err)
    }
  }

  const totalRows = staffMembers.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE
  const visibleStaffMembers = staffMembers.slice(pageStart, pageStart + PAGE_SIZE)

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage)
    }
  }, [currentPage, safeCurrentPage])

  const detailStatusValue = String(detailForm.status || 'Active')
  const detailStatusClassName = detailStatusValue.toLowerCase() === 'inactive'
    ? 'staff-detailStatusBadge is-inactive'
    : 'staff-detailStatusBadge is-active'

  return (
    <div className="staff-page">
      <div className="staff-dashboardGrid">
        <PortalCard className="staff-dashboardCard" title="Total Staff">
          <div className="staff-dashboardStatRow">
            <div className="staff-dashboardValue">{Number(staffSummary.totalStaff || 0)}</div>
            <div className="staff-dashboardIcon" aria-hidden="true">
              <IconUsers />
            </div>
          </div>
        </PortalCard>
        <PortalCard className="staff-dashboardCard" title="Total Booking">
          <div className="staff-dashboardStatRow">
            <div className="staff-dashboardValue">{Number(staffSummary.totalBookings || 0)}</div>
            <div className="staff-dashboardIcon" aria-hidden="true">
              <IconCalendar />
            </div>
          </div>
        </PortalCard>
        <PortalCard className="staff-dashboardCard" title="Total Salary">
          <div className="staff-dashboardStatRow">
            <div className="staff-dashboardValue">{formatMoney(staffSummary.totalSalary)}</div>
            <div className="staff-dashboardIcon" aria-hidden="true">
              <IconDollar />
            </div>
          </div>
        </PortalCard>
      </div>

      <PortalModal
        open={open}
        title="Add new staff member"
        onClose={close}
        modalClassName="staff-addModal"
        bodyClassName="staff-addModalBody"
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form="staff-form" className="portal-modalBtn portal-modalBtnPrimary">
              Add staff
            </button>
          </>
        }
      >
        <form id="staff-form" className="staff-detailForm staff-addForm" onSubmit={onSubmit}>
          <div className="staff-detailSection">
            <div className="staff-detailSectionTitle">Basic Information</div>
            <div className="staff-detailGrid">
              <label className="portal-field">
                <span className="portal-label">Full name</span>
                <input
                  className="portal-input"
                  placeholder="Enter full name"
                  value={form.name}
                  onChange={(e) => updateAddFormField('name', e.target.value)}
                />
                {formErrors.name ? <span className="staff-fieldErrorText">{formErrors.name}</span> : null}
              </label>

              <label className="portal-field">
                <span className="portal-label">Phone number</span>
                <input
                  className="portal-input"
                  placeholder="Enter phone number"
                  value={form.phone}
                  onChange={(e) => updateAddFormField('phone', e.target.value)}
                />
                {formErrors.phone ? <span className="staff-fieldErrorText">{formErrors.phone}</span> : null}
              </label>

              <label className="portal-field">
                <span className="portal-label">Email</span>
                <input
                  className="portal-input"
                  placeholder="Enter email"
                  value={form.email}
                  onChange={(e) => updateAddFormField('email', e.target.value)}
                />
                {formErrors.email ? <span className="staff-fieldErrorText">{formErrors.email}</span> : null}
              </label>

              <label className="portal-field">
                <span className="portal-label">Hire Date</span>
                <input
                  type="date"
                  className="portal-input"
                  value={form.hireDate}
                  onChange={(e) => updateAddFormField('hireDate', e.target.value)}
                />
                {formErrors.hireDate ? <span className="staff-fieldErrorText">{formErrors.hireDate}</span> : null}
              </label>

            </div>
          </div>

          <div className="staff-detailSection">
            <div className="staff-detailSectionTitle">Address</div>
            <label className="portal-field staff-detailFieldFull">
              <span className="portal-label">Address</span>
              <textarea
                className="portal-input staff-detailTextarea"
                placeholder="Enter address"
                value={form.address}
                onChange={(e) => updateAddFormField('address', e.target.value)}
              />
              {formErrors.address ? <span className="staff-fieldErrorText">{formErrors.address}</span> : null}
            </label>
          </div>

          <div className="staff-detailSection">
            <div className="staff-detailSectionTitle">Specialty</div>
            <label className="portal-field staff-detailFieldFull">
              <span className="portal-label">Specialty</span>
              {renderSpecialtyPicker(form.specialtyCategoryIds, toggleCategoryInForm, 'No specialty categories found.', false, 'staff-addSpecialty')}
            </label>
          </div>
        </form>
      </PortalModal>

      <PortalModal
        open={detailOpen}
        title={detailMode === 'edit' ? 'Edit staff member' : 'Staff profile'}
        onClose={closeDetail}
        modalClassName="staff-detailModal"
        bodyClassName="staff-detailModalBody"
        footer={
          detailMode === 'edit' ? (
            <>
              <button type="button" className="portal-modalBtn" onClick={closeDetail}>
                Cancel
              </button>
              <button type="submit" form="staff-detail-form" className="portal-modalBtn portal-modalBtnPrimary">
                Save
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="portal-modalBtn danger"
                onClick={() => requestDeleteStaff(selectedStaff, { closeAfterDelete: true })}
                disabled={detailLoading || !selectedStaff?.id}
              >
                Delete
              </button>
              <button
                type="button"
                className="portal-modalBtn portal-modalBtnPrimary"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDetailMode('edit')
                  setDetailErrors({})
                }}
                disabled={detailLoading}
              >
                Edit
              </button>
            </>
          )
        }
      >
        {detailLoading ? (
          <div className="staff-detailLoading">Loading staff details...</div>
        ) : (
          <form id="staff-detail-form" className="staff-detailForm" onSubmit={onDetailSubmit}>
            <div className="staff-detailHero">
              <div className="staff-detailAvatarBlock">
                <div className="staff-detailAvatarWrap" aria-hidden="true">
                  {resolveApiImageUrl(detailForm.avatarUrl) ? (
                    <img className="staff-detailAvatar" src={resolveApiImageUrl(detailForm.avatarUrl)} alt={detailForm.name || 'Staff'} />
                  ) : (
                    <div className="staff-detailAvatarFallback">{initialsOf(detailForm.name)}</div>
                  )}
                </div>
              </div>

              <div className="staff-detailHeroInfo">
                <div className="staff-detailTopRow">
                  <div className="staff-detailName">{detailForm.name || '-'}</div>
                  <span className={detailStatusClassName}>{detailStatusValue}</span>
                </div>
                <div className="staff-detailRole">{selectedStaff?.roleName || selectedStaff?.roleKey || 'Staff'}</div>

              </div>
            </div>

            <div className="staff-detailSection">
              <div className="staff-detailSectionTitle">Basic Information</div>
              <div className="staff-detailGrid">
                <label className="portal-field">
                  <span className="portal-label">Full Name</span>
                  <input
                    className="portal-input"
                    value={detailForm.name}
                    readOnly={detailMode !== 'edit'}
                    onChange={(e) => updateDetailFormField('name', e.target.value)}
                  />
                  {detailErrors.name ? <span className="staff-fieldErrorText">{detailErrors.name}</span> : null}
                </label>

                <label className="portal-field">
                  <span className="portal-label">Phone</span>
                  <input
                    className="portal-input"
                    value={detailForm.phone}
                    readOnly={detailMode !== 'edit'}
                    onChange={(e) => updateDetailFormField('phone', e.target.value)}
                  />
                  {detailErrors.phone ? <span className="staff-fieldErrorText">{detailErrors.phone}</span> : null}
                </label>

                <label className="portal-field">
                  <span className="portal-label">Email</span>
                  <input
                    className="portal-input"
                    value={detailForm.email}
                    readOnly={detailMode !== 'edit'}
                    onChange={(e) => updateDetailFormField('email', e.target.value)}
                  />
                  {detailErrors.email ? <span className="staff-fieldErrorText">{detailErrors.email}</span> : null}
                </label>

                <label className="portal-field">
                  <span className="portal-label">Hire Date</span>
                  <input
                    type="date"
                    className="portal-input"
                    value={detailForm.hireDate}
                    readOnly={detailMode !== 'edit'}
                    onChange={(e) => updateDetailFormField('hireDate', e.target.value)}
                  />
                  {detailErrors.hireDate ? <span className="staff-fieldErrorText">{detailErrors.hireDate}</span> : null}
                </label>
              </div>
            </div>

            <div className="staff-detailSection">
              <div className="staff-detailSectionTitle">Address</div>
              <label className="portal-field staff-detailFieldFull">
                <span className="portal-label">Address</span>
                <textarea
                  className="portal-input staff-detailTextarea"
                  value={detailForm.address}
                  readOnly={detailMode !== 'edit'}
                  onChange={(e) => updateDetailFormField('address', e.target.value)}
                />
                {detailErrors.address ? <span className="staff-fieldErrorText">{detailErrors.address}</span> : null}
              </label>
            </div>

            <div className="staff-detailSection">
              <div className="staff-detailSectionTitle">Specialty</div>
              <label className="portal-field staff-detailFieldFull">
                <span className="portal-label">Specialty</span>
                {renderSpecialtyPicker(
                  detailForm.specialtyCategoryIds,
                  toggleCategoryInDetailForm,
                  'No specialty categories found.',
                  detailMode !== 'edit',
                  'staff-detailSpecialty'
                )}
              </label>
            </div>
          </form>
        )}
      </PortalModal>

      <PortalModal
        open={deleteConfirm.open}
        title="Confirm delete"
        variant="confirm"
        onClose={closeDeleteConfirm}
        modalClassName="staff-deleteConfirmModal"
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeDeleteConfirm}>
              Cancel
            </button>
            <button
              type="button"
              className="portal-modalBtn danger"
              onClick={() => onDeleteStaff(deleteConfirm.member, { closeAfterDelete: deleteConfirm.closeAfterDelete })}
              disabled={!deleteConfirm.member?.id}
            >
              Delete
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Are you sure you want to delete employee "{deleteConfirm.member?.name || deleteConfirm.member?.id || 'this staff member'}"?
        </p>
      </PortalModal>

      <div className="staff-filterRow">
        <label className="portal-field staff-filterField staff-filterSearchField">
          <span className="portal-label">Search</span>
          <div className="portal-search staff-filterSearch" role="search">
            <span className="portal-searchIcon" aria-hidden="true">
              <IconSearch />
            </span>
            <input
              className="portal-searchInput"
              placeholder="Search by name, phone, email, role, or specialty"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
        </label>

        <label className="portal-field staff-filterField">
          <span className="portal-label">Period</span>
          <select
            className="portal-select"
            value={timePeriod}
            onChange={(e) => {
              setTimePeriod(e.target.value)
              setCurrentPage(1)
            }}
          >
            <option value="all">All</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
        </label>

        <label className="portal-field staff-filterField">
          <span className="portal-label">Select date</span>
          <input
            type="date"
            className="portal-input"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value || todayDateInputValue())
              setTimePeriod('day')
              setCurrentPage(1)
            }}
          />
        </label>

        <div className="staff-filterAction">
          <button type="button" className="portal-primaryBtn staff-filterAddBtn" onClick={openAddModal}>
            <span className="portal-primaryBtnIcon staff-filterAddBtnIcon" aria-hidden="true">
              +
            </span>
            Add staff
          </button>
        </div>
      </div>

      <PortalCard className="portal-invTableCard" title="Staff Table">
        {staffError ? <div className="portal-formError" role="alert">{staffError}</div> : null}
        {staffLoading ? <div className="portal-pageSubtitle">Loading staff...</div> : null}
        <div className="portal-tableWrap">
          <table className="portal-table staff-table">
            <thead>
              <tr>
                <th>Avatar</th>
                <th>
                  <div className="staff-sortHeader">
                    <span>Name</span>
                    {renderSortButton('name', 'name')}
                  </div>
                </th>
                <th>
                  <div className="staff-sortHeader">
                    <span>Total Working Hours</span>
                    {renderSortButton('hours', 'working hours')}
                  </div>
                </th>
                <th>
                  <div className="staff-sortHeader">
                    <span>Total Bookings</span>
                    {renderSortButton('bookings', 'total booking')}
                  </div>
                </th>
                <th>
                  <div className="staff-sortHeader">
                    <span>Salary</span>
                    {renderSortButton('salary', 'salary')}
                  </div>
                </th>
                <th>
                  <div className="staff-sortHeader">
                    <span>Commission</span>
                    {renderSortButton('commission', 'commission')}
                  </div>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleStaffMembers.map((m) => {
                const avatar = resolveApiImageUrl(m.avatarUrl)
                return (
                  <tr key={m.id || m.email || m.name}>
                    <td>
                      {avatar ? (
                        <img className="staff-avatarImage" src={avatar} alt={m.name || 'Staff'} />
                      ) : (
                        <div className="portal-staffCardAvatar" aria-hidden="true">
                          {initialsOf(m.name)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="staff-name">{m.name || '-'}</div>
                      <div className="staff-role">{m.roleName || m.roleKey || 'Unknown'}</div>
                    </td>
                    <td>{formatWorkingHours(m.workingHours)}</td>
                    <td>{Number(m.totalBookings || 0)}</td>
                    <td>{formatMoney(m.totalSalary)}</td>
                    <td>{formatMoney(m.totalCommission)}</td>
                    <td>
                      <div className="staff-actions">
                        <button type="button" className="portal-ghostBtn" onClick={() => openDetail(m, 'view')}>
                          Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {visibleStaffMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="staff-emptyRow">No staff found</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="staff-pagination">
          <button
            type="button"
            className="staff-paginationBtn"
            disabled={staffLoading || safeCurrentPage <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="staff-paginationText">Page {safeCurrentPage} / {totalPages}</span>
          <button
            type="button"
            className="staff-paginationBtn"
            disabled={staffLoading || safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </PortalCard>
    </div>
  )
}

