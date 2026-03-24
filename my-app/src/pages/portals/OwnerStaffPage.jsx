import React, { useEffect, useMemo, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/staff.css'
import '../../styles/staff-specialty.css'
import {
  IconMail,
  IconPhone,
  IconSearch,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function initialsOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = (parts.length > 1 ? parts[parts.length - 1] : parts[0])?.[0] ?? ''
  return (first + last).toUpperCase()
}

function normalizeStatus(status) {
  const raw = String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (raw.includes('dang lam') || raw === 'working' || raw === 'active') return 'Working'
  if (raw === 'off' || raw === 'inactive') return 'Off'
  return 'Working'
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

export default function OwnerStaffPage() {
  const [open, setOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [staffMembers, setStaffMembers] = useState([])
  const [specialtyCategories, setSpecialtyCategories] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    specialtyCategoryIds: [],
    status: 'Working',
  })

  const [detailForm, setDetailForm] = useState({
    name: '',
    phone: '',
    email: '',
    specialtyCategoryIds: [],
    status: 'Working',
  })

  useEffect(() => {
    Promise.all([
      api.get('/api/owner/staff'),
      api.get('/api/owner/staff/skill-categories'),
    ])
      .then(([staffData, categoryData]) => {
        if (Array.isArray(staffData)) setStaffMembers(staffData)
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
    setSelected(null)
  }

  function openDetail(member) {
    if (!member) return
    setSelected(member)
    setDetailForm({
      name: member.name || '',
      phone: member.phone || '',
      email: member.email || '',
      specialtyCategoryIds: Array.isArray(member.specialtyCategoryIds)
        ? member.specialtyCategoryIds.map((x) => String(x)).filter(Boolean)
        : [],
      status: normalizeStatus(member.status),
    })
    setDetailOpen(true)
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

  function renderSpecialtyPicker(selectedIds, onToggle, emptyText = 'No specialty categories found.') {
    if (specialtyCategories.length === 0) {
      return <div className="portal-pageSubtitle">{emptyText}</div>
    }

    return (
      <div className="portal-specialtyPicker">
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
        specialtyCategoryIds: form.specialtyCategoryIds,
        status: form.status,
      })

      const fresh = await api.get('/api/owner/staff')
      if (Array.isArray(fresh)) setStaffMembers(fresh)

      setForm({ name: '', phone: '', email: '', specialtyCategoryIds: [], status: 'Working' })
      close()
    } catch (err) {
      console.error(err)
    }
  }

  async function onDetailSubmit(e) {
    e.preventDefault()
    if (!selected?.id) return
    if (!detailForm.name) return

    try {
      await api.put(`/api/owner/staff/${selected.id}`, {
        name: detailForm.name,
        phone: detailForm.phone,
        email: detailForm.email,
        specialtyCategoryIds: detailForm.specialtyCategoryIds,
        status: detailForm.status,
      })

      const fresh = await api.get('/api/owner/staff')
      if (Array.isArray(fresh)) setStaffMembers(fresh)
      closeDetail()
    } catch (err) {
      console.error(err)
    }
  }

  const filteredStaffMembers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staffMembers

    return staffMembers.filter((m) => {
      const name = String(m?.name || '').toLowerCase()
      const phone = String(m?.phone || '').toLowerCase()
      const email = String(m?.email || '').toLowerCase()
      const specialty = String(m?.specialty || '').toLowerCase()
      const status = String(m?.status || '').toLowerCase()
      return (
        name.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        specialty.includes(q) ||
        status.includes(q)
      )
    })
  }, [staffMembers, query])

  return (
    <div className="staff-page">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <button type="button" className="portal-primaryBtn" onClick={() => setOpen(true)}>
          <span className="portal-primaryBtnIcon" aria-hidden="true">
            +
          </span>
          Add staff
        </button>
      </div>

      <PortalModal
        open={open}
        title="Add new staff member"
        onClose={close}
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
        <form id="staff-form" onSubmit={onSubmit}>
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
            <span className="portal-label">Specialty</span>
            {renderSpecialtyPicker(form.specialtyCategoryIds, toggleCategoryInForm)}
          </label>

          <label className="portal-field">
            <span className="portal-label">Status</span>
            <select
              className="portal-select"
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="Working">Working</option>
              <option value="Off">Off</option>
            </select>
          </label>
        </form>
      </PortalModal>

      <PortalModal
        open={detailOpen}
        title="Staff details"
        onClose={closeDetail}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeDetail}>
              Close
            </button>
            <button type="submit" form="staff-detail-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save changes
            </button>
          </>
        }
      >
        <form id="staff-detail-form" onSubmit={onDetailSubmit}>
          <label className="portal-field">
            <span className="portal-label">Full name</span>
            <input
              className="portal-input"
              placeholder="Enter full name"
              value={detailForm.name}
              onChange={(e) => setDetailForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">Phone number</span>
            <input
              className="portal-input"
              placeholder="Enter phone number"
              value={detailForm.phone}
              onChange={(e) => setDetailForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">Email</span>
            <input
              className="portal-input"
              placeholder="Enter email"
              value={detailForm.email}
              onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">Specialty</span>
            {renderSpecialtyPicker(detailForm.specialtyCategoryIds, toggleCategoryInDetailForm)}
          </label>

          <label className="portal-field">
            <span className="portal-label">Status</span>
            <select
              className="portal-select"
              value={detailForm.status}
              onChange={(e) => setDetailForm((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="Working">Working</option>
              <option value="Off">Off</option>
            </select>
          </label>
        </form>
      </PortalModal>

      <div className="portal-search portal-searchFull" role="search">
        <span className="portal-searchIcon" aria-hidden="true">
          <IconSearch />
        </span>
        <input
          className="portal-searchInput"
          placeholder="Search staff by name, phone, email, or specialty..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="portal-staffGrid" role="list">
        {filteredStaffMembers.map((m) => (
          <PortalCard key={m.id || m.email || m.name} className="portal-staffCard" role="listitem">
            <div className="portal-staffCardTop">
              <div className="portal-staffCardAvatar" aria-hidden="true">
                {initialsOf(m.name)}
              </div>
              <span className="portal-pill portal-pillGreen">{normalizeStatus(m.status)}</span>
            </div>

            <div className="portal-staffCardName">{m.name}</div>
            <div className="portal-staffCardSpecialty">{m.specialty}</div>

            <div className="portal-staffContacts">
              <div className="portal-staffContact">
                <span className="portal-staffContactIcon" aria-hidden="true">
                  <IconPhone />
                </span>
                <span className="portal-staffContactText">{m.phone}</span>
              </div>
              <div className="portal-staffContact">
                <span className="portal-staffContactIcon" aria-hidden="true">
                  <IconMail />
                </span>
                <span className="portal-staffContactText">{m.email}</span>
              </div>
            </div>

            <div className="portal-staffDivider" aria-hidden="true" />

            <button type="button" className="portal-staffDetailBtn" onClick={() => openDetail(m)}>
              View details
            </button>
          </PortalCard>
        ))}
      </div>
    </div>
  )
}
