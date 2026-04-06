import React, { useEffect, useMemo, useRef, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import { IconAlertTriangle, IconBarCart, IconCheckCircle, IconSearch, IconStore } from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'
import { useNavigate } from 'react-router-dom'
import '../../styles/products.css'
function formatVnd(value) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US')
}

function formatAverageRating(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '-'
  return n.toFixed(1)
}

function digitsOnly(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.replace(/[^0-9]/g, '')
}

function hasDangerousInput(value) {
  const raw = String(value || '')
  const lower = raw.toLowerCase()
  if (/<\s*script\b/i.test(raw)) return true
  if (/on\w+\s*=\s*/i.test(raw)) return true
  if (/\bor\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i.test(lower)) return true
  if (/\bunion\b\s+\bselect\b/i.test(lower)) return true
  return false
}

function resolveAssetUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const base = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' })
}

const OWNER_PRODUCTS_UI_STATE_KEY = 'ownerProductsPage.ui.v1'

function readProductsUiState() {
  try {
    const raw = sessionStorage.getItem(OWNER_PRODUCTS_UI_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeProductsUiState(value) {
  try {
    sessionStorage.setItem(OWNER_PRODUCTS_UI_STATE_KEY, JSON.stringify(value))
  } catch {
    // ignore storage write failures
  }
}

export default function OwnerProductsPage() {
  const navigate = useNavigate()
  const [loadError, setLoadError] = useState('')
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ kinds: [], statuses: [], categories: [] })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [openCat, setOpenCat] = useState(false)
  const [catError, setCatError] = useState('')
  const [catForm, setCatForm] = useState({ name: '', description: '' })

  const [openVariants, setOpenVariants] = useState(false)
  const [variantsFor, setVariantsFor] = useState(null)
  const [variantsError, setVariantsError] = useState('')
  const [variants, setVariants] = useState([])
  const [newVariant, setNewVariant] = useState({ name: '', stock: '0' })

  const variantsTotalStock = useMemo(() => {
    return variants.reduce((sum, v) => sum + Number(digitsOnly(v?.stock ?? 0) || 0), 0)
  }, [variants])

  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    kind: '',
    status: '',
    supplier: 'Default',
    sellPriceVnd: '0',
    importPriceVnd: '',
    images: [],
    description: '',
  })
  const [selectedImageIdx, setSelectedImageIdx] = useState(-1)
  const hasRestoredUiRef = useRef(false)

  const imageInputRef = useRef(null)

  function onToggleSort(field) {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortOrder('asc')
  }

  function renderSortToggle(field, label) {
    return (
      <button
        type="button"
        className="products-sortToggle"
        aria-label={`Sort by ${label}`}
        onClick={() => onToggleSort(field)}
      >
        <span className={`products-sortTriangle up ${sortBy === field && sortOrder === 'asc' ? 'is-active' : ''}`.trim()} aria-hidden="true" />
        <span className={`products-sortTriangle down ${sortBy === field && sortOrder === 'desc' ? 'is-active' : ''}`.trim()} aria-hidden="true" />
      </button>
    )
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to read file'))
      reader.readAsDataURL(file)
    })
  }

  async function onPickImage(e) {
    const file = e?.target?.files?.[0]
    if (!file) return
    try {
      setError('')
      const dataUrl = await readFileAsDataUrl(file)
      const uploaded = await api.post('/api/owner/retail/uploads/image', { dataUrl })
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

  async function load() {
    try {
      setLoadError('')
      const [list, m] = await Promise.all([api.get('/api/owner/retail/products'), api.get('/api/owner/retail/meta')])
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


  async function refreshCategories() {
    try {
      const list = await api.get('/api/owner/retail/categories')
      setMeta((prev) => ({
        ...prev,
        categories: Array.isArray(list) ? list : [],
      }))
    } catch (err) {
      console.error(err)
      setLoadError((prev) => prev || err?.message || 'Unable to load categories')
      setMeta((prev) => ({ ...prev, categories: [] }))
    }
  }

  useEffect(() => {
    Promise.resolve().then(load)
  }, [])

  useEffect(() => {
    if (hasRestoredUiRef.current) return
    const saved = readProductsUiState()
    if (!saved || typeof saved !== 'object') {
      hasRestoredUiRef.current = true
      return
    }

    if (typeof saved.query === 'string') setQuery(saved.query)
    if (saved.statusFilter === 'all' || saved.statusFilter === 'active' || saved.statusFilter === 'inactive') {
      setStatusFilter(saved.statusFilter)
    }
    if (typeof saved.categoryFilter === 'string') setCategoryFilter(saved.categoryFilter)
    if (typeof saved.sortBy === 'string') setSortBy(saved.sortBy)
    if (saved.sortOrder === 'asc' || saved.sortOrder === 'desc') setSortOrder(saved.sortOrder)
    if (saved.openCat === true || saved.openCat === false) setOpenCat(saved.openCat)
    if (saved.catForm && typeof saved.catForm === 'object') {
      setCatForm({
        name: String(saved.catForm.name || ''),
        description: String(saved.catForm.description || ''),
      })
    }
    if (saved.open === true || saved.open === false) setOpen(saved.open)
    if (saved.form && typeof saved.form === 'object') {
      setForm({
        name: String(saved.form.name || ''),
        categoryId: String(saved.form.categoryId || ''),
        kind: String(saved.form.kind || ''),
        status: String(saved.form.status || ''),
        supplier: String(saved.form.supplier || 'Default'),
        sellPriceVnd: String(saved.form.sellPriceVnd || '0'),
        importPriceVnd: String(saved.form.importPriceVnd || ''),
        images: Array.isArray(saved.form.images) ? saved.form.images.filter(Boolean).slice(0, 8) : [],
        description: String(saved.form.description || ''),
      })
    }
    if (Number.isInteger(saved.selectedImageIdx)) setSelectedImageIdx(saved.selectedImageIdx)
    if (saved.newVariant && typeof saved.newVariant === 'object') {
      setNewVariant({
        name: String(saved.newVariant.name || ''),
        stock: String(saved.newVariant.stock || '0'),
      })
    }
    hasRestoredUiRef.current = true
  }, [])

  useEffect(() => {
    if (!hasRestoredUiRef.current) return
    writeProductsUiState({
      query,
      statusFilter,
      categoryFilter,
      sortBy,
      sortOrder,
      openCat,
      catForm,
      open,
      form,
      selectedImageIdx,
      newVariant,
    })
  }, [query, statusFilter, categoryFilter, sortBy, sortOrder, openCat, catForm, open, form, selectedImageIdx, newVariant])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searched = items.filter((p) => {
      const name = String(p.name || '').toLowerCase()
      const kind = String(p.kind || p.categoryName || '').toLowerCase()
      const status = String(p.status || '').toLowerCase()
      const category = String(p.categoryId || '')
      const queryMatched = !q || name.includes(q) || kind.includes(q)
      const statusMatched = statusFilter === 'all' || status === statusFilter
      const categoryMatched = categoryFilter === 'all' || category === categoryFilter
      return queryMatched && statusMatched && categoryMatched
    })
    return searched
  }, [items, query, statusFilter, categoryFilter])

  const sortedFiltered = useMemo(() => {
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sortBy === 'price') {
        const cmp = Number(a?.price || 0) - Number(b?.price || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'stock') {
        const cmp = Number(a?.stock || 0) - Number(b?.stock || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'sold') {
        const cmp = Number(a?.soldCount || 0) - Number(b?.soldCount || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'rating') {
        const cmp = Number(a?.averageRating || 0) - Number(b?.averageRating || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'category') {
        const cmp = compareText(a?.categoryName || a?.kind || '', b?.categoryName || b?.kind || '')
        return sortOrder === 'asc' ? cmp : -cmp
      }
      const cmp = compareText(a?.name || '', b?.name || '')
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filtered, sortBy, sortOrder])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedFiltered.slice(start, start + pageSize)
  }, [sortedFiltered, page])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedFiltered.length / pageSize)), [sortedFiltered.length])

  const totalProductsCount = useMemo(() => items.length, [items])

  const activeProductsCount = useMemo(
    () => items.filter((p) => String(p?.status || '').toLowerCase() === 'active').length,
    [items]
  )

  const outOfStockProductsCount = useMemo(
    () => items.filter((p) => Number(p?.stock || 0) <= 0).length,
    [items]
  )

  const lowStockProductsCount = useMemo(
    () => items.filter((p) => Number(p?.stock || 0) > 0 && Number(p?.stock || 0) <= 10).length,
    [items]
  )

  const categoriesById = useMemo(() => {
    const map = new Map()
    for (const c of meta.categories || []) {
      if (c && (c.id !== undefined && c.id !== null)) {
        map.set(String(c.id), c)
      }
    }
    return map
  }, [meta.categories])

  function close() {
    setOpen(false)
    setError('')
    setEditing(null)
  }

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, categoryFilter, sortBy, sortOrder])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function closeVariants() {
    setOpenVariants(false)
    setVariantsFor(null)
    setVariantsError('')
    setVariants([])
    setNewVariant({ name: '', stock: '0' })
  }

  function closeCreateCategory() {
    setOpenCat(false)
    setCatError('')
  }

  async function onCreateCategory(e) {
    e.preventDefault()
    const name = String(catForm?.name || '').trim()
    if (!name) {
      setCatError('Please enter a category name')
      return
    }

    try {
      setCatError('')
      const created = await api.post('/api/owner/retail/categories', {
        name,
        description: String(catForm?.description || '').trim(),
      })
      await refreshCategories()
      if (created?.id && !form.categoryId) {
        setForm((p) => ({
          ...p,
          categoryId: String(created.id),
          kind: created?.name || p.kind,
        }))
      }
      closeCreateCategory()
    } catch (err) {
      console.error(err)
      setCatError(err?.message || 'Unable to create category')
    }
  }

  async function refreshVariantsAndProduct(productId) {
    const [v, p] = await Promise.all([
      api.get(`/api/owner/retail/products/${productId}/variants`),
      api.get(`/api/owner/retail/products/${productId}`),
    ])
    setVariants(Array.isArray(v) ? v : [])
    if (p && typeof p === 'object') {
      setVariantsFor((prev) => (prev?.id === productId ? { ...prev, ...p } : prev))
    }
  }

  function openVariantsForProduct(product) {
    if (!product?.id) return
    setVariantsError('')
    setVariantsFor(product)
    setOpenVariants(true)
    Promise.resolve()
      .then(() => refreshVariantsAndProduct(product.id))
      .catch((err) => {
        console.error(err)
        setVariantsError(err?.message || 'Unable to load variants')
      })
  }

  function openCreate() {
    setEditing(null)
    setError('')
    setForm({
      name: '',
      categoryId: '',
      kind: '',
      status: '',
      supplier: 'Default',
      sellPriceVnd: '0',
      importPriceVnd: '',
      images: [],
      description: '',
    })
    setSelectedImageIdx(-1)
    setOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setError('')
    const rawCategoryId = item?.categoryId ?? item?.category?.id ?? ''
    const fallbackCategoryId = rawCategoryId
      ? String(rawCategoryId)
      : (() => {
          const k = String(item?.kind || item?.categoryName || '').trim()
          if (!k) return ''
          const found = (meta.categories || []).find((c) => String(c?.name || '').trim() === k)
          return found?.id !== undefined && found?.id !== null ? String(found.id) : ''
        })()
    setForm({
      name: item?.name || '',
      categoryId: fallbackCategoryId,
      kind: item?.kind || item?.categoryName || '',
      status: item?.status || '',
      supplier: item?.supplier || 'Default',
      sellPriceVnd: String(item?.price ?? '0'),
      importPriceVnd: '',
      images: Array.isArray(item?.images) ? item.images : item?.imageUrl ? [item.imageUrl] : [],
      description: item?.description || '',
    })
    setSelectedImageIdx(-1)
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const normalizedName = String(form.name || '').trim()
    if (!normalizedName) {
      setError('Product name is required')
      return
    }
    if (hasDangerousInput(normalizedName)) {
      setError('Invalid product name')
      return
    }

    if (Array.isArray(meta.categories) && meta.categories.length > 0 && !form.categoryId) {
      setError('Please select a category')
      return
    }

    if (!form.status) {
      setError('Please select a status')
      return
    }

    const price = Number(digitsOnly(form.sellPriceVnd) || 0)
    if (!Number.isFinite(price) || price <= 0) {
      setError('Price must be greater than 0')
      return
    }

    const importPriceRaw = digitsOnly(form.importPriceVnd)
    const importPrice = Number(importPriceRaw || 0)
    if (importPriceRaw && (!Number.isFinite(importPrice) || importPrice < 0)) {
      setError('Import price must be 0 or greater')
      return
    }

    try {
      setError('')
      const payload = {
        name: normalizedName,
        ...(form.categoryId ? { categoryId: form.categoryId } : {}),
        status: form.status,
        supplier: String(form.supplier || 'Default').trim() || 'Default',
        price: String(price),
        images: Array.isArray(form.images) ? form.images : [],
        description: form.description,
      }
      if (importPriceRaw) payload.importPriceVnd = String(importPrice)

      if (editing?.id) {
        await api.put(`/api/owner/retail/products/${editing.id}`, payload)
      } else {
        await api.post('/api/owner/retail/products', payload)
      }

      await load()
      close()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Something went wrong')
    }
  }

  // Delete functionality removed — products should be deactivated via Edit -> Status

  async function onCreateVariant(e) {
    e.preventDefault()
    if (!variantsFor?.id) return
    const variantName = String(newVariant.name || '').trim()
    if (!variantName) {
      setVariantsError('Variant name is required')
      return
    }
    if (hasDangerousInput(variantName)) {
      setVariantsError('Invalid variant name')
      return
    }

    const normalizedStock = Number(digitsOnly(newVariant.stock) || 0)
    if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
      setVariantsError('Invalid stock')
      return
    }

    // fetch authoritative product and variants totals from server to avoid race conditions
    try {
      const [serverVariants, serverProduct] = await Promise.all([
        api.get(`/api/owner/retail/products/${variantsFor.id}/variants`),
        api.get(`/api/owner/retail/products/${variantsFor.id}`),
      ])

      const serverTotal = Array.isArray(serverVariants)
        ? serverVariants.reduce((s, v) => s + Number(digitsOnly(v?.stock ?? 0) || 0), 0)
        : 0
      const serverCap = Number(serverProduct?.stock ?? 0)
      if (serverTotal + normalizedStock > serverCap) {
        setVariantsError('Insufficient stock')
        return
      }
    } catch (err) {
      // if we can't validate server-side, continue but warn in console
      console.error('Failed to validate stock with server', err)
    }

    try {
      setVariantsError('')
      await api.post(`/api/owner/retail/products/${variantsFor.id}/variants`, {
        name: variantName,
        stock: String(normalizedStock),
      })
      await refreshVariantsAndProduct(variantsFor.id)
      setNewVariant({ name: '', stock: '0' })
      await load()
    } catch (err) {
      console.error(err)
      setVariantsError(err?.message || 'Unable to create variant')
    }
  }

  async function onUpdateVariant(variant) {
    if (!variant?.id) return

    const normalizedName = String(variant.name || '').trim()
    if (!normalizedName) {
      setVariantsError('Variant name is required')
      return
    }
    if (hasDangerousInput(normalizedName)) {
      setVariantsError('Invalid variant name')
      return
    }

    const normalizedStock = Number(digitsOnly(variant.stock) || 0)
    if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
      setVariantsError('Invalid stock')
      return
    }

    const cap = Number(variantsFor?.stock ?? 0)
    if (Number(variantsTotalStock || 0) > cap) {
      setVariantsError('Insufficient stock')
      return
    }
    try {
      setVariantsError('')
      await api.put(`/api/owner/retail/variants/${variant.id}`, {
        name: normalizedName,
        stock: String(normalizedStock),
      })
      if (variantsFor?.id) {
        await refreshVariantsAndProduct(variantsFor.id)
      }
      await load()
    } catch (err) {
      console.error(err)
      setVariantsError(err?.message || 'Unable to update variant')
    }
  }

  async function onDeleteVariant(variant) {
    if (!variant?.id) return
    if (!variantsFor?.id) return
    try {
      setVariantsError('')
      await api.del(`/api/owner/retail/variants/${variant.id}`)
      await refreshVariantsAndProduct(variantsFor.id)
      await load()
    } catch (err) {
      console.error(err)
      setVariantsError(err?.message || 'Unable to delete variant')
    }
  }

  function openDetail(product) {
    if (!product?.id) return
    navigate(`/portals/owner/products/${product.id}`, {
      state: {
        product: {
          ProductId: product.id,
          Name: product.name || '',
          Price: Number(product.price || 0),
          Stock: Number(product.stock || 0),
          SoldCount: Number(product.soldCount || 0),
          Description: product.description || '',
          ImageUrl: Array.isArray(product.images) && product.images.length ? product.images[0] : product.imageUrl || '',
          Images: Array.isArray(product.images) ? product.images : product.imageUrl ? [product.imageUrl] : [],
          CategoryId: product.categoryId ?? product.categoryId,
        },
      },
    })
  }

  return (
    <div className="products-page">
      {loadError ? (
        <div className="portal-formError" role="alert" style={{ marginBottom: 12 }}>
          {loadError}
        </div>
      ) : null}

      <div className="products-kpiGrid">
        <PortalCard
          className="portal-kpi"
          title="Total Products"
          style={{
            '--kpi-accent': 'var(--primary)',
            '--kpi-icon-bg': 'var(--primary-soft)',
          }}
          right={
            <div className="portal-kpiIcon" aria-hidden="true">
              <IconStore />
            </div>
          }
        >
          <div className="portal-kpiValue">{formatVnd(totalProductsCount)}</div>
        </PortalCard>

        <PortalCard
          className="portal-kpi"
          title="Active Products"
          style={{
            '--kpi-accent': 'var(--success)',
            '--kpi-icon-bg': 'var(--success-soft)',
          }}
          right={
            <div className="portal-kpiIcon" aria-hidden="true">
              <IconCheckCircle />
            </div>
          }
        >
          <div className="portal-kpiValue">{formatVnd(activeProductsCount)}</div>
        </PortalCard>

        <PortalCard
          className="portal-kpi"
          title="Low Stock"
          style={{
            '--kpi-accent': 'var(--warning)',
            '--kpi-icon-bg': 'var(--warning-soft)',
          }}
          right={
            <div className="portal-kpiIcon" aria-hidden="true">
              <IconAlertTriangle />
            </div>
          }
        >
          <div className="portal-kpiValue">{formatVnd(lowStockProductsCount)}</div>
        </PortalCard>

        <PortalCard
          className="portal-kpi"
          title="Out of Stock"
          style={{
            '--kpi-accent': 'var(--info)',
            '--kpi-icon-bg': 'var(--info-soft)',
          }}
          right={
            <div className="portal-kpiIcon" aria-hidden="true">
              <IconBarCart />
            </div>
          }
        >
          <div className="portal-kpiValue">{formatVnd(outOfStockProductsCount)}</div>
        </PortalCard>
      </div>

      <div className="products-topRow">
        <div className="portal-search portal-searchFull" role="search">
          <span className="portal-searchIcon" aria-hidden="true">
            <IconSearch />
          </span>
          <input
            className="portal-searchInput"
            placeholder="Search by name / category..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="portal-headerActions">
          <button type="button" className="portal-primaryBtn" onClick={openCreate}>
            <span className="portal-primaryBtnIcon" aria-hidden="true">
              +
            </span>
            Add Product
          </button>
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
            {(meta.categories || []).map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

      </div>
      <PortalCard className="portal-invTableCard" title="Retail Product List">
        <div className="portal-tableWrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>
                  <div className="products-sortHeader">
                    <span>Name</span>
                    {renderSortToggle('name', 'name')}
                  </div>
                </th>
                <th>Category</th>
                <th>
                  <div className="products-sortHeader">
                    <span>Price</span>
                    {renderSortToggle('price', 'price')}
                  </div>
                </th>
                <th>
                  <div className="products-sortHeader">
                    <span>Stock</span>
                    {renderSortToggle('stock', 'stock')}
                  </div>
                </th>
                <th>
                  <div className="products-sortHeader">
                    <span>Sold</span>
                    {renderSortToggle('sold', 'sold')}
                  </div>
                </th>
                <th>
                  <div className="products-sortHeader">
                    <span>Rating</span>
                    {renderSortToggle('rating', 'rating')}
                  </div>
                </th>
                <th className="products-actionsCol">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((p) => (
                <tr key={p.id}>
                  <td className="portal-invName">{p.name}</td>
                  <td>
                      <span className="portal-invPill">{p.categoryName || p.kind || '-'}</span>
                  </td>
                  <td>{formatVnd(p.price)} ₫</td>
                  <td>{p.stock ?? 0}</td>
                  <td>{Number(p.soldCount ?? 0)}</td>
                  <td>{formatAverageRating(p.averageRating)}</td>
                  <td className="products-actionsCell">
                    <div className="portal-rowActions">
                      <button type="button" className="portal-ghostBtn" onClick={() => openEdit(p)}>
                        Edit
                      </button>
                      <button type="button" className="portal-ghostBtn" onClick={() => openVariantsForProduct(p)}>
                        Variants
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="products-emptyRow">No products found</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="products-pagination">
          <button
            type="button"
            className="portal-ghostBtn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="products-paginationText">Page {page} / {totalPages}</span>
          <button
            type="button"
            className="portal-ghostBtn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </PortalCard>

      <PortalModal
        open={open}
        title={editing?.id ? 'Update Product' : 'Add Product'}
        onClose={close}
        footer={
          <>
            {editing?.id ? (
              <button
                type="button"
                className="portal-modalBtn"
                onClick={() => {
                  openDetail(editing)
                }}
              >
                Details
              </button>
            ) : null}
            {editing?.id ? (
              <button type="button" className="portal-modalBtn" onClick={close}>
                Cancel
              </button>
            ) : null}
            <button type="submit" form="product-mgmt-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save
            </button>
          </>
        }
      >
        <form id="product-mgmt-form" onSubmit={onSubmit}>
          {error ? (
            <div className="portal-formError" role="alert">
              {error}
            </div>
          ) : null}

          <label className="portal-field">
            <span className="portal-label">Product Name <span className="products-required">*</span></span>
            <input className="portal-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </label>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Category <span className="products-required">*</span></span>
              <select
                className="portal-select"
                value={form.categoryId || ''}
                onChange={(e) => {
                  const nextId = e.target.value
                  const cat = categoriesById.get(nextId)
                  setForm((p) => ({
                    ...p,
                    categoryId: nextId,
                    kind: cat?.name || p.kind,
                  }))
                }}
                disabled={!Array.isArray(meta.categories) || meta.categories.length === 0}
              >
                <option value="">
                  {Array.isArray(meta.categories) && meta.categories.length > 0
                    ? '-- Select category --'
                    : 'No categories available'}
                </option>
                {(meta.categories || []).map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Status <span className="products-required">*</span></span>
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

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Price (VND) <span className="products-required">*</span></span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={form.sellPriceVnd}
                onChange={(e) => setForm((p) => ({ ...p, sellPriceVnd: digitsOnly(e.target.value) }))}
              />
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Import Price (VND)</span>
              <input
                className="portal-input"
                inputMode="numeric"
                placeholder="Optional"
                value={form.importPriceVnd}
                onChange={(e) => setForm((p) => ({ ...p, importPriceVnd: digitsOnly(e.target.value) }))}
              />
            </label>
          </div>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Supplier</span>
            <input
              className="portal-input"
              placeholder="Default"
              value={form.supplier || ''}
              onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
            />
          </label>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Images</span>
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
                    <img className="portal-mediaPreview" src={resolveAssetUrl(url)} alt={`${form.name || 'product'}-${idx + 1}`} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="portal-pageSubtitle">No images yet.</div>
            )}
          </label>

          <div className="portal-rowActions" style={{ marginTop: 8 }}>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: 'none' }}
              onChange={onPickImage}
            />
            <button type="button" className="portal-ghostBtn" onClick={() => imageInputRef.current?.click()}>
              Add Image
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
              Remove Image
            </button>
          </div>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Description</span>
            <textarea
              className="portal-textarea"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </label>
        </form>
      </PortalModal>

      <PortalModal
        open={openCat}
        title="Add Category"
        onClose={closeCreateCategory}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeCreateCategory}>
              Cancel
            </button>
            <button type="submit" form="category-create-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save
            </button>
          </>
        }
      >
        {catError ? (
          <div className="portal-formError" role="alert">
            {catError}
          </div>
        ) : null}

        <form id="category-create-form" onSubmit={onCreateCategory}>
          <label className="portal-field">
            <span className="portal-label">Category Name <span className="products-required">*</span></span>
            <input
              className="portal-input"
              value={catForm.name}
              onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Description</span>
            <textarea
              className="portal-textarea"
              placeholder="Description (optional)"
              value={catForm.description}
              onChange={(e) => setCatForm((p) => ({ ...p, description: e.target.value }))}
            />
          </label>
        </form>
      </PortalModal>

      <PortalModal
        open={openVariants}
        title={variantsFor?.name ? `Variants - ${variantsFor.name}` : 'Variants'}
        onClose={closeVariants}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeVariants}>
              Close
            </button>
          </>
        }
      >
        {variantsError ? (
          <div className="portal-formError" role="alert">
            {variantsError}
          </div>
        ) : null}

        <div className="portal-pageSubtitle">
          Product stock: <b>{variantsFor?.stock ?? 0}</b> | Total variant stock: <b>{variantsTotalStock}</b>
        </div>

        {Number(variantsTotalStock || 0) > Number(variantsFor?.stock ?? 0) ? (
          <div className="portal-formError" role="alert" style={{ marginTop: 8 }}>
            Insufficient stock
          </div>
        ) : null}

        <PortalCard title="Variant List">
          {variants.length === 0 ? <div className="portal-pageSubtitle">No variants yet.</div> : null}
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Variant Name</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <input
                        className="portal-input"
                        value={v.name || ''}
                        onChange={(e) =>
                          setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td style={{ width: 140 }}>
                      <input
                        className="portal-input"
                        inputMode="numeric"
                        value={String(v.stock ?? '0')}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((x) => (x.id === v.id ? { ...x, stock: digitsOnly(e.target.value) } : x))
                          )
                        }
                      />
                    </td>
                    <td style={{ width: 220 }}>
                      <div className="portal-rowActions">
                        <button type="button" className="portal-ghostBtn" onClick={() => onUpdateVariant(v)}>
                          Save
                        </button>
                        <button type="button" className="portal-ghostBtn danger" onClick={() => onDeleteVariant(v)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>

        <PortalCard title="Add Variant" style={{ marginTop: 12 }}>
          <form onSubmit={onCreateVariant}>
            <div className="portal-modalGrid2">
              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Variant Name</span>
                <input
                  className="portal-input"
                  placeholder="e.g. Blue / Red..."
                  value={newVariant.name}
                  onChange={(e) => setNewVariant((p) => ({ ...p, name: e.target.value }))}
                />
              </label>

              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Stock</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  value={newVariant.stock}
                  onChange={(e) => setNewVariant((p) => ({ ...p, stock: digitsOnly(e.target.value) }))}
                />
              </label>
            </div>

            <div className="portal-rowActions" style={{ marginTop: 12 }}>
              <button type="submit" className="portal-modalBtn portal-modalBtnPrimary">
                Add Variant
              </button>
            </div>
          </form>
        </PortalCard>
      </PortalModal>
    </div>
  )
}
