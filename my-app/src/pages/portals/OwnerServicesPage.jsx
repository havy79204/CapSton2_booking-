import React, { useEffect, useMemo, useRef, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import { IconClock, IconSearch } from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'
import '../../styles/service.css'

function digitsOnly(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.replace(/[^0-9]/g, '')
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Cannot read file'))
    reader.readAsDataURL(file)
  })
}

function resolveAssetUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const base = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`
}

export default function OwnerServicesPage() {
  const [open, setOpen] = useState(false)
  const [openCategory, setOpenCategory] = useState(false)
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    duration: '30',
    price: '150000',
    description: '',
    status: '',
    images: [],
  })
  const [selectedImageIdx, setSelectedImageIdx] = useState(-1)

  const imageInputRef = useRef(null)

  useEffect(() => {
    Promise.resolve()
      .then(() => refresh())
      .then(() => refreshCategories())
      .catch((err) => console.error(err))
  }, [])

  function close() {
    setOpen(false)
    setEditing(null)
    setError('')
  }

  function openCreate() {
    setEditing(null)
    setError('')
    setForm({ name: '', categoryId: '', duration: '30', price: '150000', description: '', status: '', images: [] })
    setSelectedImageIdx(-1)
    setOpen(true)
  }

  function openCreateCategory() {
    setCategoryError('')
    setCategoryForm({ name: '', description: '' })
    setOpenCategory(true)
  }

  function closeCreateCategory() {
    setOpenCategory(false)
    setCategoryError('')
  }

  function openEdit(service) {
    if (!service) return
    setError('')
    setEditing(service)
    setOpen(true)

    Promise.resolve()
      .then(async () => {
        const full = await api.get(`/api/owner/services/${service.id}`)
        setForm({
          name: full?.name || service.name || '',
          categoryId:
            full?.categoryId !== undefined && full?.categoryId !== null
              ? String(full.categoryId)
              : service?.categoryId
                ? String(service.categoryId)
                : '',
          duration:
            full?.durationMinutes === null || full?.durationMinutes === undefined
              ? '0'
              : String(full.durationMinutes),
          price: full?.priceVnd === null || full?.priceVnd === undefined ? '0' : String(full.priceVnd),
          description: full?.description || '',
          status: full?.status || '',
          images: Array.isArray(full?.images) ? full.images : Array.isArray(service?.images) ? service.images : [],
        })
        setSelectedImageIdx(-1)
      })
      .catch((err) => {
        console.error(err)
        setError(err?.message || 'Unable to load service')
        setForm({
          name: service.name || '',
          categoryId: service?.categoryId ? String(service.categoryId) : '',
          duration:
            service.durationMinutes === null || service.durationMinutes === undefined
              ? '0'
              : String(service.durationMinutes),
          price: service.priceVnd === null || service.priceVnd === undefined ? '0' : String(service.priceVnd),
          description: service.description || '',
          status: service.status || '',
          images: Array.isArray(service?.images) ? service.images : [],
        })
        setSelectedImageIdx(-1)
      })
  }

  async function refresh() {
    const fresh = await api.get('/api/owner/services')
    if (Array.isArray(fresh)) setServices(fresh)
  }

  async function refreshCategories() {
    const fresh = await api.get('/api/owner/services/categories')
    setCategories(Array.isArray(fresh) ? fresh : [])
  }

  async function onSubmitCategory(e) {
    e.preventDefault()
    if (!categoryForm.name) return

    try {
      setCategoryError('')
      const created = await api.post('/api/owner/services/categories', {
        name: categoryForm.name,
        description: categoryForm.description,
      })
      await refreshCategories()
      if (created?.id) {
        setForm((p) => ({ ...p, categoryId: String(created.id) }))
      }
      closeCreateCategory()
    } catch (err) {
      console.error(err)
      setCategoryError(err?.message || 'Unable to create service category')
    }
  }

  async function onPickImage(e) {
    const file = e?.target?.files?.[0]
    if (!file) return
    try {
      setError('')
      const dataUrl = await readFileAsDataUrl(file)
      const uploaded = await api.post('/api/owner/services/uploads/image', { dataUrl })
      setForm((p) => {
        const next = [...(Array.isArray(p.images) ? p.images : []), uploaded?.url || ''].filter(Boolean)
        setSelectedImageIdx(next.length - 1)
        return { ...p, images: next }
      })
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Unable to upload image')
    } finally {
      if (e?.target) e.target.value = ''
    }
  }

  async function onDelete() {
    if (!editing?.id) return
    const ok = window.confirm('Are you sure you want to delete this service?')
    if (!ok) return
    try {
      setError('')
      await api.del(`/api/owner/services/${editing.id}`)
      await refresh()
      close()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Unable to delete service')
    }
  }

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
        images: Array.isArray(form.images) ? form.images : [],
      }

      if (editing?.id) {
        await api.put(`/api/owner/services/${editing.id}`, payload)
      } else {
        await api.post('/api/owner/services', payload)
      }

      await refresh()
      setForm({ name: '', categoryId: '', duration: '30', price: '150000', description: '', status: '', images: [] })
      setSelectedImageIdx(-1)
      close()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Something went wrong')
    }
  }

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!Array.isArray(services)) return []
    if (!q) return services

    return services
      .map((section) => {
        const group = String(section?.group || '').toLowerCase()
        const items = Array.isArray(section?.items) ? section.items : []
        const filteredItems = items.filter((s) => {
          const name = String(s?.name || '').toLowerCase()
          const tag = String(s?.tag || '').toLowerCase()
          const status = String(s?.status || '').toLowerCase()
            const category = String(s?.category || '').toLowerCase()
            return name.includes(q) || tag.includes(q) || status.includes(q) || category.includes(q) || group.includes(q)
        })
        return { ...section, items: filteredItems }
      })
      .filter((section) => Array.isArray(section.items) && section.items.length > 0)
  }, [services, query])

  return (
    <div className="service-page">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <div className="portal-headerActions">
          <button type="button" className="portal-primaryBtn" onClick={openCreate}>
            <span className="portal-primaryBtnIcon" aria-hidden="true">
              +
            </span>
            Add service
          </button>

          <button type="button" className="portal-primaryBtn" onClick={openCreateCategory}>
            <span className="portal-primaryBtnIcon" aria-hidden="true">
              +
            </span>
            Add service category
          </button>
        </div>
      </div>

      <PortalModal
        open={open}
        title={editing ? 'Edit service' : 'Add new service'}
        onClose={close}
        modalClassName="portal-modalServiceCompact"
        bodyClassName="portal-serviceModalBody"
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={close}>
              Cancel
            </button>
            {editing?.id ? (
              <button type="button" className="portal-modalBtn danger" onClick={onDelete}>
                Delete
              </button>
            ) : null}
            <button type="submit" form="service-form" className="portal-modalBtn portal-modalBtnPrimary">
              {editing ? 'Save changes' : 'Add service'}
            </button>
          </>
        }
      >
        <form id="service-form" className="portal-serviceFormCompact" onSubmit={onSubmit}>
          {error ? (
            <div className="portal-formError" role="alert">
              {error}
            </div>
          ) : null}

          <label className="portal-field">
            <span className="portal-label">Service name</span>
            <input
              className="portal-input"
              placeholder="Enter service name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>

          <div className="portal-modalGrid2 portal-serviceGridTop">
            <label className="portal-field">
              <span className="portal-label">Service category</span>
              <select
                className="portal-select"
                value={form.categoryId || ''}
                onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
              >
                <option value="">-- Select service category --</option>
                {categories.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="portal-field">
              <span className="portal-label">Status</span>
              <select
                className="portal-select"
                value={form.status || ''}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="">-- Select status --</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                {form.status && form.status !== 'active' && form.status !== 'inactive' ? (
                  <option value={form.status}>{form.status}</option>
                ) : null}
              </select>
            </label>
          </div>

          <div className="portal-modalGrid2 portal-serviceGridTop">
            <label className="portal-field">
              <span className="portal-label">Duration (minutes)</span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={form.duration}
                onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))}
              />
            </label>

            <label className="portal-field">
              <span className="portal-label">Price (VND)</span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              />
            </label>
          </div>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Description</span>
            <textarea
              className="portal-textarea"
              placeholder="Optional service description"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </label>

          <PortalCard title="Images" className="portal-serviceMediaCard" style={{ marginTop: 10 }}>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: 'none' }}
              onChange={onPickImage}
            />

            {Array.isArray(form.images) && form.images.length > 0 ? (
              <div className="portal-mediaGallery" role="list">
                {form.images.map((url, idx) => (
                  <button
                    key={`${idx}-${url}`}
                    type="button"
                    className={`portal-mediaGalleryItem ${selectedImageIdx === idx ? 'active' : ''}`.trim()}
                    onClick={() => setSelectedImageIdx(idx)}
                    role="listitem"
                  >
                    <img className="portal-mediaPreview" src={resolveAssetUrl(url)} alt={`service-${idx + 1}`} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="portal-pageSubtitle">No images yet.</div>
            )}

            <div className="portal-rowActions" style={{ marginTop: 12 }}>
              <button type="button" className="portal-ghostBtn" onClick={() => imageInputRef.current?.click()}>
                Add image
              </button>
              <button
                type="button"
                className="portal-ghostBtn danger"
                onClick={() =>
                  setForm((p) => {
                    if (!Array.isArray(p.images) || p.images.length === 0) return p
                    const idx = selectedImageIdx >= 0 ? selectedImageIdx : p.images.length - 1
                    const next = p.images.filter((_, i) => i !== idx)
                    setSelectedImageIdx(next.length ? Math.min(idx, next.length - 1) : -1)
                    return { ...p, images: next }
                  })
                }
                disabled={!Array.isArray(form.images) || form.images.length === 0}
              >
                Remove image
              </button>
            </div>
          </PortalCard>
        </form>
      </PortalModal>

      <PortalModal
        open={openCategory}
        title="Add service category"
        onClose={closeCreateCategory}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeCreateCategory}>
              Cancel
            </button>
            <button type="submit" form="service-category-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save
            </button>
          </>
        }
      >
        <form id="service-category-form" onSubmit={onSubmitCategory}>
          {categoryError ? (
            <div className="portal-formError" role="alert">
              {categoryError}
            </div>
          ) : null}

          <label className="portal-field">
            <span className="portal-label">Category name</span>
            <input
              className="portal-input"
              placeholder="e.g. Nail care, Eyelash extensions..."
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Description</span>
            <textarea
              className="portal-textarea"
              placeholder="Optional description"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
            />
          </label>
        </form>
      </PortalModal>

      <div className="portal-search portal-searchFull" role="search">
        <span className="portal-searchIcon" aria-hidden="true">
          <IconSearch />
        </span>
        <input
          className="portal-searchInput"
          placeholder="Search by service name, category, or status..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filteredSections.map((section) => (
        <div key={section.group} className="portal-serviceSection">
          <h2 className="portal-sectionTitle">{section.group}</h2>

          <div className="portal-serviceGrid" role="list">
            {section.items.map((s) => (
              <PortalCard key={s.id || `${section.group}-${s.name}`} className="portal-serviceCard" role="listitem">
                <div className="portal-serviceTop">
                  <span className={`portal-serviceTag ${s.tag === 'Pedicure' ? 'pedicure' : ''}`.trim()}>
                    {s.tag}
                  </span>
                  <button type="button" className="portal-ghostBtn portal-serviceEdit" onClick={() => openEdit(s)}>
                    Edit
                  </button>
                </div>

                <div className="portal-serviceName">{s.name}</div>

                <div className="portal-serviceMeta">
                  <span className="portal-serviceMetaIcon" aria-hidden="true">
                    <IconClock />
                  </span>
                  {s.duration}
                </div>

                <div className="portal-serviceDivider" aria-hidden="true" />

                <div className="portal-servicePrice">{s.price}</div>
              </PortalCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
