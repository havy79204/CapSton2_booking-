import React, { useEffect, useMemo, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/staff.css'
import '../../styles/staff-specialty.css'
import {
  IconSearch,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api, resolveApiImageUrl } from '../../lib/api.js'

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
  const isoDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDateMatch) return isoDateMatch[1]

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function OwnerStaffPage() {
  const PAGE_SIZE = 8
  const [open, setOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailMode, setDetailMode] = useState('view')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [staffMembers, setStaffMembers] = useState([])
  const [specialtyCategories, setSpecialtyCategories] = useState([])
  const [query, setQuery] = useState('')
  const [timePeriod, setTimePeriod] = useState('all')
  const [selectedDate, setSelectedDate] = useState(todayDateInputValue)
  const [sortBy, setSortBy] = useState('name_asc')
  const [page, setPage] = useState(1)

  function getSortDirection(field) {
    if (sortBy === `${field}_asc`) return 'asc'
    if (sortBy === `${field}_desc`) return 'desc'
    return null
  }

  function setSortField(field, direction) {
    setSortBy(`${field}_${direction}`)
    setPage(1)
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
    status: 'Active',
    specialtyCategoryIds: [],
  })

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

  async function fetchStaffMembers() {
    const params = new URLSearchParams({ period: timePeriod, date: selectedDate })
    const staffData = await api.get(`/api/owner/staff?${params.toString()}`)
    return Array.isArray(staffData) ? staffData : []
  }

  async function loadStaffMembers() {
    const staffData = await fetchStaffMembers()
    setStaffMembers(staffData)
  }

  useEffect(() => {
    const params = new URLSearchParams({ period: timePeriod, date: selectedDate })
    api.get(`/api/owner/staff?${params.toString()}`)
      .then((staffData) => {
        setStaffMembers(Array.isArray(staffData) ? staffData : [])
      })
      .catch((err) => console.error(err))
  }, [timePeriod, selectedDate])

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
  }

  function closeDetail() {
    setDetailOpen(false)
    setDetailLoading(false)
    setSelectedStaff(null)
    setDetailMode('view')
  }

  async function openDetail(member, mode = 'view') {
    if (!member?.id) return
    setDetailLoading(true)
    setDetailMode(mode)
    setDetailOpen(true)

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
  }

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
    if (!form.name) return

    try {
      await api.post('/api/owner/staff', {
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        hireDate: form.hireDate,
        status: form.status,
        specialtyCategoryIds: form.specialtyCategoryIds,
      })

      await loadStaffMembers()

      setForm({
        name: '',
        phone: '',
        email: '',
        address: '',
        hireDate: todayDateInputValue(),
        status: 'Active',
        specialtyCategoryIds: [],
      })
      close()
    } catch (err) {
      console.error(err)
    }
  }

  async function onDeleteStaff(member, options = {}) {
    if (!member?.id) return
    const accepted = window.confirm(`Delete staff "${member.name || member.id}"?`)
    if (!accepted) return
    try {
      await api.delete(`/api/owner/staff/${member.id}`)
      await loadStaffMembers()
      if (options.closeAfterDelete) {
        closeDetail()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function onDetailSubmit(e) {
    e.preventDefault()
    if (!selectedStaff?.id || detailMode !== 'edit') return
    if (!detailForm.name) return

    try {
      await api.put(`/api/owner/staff/${selectedStaff.id}`, {
        name: detailForm.name,
        phone: detailForm.phone,
        email: detailForm.email,
        address: detailForm.address,
        hireDate: detailForm.hireDate,
        specialtyCategoryIds: detailForm.specialtyCategoryIds,
      })

      await loadStaffMembers()
      await openDetail({ id: selectedStaff.id }, 'view')
    } catch (err) {
      console.error(err)
    }
  }

  const filteredAndSortedStaff = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = staffMembers.filter((m) => {
      const status = String(m?.status || '').trim().toLowerCase()
      if (status === 'inactive') return false

      const name = String(m?.name || '').toLowerCase()
      const phone = String(m?.phone || '').toLowerCase()
      const email = String(m?.email || '').toLowerCase()
      const specialty = String(m?.specialty || '').toLowerCase()
      const roleName = String(m?.roleName || m?.roleKey || '').toLowerCase()
      const matchesText = (
        name.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        specialty.includes(q) ||
        roleName.includes(q)
      )

      return matchesText
    })

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sortBy === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''))
      if (sortBy === 'bookings_desc') return Number(b.totalBookings || 0) - Number(a.totalBookings || 0)
      if (sortBy === 'bookings_asc') return Number(a.totalBookings || 0) - Number(b.totalBookings || 0)
      if (sortBy === 'salary_desc') return Number(b.totalSalary || 0) - Number(a.totalSalary || 0)
      if (sortBy === 'salary_asc') return Number(a.totalSalary || 0) - Number(b.totalSalary || 0)
      if (sortBy === 'tip_desc') return Number(b.totalTip || 0) - Number(a.totalTip || 0)
      if (sortBy === 'tip_asc') return Number(a.totalTip || 0) - Number(b.totalTip || 0)
      if (sortBy === 'hours_desc') return Number(b.workingHours || 0) - Number(a.workingHours || 0)
      if (sortBy === 'hours_asc') return Number(a.workingHours || 0) - Number(b.workingHours || 0)
      return String(a.name || '').localeCompare(String(b.name || ''))
    })

    return sorted
  }, [staffMembers, query, sortBy])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAndSortedStaff.length / PAGE_SIZE)),
    [filteredAndSortedStaff.length]
  )

  const currentPage = Math.min(page, totalPages)

  const pagedStaff = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredAndSortedStaff.slice(start, start + PAGE_SIZE)
  }, [filteredAndSortedStaff, currentPage])

  const dashboard = useMemo(() => {
    const total = staffMembers.length

    const totalBookings = staffMembers.reduce((sum, x) => sum + Number(x?.totalBookings || 0), 0)
    const totalSalary = staffMembers.reduce((sum, x) => sum + Number(x?.totalSalary || 0), 0)

    return {
      total,
      totalBookings,
      totalSalary,
    }
  }, [staffMembers])

  const detailStatusValue = String(detailForm.status || 'Active')
  const detailStatusClassName = detailStatusValue.toLowerCase() === 'inactive'
    ? 'staff-detailStatusBadge is-inactive'
    : 'staff-detailStatusBadge is-active'

  return (
    <div className="staff-page">
      <div className="staff-dashboardGrid">
        <PortalCard className="staff-dashboardCard" title="Total Staff">
          <div className="staff-dashboardValue">{dashboard.total}</div>
        </PortalCard>
        <PortalCard className="staff-dashboardCard" title="Total Booking">
          <div className="staff-dashboardValue">{dashboard.totalBookings}</div>
        </PortalCard>
        <PortalCard className="staff-dashboardCard" title="Total Salary">
          <div className="staff-dashboardValue">{formatMoney(dashboard.totalSalary)}</div>
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
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Phone number</span>
                <input
                  className="portal-input"
                  placeholder="Enter phone number"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Email</span>
                <input
                  className="portal-input"
                  placeholder="Enter email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Hire Date</span>
                <input
                  type="date"
                  className="portal-input"
                  value={form.hireDate}
                  onChange={(e) => setForm((p) => ({ ...p, hireDate: e.target.value }))}
                />
              </label>

              <label className="portal-field staff-detailFieldFull">
                <span className="portal-label">Status</span>
                <select
                  className="portal-select"
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
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
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
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
                onClick={() => onDeleteStaff(selectedStaff, { closeAfterDelete: true })}
                disabled={detailLoading || !selectedStaff?.id}
              >
                Delete
              </button>
              <button
                type="button"
                className="portal-modalBtn portal-modalBtnPrimary"
                onClick={() => setDetailMode('edit')}
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
                    disabled={detailMode !== 'edit'}
                    onChange={(e) => setDetailForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </label>

                <label className="portal-field">
                  <span className="portal-label">Phone</span>
                  <input
                    className="portal-input"
                    value={detailForm.phone}
                    disabled={detailMode !== 'edit'}
                    onChange={(e) => setDetailForm((p) => ({ ...p, phone: e.target.value }))}
                  />
                </label>

                <label className="portal-field">
                  <span className="portal-label">Email</span>
                  <input
                    className="portal-input"
                    value={detailForm.email}
                    disabled={detailMode !== 'edit'}
                    onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </label>

                <label className="portal-field">
                  <span className="portal-label">Hire Date</span>
                  <input
                    type="date"
                    className="portal-input"
                    value={detailForm.hireDate}
                    disabled={detailMode !== 'edit'}
                    onChange={(e) => setDetailForm((p) => ({ ...p, hireDate: e.target.value }))}
                  />
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
                  disabled={detailMode !== 'edit'}
                  onChange={(e) => setDetailForm((p) => ({ ...p, address: e.target.value }))}
                />
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
                setPage(1)
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
              setPage(1)
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
              setPage(1)
            }}
          />
        </label>

        <div className="staff-filterAction">
          <button type="button" className="portal-primaryBtn staff-filterAddBtn" onClick={() => setOpen(true)}>
            <span className="portal-primaryBtnIcon staff-filterAddBtnIcon" aria-hidden="true">
              +
            </span>
            Add staff
          </button>
        </div>
      </div>

      <PortalCard className="portal-invTableCard" title="Staff Table">
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
                    <span>Tip</span>
                    {renderSortButton('tip', 'tip')}
                  </div>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedStaff.map((m) => {
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
                    <td>{formatMoney(m.totalTip)}</td>
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

              {pagedStaff.length === 0 ? (
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
            className="portal-ghostBtn staff-paginationBtn"
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>

          <span className="staff-paginationText">{currentPage} / {totalPages}</span>

          <button
            type="button"
            className="portal-ghostBtn staff-paginationBtn"
            aria-label="Next page"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            ›
          </button>
        </div>
      </PortalCard>
    </div>
  )
}
