import React, { useEffect, useMemo, useRef, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/inventory.css'

import {
  IconAlertTriangle,
  IconCalendar,
  IconClock,
  IconCube,
  IconDownload,
  IconSearch,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function formatVnd(value) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US')
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

function getTodayDateInput() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDmyString(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = Number(m[1])
  const mon = Number(m[2])
  const y = Number(m[3])
  if (!Number.isFinite(d) || !Number.isFinite(mon) || !Number.isFinite(y)) return null
  return new Date(y, mon - 1, d)
}

function extractRetailProductId(value) {
  if (!value) return ''
  const raw = String(value)
  const idx = raw.indexOf(':')
  if (idx > 0) return raw.slice(idx + 1)
  return raw
}

export default function OwnerInventoryPage() {
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stockStateFilter, setStockStateFilter] = useState('all')
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [openAdd, setOpenAdd] = useState(false)
  const [openStock, setOpenStock] = useState(false)
  const [openStockOut, setOpenStockOut] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [addError, setAddError] = useState('')
  const [stockError, setStockError] = useState('')
  const [stockOutError, setStockOutError] = useState('')
  const [editError, setEditError] = useState('')
  const [items, setItems] = useState([])
  const [stockForId, setStockForId] = useState('')
  const [history, setHistory] = useState([])

  const [categories, setCategories] = useState([])
  const [openCat, setOpenCat] = useState(false)
  const [catError, setCatError] = useState('')
  const [catForm, setCatForm] = useState({ name: '', description: '' })

  const [editFor, setEditFor] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    categoryId: '',
    category: '',
    kind: '',
    unit: '',
    minQty: '0',
    priceVnd: '0',
    sellPriceVnd: '0',
    description: '',
    imageUrl: '',
    status: '',
  })

  const editImageInputRef = useRef(null)

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to read file'))
      reader.readAsDataURL(file)
    })
  }

  async function onPickEditImage(e) {
    const file = e?.target?.files?.[0]
    if (!file) return

    try {
      setEditError('')
      const dataUrl = await readFileAsDataUrl(file)
      const uploaded = await api.post('/api/owner/retail/uploads/image', { dataUrl })
      setEditForm((p) => ({ ...p, imageUrl: uploaded?.url || '' }))
    } catch (err) {
      console.error(err)
      setEditError(err?.message || 'Unable to upload image')
    } finally {
      if (e?.target) e.target.value = ''
    }
  }

  const [openVariants, setOpenVariants] = useState(false)
  const [variantsError, setVariantsError] = useState('')
  const [variants, setVariants] = useState([])
  const [variantsFor, setVariantsFor] = useState(null)
  const [newVariant, setNewVariant] = useState({ name: '', stock: '0' })
  const [variantsProductStock, setVariantsProductStock] = useState(null)

  const variantsTotalStock = useMemo(() => {
    return variants.reduce((sum, v) => sum + Number(digitsOnly(v?.stock ?? 0) || 0), 0)
  }, [variants])

  async function refreshInventory() {
    try {
      const data = await api.get('/api/owner/inventory')
      if (data && typeof data === 'object') {
        if (Array.isArray(data.items)) setItems(data.items)
        if (Array.isArray(data.history)) setHistory(data.history)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function refreshCategories() {
    try {
      const list = await api.get('/api/owner/retail/categories')
      setCategories(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error(err)
      setCategories([])
    }
  }

  const categoriesById = useMemo(() => {
    const map = new Map()
    for (const c of categories || []) {
      if (c && c.id !== undefined && c.id !== null) map.set(String(c.id), c)
    }
    return map
  }, [categories])

  function findCategoryIdByName(name) {
    const n = String(name || '').trim()
    if (!n) return ''
    const found = (categories || []).find((c) => String(c?.name || '').trim() === n)
    return found?.id !== undefined && found?.id !== null ? String(found.id) : ''
  }

  useEffect(() => {
    Promise.resolve()
      .then(() => refreshInventory())
      .then(() => refreshCategories())
  }, [])

  const [productForm, setProductForm] = useState({
    group: 'service',
    name: '',
    categoryId: '',
    qty: '0',
    minQty: '0',
    unit: '',
    price: '0',
    supplier: '',
  })

  const [stockForm, setStockForm] = useState({
    inventoryItemId: '',
    qty: '0',
    importPrice: '0',
    supplier: '',
    date: getTodayDateInput(),
    note: '',
  })

  const [stockOutForm, setStockOutForm] = useState({
    inventoryItemId: '',
    qty: '0',
    date: getTodayDateInput(),
    note: '',
  })

  const productOptions = useMemo(() => items.map((i) => ({ id: i.id, name: i.name, group: i.group })), [items])

  const stockInOptions = useMemo(() => {
    const options = productOptions
    const autoGroup = tab === 'service' ? 'service' : tab === 'retail' ? 'retail' : 'all'
    if (autoGroup === 'all') return options
    return options.filter((o) => o.group === autoGroup)
  }, [productOptions, tab])

  const stockOutOptions = useMemo(() => {
    const options = productOptions
    const autoGroup = tab === 'service' ? 'service' : tab === 'retail' ? 'retail' : 'all'
    if (autoGroup === 'all') return options
    return options.filter((o) => o.group === autoGroup)
  }, [productOptions, tab])

  const lowStockCount = useMemo(
    () => items.filter((i) => Number(i.minQty || 0) > 0 && Number(i.stock || 0) <= Number(i.minQty || 0)).length,
    [items]
  )

  const outOfStockCount = useMemo(() => items.filter((i) => Number(i.stock || 0) <= 0).length, [items])

  const healthyStockCount = useMemo(
    () =>
      items.filter((i) => {
        const s = Number(i.stock || 0)
        const min = Number(i.minQty || 0)
        return s > 0 && (min <= 0 || s > min)
      }).length,
    [items]
  )
  const totalImportVnd = useMemo(
    () => history.filter((h) => h.type === 'Stock In').reduce((sum, h) => sum + Number(h.totalVnd || 0), 0),
    [history]
  )

  const totalStockOutVnd = useMemo(
    () => history.filter((h) => h.type === 'Stock Out').reduce((sum, h) => sum + Number(h.totalVnd || 0), 0),
    [history]
  )

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = items.filter((i) => {
      const textMatched = q ? i.name.toLowerCase().includes(q) || String(i.category || '').toLowerCase().includes(q) : true
      const categoryMatched = categoryFilter === 'all' || String(i.category || '') === categoryFilter
      const stock = Number(i.stock || 0)
      const min = Number(i.minQty || 0)
      const stateMatched =
        stockStateFilter === 'all' ||
        (stockStateFilter === 'out' && stock <= 0) ||
        (stockStateFilter === 'low' && stock > 0 && min > 0 && stock <= min) ||
        (stockStateFilter === 'healthy' && stock > 0 && (min <= 0 || stock > min))
      return textMatched && categoryMatched && stateMatched
    })
    if (tab === 'service') return base.filter((i) => i.group === 'service')
    if (tab === 'retail') return base.filter((i) => i.group === 'retail')
    return base
  }, [items, query, tab, categoryFilter, stockStateFilter])

  const serviceItems = useMemo(() => filteredItems.filter((i) => i.group === 'service'), [filteredItems])
  const retailItems = useMemo(() => filteredItems.filter((i) => i.group === 'retail'), [filteredItems])

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase()
    return history.filter((h) => {
      const textMatched =
        q
          ? String(h.product || '').toLowerCase().includes(q) || String(h.note || '').toLowerCase().includes(q)
          : true
      const typeMatched = historyTypeFilter === 'all' || String(h.type || '').toLowerCase() === historyTypeFilter
      const dateObj = parseDmyString(h.date)
      const fromMatched = !fromDate || (dateObj && dateObj >= new Date(fromDate))
      const toMatched = !toDate || (dateObj && dateObj <= new Date(`${toDate}T23:59:59`))
      return textMatched && typeMatched && fromMatched && toMatched
    })
  }, [history, query, historyTypeFilter, fromDate, toDate])

  const pagedItems = useMemo(() => {
    const source = tab === 'history' ? filteredHistory : filteredItems
    const start = (page - 1) * pageSize
    return source.slice(start, start + pageSize)
  }, [tab, filteredHistory, filteredItems, page])

  const totalPages = useMemo(() => {
    const source = tab === 'history' ? filteredHistory : filteredItems
    return Math.max(1, Math.ceil(source.length / pageSize))
  }, [tab, filteredHistory, filteredItems])

  useEffect(() => {
    setPage(1)
  }, [tab, query, categoryFilter, stockStateFilter, historyTypeFilter, fromDate, toDate])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function closeAdd() {
    setOpenAdd(false)
    setAddError('')
  }

  function closeStock() {
    setOpenStock(false)
    setStockForId('')
    setStockError('')
  }

  function closeStockOut() {
    setOpenStockOut(false)
    setStockForId('')
    setStockOutError('')
  }

  function closeEdit() {
    setOpenEdit(false)
    setEditFor(null)
    setEditError('')
  }

  function closeVariants() {
    setOpenVariants(false)
    setVariantsError('')
    setVariants([])
    setVariantsFor(null)
    setNewVariant({ name: '', stock: '0' })
    setVariantsProductStock(null)
  }

  async function refreshVariantsAndProduct(productId) {
    const [v, p] = await Promise.all([
      api.get(`/api/owner/retail/products/${productId}/variants`),
      api.get(`/api/owner/retail/products/${productId}`),
    ])
    setVariants(Array.isArray(v) ? v : [])
    if (p && typeof p === 'object') {
      setVariantsProductStock(p.stock ?? null)
    }
  }

  function openCreateCategory() {
    setCatError('')
    setCatForm({ name: '', description: '' })
    setOpenCat(true)
  }

  function closeCreateCategory() {
    setOpenCat(false)
    setCatError('')
  }

  async function onCreateCategory(e) {
    e.preventDefault()
    const name = String(catForm.name || '').trim()
    if (!name) {
      setCatError('Category name is required')
      return
    }
    if (hasDangerousInput(name)) {
      setCatError('Invalid category name')
      return
    }

    try {
      setCatError('')
      const created = await api.post('/api/owner/retail/categories', {
        name,
        description: catForm.description,
      })
      await refreshCategories()

      const nextId = created?.id !== undefined && created?.id !== null ? String(created.id) : ''
      if (nextId) {
        if (openAdd) setProductForm((p) => ({ ...p, categoryId: nextId }))
        if (openEdit) setEditForm((p) => ({ ...p, categoryId: nextId }))
      }

      closeCreateCategory()
    } catch (err) {
      console.error(err)
      setCatError(err?.message || 'Unable to create category')
    }
  }

  function openEditFor(item) {
    setEditFor(item || null)
    setEditError('')
    setEditForm({
      name: item?.name || '',
      categoryId: findCategoryIdByName(item?.category || item?.kind || ''),
      category: item?.category || '',
      kind: item?.kind || '',
      unit: item?.unit || '',
      minQty: String(item?.minQty ?? '0'),
      priceVnd: String(item?.priceVnd ?? '0'),
      sellPriceVnd: String(item?.sellPriceVnd ?? '0'),
      description: '',
      imageUrl: '',
      status: '',
    })
    setOpenEdit(true)

    if (item?.group === 'retail') {
      const productId = extractRetailProductId(item?.id)
      Promise.resolve()
        .then(() => api.get(`/api/owner/retail/products/${productId}`))
        .then((data) => {
          if (!data || typeof data !== 'object') return
          setEditForm((p) => ({
            ...p,
            categoryId: data.categoryId !== undefined && data.categoryId !== null ? String(data.categoryId) : p.categoryId,
            category: data.categoryName ?? data.kind ?? p.category,
            kind: data.kind ?? p.kind,
            sellPriceVnd: String(data.price ?? p.sellPriceVnd ?? '0'),
            description: data.description ?? '',
            imageUrl: data.imageUrl ?? '',
            status: data.status ?? '',
          }))
        })
        .catch((err) => {
          console.error(err)
        })
    }
  }

  function openVariantsForItem(item) {
    if (!item) return
    const productId = extractRetailProductId(item.id)
    setVariantsError('')
    setVariantsFor({ ...item, productId })
    setOpenVariants(true)
    Promise.resolve()
      .then(() => refreshVariantsAndProduct(productId))
      .catch((err) => {
        console.error(err)
        setVariantsError(err?.message || 'Unable to load variants')
      })
  }

  function openStockFor(item) {
    setStockForId(item?.id || '')
    setStockError('')
    setStockForm((p) => ({
      ...p,
      inventoryItemId: item?.id || '',
      importPrice: String(item?.priceVnd ?? p.importPrice ?? '0'),
      supplier: item?.supplier || p.supplier,
    }))
    setOpenStock(true)
  }

  async function onAddProduct(e) {
    e.preventDefault()
    const name = String(productForm.name || '').trim()
    if (!name) {
      setAddError('Product name is required')
      return
    }
    if (hasDangerousInput(name)) {
      setAddError('Invalid product name')
      return
    }

    if (!productForm.categoryId) {
      setAddError('Please select a category')
      return
    }

    const qty = Number(digitsOnly(productForm.qty) || 0)
    const minQty = Number(digitsOnly(productForm.minQty) || 0)
    const price = Number(digitsOnly(productForm.price) || 0)
    if (!Number.isFinite(qty) || qty < 0) {
      setAddError('Invalid quantity')
      return
    }
    if (!Number.isFinite(minQty) || minQty < 0) {
      setAddError('Invalid minimum stock')
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setAddError('Invalid purchase price')
      return
    }

    try {
      setAddError('')
      const normalizedPrice = String(price)

      await api.post('/api/owner/inventory/items', {
        group: productForm.group,
        name,
        categoryId: productForm.categoryId,
        qty: String(qty),
        minQty: String(minQty),
        unit: productForm.unit,
        priceVnd: normalizedPrice,
        supplier: productForm.supplier,
      })

      await refreshInventory()
      setProductForm((p) => ({
        ...p,
        name: '',
        categoryId: '',
        qty: '0',
        minQty: '0',
        unit: '',
        price: '0',
        supplier: '',
      }))
      closeAdd()
    } catch (err) {
      console.error(err)
      setAddError(err?.message || 'Something went wrong')
    }
  }

  async function onStockIn(e) {
    e.preventDefault()
    if (!stockForm.inventoryItemId) return

    const qty = Number(digitsOnly(stockForm.qty) || 0)
    const importPrice = Number(digitsOnly(stockForm.importPrice) || 0)
    const selectedDate = stockForm.date || getTodayDateInput()
    const today = getTodayDateInput()
    if (!Number.isFinite(qty) || qty <= 0) {
      setStockError('Quantity must be greater than 0')
      return
    }
    if (!Number.isFinite(importPrice) || importPrice <= 0) {
      setStockError('Purchase price must be greater than 0')
      return
    }
    if (selectedDate > today) {
      setStockError('Stock-in date cannot be in the future')
      return
    }

    try {
      setStockError('')
      await api.post('/api/owner/inventory/stock', {
        inventoryItemId: stockForm.inventoryItemId,
        qty: String(qty),
        importPrice: String(importPrice),
        supplier: stockForm.supplier,
        date: selectedDate,
        note: stockForm.note,
      })

      await refreshInventory()
      setStockForm({ inventoryItemId: '', qty: '0', importPrice: '0', supplier: '', date: getTodayDateInput(), note: '' })
      closeStock()
    } catch (err) {
      console.error(err)
      setStockError(err?.message || 'Something went wrong')
    }
  }

  async function onStockOut(e) {
    e.preventDefault()
    if (!stockOutForm.inventoryItemId) return

    const qty = Number(digitsOnly(stockOutForm.qty) || 0)
    const selectedDate = stockOutForm.date || getTodayDateInput()
    const today = getTodayDateInput()
    if (!Number.isFinite(qty) || qty <= 0) {
      setStockOutError('Quantity must be greater than 0')
      return
    }
    if (selectedDate > today) {
      setStockOutError('Stock-out date cannot be in the future')
      return
    }

    try {
      setStockOutError('')
      await api.post('/api/owner/inventory/stock-out', {
        inventoryItemId: stockOutForm.inventoryItemId,
        qty: String(qty),
        date: selectedDate,
        note: stockOutForm.note,
      })

      await refreshInventory()
      setStockOutForm({ inventoryItemId: '', qty: '0', date: getTodayDateInput(), note: '' })
      closeStockOut()
    } catch (err) {
      console.error(err)
      setStockOutError(err?.message || 'Something went wrong')
    }
  }

  async function onEditItem(e) {
    e.preventDefault()
    if (!editFor?.id) return

    const normalizedName = String(editForm.name || '').trim()
    if (!normalizedName) {
      setEditError('Product name is required')
      return
    }
    if (hasDangerousInput(normalizedName)) {
      setEditError('Invalid product name')
      return
    }

    try {
      setEditError('')
      if (!editForm.categoryId) {
        setEditError('Please select a category')
        return
      }

      if (editFor.group === 'retail') {
        await api.put(`/api/owner/inventory/items/${editFor.id}`, {
          name: normalizedName,
          categoryId: editForm.categoryId,
          priceVnd: digitsOnly(editForm.priceVnd),
          sellPriceVnd: digitsOnly(editForm.sellPriceVnd),
          description: editForm.description,
          imageUrl: editForm.imageUrl,
          status: editForm.status,
        })
      } else {
        await api.put(`/api/owner/inventory/items/${editFor.id}`, {
          name: normalizedName,
          categoryId: editForm.categoryId,
          unit: editForm.unit,
          minQty: editForm.minQty,
        })
      }

      await refreshInventory()
      closeEdit()
    } catch (err) {
      console.error(err)
      setEditError(err?.message || 'Something went wrong')
    }
  }

  async function onCreateVariant(e) {
    e.preventDefault()
    if (!variantsFor?.productId) return
    const variantName = String(newVariant.name || '').trim()
    if (!variantName) {
      setVariantsError('Variant name is required')
      return
    }
    if (hasDangerousInput(variantName)) {
      setVariantsError('Invalid variant name')
      return
    }

    const cap = Number(variantsProductStock ?? variantsFor?.qty ?? 0)
    const nextTotal = Number(variantsTotalStock || 0) + Number(digitsOnly(newVariant.stock) || 0)
    if (nextTotal > cap) {
      setVariantsError('Insufficient stock')
      return
    }

    try {
      setVariantsError('')
      await api.post(`/api/owner/retail/products/${variantsFor.productId}/variants`, {
        name: variantName,
        stock: digitsOnly(newVariant.stock),
      })
      await refreshVariantsAndProduct(variantsFor.productId)
      setNewVariant({ name: '', stock: '0' })
      await refreshInventory()
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

    const cap = Number(variantsProductStock ?? variantsFor?.qty ?? 0)
    if (Number(variantsTotalStock || 0) > cap) {
      setVariantsError('Insufficient stock')
      return
    }
    try {
      setVariantsError('')
      await api.put(`/api/owner/retail/variants/${variant.id}`, {
        name: normalizedName,
        stock: digitsOnly(variant.stock),
      })
      if (variantsFor?.productId) {
        await refreshVariantsAndProduct(variantsFor.productId)
      }
      await refreshInventory()
    } catch (err) {
      console.error(err)
      setVariantsError(err?.message || 'Unable to update variant')
    }
  }

  async function onDeleteVariant(variant) {
    if (!variant?.id) return
    if (!variantsFor?.productId) return
    try {
      setVariantsError('')
      await api.del(`/api/owner/retail/variants/${variant.id}`)
      await refreshVariantsAndProduct(variantsFor.productId)
      await refreshInventory()
    } catch (err) {
      console.error(err)
      setVariantsError(err?.message || 'Unable to delete variant')
    }
  }

  return (
    <div className="inventory-page">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <div className="portal-headerActions">
          <button
            type="button"
            className="portal-successBtn"
            onClick={() => {
              setStockError('')
              setOpenStock(true)
            }}
          >
            <span className="portal-successBtnIcon" aria-hidden="true">
              <IconDownload />
            </span>
            Stock In
          </button>

          <button
            type="button"
            className="portal-outlineBtn"
            onClick={() => {
              setStockOutError('')
              setOpenStockOut(true)
            }}
          >
            <span className="portal-outlineBtnIcon" aria-hidden="true">
              <IconDownload />
            </span>
            Stock Out
          </button>

          <button
            type="button"
            className="portal-primaryBtn"
            onClick={() => {
              setAddError('')
              setProductForm((p) => ({
                ...p,
                group: tab === 'retail' ? 'retail' : 'service',
              }))
              setOpenAdd(true)
            }}
          >
            <span className="portal-primaryBtnIcon" aria-hidden="true">
              +
            </span>
            Add Product
          </button>

          <button type="button" className="portal-primaryBtn" onClick={openCreateCategory}>
            <span className="portal-primaryBtnIcon" aria-hidden="true">
              +
            </span>
            Add Category
          </button>
        </div>
      </div>

      <PortalModal
        open={openAdd}
        title="Add New Product"
        onClose={closeAdd}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeAdd}>
              Cancel
            </button>
            <button type="submit" form="product-form" className="portal-modalBtn portal-modalBtnPrimary">
              Add Product
            </button>
          </>
        }
      >
        <form id="product-form" onSubmit={onAddProduct}>
          {addError ? (
            <div className="portal-formError" role="alert">
              {addError}
            </div>
          ) : null}
          <label className="portal-field">
            <span className="portal-label">Product Name <span className="products-required">*</span></span>
            <input
              className="portal-input"
              placeholder="Enter product name"
              value={productForm.name}
              onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Category <span className="products-required">*</span></span>
              <select
                className="portal-select"
                value={productForm.categoryId || ''}
                onChange={(e) => setProductForm((p) => ({ ...p, categoryId: e.target.value }))}
              >
                <option value="">-- Select category --</option>
                {categories.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Type</span>
              <select
                className="portal-select"
                value={productForm.group}
                onChange={(e) => setProductForm((p) => ({ ...p, group: e.target.value }))}
              >
                <option value="service">Supplies</option>
                <option value="retail">Retail</option>
              </select>
            </label>
          </div>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Quantity <span className="products-required">*</span></span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={productForm.qty}
                onChange={(e) => setProductForm((p) => ({ ...p, qty: digitsOnly(e.target.value) }))}
              />
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Minimum Stock</span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={productForm.minQty}
                onChange={(e) => setProductForm((p) => ({ ...p, minQty: digitsOnly(e.target.value) }))}
              />
            </label>
          </div>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Unit</span>
              <input
                className="portal-input"
                placeholder="bottle, box..."
                value={productForm.unit}
                onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))}
              />
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Purchase Price (VND)</span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={productForm.price}
                onChange={(e) => setProductForm((p) => ({ ...p, price: digitsOnly(e.target.value) }))}
              />
            </label>
          </div>

        </form>
      </PortalModal>

      <PortalModal
        open={openStock}
        title="Stock In"
        onClose={closeStock}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeStock}>
              Cancel
            </button>
            <button type="submit" form="stock-form" className="portal-modalBtn portal-modalBtnSuccess">
              Confirm Stock In
            </button>
          </>
        }
      >
        <form id="stock-form" onSubmit={onStockIn}>
          {stockError ? (
            <div className="portal-formError" role="alert">
              {stockError}
            </div>
          ) : null}

          <label className="portal-field">
            <span className="portal-label">Product</span>
            <select
              className="portal-select"
              value={stockForId || stockForm.inventoryItemId}
              onChange={(e) => {
                setStockForId('')
                const nextId = e.target.value
                const selected = items.find((it) => String(it.id) === String(nextId))
                setStockForm((p) => ({
                  ...p,
                  inventoryItemId: nextId,
                  importPrice: selected ? String(selected.priceVnd ?? p.importPrice ?? '0') : p.importPrice,
                  supplier: selected?.supplier ? selected.supplier : p.supplier,
                }))
              }}
            >
              <option value="">Select product</option>
              {stockInOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Stock-in Quantity <span className="products-required">*</span></span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={stockForm.qty}
                onChange={(e) => setStockForm((p) => ({ ...p, qty: digitsOnly(e.target.value) }))}
              />
            </label>
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Purchase Price (VND) <span className="products-required">*</span></span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={stockForm.importPrice}
                onChange={(e) => setStockForm((p) => ({ ...p, importPrice: digitsOnly(e.target.value) }))}
              />
            </label>
          </div>

          <label className="portal-field">
            <span className="portal-label">Stock-in Date</span>
            <div className="portal-inputWithIcon">
              <input
                className="portal-input"
                type="date"
                value={stockForm.date}
                max={getTodayDateInput()}
                onChange={(e) => setStockForm((p) => ({ ...p, date: e.target.value }))}
              />
              <span className="portal-inputIcon" aria-hidden="true">
                <IconCalendar />
              </span>
            </div>
          </label>

          <label className="portal-field">
            <span className="portal-label">Notes</span>
            <textarea
              className="portal-textarea"
              placeholder="Notes (optional)"
              value={stockForm.note}
              onChange={(e) => setStockForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
        </form>
      </PortalModal>

      <PortalModal
        open={openStockOut}
        title="Stock Out"
        onClose={closeStockOut}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeStockOut}>
              Cancel
            </button>
            <button type="submit" form="stock-out-form" className="portal-modalBtn portal-modalBtnPrimary">
              Confirm Stock Out
            </button>
          </>
        }
      >
        <form id="stock-out-form" onSubmit={onStockOut}>
          {stockOutError ? (
            <div className="portal-formError" role="alert">
              {stockOutError}
            </div>
          ) : null}

          <label className="portal-field">
            <span className="portal-label">Product</span>
            <select
              className="portal-select"
              value={stockForId || stockOutForm.inventoryItemId}
              onChange={(e) => {
                setStockForId('')
                setStockOutForm((p) => ({ ...p, inventoryItemId: e.target.value }))
              }}
            >
              <option value="">Select product</option>
              {stockOutOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Stock-out Quantity <span className="products-required">*</span></span>
            <input
              className="portal-input"
              inputMode="numeric"
              value={stockOutForm.qty}
              onChange={(e) => setStockOutForm((p) => ({ ...p, qty: digitsOnly(e.target.value) }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">Stock-out Date</span>
            <div className="portal-inputWithIcon">
              <input
                className="portal-input"
                type="date"
                value={stockOutForm.date}
                max={getTodayDateInput()}
                onChange={(e) => setStockOutForm((p) => ({ ...p, date: e.target.value }))}
              />
              <span className="portal-inputIcon" aria-hidden="true">
                <IconCalendar />
              </span>
            </div>
          </label>

          <label className="portal-field">
            <span className="portal-label">Notes</span>
            <textarea
              className="portal-textarea"
              placeholder="Notes (optional)"
              value={stockOutForm.note}
              onChange={(e) => setStockOutForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
        </form>
      </PortalModal>

      <PortalModal
        open={openEdit}
        title="Edit Item"
        onClose={closeEdit}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeEdit}>
              Cancel
            </button>
            <button type="submit" form="edit-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save
            </button>
          </>
        }
      >
        <form id="edit-form" onSubmit={onEditItem}>
          {editError ? (
            <div className="portal-formError" role="alert">
              {editError}
            </div>
          ) : null}
          <label className="portal-field">
            <span className="portal-label">Product Name <span className="products-required">*</span></span>
            <input
              className="portal-input"
              value={editForm.name}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Category</span>
              <select
                className="portal-select"
                value={editForm.categoryId || ''}
                onChange={(e) => {
                  const nextId = e.target.value
                  const cat = categoriesById.get(String(nextId))
                  setEditForm((p) => ({
                    ...p,
                    categoryId: nextId,
                    category: cat?.name || p.category,
                    kind: cat?.name || p.kind,
                  }))
                }}
              >
                <option value="">-- Select category --</option>
                {categories.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {editFor?.group === 'retail' ? (
            <>
              <div className="portal-modalGrid2">
                <label className="portal-field" style={{ marginTop: 12 }}>
                  <span className="portal-label">Status <span className="products-required">*</span></span>
                  <select
                    className="portal-select"
                    value={editForm.status || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="">-- Select status --</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    {editForm.status && editForm.status !== 'active' && editForm.status !== 'inactive' ? (
                      <option value={editForm.status}>{editForm.status}</option>
                    ) : null}
                  </select>
                </label>
              </div>

              <div className="portal-modalGrid2">
                <label className="portal-field" style={{ marginTop: 12 }}>
                  <span className="portal-label">Purchase Price (VND)</span>
                  <input
                    className="portal-input"
                    inputMode="numeric"
                    value={editForm.priceVnd}
                    onChange={(e) => setEditForm((p) => ({ ...p, priceVnd: digitsOnly(e.target.value) }))}
                  />
                </label>

                <label className="portal-field" style={{ marginTop: 12 }}>
                  <span className="portal-label">Sell Price (VND)</span>
                  <input
                    className="portal-input"
                    inputMode="numeric"
                    value={editForm.sellPriceVnd}
                    onChange={(e) => setEditForm((p) => ({ ...p, sellPriceVnd: digitsOnly(e.target.value) }))}
                  />
                </label>
              </div>

              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Image (URL)</span>
                <input
                  className="portal-input"
                  placeholder="https://..."
                  value={editForm.imageUrl}
                  onChange={(e) => setEditForm((p) => ({ ...p, imageUrl: e.target.value }))}
                />
              </label>

              <div className="portal-rowActions" style={{ marginTop: 8 }}>
                <input
                  ref={editImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={onPickEditImage}
                />
                <button
                  type="button"
                  className="portal-ghostBtn"
                  onClick={() => editImageInputRef.current?.click()}
                >
                  Add Image
                </button>
              </div>

              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Description</span>
                <textarea
                  className="portal-textarea"
                  placeholder="Product description (optional)"
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                />
              </label>

              <div className="portal-rowActions" style={{ marginTop: 12 }}>
                <button type="button" className="portal-ghostBtn" onClick={() => openVariantsForItem(editFor)}>
                  Manage Variants
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Unit</span>
                <input
                  className="portal-input"
                  value={editForm.unit}
                  onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))}
                />
              </label>

              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Minimum Stock</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  value={editForm.minQty}
                  onChange={(e) => setEditForm((p) => ({ ...p, minQty: digitsOnly(e.target.value) }))}
                />
              </label>
            </>
          )}
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
            <button type="submit" form="cat-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save
            </button>
          </>
        }
      >
        <form id="cat-form" onSubmit={onCreateCategory}>
          {catError ? (
            <div className="portal-formError" role="alert">
              {catError}
            </div>
          ) : null}

          <label className="portal-field">
            <span className="portal-label">Category Name</span>
            <input
              className="portal-input"
              placeholder="e.g. Skincare, Nail Polish..."
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
          Product stock: <b>{variantsProductStock ?? variantsFor?.qty ?? 0}</b> | Total variant stock:{' '}
          <b>{variantsTotalStock}</b>
        </div>

        {Number(variantsTotalStock || 0) > Number(variantsProductStock ?? variantsFor?.qty ?? 0) ? (
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
                          setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, stock: digitsOnly(e.target.value) } : x)))
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
                  placeholder="e.g. Size M / Red..."
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

      <div className="portal-invKpiGrid">
        <PortalCard
          className="portal-kpi"
          title="Total Stock-in Value"
          style={{
            '--kpi-accent': 'var(--info)',
            '--kpi-icon-bg': 'var(--info-soft)',
          }}
          right={
            <div className="portal-kpiIcon" aria-hidden="true">
              <IconCube />
            </div>
          }
        >
          <div className="portal-kpiValue">{formatVnd(totalImportVnd)} VND</div>
        </PortalCard>

        <PortalCard
          className="portal-kpi"
          title="Total Stock-out Value"
          style={{
            '--kpi-accent': 'var(--success)',
            '--kpi-icon-bg': 'var(--success-soft)',
          }}
          right={
            <div className="portal-kpiIcon" aria-hidden="true">
              <IconCube />
            </div>
          }
        >
          <div className="portal-kpiValue">{formatVnd(totalStockOutVnd)} VND</div>
        </PortalCard>

        <PortalCard
          className="portal-kpi"
          title="Stock Status"
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
          <div className="portal-kpiValue">{outOfStockCount}/{lowStockCount}/{healthyStockCount}</div>
          <div className="portal-pageSubtitle">Out / Low / Healthy</div>
        </PortalCard>
      </div>

      <div className="portal-invTabs">
        <div className="portal-seg" role="tablist" aria-label="Inventory tabs">
          <button
            type="button"
            className={`portal-segBtn ${tab === 'all' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'all'}
            onClick={() => setTab('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'service' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'service'}
            onClick={() => setTab('service')}
          >
            Service Supplies
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'retail' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'retail'}
            onClick={() => setTab('retail')}
          >
            Retail Products
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'history' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
          >
            Stock In/Out History
          </button>
        </div>
      </div>

      <div className="portal-search portal-searchFull" role="search">
        <span className="portal-searchIcon" aria-hidden="true">
          <IconSearch />
        </span>
        <input
          className="portal-searchInput"
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="inventory-filterRow">
        <label className="portal-field inventory-filterField">
          <span className="portal-label">Category</span>
          <select className="portal-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {[...new Set(items.map((i) => String(i.category || '').trim()).filter(Boolean))].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {tab !== 'history' ? (
          <label className="portal-field inventory-filterField">
            <span className="portal-label">Stock state</span>
            <select className="portal-select" value={stockStateFilter} onChange={(e) => setStockStateFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="out">Out of stock</option>
              <option value="low">Low stock</option>
              <option value="healthy">Healthy</option>
            </select>
          </label>
        ) : (
          <>
            <label className="portal-field inventory-filterField">
              <span className="portal-label">Type</span>
              <select className="portal-select" value={historyTypeFilter} onChange={(e) => setHistoryTypeFilter(e.target.value)}>
                <option value="all">All types</option>
                <option value="stock in">Stock In</option>
                <option value="stock out">Stock Out</option>
              </select>
            </label>

            <label className="portal-field inventory-filterField">
              <span className="portal-label">From date</span>
              <input className="portal-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>

            <label className="portal-field inventory-filterField">
              <span className="portal-label">To date</span>
              <input className="portal-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </>
        )}
      </div>

      {tab === 'history' ? (
        <PortalCard
          className="portal-invTableCard"
          title={
            <span className="portal-invHistoryTitle">
              <span className="portal-invHistoryIcon" aria-hidden="true">
                <IconClock />
              </span>
              Stock in/out history
            </span>
          }
        >
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction Type</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Total</th>
                  <th>Performed By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((h, idx) => (
                  <tr key={`${h.date}-${h.product}-${idx}`}>
                    <td>{h.date}</td>
                    <td>
                      <span className={`portal-badge ${h.type === 'Stock In' ? 'confirmed' : 'canceled'}`.trim()}>
                        {h.type}
                      </span>
                    </td>
                    <td className="portal-invName">{h.product}</td>
                    <td>
                      <span className={`portal-invQty ${h.qty >= 0 ? 'pos' : 'neg'}`.trim()}>
                        {h.qty >= 0 ? `+${h.qty}` : h.qty}
                      </span>
                    </td>
                    <td>{Number.isFinite(Number(h.totalVnd)) ? `${formatVnd(h.totalVnd)} VND` : '-'}</td>
                    <td className="portal-invBy">{h.by}</td>
                    <td className="portal-invNote">{h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PortalCard>
      ) : tab === 'all' ? (
        <PortalCard className="portal-invTableCard" title="Inventory List">
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Stock</th>
                  <th>Unit</th>
                  <th>Price</th>
                  <th>Total</th>
                  <th>Last Stock-in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((it) => {
                  const low = Number(it.minQty || 0) > 0 && Number(it.stock || 0) <= Number(it.minQty || 0)
                  const typeLabel = it.group === 'retail' ? 'Retail' : 'Supplies'
                  const total = Number(it.priceVnd || 0) * Number(it.stock || 0)
                  return (
                    <tr key={it.id || it.name}>
                      <td className="portal-invName">{it.name}</td>
                      <td>
                        <span className="portal-invPill">{it.category || '-'}</span>
                      </td>
                      <td>
                        <span className="portal-invPill">{typeLabel}</span>
                      </td>
                      <td>
                        {low ? (
                          <span className="portal-stockLow">
                            {it.stock}
                            <span className="portal-stockIcon" aria-hidden="true">
                              <IconAlertTriangle />
                            </span>
                          </span>
                        ) : (
                          <span>{it.stock}</span>
                        )}
                      </td>
                      <td>{it.unit || '-'}</td>
                      <td>{formatVnd(it.priceVnd)} VND</td>
                      <td>{formatVnd(total)} VND</td>
                      <td>{it.lastIn || '-'}</td>
                      <td>
                        <div className="portal-rowActions">
                          <button type="button" className="portal-ghostBtn" onClick={() => openEditFor(it)}>
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </PortalCard>
      ) : (
        <div className="portal-invSections">
          {(tab === 'all' || tab === 'service') && serviceItems.length > 0 ? (
            <PortalCard className="portal-invSection">
              <div className="portal-invSectionHead">
                <h3 className="portal-invSectionTitle">Service Supplies</h3>
              </div>
              <div className="portal-invCardGrid" role="list">
                {serviceItems.map((it) => {
                  const low = Number(it.minQty || 0) > 0 && Number(it.stock || 0) <= Number(it.minQty || 0)
                  return (
                    <PortalCard
                      key={it.id || it.name}
                      className={`portal-invItemCard ${low ? 'low' : ''}`.trim()}
                      role="listitem"
                    >
                      <div className="portal-invItemTop">
                        <span className="portal-invPill">{it.category}</span>
                        {low ? (
                          <span className="portal-invLowBadge">
                            <span className="portal-invLowIcon" aria-hidden="true">
                              <IconAlertTriangle />
                            </span>
                            Low stock
                          </span>
                        ) : null}
                      </div>
                      <div className="portal-invItemName">{it.name}</div>

                      <div className="portal-invMeta">
                        <div className="portal-invMetaRow">
                          <span className="portal-invMetaLabel">Stock:</span>
                          <span className={`portal-invMetaValue ${low ? 'low' : ''}`.trim()}>
                            {it.stock} {it.unit}
                          </span>
                        </div>
                        <div className="portal-invMetaRow">
                          <span className="portal-invMetaLabel">Minimum:</span>
                          <span className="portal-invMetaValue">
                            {it.minQty} {it.unit}
                          </span>
                        </div>
                        <div className="portal-invMetaRow">
                          <span className="portal-invMetaLabel">Price:</span>
                          <span className="portal-invPrice">{formatVnd(it.priceVnd)} VND</span>
                        </div>
                      </div>

                      <button type="button" className="portal-invStockBtn" onClick={() => openStockFor(it)}>
                        <span className="portal-invStockBtnIcon" aria-hidden="true">
                          <IconDownload />
                        </span>
                        Stock In
                      </button>
                    </PortalCard>
                  )
                })}
              </div>
            </PortalCard>
          ) : null}

          {(tab === 'all' || tab === 'retail') && retailItems.length > 0 ? (
            <PortalCard className="portal-invSection">
              <div className="portal-invSectionHead">
                <h3 className="portal-invSectionTitle">Retail Products</h3>
              </div>
              <div className="portal-invCardGrid" role="list">
                {retailItems.map((it) => {
                  const low = Number(it.minQty || 0) > 0 && Number(it.stock || 0) <= Number(it.minQty || 0)
                  return (
                    <PortalCard
                      key={it.id || it.name}
                      className={`portal-invItemCard ${low ? 'low' : ''}`.trim()}
                      role="listitem"
                    >
                      <div className="portal-invItemTop">
                        <span className="portal-invPill">{it.category}</span>
                        {low ? (
                          <span className="portal-invLowBadge">
                            <span className="portal-invLowIcon" aria-hidden="true">
                              <IconAlertTriangle />
                            </span>
                            Low stock
                          </span>
                        ) : null}
                      </div>
                      <div className="portal-invItemName">{it.name}</div>

                      <div className="portal-invMeta">
                        <div className="portal-invMetaRow">
                          <span className="portal-invMetaLabel">Stock:</span>
                          <span className={`portal-invMetaValue ${low ? 'low' : ''}`.trim()}>
                            {it.stock} {it.unit}
                          </span>
                        </div>
                        <div className="portal-invMetaRow">
                          <span className="portal-invMetaLabel">Price:</span>
                          <span className="portal-invPrice">{formatVnd(it.priceVnd)} VND</span>
                        </div>
                      </div>

                      <button type="button" className="portal-invStockBtn" onClick={() => openStockFor(it)}>
                        <span className="portal-invStockBtnIcon" aria-hidden="true">
                          <IconDownload />
                        </span>
                        Stock In
                      </button>
                    </PortalCard>
                  )
                })}
              </div>
            </PortalCard>
          ) : null}
        </div>
      )}

      <div className="inventory-pagination">
        <button
          type="button"
          className="portal-ghostBtn"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span className="inventory-paginationText">Page {page} / {totalPages}</span>
        <button
          type="button"
          className="portal-ghostBtn"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  )
}

