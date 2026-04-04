import React, { useEffect, useMemo, useState } from 'react'
import PortalCard from '../../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../../components/Layout portal/PortalModal.jsx'
import { IconSearch } from '../../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../../lib/api.js'
import { useNavigate } from 'react-router-dom'
import '../../../styles/products.css'
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

function resolveAssetUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const base = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`
}

export default function StaffProductsPage() {
  const navigate = useNavigate()
  const [loadError, setLoadError] = useState('')
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ kinds: [], statuses: [], categories: [] })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    kind: '',
    status: '',
    sellPriceVnd: '0',
    images: [],
    description: '',
  })

  async function load() {
    try {
      setLoadError('')
      const [list, m] = await Promise.all([api.get('/api/staff/products'), api.get('/api/staff/products/meta')])
      setItems(Array.isArray(list) ? list : [])
      if (m && typeof m === 'object') {
        setMeta({
          kinds: Array.isArray(m.kinds) ? m.kinds : [],
          statuses: Array.isArray(m.statuses) ? m.statuses : [],
          categories: Array.isArray(m.categories) ? m.categories : [],
        })
      }
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Unable to load products data')
    }
  }

  useEffect(() => {
    Promise.resolve().then(load)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((p) => {
      const name = String(p.name || '').toLowerCase()
      const kind = String(p.kind || p.categoryName || '').toLowerCase()
      const status = String(p.status || '').toLowerCase()
      const category = String(p.categoryId || '')
      const queryMatched = !q || name.includes(q) || kind.includes(q)
      const statusMatched = statusFilter === 'all' || status === statusFilter
      const categoryMatched = categoryFilter === 'all' || category === categoryFilter
      return queryMatched && statusMatched && categoryMatched
    })
  }, [items, query, statusFilter, categoryFilter])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, categoryFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function close() {
    setOpen(false)
    setError('')
    setEditing(null)
  }

  function openEdit(item) {
    setEditing(item)
    setError('')
    setForm({
      name: item?.name || '',
      categoryId: item?.categoryId || '',
      kind: item?.kind || item?.categoryName || '',
      status: item?.status || '',
      sellPriceVnd: String(item?.price ?? '0'),
      images: Array.isArray(item?.images) ? item.images : item?.imageUrl ? [item.imageUrl] : [],
      description: item?.description || '',
    })
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const normalizedName = String(form.name || '').trim()
    if (!normalizedName) {
      setError('Product name is required')
      return
    }

    const price = Number(digitsOnly(form.sellPriceVnd) || 0)
    if (!Number.isFinite(price) || price <= 0) {
      setError('Price must be greater than 0')
      return
    }

    try {
      setError('')
      const payload = {
        name: normalizedName,
        ...(form.categoryId ? { categoryId: form.categoryId } : {}),
        status: form.status,
        price: String(price),
        images: Array.isArray(form.images) ? form.images : [],
        description: form.description,
      }

      if (editing?.id) {
        await api.put(`/api/staff/products/${editing.id}`, payload)
        window.dispatchEvent(new CustomEvent('portal:success-modal', { 
          detail: { message: 'Product updated successfully', title: 'Completed' } 
        }))
      }

      await load()
      close()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Something went wrong')
    }
  }

  return (
    <div className="products-page">
      {loadError ? <div className="portal-formError" role="alert" style={{ marginBottom: 12 }}>{loadError}</div> : null}

      <div className="products-topRow">
        <div className="portal-search portal-searchFull" role="search">
          <span className="portal-searchIcon" aria-hidden="true"><IconSearch /></span>
          <input className="portal-searchInput" placeholder="Search by name / category..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="products-filterRow">
        <label className="portal-field products-filterField">
          <span className="portal-label">Filter by status</span>
          <select className="portal-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="portal-field products-filterField">
          <span className="portal-label">Filter by category</span>
          <select className="portal-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {(meta.categories || []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <PortalCard className="portal-invTableCard" title="Retail Product List">
        <div className="portal-tableWrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((p) => (
                <tr key={p.id}>
                  <td className="portal-invName">{p.name}</td>
                  <td><span className="portal-invPill">{p.categoryName || p.kind || '-'}</span></td>
                  <td>{formatVnd(p.price)} ₫</td>
                  <td>{p.stock ?? 0}</td>
                  <td><span className="portal-invPill">{p.status || '-'}</span></td>
                  <td className="products-actionsCell">
                    <div className="portal-rowActions">
                      <button type="button" className="portal-ghostBtn" onClick={() => openEdit(p)}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagedItems.length === 0 ? <tr><td colSpan={6} className="products-emptyRow">No products found</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="products-pagination">
          <button type="button" className="products-paginationBtn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
          <span className="products-paginationText">Page {page} / {totalPages}</span>
          <button type="button" className="products-paginationBtn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
        </div>
      </PortalCard>

      <PortalModal open={open} title={editing?.id ? 'Update Product' : 'Add Product'} onClose={close}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={close}>Cancel</button>
            <button type="submit" form="product-mgmt-form" className="portal-modalBtn portal-modalBtnPrimary">Save</button>
          </>
        }>
        <form id="product-mgmt-form" onSubmit={onSubmit}>
          {error ? <div className="portal-formError" role="alert">{error}</div> : null}
          <label className="portal-field">
            <span className="portal-label">Product Name <span className="products-required">*</span></span>
            <input className="portal-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Category <span className="products-required">*</span></span>
              <select className="portal-select" value={form.categoryId || ''} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}>
                <option value="">-- Select category --</option>
                {(meta.categories || []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
              </select>
            </label>
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Price (VND)</span>
              <input className="portal-input" value={form.sellPriceVnd} onChange={(e) => setForm((p) => ({ ...p, sellPriceVnd: e.target.value }))} />
            </label>
          </div>
        </form>
      </PortalModal>
    </div>
  )
}
