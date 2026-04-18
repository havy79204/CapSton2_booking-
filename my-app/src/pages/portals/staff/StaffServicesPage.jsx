import React, { useEffect, useMemo, useState } from 'react'
import PortalCard from '../../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../../components/Layout portal/PortalModal.jsx'
import { IconSearch } from '../../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../../lib/api.js'
import '../../../styles/service.css'
import '../../../styles/global-buttons.css'

function formatVnd(value) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US')
}

function digitsOnly(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.replace(/[^0-9]/g, '')
}

export default function StaffServicesPage() {
  const [open, setOpen] = useState(false)
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    duration: '30',
    price: '150000',
    description: '',
    status: '',
  })

  function close() {
    setOpen(false)
    setEditing(null)
    setError('')
  }

  function openEdit(service) {
    if (!service) return
    setError('')
    setEditing(service)
    setOpen(true)
    setForm({
      name: service.name || '',
      categoryId: service?.categoryId ? String(service.categoryId) : '',
      duration: String(service.durationMinutes || 30),
      price: String(service.priceVnd || 150000),
      description: service.description || '',
      status: service.status || '',
    })
  }

  async function refresh() {
    const fresh = await api.get('/api/staff/services')
    if (Array.isArray(fresh)) setServices(fresh)
  }

  async function refreshCategories() {
    const fresh = await api.get('/api/staff/services/categories')
    setCategories(Array.isArray(fresh) ? fresh : [])
  }

  useEffect(() => {
    Promise.resolve()
      .then(() => refresh())
      .then(() => refreshCategories())
      .catch((err) => console.error(err))
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.name) return
    if (!form.categoryId) {
      setError('Please select a service category')
      return
    }

    try {
      setError('')
      const payload = {
        name: form.name,
        categoryId: form.categoryId,
        durationMinutes: digitsOnly(form.duration),
        priceVnd: digitsOnly(form.price),
        description: form.description,
        status: form.status,
      }

      if (editing?.id) {
        await api.put(`/api/staff/services/${editing.id}`, payload)
        window.dispatchEvent(new CustomEvent('portal:success-modal', { 
          detail: { message: 'Service updated successfully', title: 'Completed' } 
        }))
      }

      await refresh()
      close()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Something went wrong')
    }
  }

  const categoriesById = useMemo(() => {
    const map = new Map()
    for (const c of categories || []) {
      if (c && c.id !== undefined && c.id !== null) {
        map.set(String(c.id), c)
      }
    }
    return map
  }, [categories])

  const flatServices = useMemo(() => {
    if (!Array.isArray(services)) return []
    const next = []
    for (const section of services) {
      if (section && Array.isArray(section.items)) {
        for (const item of section.items) {
          next.push({ ...item, __group: section.group || '' })
        }
      }
    }
    return next
  }, [services])

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase()
    return flatServices.filter((s) => {
      const name = String(s?.name || '').toLowerCase()
      const status = String(s?.status || '').toLowerCase()
      const categoryId = String(s?.categoryId ?? s?.category?.id ?? '')
      const categoryName = String(s?.categoryName || s?.category || categoriesById.get(categoryId)?.name || s?.__group || '').toLowerCase()

      const queryMatched = !q || name.includes(q) || categoryName.includes(q)
      const statusMatched = statusFilter === 'all' || status === statusFilter
      const categoryMatched = categoryFilter === 'all' || categoryId === categoryFilter
      return queryMatched && statusMatched && categoryMatched
    })
  }, [flatServices, query, statusFilter, categoryFilter, categoriesById])

  const pagedServices = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredServices.slice(start, start + pageSize)
  }, [filteredServices, page])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredServices.length / pageSize)), [filteredServices.length])

  return (
    <div className="service-page">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />
      </div>

      <PortalModal open={open} title={editing ? 'Edit service' : 'View service'} onClose={close}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={close}>Cancel</button>
            {editing?.id && <button type="submit" form="service-form" className="portal-modalBtn portal-modalBtnPrimary">Save changes</button>}
          </>
        }>
        <form id="service-form" onSubmit={onSubmit}>
          {error ? <div className="portal-formError" role="alert">{error}</div> : null}
          <label className="portal-field">
            <span className="portal-label">Service name</span>
            <input className="portal-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} disabled={!editing} />
          </label>
          <div className="portal-modalGrid2 portal-serviceGridTop">
            <label className="portal-field">
              <span className="portal-label">Service category</span>
              <select className="portal-select" value={form.categoryId || ''} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))} disabled={!editing}>
                <option value="">-- Select category --</option>
                {categories.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
              </select>
            </label>
            <label className="portal-field">
              <span className="portal-label">Status</span>
              <select className="portal-select" value={form.status || ''} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} disabled={!editing}>
                <option value="">-- Select status --</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="portal-modalGrid2 portal-serviceGridTop">
            <label className="portal-field">
              <span className="portal-label">Duration (minutes)</span>
              <input className="portal-input" value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))} disabled={!editing} />
            </label>
            <label className="portal-field">
              <span className="portal-label">Price (VND)</span>
              <input className="portal-input" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} disabled={!editing} />
            </label>
          </div>
        </form>
      </PortalModal>

      <div className="portal-search portal-searchFull" role="search">
        <span className="portal-searchIcon" aria-hidden="true"><IconSearch /></span>
        <input className="portal-searchInput" placeholder="Search by service name, category, or status..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="service-filterRow">
        <label className="portal-field service-filterField">
          <span className="portal-label">Filter by status</span>
          <select className="portal-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="portal-field service-filterField">
          <span className="portal-label">Filter by category</span>
          <select className="portal-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {(categories || []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <PortalCard className="portal-invTableCard" title="Service List">
        <div className="portal-tableWrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedServices.map((s) => {
                const categoryId = String(s?.categoryId ?? s?.category?.id ?? '')
                const categoryName = s?.categoryName || s?.category || categoriesById.get(categoryId)?.name || s?.__group || '-'
                const duration = s?.durationMinutes ? `${s.durationMinutes} min` : '-'
                const price = s?.priceVnd ? formatVnd(s.priceVnd) : '-'

                return (
                  <tr key={s.id || `${categoryName}-${s.name}`}>
                    <td className="portal-invName">{s.name || '-'}</td>
                    <td><span className="portal-invPill">{categoryName}</span></td>
                    <td>{duration}</td>
                    <td>{price} ₫</td>
                    <td><span className="portal-invPill">{s.status || '-'}</span></td>
                    <td style={{ width: 180 }}>
                      <div className="portal-rowActions">
                        <button type="button" className="portal-ghostBtn" onClick={() => openEdit(s)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {pagedServices.length === 0 ? <tr><td colSpan={6} className="service-emptyRow">No services found</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="service-pagination">
          <button type="button" className="service-paginationBtn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
          <span className="service-paginationText">Page {page} / {totalPages}</span>
          <button type="button" className="service-paginationBtn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
        </div>
      </PortalCard>
    </div>
  )
}
