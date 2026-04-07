import React, { useEffect, useMemo, useRef, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/inventory.css'

import {
  IconAlertTriangle,
  IconClock,
  IconCube,
  IconDownload,
  IconSearch,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'
import { getToken } from '../../lib/auth.js'

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

function getDefaultExpiryDateInput() {
  const base = new Date()
  base.setFullYear(base.getFullYear() + 1)
  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
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

function isValidDateInput(value) {
  if (!value) return true
  const d = new Date(value)
  return !Number.isNaN(d.getTime())
}

function extractRetailProductId(value) {
  if (!value) return ''
  const raw = String(value)
  const idx = raw.indexOf(':')
  if (idx > 0) return raw.slice(idx + 1)
  return raw
}

function parseSkuKey(value) {
  const raw = String(value || '')
  const idx = raw.indexOf(':')
  if (idx <= 0) return { type: '', id: raw }
  return { type: raw.slice(0, idx).toLowerCase(), id: raw.slice(idx + 1) }
}

function isVariantItem(item) {
  return String(item?.skuType || '').toLowerCase() === 'variant' || Boolean(item?.variantId)
}

function toStockOptionLabel(item) {
  const name = String(item?.name || '').trim()
  if (isVariantItem(item)) return `${name} (Variant)`
  if (String(item?.group || '').toLowerCase() === 'retail') return `${name} (Retail)`
  return name
}

function buildInventorySkuFromSelection(productItem, variantId) {
  if (!productItem) return ''
  const group = String(productItem?.group || '').toLowerCase()
  if (group === 'retail') {
    const v = String(variantId || '').trim()
    if (v) return `variant:${v}`
  }
  return String(productItem?.id || '').trim()
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

function resolveImportPrice(item) {
  const lots = Array.isArray(item?.lots) ? item.lots : []
  if (lots.length) {
    const totalQty = lots.reduce((sum, lot) => sum + Number(lot?.remaining || 0), 0)
    const totalCost = lots.reduce((sum, lot) => sum + Number(lot?.remaining || 0) * Number(lot?.price || 0), 0)
    if (totalQty > 0 && Number.isFinite(totalCost)) return totalCost / totalQty
  }
  const n = Number(item?.priceVnd)
  return Number.isFinite(n) && n > 0 ? n : null
}

function resolveStockInImportPriceInputValue(item) {
  const lots = Array.isArray(item?.lots) ? item.lots : []
  const lotSummary = summarizeLots(lots)
  if (lots.length > 1 && lotSummary.distinctPrices > 1) {
    return 'Multiple'
  }
  const price = resolveImportPrice(item)
  if (price === null) return '0'
  return String(Math.round(Number(price) || 0))
}

function resolveStockInSellPriceInputValue(item) {
  const price = resolveSellPrice(item)
  if (price === null) return ''
  return String(Math.round(Number(price) || 0))
}

function resolveSellPrice(item) {
  const n = Number(item?.sellPriceVnd)
  return Number.isFinite(n) && n > 0 ? n : null
}

function formatShortDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB')
}

function formatDateInput(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function summarizeLots(lots) {
  const prices = new Set()
  for (const lot of lots || []) {
    const price = Number(lot?.price || 0)
    if (Number.isFinite(price) && price > 0) prices.add(price)
  }
  return { distinctPrices: prices.size }
}

function extractVariantFromLotNote(note) {
  const raw = String(note || '').trim()
  if (!raw) return ''
  const m = raw.match(/^\[\s*Variant\s*:\s*([^\]]+)\]/i)
  if (!m) return ''
  return String(m[1] || '').trim()
}

function stripVariantPrefixFromLotNote(note) {
  const raw = String(note || '')
  return raw.replace(/^\[\s*Variant\s*:\s*[^\]]+\]\s*/i, '').trim()
}

function composeLotNoteWithVariant(variantName, note) {
  const cleanVariant = String(variantName || '').trim()
  const cleanNote = String(note || '').trim()
  if (!cleanVariant) return cleanNote
  if (!cleanNote) return `[Variant: ${cleanVariant}]`
  return `[Variant: ${cleanVariant}] ${cleanNote}`
}

function listSupplyVariantsFromLots(lots) {
  const byName = new Map()
  for (const lot of lots || []) {
    const remaining = Number(lot?.remaining || 0)
    if (!Number.isFinite(remaining) || remaining <= 0) continue
    const variantName = extractVariantFromLotNote(lot?.note)
    if (!variantName) continue
    byName.set(variantName, Number(byName.get(variantName) || 0) + remaining)
  }
  return Array.from(byName.entries())
    .sort((a, b) => compareText(a[0], b[0]))
    .map(([name, stock]) => ({ name, stock }))
}

function isBelowMinThreshold(item) {
  const stock = Number(item?.stock || 0)
  const min = Number(item?.minQty || 0)
  return Number.isFinite(min) && min > 0 && stock < min
}

function resolveUiErrorMessage(err, fallback = 'Something went wrong') {
  const direct = String(err?.message || '').trim()
  if (direct) return direct
  const bodyMsg = String(err?.body?.message || err?.body?.error || '').trim()
  if (bodyMsg) return bodyMsg
  const raw = String(err?.raw || '').trim()
  if (raw) return raw
  return fallback
}

const OWNER_INVENTORY_UI_STATE_KEY = 'ownerInventoryPage.ui.v1'

function readInventoryUiState() {
  try {
    const raw = sessionStorage.getItem(OWNER_INVENTORY_UI_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeInventoryUiState(value) {
  try {
    sessionStorage.setItem(OWNER_INVENTORY_UI_STATE_KEY, JSON.stringify(value))
  } catch {
    // ignore storage write failures
  }
}

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')

const MAX_INVENTORY_QTY = 99999999
const MAX_PRICE_VND = 9999999999
const STOCK_IN_NEW_VARIANT_VALUE = '__new_variant__'
const STOCK_IN_NEW_SUPPLY_VARIANT_VALUE = '__new_supply_variant__'
const DEFAULT_RETAIL_VARIANT_NAME = 'Default'

function ensureRetailVariantDrafts(rawVariants, fallbackStock = '0') {
  const mapped = (Array.isArray(rawVariants) ? rawVariants : [])
    .map((v) => ({
      name: String(v?.name || '').trim(),
      stock: String(v?.stock || '0'),
    }))
    .slice(0, 20)

  if (mapped.length > 0) return mapped
  return [{ name: DEFAULT_RETAIL_VARIANT_NAME, stock: String(fallbackStock || '0') }]
}

function computeAutoMinQty(qtyDigits) {
  const qty = Number(digitsOnly(qtyDigits) || 0)
  if (!Number.isFinite(qty) || qty <= 0) return '0'
  return String(Math.ceil(qty * 0.1))
}

function InventorySearchableDropdown({
  value,
  onChange,
  options,
  placeholder,
  emptyValueLabel = '',
  onCreateFromQuery,
  createOptionLabel,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const selected = useMemo(
    () => (options || []).find((opt) => String(opt?.value || '') === String(value || '')),
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return options || []
    return (options || []).filter((opt) => String(opt?.label || '').toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
    return () => clearTimeout(timer)
  }, [open])

  function onPick(nextValue) {
    onChange(nextValue)
    setOpen(false)
    setQuery('')
  }

  function pickFirstMatchedOption() {
    const first = (filteredOptions || []).find((opt) => !opt?.disabled)
    if (first) onPick(String(first.value))
  }

  function createFromQuery() {
    const nextLabel = String(query || '').trim()
    if (!nextLabel || typeof onCreateFromQuery !== 'function') return
    onCreateFromQuery(nextLabel)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="inventory-searchSelect" ref={rootRef}>
      <button
        type="button"
        className="portal-select inventory-searchSelectTrigger"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
            setQuery('')
          }
        }}
      >
        <span className="inventory-searchSelectText">{selected?.label || placeholder}</span>
        <span className="inventory-searchSelectCaret" aria-hidden="true">v</span>
      </button>

      {open ? (
        <div className="inventory-searchSelectMenu">
          <input
            ref={inputRef}
            className="portal-input inventory-searchSelectInput"
            placeholder="Type to search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
                setQuery('')
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                const hasMatchedOption = (filteredOptions || []).some((opt) => !opt?.disabled)
                if (hasMatchedOption) {
                  pickFirstMatchedOption()
                } else {
                  createFromQuery()
                }
              }
            }}
          />
          <div className="inventory-searchSelectList">
            {emptyValueLabel ? (
              <button
                type="button"
                className={`inventory-searchSelectOption ${String(value || '') === '' ? 'is-active' : ''}`.trim()}
                onClick={() => onPick('')}
              >
                {emptyValueLabel}
              </button>
            ) : null}

            {typeof onCreateFromQuery === 'function' && String(query || '').trim() ? (
              <button
                type="button"
                className="inventory-searchSelectOption"
                onClick={createFromQuery}
              >
                {typeof createOptionLabel === 'function'
                  ? createOptionLabel(String(query || '').trim())
                  : `+ Add "${String(query || '').trim()}"`}
              </button>
            ) : null}

            {filteredOptions.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                className={`inventory-searchSelectOption ${String(opt.value) === String(value || '') ? 'is-active' : ''}`.trim()}
                onClick={() => onPick(opt.value)}
                disabled={Boolean(opt.disabled)}
              >
                {opt.label}
              </button>
            ))}

            {!filteredOptions.length ? (
              <div className="inventory-searchSelectEmpty">No product found</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function OwnerInventoryPage() {
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stockStateFilter, setStockStateFilter] = useState('all')
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [openAdd, setOpenAdd] = useState(false)
  const [openStock, setOpenStock] = useState(false)
  const [openStockOut, setOpenStockOut] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false)
  const [openLotEdit, setOpenLotEdit] = useState(false)
  const [openLotDeleteConfirm, setOpenLotDeleteConfirm] = useState(false)
  const [addError, setAddError] = useState('')
  const [stockError, setStockError] = useState('')
  const [stockOutError, setStockOutError] = useState('')
  const [stockNote, setStockNote] = useState('')
  const [stockOutNote, setStockOutNote] = useState('')
  const [fifoPreview, setFifoPreview] = useState([])
  const [fifoPreviewError, setFifoPreviewError] = useState('')
  const [fifoPreviewLoading, setFifoPreviewLoading] = useState(false)
  const [expandedLots, setExpandedLots] = useState([])
  const [editError, setEditError] = useState('')
  const [lotEditError, setLotEditError] = useState('')
  const [items, setItems] = useState([])
  const [stockForId, setStockForId] = useState('')
  const [history, setHistory] = useState([])
  const [lotEditFor, setLotEditFor] = useState(null)
  const [lotEditForm, setLotEditForm] = useState({
    variantName: '',
    remainingQty: '0',
    price: '0',
    sellPrice: '',
    receivedAt: getTodayDateInput(),
    expiryDate: '',
    supplier: '',
    note: '',
  })

  const [categories, setCategories] = useState([])
  const [openCat, setOpenCat] = useState(false)
  const [catError, setCatError] = useState('')
  const [catForm, setCatForm] = useState({ name: '', description: '' })
  const [openImport, setOpenImport] = useState(false)
  const [importError, setImportError] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importFileName, setImportFileName] = useState('')
  const [importReport, setImportReport] = useState(null)
  const [importOptions, setImportOptions] = useState({
    duplicateMode: 'update',
    updatePrices: true,
  })

  const [editFor, setEditFor] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    group: 'service',
    stock: '0',
    categoryId: '',
    category: '',
    kind: '',
    unit: '',
    minQty: '0',
    priceVnd: '0',
    sellPriceVnd: '0',
    receivedDate: getTodayDateInput(),
    expiryDate: '',
    description: '',
    imageUrl: '',
    images: [],
    status: '',
  })

  const [productForm, setProductForm] = useState({
    group: 'retail',
    name: '',
    categoryId: '',
    qty: '',
    minQty: '',
    unit: '',
    price: '0',
    sellPrice: '',
    supplier: '',
    receivedDate: getTodayDateInput(),
    expiryDate: getDefaultExpiryDateInput(),
    description: '',
    images: [],
    imageUrl: '',
    variants: ensureRetailVariantDrafts([], '0'),
  })

  const [addImageIdx, setAddImageIdx] = useState(-1)

  const [stockForm, setStockForm] = useState({
    productId: '',
    variantId: '',
    newVariantName: '',
    inventoryItemId: '',
    qty: '0',
    importPrice: '0',
    sellPrice: '',
    supplier: '',
    date: getTodayDateInput(),
    expiryDate: getDefaultExpiryDateInput(),
    note: '',
  })

  const [stockOutForm, setStockOutForm] = useState({
    productId: '',
    variantId: '',
    supplyVariantName: '',
    inventoryItemId: '',
    qty: '0',
    date: getTodayDateInput(),
    note: '',
  })

  const addImageInputRef = useRef(null)
  const editImageInputRef = useRef(null)
  const importFileInputRef = useRef(null)
  const dragIndexRef = useRef(null)
  const hasRestoredUiRef = useRef(false)

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to read file'))
      reader.readAsDataURL(file)
    })
  }

  async function onPickAddImage(e) {
    const file = e?.target?.files?.[0]
    if (!file) return

    try {
      setAddError('')
      const dataUrl = await readFileAsDataUrl(file)
      const uploaded = await api.post('/api/owner/retail/uploads/image', { dataUrl })
      setProductForm((p) => {
        const current = Array.isArray(p.images) ? p.images : []
        if (current.length >= 4) return p
        const next = [...current, uploaded?.url || ''].filter(Boolean).slice(0, 4)
        setAddImageIdx(next.length - 1)
        return {
          ...p,
          imageUrl: next[0] || '',
          images: next,
        }
      })
    } catch (err) {
      console.error(err)
      setAddError(err?.message || 'Unable to upload image')
    } finally {
      if (e?.target) e.target.value = ''
    }
  }

  function onRemoveAddImageAt(index) {
    setProductForm((p) => {
      const current = Array.isArray(p.images) ? p.images : []
      const next = current.filter((_, i) => i !== index)
      const nextActive = next.length ? Math.min(index, next.length - 1) : -1
      setAddImageIdx(nextActive)
      return {
        ...p,
        images: next,
        imageUrl: next[0] || '',
      }
    })
  }

  async function onPickEditImage(e) {
    const file = e?.target?.files?.[0]
    if (!file) return

    try {
      setEditError('')
      const dataUrl = await readFileAsDataUrl(file)
      const uploaded = await api.post('/api/owner/retail/uploads/image', { dataUrl })
      setEditForm((p) => {
        const current = Array.isArray(p.images) ? p.images : []
        if (current.length >= 4) return p
        const next = [...current, uploaded?.url || ''].filter(Boolean).slice(0, 4)
        return {
          ...p,
          imageUrl: next[0] || '',
          images: next,
        }
      })
    } catch (err) {
      console.error(err)
      setEditError(err?.message || 'Unable to upload image')
    } finally {
      if (e?.target) e.target.value = ''
    }
  }

  function onEditImageDragStart(index, e) {
    dragIndexRef.current = index
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    } catch  {
      // some browsers may throw when setting drag data for images
    }
  }

  function onEditImageDragOver(index, e) {
    e.preventDefault()
    try {
      e.dataTransfer.dropEffect = 'move'
    } catch  {
      // some browsers may throw when setting drag data for images
    }
  }

  function onEditImageDrop(index, e) {
    e.preventDefault()
    const src = dragIndexRef.current
    if (src === null || src === undefined) return
    setEditForm((p) => {
      const current = Array.isArray(p.images) ? [...p.images] : []
      if (!current.length) return p
      const s = Number(src)
      const t = Number(index)
      if (s === t) return p
      const moved = current.splice(s, 1)[0]
      current.splice(t, 0, moved)
      return {
        ...p,
        images: current,
        imageUrl: current[0] || '',
      }
    })
    dragIndexRef.current = null
  }

  const [openVariants, setOpenVariants] = useState(false)
  const [variantsError, setVariantsError] = useState('')
  const [variants, setVariants] = useState([])
  const [variantsFor, setVariantsFor] = useState(null)
  const [newVariant, setNewVariant] = useState({ name: '', stock: '0' })
  const [variantsProductStock, setVariantsProductStock] = useState(null)

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
        className="inventory-sortToggle"
        aria-label={`Sort by ${label}`}
        onClick={() => onToggleSort(field)}
      >
        <span className={`inventory-sortTriangle up ${sortBy === field && sortOrder === 'asc' ? 'is-active' : ''}`.trim()} aria-hidden="true">▲</span>
        <span className={`inventory-sortTriangle down ${sortBy === field && sortOrder === 'desc' ? 'is-active' : ''}`.trim()} aria-hidden="true">▼</span>
      </button>
    )
  }

  const variantsTotalStock = useMemo(() => {
    return variants.reduce((sum, v) => sum + Number(digitsOnly(v?.stock ?? 0) || 0), 0)
  }, [variants])

  async function refreshInventory() {
    try {
      setLoadError('')
      const data = await api.get('/api/owner/inventory')
      if (data && typeof data === 'object') {
        if (Array.isArray(data.items)) setItems(data.items)
        if (Array.isArray(data.history)) setHistory(data.history)
      }
    } catch (err) {
      console.error(err)
      setLoadError(err?.message || 'Unable to load inventory data')
    }
  }

  async function refreshCategories() {
    try {
      const list = await api.get('/api/owner/retail/categories')
      setCategories(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error(err)
      setLoadError((prev) => prev || err?.message || 'Unable to load categories')
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

  useEffect(() => {
    if (hasRestoredUiRef.current) return
    const saved = readInventoryUiState()
    if (!saved || typeof saved !== 'object') {
      hasRestoredUiRef.current = true
      return
    }

    if (typeof saved.tab === 'string') setTab(saved.tab)
    if (typeof saved.query === 'string') setQuery(saved.query)
    if (typeof saved.categoryFilter === 'string') setCategoryFilter(saved.categoryFilter)
    if (typeof saved.stockStateFilter === 'string') setStockStateFilter(saved.stockStateFilter)
    if (typeof saved.historyTypeFilter === 'string') setHistoryTypeFilter(saved.historyTypeFilter)
    if (typeof saved.sortBy === 'string') setSortBy(saved.sortBy)
    if (saved.sortOrder === 'asc' || saved.sortOrder === 'desc') setSortOrder(saved.sortOrder)
    if (typeof saved.fromDate === 'string') setFromDate(saved.fromDate)
    if (typeof saved.toDate === 'string') setToDate(saved.toDate)

    if (saved.openAdd === true || saved.openAdd === false) setOpenAdd(saved.openAdd)
    if (saved.productForm && typeof saved.productForm === 'object') {
      const restoredGroup = saved.productForm.group === 'service' ? 'service' : 'retail'
      const restoredVariants = Array.isArray(saved.productForm.variants)
        ? saved.productForm.variants
            .map((v) => ({
              name: String(v?.name || ''),
              stock: String(v?.stock || '0'),
            }))
            .slice(0, 20)
        : []
      setProductForm({
        group: restoredGroup,
        name: String(saved.productForm.name || ''),
        categoryId: String(saved.productForm.categoryId || ''),
        qty: String(saved.productForm.qty || ''),
        minQty: String(saved.productForm.minQty || ''),
        unit: String(saved.productForm.unit || ''),
        price: String(saved.productForm.price || '0'),
        sellPrice: String(saved.productForm.sellPrice || ''),
        supplier: String(saved.productForm.supplier || ''),
        receivedDate: String(saved.productForm.receivedDate || getTodayDateInput()),
        expiryDate: String(saved.productForm.expiryDate || getDefaultExpiryDateInput()),
        description: String(saved.productForm.description || ''),
        images: Array.isArray(saved.productForm.images) ? saved.productForm.images.filter(Boolean).slice(0, 4) : [],
        imageUrl: String(saved.productForm.imageUrl || ''),
        variants: restoredGroup === 'retail'
          ? ensureRetailVariantDrafts(restoredVariants, String(saved.productForm.qty || '0'))
          : [],
      })
    }

    if (saved.openStock === true || saved.openStock === false) setOpenStock(saved.openStock)
    if (saved.stockForm && typeof saved.stockForm === 'object') {
      setStockForm({
        productId: String(saved.stockForm.productId || ''),
        variantId: String(saved.stockForm.variantId || ''),
        newVariantName: String(saved.stockForm.newVariantName || ''),
        inventoryItemId: String(saved.stockForm.inventoryItemId || ''),
        qty: String(saved.stockForm.qty || '0'),
        importPrice: String(saved.stockForm.importPrice || '0'),
        sellPrice: String(saved.stockForm.sellPrice || ''),
        supplier: String(saved.stockForm.supplier || ''),
        date: String(saved.stockForm.date || getTodayDateInput()),
        expiryDate: String(saved.stockForm.expiryDate || getDefaultExpiryDateInput()),
        note: String(saved.stockForm.note || ''),
      })
    }

    if (saved.openStockOut === true || saved.openStockOut === false) setOpenStockOut(saved.openStockOut)
    if (saved.stockOutForm && typeof saved.stockOutForm === 'object') {
      setStockOutForm({
        productId: String(saved.stockOutForm.productId || ''),
        variantId: String(saved.stockOutForm.variantId || ''),
        supplyVariantName: String(saved.stockOutForm.supplyVariantName || ''),
        inventoryItemId: String(saved.stockOutForm.inventoryItemId || ''),
        qty: String(saved.stockOutForm.qty || '0'),
        date: String(saved.stockOutForm.date || getTodayDateInput()),
        note: String(saved.stockOutForm.note || ''),
      })
    }

    if (saved.openEdit === true || saved.openEdit === false) setOpenEdit(saved.openEdit)
    if (saved.editFor && typeof saved.editFor === 'object') setEditFor(saved.editFor)
    if (saved.editForm && typeof saved.editForm === 'object') {
      setEditForm({
        name: String(saved.editForm.name || ''),
        group: saved.editForm.group === 'retail' ? 'retail' : 'service',
        stock: String(saved.editForm.stock || '0'),
        categoryId: String(saved.editForm.categoryId || ''),
        category: String(saved.editForm.category || ''),
        kind: String(saved.editForm.kind || ''),
        unit: String(saved.editForm.unit || ''),
        minQty: String(saved.editForm.minQty || '0'),
        priceVnd: String(saved.editForm.priceVnd || '0'),
        sellPriceVnd: String(saved.editForm.sellPriceVnd || ''),
        receivedDate: String(saved.editForm.receivedDate || getTodayDateInput()),
        expiryDate: String(saved.editForm.expiryDate || ''),
        description: String(saved.editForm.description || ''),
        imageUrl: String(saved.editForm.imageUrl || ''),
        images: Array.isArray(saved.editForm.images) ? saved.editForm.images.filter(Boolean).slice(0, 8) : [],
        status: String(saved.editForm.status || ''),
      })
    }

    if (saved.openCat === true || saved.openCat === false) setOpenCat(saved.openCat)
    if (saved.catForm && typeof saved.catForm === 'object') {
      setCatForm({
        name: String(saved.catForm.name || ''),
        description: String(saved.catForm.description || ''),
      })
    }

    hasRestoredUiRef.current = true
  }, [])

  useEffect(() => {
    if (!hasRestoredUiRef.current) return
    writeInventoryUiState({
      tab,
      query,
      categoryFilter,
      stockStateFilter,
      historyTypeFilter,
      sortBy,
      sortOrder,
      fromDate,
      toDate,
      openAdd,
      productForm,
      openStock,
      stockForm,
      openStockOut,
      stockOutForm,
      openEdit,
      editFor,
      editForm,
      openCat,
      catForm,
      openImport,
      importOptions,
    })
  }, [
    tab,
    query,
    categoryFilter,
    stockStateFilter,
    historyTypeFilter,
    sortBy,
    sortOrder,
    fromDate,
    toDate,
    openAdd,
    productForm,
    openStock,
    stockForm,
    openStockOut,
    stockOutForm,
    openEdit,
    editFor,
    editForm,
    openCat,
    catForm,
    openImport,
    importOptions,
  ])

  const productOptions = useMemo(
    () => items.map((i) => ({
      id: i.id,
      name: i.name,
      group: i.group,
      skuType: i?.skuType || '',
      variantId: i?.variantId || null,
      productId: i?.productId || null,
      stock: Number(i?.stock || 0),
      minQty: Number(i?.minQty || 0),
    })),
    [items]
  )

  const inventoryCategoryOptions = useMemo(() => {
    const names = new Set()
    for (const c of categories || []) {
      const name = String(c?.name || '').trim()
      if (name) names.add(name)
    }

    for (const i of items || []) {
      const name = String(i?.category || '').trim()
      if (name) names.add(name)
    }

    return Array.from(names).sort(compareText)
  }, [categories, items])

  const stockInOptions = useMemo(() => {
    const options = [...productOptions]
      .filter((o) => !isVariantItem(o))
      .sort((a, b) => compareText(a?.name, b?.name))
    const autoGroup = tab === 'service' ? 'service' : tab === 'retail' ? 'retail' : 'all'
    if (autoGroup === 'all') return options
    return options.filter((o) => o.group === autoGroup)
  }, [productOptions, tab])

  const stockOutOptions = useMemo(() => {
    const options = [...productOptions]
      .filter((o) => !isVariantItem(o))
      .sort((a, b) => compareText(a?.name, b?.name))
    const autoGroup = tab === 'service' ? 'service' : tab === 'retail' ? 'retail' : 'all'
    if (autoGroup === 'all') return options
    return options.filter((o) => o.group === autoGroup)
  }, [productOptions, tab])

  const variantOptionsByProductId = useMemo(() => {
    const map = new Map()
    for (const item of productOptions) {
      if (!isVariantItem(item)) continue
      const pid = String(item?.productId || '').trim()
      const vid = String(item?.variantId || '').trim()
      if (!pid || !vid) continue
      const list = map.get(pid) || []
      list.push({
        id: vid,
        inventoryItemId: String(item?.id || '').trim(),
        name: String(item?.name || '').trim(),
        stock: Number(item?.stock || 0),
      })
      map.set(pid, list)
    }
    for (const [pid, list] of map.entries()) {
      list.sort((a, b) => compareText(a.name, b.name))
      map.set(pid, list)
    }
    return map
  }, [productOptions])

  useEffect(() => {
    if (!openStockOut) return
    const selectedProduct = stockOutOptions.find((it) => String(it?.id || '') === String(stockOutForm.productId || ''))
    const itemId = buildInventorySkuFromSelection(selectedProduct, stockOutForm.variantId)
    const qty = Number(digitsOnly(stockOutForm.qty) || 0)
    const selected = items.find((it) => String(it?.id || '') === String(itemId || ''))
    if (!itemId || !Number.isFinite(qty) || qty <= 0 || selected?.group === 'retail') {
      setFifoPreview([])
      setFifoPreviewError('')
      return
    }

    let active = true
    setFifoPreviewLoading(true)
    api
      .post('/api/owner/inventory/fifo-preview', { inventoryItemId: itemId, qty: String(qty) })
      .then((data) => {
        if (!active) return
        setFifoPreview(Array.isArray(data) ? data : [])
        setFifoPreviewError('')
      })
      .catch((err) => {
        if (!active) return
        setFifoPreview([])
        setFifoPreviewError(err?.message || 'Unable to load FIFO preview')
      })
      .finally(() => {
        if (active) setFifoPreviewLoading(false)
      })

    return () => {
      active = false
    }
  }, [openStockOut, stockOutForm.productId, stockOutForm.variantId, stockOutForm.qty, items, stockOutOptions])

  const kpiGroup = tab === 'service' ? 'service' : tab === 'retail' ? 'retail' : 'all'

  const displayItems = useMemo(
    () => items.filter((i) => !isVariantItem(i)),
    [items]
  )

  const kpiItems = useMemo(() => {
    if (kpiGroup === 'service') return displayItems.filter((i) => i.group === 'service')
    if (kpiGroup === 'retail') return displayItems.filter((i) => i.group === 'retail')
    return displayItems
  }, [displayItems, kpiGroup])

  const kpiItemNameSet = useMemo(
    () => new Set(kpiItems.map((i) => String(i?.name || '').trim().toLowerCase()).filter(Boolean)),
    [kpiItems]
  )

  const kpiHistory = useMemo(() => {
    if (kpiGroup === 'all') return history
    return history.filter((h) => kpiItemNameSet.has(String(h?.product || '').trim().toLowerCase()))
  }, [history, kpiGroup, kpiItemNameSet])

  const lowStockCount = useMemo(
    () => kpiItems.filter((i) => Number(i.minQty || 0) > 0 && Number(i.stock || 0) <= Number(i.minQty || 0)).length,
    [kpiItems]
  )

  const outOfStockCount = useMemo(() => kpiItems.filter((i) => Number(i.stock || 0) <= 0).length, [kpiItems])

  const healthyStockCount = useMemo(
    () =>
      kpiItems.filter((i) => {
        const s = Number(i.stock || 0)
        const min = Number(i.minQty || 0)
        return s > 0 && (min <= 0 || s > min)
      }).length,
    [kpiItems]
  )

  const suppliesCount = useMemo(
    () => kpiItems.filter((i) => String(i?.group || '').toLowerCase() === 'service').length,
    [kpiItems]
  )

  const retailsCount = useMemo(
    () => kpiItems.filter((i) => String(i?.group || '').toLowerCase() === 'retail').length,
    [kpiItems]
  )

  const totalProductsCount = useMemo(() => suppliesCount + retailsCount, [suppliesCount, retailsCount])

  const totalProductsSubtitle = useMemo(() => {
    if (kpiGroup === 'service') return 'Service Supplies only'
    if (kpiGroup === 'retail') return 'Retail Products only'
    return `Supplies: ${formatVnd(suppliesCount)} | Retail: ${formatVnd(retailsCount)}`
  }, [kpiGroup, suppliesCount, retailsCount])

  const totalImportVnd = useMemo(
    () => kpiHistory.filter((h) => h.type === 'Stock In').reduce((sum, h) => sum + Number(h.totalVnd || 0), 0),
    [kpiHistory]
  )

  const totalStockOutVnd = useMemo(
    () => kpiHistory.filter((h) => h.type === 'Stock Out').reduce((sum, h) => sum + Number(h.totalVnd || 0), 0),
    [kpiHistory]
  )

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = displayItems.filter((i) => {
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
  }, [displayItems, query, tab, categoryFilter, stockStateFilter])

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

  const sortedFilteredItems = useMemo(() => {
    const sorted = [...filteredItems]
    sorted.sort((a, b) => {
      if (sortBy === 'stock') {
        const cmp = Number(a?.stock || 0) - Number(b?.stock || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'minQty') {
        const cmp = Number(a?.minQty || 0) - Number(b?.minQty || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'price') {
        const cmp = Number(resolveImportPrice(a) || 0) - Number(resolveImportPrice(b) || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'sellPrice') {
        const cmp = Number(resolveSellPrice(a) || 0) - Number(resolveSellPrice(b) || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'total') {
        const aTotal = Number(resolveImportPrice(a) || 0) * Number(a?.stock || 0)
        const bTotal = Number(resolveImportPrice(b) || 0) * Number(b?.stock || 0)
        const cmp = aTotal - bTotal
        return sortOrder === 'asc' ? cmp : -cmp
      }
      const cmp = compareText(a?.name || '', b?.name || '')
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredItems, sortBy, sortOrder])

  const sortedFilteredHistory = useMemo(() => {
    const sorted = [...filteredHistory]
    sorted.sort((a, b) => {
      if (sortBy === 'date') {
        const aDate = parseDmyString(a?.date)
        const bDate = parseDmyString(b?.date)
        const aTs = aDate ? aDate.getTime() : 0
        const bTs = bDate ? bDate.getTime() : 0
        const cmp = aTs - bTs
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'type') {
        const cmp = compareText(a?.type || '', b?.type || '')
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'qty') {
        const cmp = Number(a?.qty || 0) - Number(b?.qty || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      if (sortBy === 'value') {
        const cmp = Number(a?.totalVnd || 0) - Number(b?.totalVnd || 0)
        return sortOrder === 'asc' ? cmp : -cmp
      }
      const cmp = compareText(a?.product || '', b?.product || '')
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredHistory, sortBy, sortOrder])

  const pagedItems = useMemo(() => {
    const source = tab === 'history' ? sortedFilteredHistory : sortedFilteredItems
    const start = (page - 1) * pageSize
    return source.slice(start, start + pageSize)
  }, [tab, sortedFilteredHistory, sortedFilteredItems, page])

  const totalPages = useMemo(() => {
    const source = tab === 'history' ? sortedFilteredHistory : sortedFilteredItems
    return Math.max(1, Math.ceil(source.length / pageSize))
  }, [tab, sortedFilteredHistory, sortedFilteredItems])

  useEffect(() => {
    setPage(1)
  }, [tab, query, categoryFilter, stockStateFilter, historyTypeFilter, fromDate, toDate, sortBy, sortOrder])

  useEffect(() => {
    if (tab === 'history') {
      setSortBy((prev) => (prev === 'name' || prev === 'stock' || prev === 'minQty' || prev === 'price' || prev === 'sellPrice' || prev === 'total' ? 'date' : prev))
    } else {
      setSortBy((prev) => (prev === 'date' || prev === 'type' || prev === 'qty' || prev === 'value' || prev === 'product' ? 'name' : prev))
    }
  }, [tab])

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
    setStockNote('')
  }

  function closeStockOut() {
    setOpenStockOut(false)
    setStockForId('')
    setStockOutError('')
    setFifoPreview([])
    setFifoPreviewError('')
    setStockOutNote('')
  }

  function closeEdit() {
    setOpenEdit(false)
    setEditFor(null)
    setEditError('')
    setOpenDeleteConfirm(false)
  }

  function openEditLot(item, lot) {
    const variantName = extractVariantFromLotNote(lot?.note)
    const itemSellPrice = resolveSellPrice(item)
    setLotEditError('')
    setLotEditFor({
      itemId: item?.id,
      itemName: item?.name,
      lotId: lot?.lotId,
    })
    setLotEditForm({
      variantName: String(variantName || ''),
      remainingQty: String(Number(lot?.remaining || 0)),
      price: String(Number(lot?.price || 0)),
      sellPrice: itemSellPrice !== null ? String(Math.round(itemSellPrice)) : '',
      receivedAt: formatDateInput(lot?.receivedAt) || getTodayDateInput(),
      expiryDate: formatDateInput(lot?.expiryDate),
      supplier: String(lot?.supplier || ''),
      note: stripVariantPrefixFromLotNote(lot?.note),
    })
    setOpenLotEdit(true)
  }

  function closeEditLot() {
    setOpenLotEdit(false)
    setLotEditError('')
    setOpenLotDeleteConfirm(false)
    setLotEditFor(null)
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

  function openImportModal() {
    setImportError('')
    setOpenImport(true)
  }

  function closeImportModal() {
    setOpenImport(false)
    setImportError('')
    setImportFile(null)
    setImportFileName('')
  }

  async function onDownloadImportTemplate() {
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE_URL}/api/owner/inventory/import-template`, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        throw new Error('Unable to download template')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'inventory-import-template.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      setImportError(err?.message || 'Unable to download template')
    }
  }

  function onPickImportFile(e) {
    const file = e?.target?.files?.[0]
    if (!file) return
    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setImportError('Please choose an Excel file (.xlsx or .xls)')
      setImportFile(null)
      setImportFileName('')
      if (e?.target) e.target.value = ''
      return
    }
    setImportError('')
    setImportFile(file)
    setImportFileName(file.name)
  }

  async function onSubmitImportExcel(e) {
    e.preventDefault()
    if (!importFile) {
      setImportError('Please select an Excel file')
      return
    }
    try {
      setImportError('')
      setImportLoading(true)
      const fileBase64 = await readFileAsDataUrl(importFile)
      const report = await api.post('/api/owner/inventory/import-excel', {
        fileBase64,
        duplicateMode: importOptions.duplicateMode,
        updatePrices: importOptions.updatePrices,
      })
      setImportReport(report)
      await refreshInventory()
    } catch (err) {
      console.error(err)
      setImportError(err?.message || 'Unable to import Excel')
    } finally {
      setImportLoading(false)
    }
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
    const normalizedGroup = item?.group === 'retail' ? 'retail' : 'service'
    setEditFor(item || null)
    setEditError('')
    setEditForm({
      name: item?.name || '',
      group: normalizedGroup,
      stock: String(item?.stock ?? '0'),
      categoryId: findCategoryIdByName(item?.category || item?.kind || ''),
      category: item?.category || '',
      kind: item?.kind || '',
      unit: item?.unit || '',
      minQty: String(item?.minQty ?? '0'),
      priceVnd: String(item?.priceVnd ?? '0'),
      sellPriceVnd: String(item?.sellPriceVnd ?? '0'),
      receivedDate: getTodayDateInput(),
      description: item?.description || '',
      imageUrl: item?.imageUrl || '',
      images: item?.imageUrl ? [item.imageUrl] : [],
      status: item?.status || '',
    })
    setOpenEdit(true)

    if (item?.group === 'retail') {
      const productId = String(item?.productId || extractRetailProductId(item?.id) || '').trim()
      Promise.resolve()
        .then(() => api.get(`/api/owner/retail/products/${productId}`))
        .then((data) => {
          if (!data || typeof data !== 'object') return
          setEditForm((p) => ({
            ...p,
            stock: String(data.stock ?? p.stock ?? '0'),
            categoryId: data.categoryId !== undefined && data.categoryId !== null ? String(data.categoryId) : p.categoryId,
            category: data.categoryName ?? data.kind ?? p.category,
            kind: data.kind ?? p.kind,
            sellPriceVnd: String(data.price ?? p.sellPriceVnd ?? '0'),
            description: data.description ?? '',
            imageUrl: data.imageUrl ?? p.imageUrl,
            images: Array.isArray(data.images) ? data.images.slice(0, 4) : (p.imageUrl ? [p.imageUrl] : []),
            status: data.status ?? p.status,
          }))
        })
        .catch((err) => {
          console.error(err)
        })
    }
  }


  async function onAddProduct(e) {
    e.preventDefault()
    const name = String(productForm.name || '').trim()
    const normalizedName = name.toLowerCase()
    const existingNameSet = new Set(
      (items || [])
        .filter((it) => !isVariantItem(it))
        .map((it) => String(it?.name || '').trim().toLowerCase())
        .filter(Boolean)
    )
    if (!name) {
      setAddError('Product name is required')
      return
    }
    if (hasDangerousInput(name)) {
      setAddError('Invalid product name')
      return
    }
    if (existingNameSet.has(normalizedName)) {
      setAddError('Name already exists. Please use a different product name.')
      return
    }

    if (!productForm.categoryId) {
      setAddError('Please select a category')
      return
    }

    const qtyRaw = digitsOnly(productForm.qty)
    const minQtyRaw = digitsOnly(productForm.minQty)
    if (!qtyRaw) {
      setAddError('Quantity is required')
      return
    }
    if (!minQtyRaw) {
      setAddError('Minimum stock is required')
      return
    }

    const qty = Number(qtyRaw)
    const minQty = Number(minQtyRaw)
    const price = Number(digitsOnly(productForm.price) || 0)
    const sellPriceRaw = digitsOnly(productForm.sellPrice)
    const sellPrice = Number(sellPriceRaw || 0)
    const normalizedGroup = String(productForm.group || '').trim().toLowerCase() === 'retail' ? 'retail' : 'service'
    const rawVariantDrafts = normalizedGroup === 'retail'
      ? ensureRetailVariantDrafts(Array.isArray(productForm.variants) ? productForm.variants : [], qtyRaw || '0')
      : (Array.isArray(productForm.variants) ? productForm.variants : [])
    const variantDrafts = rawVariantDrafts
      .map((v) => ({
        name: String(v?.name || '').trim(),
        stock: Number(digitsOnly(v?.stock) || 0),
      }))
      .filter((v) => v.name || Number(v.stock || 0) > 0)
    const today = getTodayDateInput()
    const receivedDate = productForm.receivedDate || today
    if (receivedDate > today) {
      setAddError('Stock-in date cannot be in the future')
      return
    }
    if (normalizedGroup !== 'retail') {
      if (!productForm.expiryDate) {
        setAddError('Expiry date is required')
        return
      }
      if (!isValidDateInput(productForm.expiryDate)) {
        setAddError('Invalid expiry date')
        return
      }
    } else if (productForm.expiryDate && !isValidDateInput(productForm.expiryDate)) {
      setAddError('Invalid expiry date')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setAddError('Quantity must be greater than 0')
      return
    }
    if (!Number.isFinite(minQty) || minQty < 0) {
      setAddError('Invalid minimum stock')
      return
    }
    if (qty > MAX_INVENTORY_QTY) {
      setAddError(`Quantity must be less than or equal to ${MAX_INVENTORY_QTY}`)
      return
    }
    if (minQty > MAX_INVENTORY_QTY) {
      setAddError(`Minimum stock must be less than or equal to ${MAX_INVENTORY_QTY}`)
      return
    }
    if (qty <= minQty) {
      setAddError('Quantity must be greater than Minimum Stock')
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setAddError('Invalid purchase price')
      return
    }
    if (price > MAX_PRICE_VND) {
      setAddError(`Purchase price must be less than or equal to ${MAX_PRICE_VND}`)
      return
    }
    if (normalizedGroup === 'retail' && sellPriceRaw && (!Number.isFinite(sellPrice) || sellPrice <= 0)) {
      setAddError('Sell price must be greater than 0')
      return
    }
    if (normalizedGroup === 'retail' && sellPriceRaw && sellPrice > MAX_PRICE_VND) {
      setAddError(`Sell price must be less than or equal to ${MAX_PRICE_VND}`)
      return
    }
    if (qty > 0 && price <= 0) {
      setAddError('Purchase price must be greater than 0 when initial stock is greater than 0')
      return
    }
    if (variantDrafts.length) {
      for (const variant of variantDrafts) {
        if (!variant.name) {
          setAddError('Variant name is required')
          return
        }
        if (hasDangerousInput(variant.name)) {
          setAddError('Invalid variant name')
          return
        }
        if (!Number.isFinite(variant.stock) || variant.stock < 0) {
          setAddError('Variant stock must be 0 or greater')
          return
        }
      }
      const totalVariantStock = variantDrafts.reduce((sum, v) => sum + Number(v.stock || 0), 0)
      if (totalVariantStock !== qty) {
        setAddError('Total variant stock must be equal to Quantity')
        return
      }
    }

    try {
      setAddError('')
      const normalizedPrice = String(price)

      const images = Array.isArray(productForm.images) ? productForm.images.filter(Boolean).slice(0, 4) : []
      const description = String(productForm.description || '').trim()
      const payload = {
        group: normalizedGroup,
        name,
        categoryId: productForm.categoryId,
        qty: String(variantDrafts.length ? 0 : qty),
        minQty: String(minQty),
        unit: productForm.unit,
        priceVnd: normalizedPrice,
        importPrice: normalizedPrice,
        supplier: productForm.supplier,
        date: receivedDate,
      }
      if (normalizedGroup !== 'retail' && productForm.expiryDate) {
        payload.expiryDate = productForm.expiryDate
      }
      if (normalizedGroup === 'retail' && sellPriceRaw) {
        payload.sellPriceVnd = String(sellPrice)
      }
      if (description) payload.description = description
      if (images.length) {
        payload.images = images
        payload.imageUrl = images[0]
      }

      const created = await api.post('/api/owner/inventory/items', payload)
      const createdId = String(created?.id || '').trim()

      if (normalizedGroup === 'retail' && variantDrafts.length) {
        if (!createdId) {
          throw new Error('Unable to create retail product for variants')
        }

        for (const variant of variantDrafts) {
          const variantCreated = await api.post(`/api/owner/retail/products/${createdId}/variants`, {
            name: variant.name,
            stock: '0',
          })

          const variantId = String(variantCreated?.id || '').trim()
          if (!variantId) {
            throw new Error(`Unable to create variant: ${variant.name}`)
          }

          if (Number(variant.stock || 0) > 0) {
            await api.post('/api/owner/inventory/stock', {
              inventoryItemId: `variant:${variantId}`,
              qty: String(Math.trunc(variant.stock)),
              importPrice: normalizedPrice,
              supplier: productForm.supplier,
              date: receivedDate,
              note: `Initial variant stock: ${variant.name}`,
            })
          }
        }
      }

      if (normalizedGroup !== 'retail' && variantDrafts.length) {
        if (!createdId) {
          throw new Error('Unable to create supplies item for variants')
        }

        for (const variant of variantDrafts) {
          if (Number(variant.stock || 0) <= 0) continue
          await api.post('/api/owner/inventory/stock', {
            inventoryItemId: createdId,
            qty: String(Math.trunc(variant.stock)),
            importPrice: normalizedPrice,
            supplier: productForm.supplier,
            date: receivedDate,
            expiryDate: productForm.expiryDate,
            note: composeLotNoteWithVariant(variant.name, `Initial variant stock: ${variant.name}`),
          })
        }
      }

      await refreshInventory()
      setProductForm((p) => ({
        ...p,
        group: 'retail',
        name: '',
        categoryId: '',
        qty: '',
        minQty: '',
        unit: '',
        price: '0',
        sellPrice: '',
        supplier: '',
        receivedDate: getTodayDateInput(),
        expiryDate: getDefaultExpiryDateInput(),
        description: '',
        images: [],
        imageUrl: '',
        variants: ensureRetailVariantDrafts([], '0'),
      }))
      setAddImageIdx(-1)
      closeAdd()
    } catch (err) {
      console.error(err)
      setAddError(err?.message || 'Something went wrong')
    }
  }

  async function onStockIn(e) {
    e.preventDefault()
    if (!String(stockForm.productId || '').trim()) {
      setStockError('Please select a product')
      return
    }
    const selectedProduct = stockInOptions.find((it) => String(it?.id || '') === String(stockForm.productId || ''))
    const selectedProductGroup = String(selectedProduct?.group || '').toLowerCase()
    const isRetailProduct = selectedProductGroup === 'retail'
    const isSuppliesProduct = selectedProductGroup === 'service'
    const wantsCreateRetailVariant = isRetailProduct && String(stockForm.variantId || '') === STOCK_IN_NEW_VARIANT_VALUE
    const wantsCreateSupplyVariant = isSuppliesProduct && String(stockForm.variantId || '') === STOCK_IN_NEW_SUPPLY_VARIANT_VALUE
    const wantsCreateVariant = wantsCreateRetailVariant || wantsCreateSupplyVariant

    if (isRetailProduct && !wantsCreateRetailVariant && !String(stockForm.variantId || '').trim()) {
      setStockError('Please select a variant for retail stock-in')
      return
    }

    let inventoryItemId = buildInventorySkuFromSelection(selectedProduct, stockForm.variantId)
    if (wantsCreateRetailVariant) {
      inventoryItemId = ''
      const variantName = String(stockForm.newVariantName || '').trim()
      if (!variantName) {
        setStockError('Please enter new variant name')
        return
      }
      if (hasDangerousInput(variantName)) {
        setStockError('Invalid variant name')
        return
      }
    } else if (wantsCreateSupplyVariant) {
      const variantName = String(stockForm.newVariantName || '').trim()
      if (!variantName) {
        setStockError('Please enter new variant name')
        return
      }
      if (hasDangerousInput(variantName)) {
        setStockError('Invalid variant name')
        return
      }
    } else if (!inventoryItemId) {
      setStockError('Invalid product/variant selection')
      return
    }

    const qty = Number(digitsOnly(stockForm.qty) || 0)
    const importPrice = Number(digitsOnly(stockForm.importPrice) || 0)
    const sellPriceRaw = digitsOnly(stockForm.sellPrice)
    const sellPrice = Number(sellPriceRaw || 0)
    const selectedItem = items.find((it) => String(it?.id || '') === String(inventoryItemId || ''))
    const selectedSku = parseSkuKey(inventoryItemId)
    const isSuppliesSku = String(selectedItem?.group || '').toLowerCase() === 'service' || selectedSku.type === 'service'
    const selectedDate = stockForm.date || getTodayDateInput()
    const today = getTodayDateInput()
    if (!Number.isFinite(qty) || qty < 0) {
      setStockError('Quantity cannot be negative')
      return
    }
    if (!wantsCreateVariant && qty <= 0) {
      setStockError('Quantity must be greater than 0')
      return
    }
    if (qty > 0 && (!Number.isFinite(importPrice) || importPrice <= 0)) {
      setStockError('Purchase price must be greater than 0')
      return
    }
    if (!isSuppliesSku && sellPriceRaw && (!Number.isFinite(sellPrice) || sellPrice <= 0)) {
      setStockError('Sell price must be greater than 0')
      return
    }
    if (!isSuppliesSku && sellPriceRaw && sellPrice > MAX_PRICE_VND) {
      setStockError(`Sell price must be less than or equal to ${MAX_PRICE_VND}`)
      return
    }
    if (!isSuppliesSku && qty > 0 && sellPriceRaw && sellPrice < importPrice) {
      setStockError('Sell price must be greater than or equal to purchase price')
      return
    }
    if (selectedDate > today) {
      setStockError('Stock-in date cannot be in the future')
      return
    }
    if (isSuppliesSku) {
      if (!stockForm.expiryDate) {
        setStockError('Expiry date is required')
        return
      }
      if (!isValidDateInput(stockForm.expiryDate)) {
        setStockError('Invalid expiry date')
        return
      }
    } else if (stockForm.expiryDate && !isValidDateInput(stockForm.expiryDate)) {
      setStockError('Invalid expiry date')
      return
    }

    try {
      setStockError('')
      setStockNote('')
      const variantLabel = isSuppliesSku
        ? (
          wantsCreateSupplyVariant
            ? String(stockForm.newVariantName || '').trim()
            : String(stockForm.variantId || '').trim()
        )
        : String(stockForm.newVariantName || '').trim()
      const noteWithVariant = isSuppliesSku && variantLabel
        ? composeLotNoteWithVariant(variantLabel, stockForm.note)
        : stockForm.note

      if (wantsCreateRetailVariant) {
        const productId = String(selectedProduct?.productId || extractRetailProductId(selectedProduct?.id) || '').trim()
        if (!productId) {
          setStockError('Cannot resolve product id for new variant')
          return
        }

        const createdVariant = await api.post(`/api/owner/retail/products/${productId}/variants`, {
          name: String(stockForm.newVariantName || '').trim(),
          stock: '0',
        })
        const createdVariantId = String(createdVariant?.id || '').trim()
        if (!createdVariantId) {
          setStockError('Unable to create new variant')
          return
        }
        inventoryItemId = `variant:${createdVariantId}`

        if (qty === 0) {
          if (sellPriceRaw) {
            const productId = String(selectedProduct?.id || '').trim()
            if (productId) {
              await api.put(`/api/owner/inventory/items/${productId}`, {
                sellPriceVnd: String(sellPrice),
              })
            }
          }
          await refreshInventory()
          setStockNote('New variant created successfully.')
          setStockForm((p) => ({
            ...p,
            variantId: createdVariantId,
            newVariantName: '',
            inventoryItemId,
            sellPrice: sellPriceRaw ? String(sellPrice) : p.sellPrice,
          }))
          return
        }
      }

      await api.post('/api/owner/inventory/stock', {
        inventoryItemId,
        qty: String(qty),
        importPrice: String(importPrice),
        supplier: stockForm.supplier,
        date: selectedDate,
        expiryDate: isSuppliesSku ? stockForm.expiryDate : null,
        note: noteWithVariant,
      })

      if (!isSuppliesSku && sellPriceRaw) {
        const productId = String(selectedProduct?.id || '').trim()
        if (productId) {
          await api.put(`/api/owner/inventory/items/${productId}`, {
            sellPriceVnd: String(sellPrice),
          })
        }
      }

      await refreshInventory()
      setStockNote('Stock-in saved. Check lots and history.')
      setStockForm({
        productId: '',
        variantId: '',
        newVariantName: '',
        inventoryItemId: '',
        qty: '0',
        importPrice: '0',
        sellPrice: '',
        supplier: '',
        date: getTodayDateInput(),
        expiryDate: getDefaultExpiryDateInput(),
        note: '',
      })
      closeStock()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Stock-in failed', err)
      }
      setStockError(resolveUiErrorMessage(err))
    }
  }

  async function onStockOut(e) {
    e.preventDefault()
    if (!String(stockOutForm.productId || '').trim()) {
      setStockOutError('Please select a product')
      return
    }
    const selectedProduct = stockOutOptions.find((it) => String(it?.id || '') === String(stockOutForm.productId || ''))
    const isRetailProduct = String(selectedProduct?.group || '').toLowerCase() === 'retail'
    if (isRetailProduct && !String(stockOutForm.variantId || '').trim()) {
      setStockOutError('Please select a variant for retail stock-out')
      return
    }
    const inventoryItemId = buildInventorySkuFromSelection(selectedProduct, stockOutForm.variantId)
    if (!inventoryItemId) {
      setStockOutError('Invalid product/variant selection')
      return
    }

    const qty = Number(digitsOnly(stockOutForm.qty) || 0)
    const selectedItem = items.find((it) => String(it?.id || '') === String(inventoryItemId || ''))
    const selectedSku = parseSkuKey(inventoryItemId)
    const isSuppliesSku = String(selectedItem?.group || '').toLowerCase() === 'service' || selectedSku.type === 'service'
    const selectedDate = stockOutForm.date || getTodayDateInput()
    const today = getTodayDateInput()
    if (!Number.isFinite(qty) || qty <= 0) {
      setStockOutError('Quantity must be greater than 0')
      return
    }
    if (selectedItem && isBelowMinThreshold(selectedItem)) {
      setStockOutError('Stock is below minimum threshold. Stock-out is not allowed.')
      return
    }
    if (selectedItem) {
      const min = Number(selectedItem?.minQty || 0)
      const stock = Number(selectedItem?.stock || 0)
      if (Number.isFinite(min) && min > 0 && stock - qty < min) {
        setStockOutError('Stock-out would make stock lower than minimum threshold.')
        return
      }
    }
    if (selectedDate > today) {
      setStockOutError('Stock-out date cannot be in the future')
      return
    }

    try {
      setStockOutError('')
      setStockOutNote('')
      const payload = {
        inventoryItemId,
        qty: String(qty),
        date: selectedDate,
        note: stockOutForm.note,
      }
      if (isSuppliesSku && String(stockOutForm.supplyVariantName || '').trim()) {
        payload.variantName = String(stockOutForm.supplyVariantName || '').trim()
      }
      await api.post('/api/owner/inventory/stock-out', {
        ...payload,
      })

      await refreshInventory()
      setStockOutNote('Stock-out saved. Check lots and history.')
      setStockOutForm({ productId: '', variantId: '', supplyVariantName: '', inventoryItemId: '', qty: '0', date: getTodayDateInput(), note: '' })
      closeStockOut()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Stock-out failed', err)
      }
      setStockOutError(resolveUiErrorMessage(err))
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

      if (editFor.group !== 'retail' && !isValidDateInput(editForm.expiryDate)) {
        setEditError('Invalid expiry date')
        return
      }

      const editDate = editForm.receivedDate || getTodayDateInput()
      if (editDate > getTodayDateInput()) {
        setEditError('Stock-in date cannot be in the future')
        return
      }

      const normalizedGroup = editFor.group === 'retail' ? 'retail' : 'service'
      const importPriceRaw = digitsOnly(editForm.priceVnd)
      const importPrice = Number(importPriceRaw || 0)

      if (editFor.group === 'retail') {
        const sellPriceRaw = digitsOnly(editForm.sellPriceVnd)
        const sellPrice = Number(sellPriceRaw || 0)
        if (!Number.isFinite(importPrice) || importPrice <= 0) {
          setEditError('Import price must be greater than 0')
          return
        }
        if (importPrice > MAX_PRICE_VND) {
          setEditError(`Import price must be less than or equal to ${MAX_PRICE_VND}`)
          return
        }
        if (sellPriceRaw && (!Number.isFinite(sellPrice) || sellPrice <= 0)) {
          setEditError('Sell price must be greater than 0')
          return
        }
        if (sellPriceRaw && sellPrice > MAX_PRICE_VND) {
          setEditError(`Sell price must be less than or equal to ${MAX_PRICE_VND}`)
          return
        }

        const payload = {
          name: normalizedName,
          group: normalizedGroup,
          stock: digitsOnly(editForm.stock),
          categoryId: editForm.categoryId,
          priceVnd: importPriceRaw,
          description: editForm.description,
          imageUrl: (Array.isArray(editForm.images) ? editForm.images[0] : '') || editForm.imageUrl,
          images: Array.isArray(editForm.images) ? editForm.images.slice(0, 4) : [],
          date: editDate,
        }
        if (sellPriceRaw) payload.sellPriceVnd = sellPriceRaw
        await api.put(`/api/owner/inventory/items/${editFor.id}`, payload)
      } else {
        if (importPriceRaw) {
          if (!Number.isFinite(importPrice) || importPrice < 0) {
            setEditError('Invalid import price')
            return
          }
          if (importPrice > MAX_PRICE_VND) {
            setEditError(`Import price must be less than or equal to ${MAX_PRICE_VND}`)
            return
          }
        }

        await api.put(`/api/owner/inventory/items/${editFor.id}`, {
          name: normalizedName,
          group: normalizedGroup,
          stock: digitsOnly(editForm.stock),
          categoryId: editForm.categoryId,
          unit: editForm.unit,
          minQty: editForm.minQty,
          priceVnd: importPriceRaw,
          date: editDate,
          expiryDate: editForm.expiryDate || null,
          description: editForm.description,
          imageUrl: (Array.isArray(editForm.images) ? editForm.images[0] : '') || editForm.imageUrl,
        })
      }

      await refreshInventory()
      closeEdit()
    } catch (err) {
      console.error(err)
      setEditError(err?.message || 'Something went wrong')
    }
  }

  function onRequestDeleteItem() {
    const targetId = String(editFor?.id || '').trim()
    if (!targetId) return
    setOpenDeleteConfirm(true)
  }

  async function onDeleteItem() {
    const targetId = String(editFor?.id || '').trim()
    if (!targetId) return
    const isRetailProduct = String(editFor?.group || '').toLowerCase() === 'retail' && !isVariantItem(editFor)

    try {
      setEditError('')
      await api.del(`/api/owner/inventory/items/${targetId}`)
      setItems((prev) => prev.filter((it) => {
        const currentId = String(it?.id || '')
        if (currentId === targetId) return false
        if (isRetailProduct && String(it?.productId || '') === targetId) return false
        return true
      }))
      setExpandedLots((prev) => prev.filter((id) => String(id || '') !== targetId))
      setOpenDeleteConfirm(false)
      closeEdit()
      refreshInventory().catch((err) => {
        console.error(err)
      })
    } catch (err) {
      console.error(err)
      setEditError(err?.message || 'Unable to deactivate item')
    }
  }

  async function onSaveLot(e) {
    e.preventDefault()
    const targetLotId = String(lotEditFor?.lotId || '').trim()
    if (!targetLotId) return

    const remainingQty = Number(digitsOnly(lotEditForm.remainingQty) || 0)
    const price = Number(digitsOnly(lotEditForm.price) || 0)
    const sellPriceRaw = digitsOnly(lotEditForm.sellPrice)
    const sellPrice = Number(sellPriceRaw || 0)
    const currentItem = items.find((it) => String(it?.id || '') === String(lotEditFor?.itemId || ''))
    const isRetailLotItem = String(currentItem?.group || '').toLowerCase() === 'retail'

    if (!Number.isFinite(remainingQty) || remainingQty < 0) {
      setLotEditError('Remaining quantity must be greater than or equal to 0')
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      setLotEditError('Price must be greater than 0')
      return
    }
    if (!isValidDateInput(lotEditForm.receivedAt)) {
      setLotEditError('Invalid received date')
      return
    }
    if (lotEditForm.receivedAt > getTodayDateInput()) {
      setLotEditError('Received date cannot be in the future')
      return
    }
    if (lotEditForm.expiryDate && !isValidDateInput(lotEditForm.expiryDate)) {
      setLotEditError('Invalid expiry date')
      return
    }
    if (isRetailLotItem && sellPriceRaw && (!Number.isFinite(sellPrice) || sellPrice <= 0)) {
      setLotEditError('Sell price must be greater than 0')
      return
    }
    if (isRetailLotItem && sellPriceRaw && sellPrice > MAX_PRICE_VND) {
      setLotEditError(`Sell price must be less than or equal to ${MAX_PRICE_VND}`)
      return
    }
    if (isRetailLotItem && sellPriceRaw && sellPrice < price) {
      setLotEditError('Sell price must be greater than or equal to import price')
      return
    }

    try {
      setLotEditError('')
      await api.put(`/api/owner/inventory/lots/${targetLotId}`, {
        remainingQty: String(remainingQty),
        price: String(price),
        receivedAt: lotEditForm.receivedAt,
        expiryDate: lotEditForm.expiryDate || null,
        supplier: lotEditForm.supplier,
        note: composeLotNoteWithVariant(lotEditForm.variantName, lotEditForm.note),
      })

      if (isRetailLotItem && sellPriceRaw) {
        const retailItemId = isVariantItem(currentItem)
          ? String(currentItem?.productId || '').trim()
          : String(currentItem?.id || '').trim()
        if (retailItemId) {
          await api.put(`/api/owner/inventory/items/${retailItemId}`, {
            sellPriceVnd: String(sellPrice),
          })
        }
      }
      await refreshInventory()
      closeEditLot()
    } catch (err) {
      console.error(err)
      setLotEditError(err?.message || 'Unable to update lot')
    }
  }

  async function onDeleteLot() {
    const targetLotId = String(lotEditFor?.lotId || '').trim()
    if (!targetLotId) return

    try {
      setLotEditError('')
      await api.del(`/api/owner/inventory/lots/${targetLotId}`)
      await refreshInventory()
      closeEditLot()
    } catch (err) {
      console.error(err)
      setLotEditError(err?.message || 'Unable to delete lot')
    }
  }

  function onRemoveEditImageAt(index) {
    setEditForm((p) => {
      const current = Array.isArray(p.images) ? p.images : []
      const next = current.filter((_, i) => i !== index)
      return {
        ...p,
        images: next,
        imageUrl: next[0] || '',
      }
    })
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
    const stock = Number(digitsOnly(variant?.stock) || 0)
    if (stock > 0) {
      setVariantsError('Cannot delete variant with remaining stock. Please stock out or set stock to 0 first.')
      return
    }
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
      {loadError ? (
        <div className="portal-formError" role="alert" style={{ marginBottom: 12 }}>
          {loadError}
        </div>
      ) : null}

      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <div className="portal-headerActions">
          <button type="button" className="portal-outlineBtn" onClick={openImportModal}>
            <span className="portal-outlineBtnIcon" aria-hidden="true">
              <IconDownload />
            </span>
            Import Excel
          </button>

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
                group: 'retail',
                variants: ensureRetailVariantDrafts(p.variants, p.qty || '0'),
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
        modalClassName="inventory-addModal"
        bodyClassName="inventory-addModalBody"
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
        <form id="product-form" onSubmit={onAddProduct} className="inventory-addForm">
          {addError ? (
            <div className="portal-formError" role="alert">
              {addError}
            </div>
          ) : null}

          <div className="inventory-addSection">
            <div className="inventory-addSectionTitle">Basic Information</div>
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
              <label className="portal-field">
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

              <label className="portal-field">
                <span className="portal-label">Type</span>
                <select
                  className="portal-select"
                  value={productForm.group}
                  onChange={(e) => {
                    const nextGroup = e.target.value
                    setProductForm((p) => ({
                      ...p,
                      group: nextGroup,
                      sellPrice: nextGroup === 'retail' ? p.sellPrice : '',
                      variants: nextGroup === 'retail'
                        ? ensureRetailVariantDrafts(p.variants, p.qty || '0')
                        : [],
                    }))
                  }}
                >
                  <option value="service">Supplies</option>
                  <option value="retail">Retail</option>
                </select>
              </label>
            </div>
          </div>

          <div className="inventory-addSection">
            <div className="inventory-addSectionTitle">Stock Setup</div>

            <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Quantity <span className="products-required">*</span></span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  required
                  value={productForm.qty}
                  onChange={(e) => {
                    const nextQty = digitsOnly(e.target.value)
                    setProductForm((p) => {
                      const nextMinQty = computeAutoMinQty(nextQty)
                      const isRetail = String(p.group || '').toLowerCase() === 'retail'
                      if (!isRetail) {
                        return {
                          ...p,
                          qty: nextQty,
                          minQty: nextMinQty,
                        }
                      }

                      const currentVariants = Array.isArray(p.variants) ? p.variants : []
                      let nextVariants = ensureRetailVariantDrafts(currentVariants, nextQty)

                      if (nextVariants.length === 1) {
                        const only = nextVariants[0]
                        const isDefaultName = String(only?.name || '').trim().toLowerCase() === DEFAULT_RETAIL_VARIANT_NAME.toLowerCase()
                        const oldQty = digitsOnly(p.qty)
                        const currentStock = digitsOnly(only?.stock)
                        if (isDefaultName && (!currentStock || currentStock === oldQty)) {
                          nextVariants = [{ ...only, stock: nextQty || '0' }]
                        }
                      }

                      return {
                        ...p,
                        qty: nextQty,
                        minQty: nextMinQty,
                        variants: nextVariants,
                      }
                    })
                  }}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Minimum Stock <span className="products-required">*</span></span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  required
                  value={productForm.minQty}
                  onChange={(e) => setProductForm((p) => ({ ...p, minQty: digitsOnly(e.target.value) }))}
                />
              </label>
            </div>

            <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Unit</span>
                <input
                  className="portal-input"
                  placeholder="bottle, box..."
                  value={productForm.unit}
                  onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Supplier</span>
                <input
                  className="portal-input"
                  placeholder="Supplier name"
                  value={productForm.supplier}
                  onChange={(e) => setProductForm((p) => ({ ...p, supplier: e.target.value }))}
                />
              </label>
            </div>
          </div>

          {(productForm.group === 'retail' || productForm.group === 'service') ? (
            <div className="inventory-addSection">
              <div className="inventory-addSectionTitle">{productForm.group === 'retail' ? 'Retail Variants' : 'Supplies Variants'}</div>
              <PortalCard title="Initial Variants" style={{ marginTop: 0 }}>
                <div className="portal-pageSubtitle" style={{ marginBottom: 8 }}>
                  Total variant stock must equal Quantity.
                </div>
                {(Array.isArray(productForm.variants) ? productForm.variants : []).map((variant, idx) => (
                  <div className="portal-modalGrid2" key={`draft-variant-${idx}`}>
                    <label className="portal-field" style={{ marginTop: 8 }}>
                      <span className="portal-label">Variant Name</span>
                      <input
                        className="portal-input"
                        placeholder="e.g. 250ml"
                        value={variant.name}
                        onChange={(e) => {
                          const nextName = e.target.value
                          setProductForm((p) => ({
                            ...p,
                            variants: (Array.isArray(p.variants) ? p.variants : []).map((v, i) =>
                              i === idx ? { ...v, name: nextName } : v
                            ),
                          }))
                        }}
                      />
                    </label>
                    <label className="portal-field" style={{ marginTop: 8 }}>
                      <span className="portal-label">Stock</span>
                      <input
                        className="portal-input"
                        inputMode="numeric"
                        value={variant.stock}
                        onChange={(e) => {
                          const nextStock = digitsOnly(e.target.value)
                          setProductForm((p) => ({
                            ...p,
                            variants: (Array.isArray(p.variants) ? p.variants : []).map((v, i) =>
                              i === idx ? { ...v, stock: nextStock } : v
                            ),
                          }))
                        }}
                      />
                    </label>
                  </div>
                ))}
                <div className="portal-rowActions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="portal-ghostBtn"
                    onClick={() => {
                      setProductForm((p) => ({
                        ...p,
                        variants: [...(Array.isArray(p.variants) ? p.variants : []), { name: '', stock: '0' }],
                      }))
                    }}
                  >
                    Add Variant Line
                  </button>
                  <button
                    type="button"
                    className="portal-ghostBtn danger"
                    disabled={!Array.isArray(productForm.variants) || productForm.variants.length === 0}
                    onClick={() => {
                      setProductForm((p) => ({
                        ...p,
                        variants: (Array.isArray(p.variants) ? p.variants : []).slice(0, -1),
                      }))
                    }}
                  >
                    Remove Last Line
                  </button>
                </div>
              </PortalCard>
            </div>
          ) : null}

          <div className="inventory-addSection">
            <div className="inventory-addSectionTitle">Pricing And Date</div>

            <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Import Price (VND) <span className="products-required">*</span></span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  required
                  placeholder="Enter import price"
                  value={productForm.price}
                  onChange={(e) => setProductForm((p) => ({ ...p, price: digitsOnly(e.target.value) }))}
                />
              </label>
              <label className="portal-field">
                <span className="portal-label">Sell Price (VND)</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  required={false}
                  disabled={productForm.group !== 'retail'}
                  placeholder={productForm.group === 'retail' ? 'Enter sell price' : 'Not allowed for Supplies'}
                  value={productForm.sellPrice}
                  onChange={(e) => setProductForm((p) => ({ ...p, sellPrice: digitsOnly(e.target.value) }))}
                />
              </label>
            </div>

            <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Stock-in Date <span className="products-required">*</span></span>
                <input
                  className="portal-input"
                  type="date"
                  required
                  value={productForm.receivedDate}
                  onChange={(e) => setProductForm((p) => ({ ...p, receivedDate: e.target.value }))}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Expiry Date {productForm.group !== 'retail' ? <span className="products-required">*</span> : null}</span>
                <input
                  className="portal-input"
                  type="date"
                  required={productForm.group !== 'retail'}
                  value={productForm.expiryDate}
                  onChange={(e) => setProductForm((p) => ({ ...p, expiryDate: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="inventory-addSection">
            <div className="inventory-addSectionTitle">Media And Description</div>

            <label className="portal-field">
              <span className="portal-label">Images</span>
              {Array.isArray(productForm.images) && productForm.images.length > 0 ? (
                <div className="portal-mediaGallery" role="list">
                  {productForm.images.map((url, idx) => (
                    <button
                      key={`${idx}-${url}`}
                      type="button"
                      className={`portal-mediaGalleryItem ${addImageIdx === idx ? 'active' : ''}`.trim()}
                      onClick={() => setAddImageIdx(idx)}
                      role="listitem"
                    >
                      <img className="portal-mediaPreview" src={resolveAssetUrl(url)} alt={`${productForm.name || 'product'}-${idx + 1}`} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="portal-pageSubtitle">No images yet.</div>
              )}
            </label>

            <div className="portal-rowActions" style={{ marginTop: 8 }}>
              <input
                ref={addImageInputRef}
                type="file"
                accept="image/png,image/jpeg"
                style={{ display: 'none' }}
                onChange={onPickAddImage}
              />
              <button type="button" className="portal-ghostBtn" onClick={() => addImageInputRef.current?.click()}>
                Add Image
              </button>
              <button
                type="button"
                className="portal-ghostBtn danger"
                onClick={() => {
                  const idx = addImageIdx >= 0 ? addImageIdx : (productForm.images || []).length - 1
                  if (idx >= 0) onRemoveAddImageAt(idx)
                }}
                disabled={!Array.isArray(productForm.images) || productForm.images.length === 0}
              >
                Remove Image
              </button>
            </div>

            <label className="portal-field">
              <span className="portal-label">Description</span>
              <textarea
                className="portal-textarea"
                placeholder="Description (optional)"
                value={productForm.description}
                onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
          </div>
        </form>
      </PortalModal>

      <PortalModal
        open={openImport}
        title="Import Inventory from Excel"
        onClose={closeImportModal}
        modalClassName="inventory-importModal"
        bodyClassName="inventory-importModalBody"
        footerClassName="inventory-importModalFooter"
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeImportModal}>
              Close
            </button>
            <button type="submit" form="inventory-import-form" className="portal-modalBtn portal-modalBtnPrimary" disabled={importLoading}>
              {importLoading ? 'Importing...' : 'Start Import'}
            </button>
          </>
        }
      >
        <form id="inventory-import-form" onSubmit={onSubmitImportExcel}>
          {importError ? (
            <div className="portal-formError" role="alert">
              {importError}
            </div>
          ) : null}

          <div className="portal-pageSubtitle inventory-importLead">
            Use the provided template to ensure the correct column format.
          </div>

          <div className="inventory-importRow">
            <button type="button" className="portal-ghostBtn inventory-importActionBtn" onClick={onDownloadImportTemplate}>
              Download Template
            </button>
            <button
              type="button"
              className="portal-ghostBtn inventory-importActionBtn"
              onClick={() => importFileInputRef.current?.click()}
            >
              Choose Excel File
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={onPickImportFile}
            />
          </div>

          <div className="inventory-importFileName">{importFileName || 'No file selected'}</div>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Duplicate ProductName</span>
              <select
                className="portal-select"
                value={importOptions.duplicateMode}
                onChange={(e) => setImportOptions((p) => ({ ...p, duplicateMode: e.target.value }))}
              >
                <option value="update">Update existing product</option>
                <option value="reject">Reject duplicate row</option>
              </select>
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Price Update Mode</span>
              <select
                className="portal-select"
                value={importOptions.updatePrices ? 'yes' : 'no'}
                onChange={(e) => setImportOptions((p) => ({ ...p, updatePrices: e.target.value === 'yes' }))}
              >
                <option value="yes">Update prices from Excel</option>
                <option value="no">Keep existing prices</option>
              </select>
            </label>
          </div>

          {importReport ? (
            <div className="inventory-importReport">
              <div className="inventory-importSummary">
                <span>Inserted: {importReport.inserted || 0}</span>
                <span>Updated: {importReport.updated || 0}</span>
                <span>Failed: {importReport.failed || 0}</span>
              </div>

              {Array.isArray(importReport.errors) && importReport.errors.length > 0 ? (
                <div className="inventory-importErrors">
                  <div className="portal-label">Row Errors</div>
                  <ul className="inventory-alertList">
                    {importReport.errors.map((err, idx) => (
                      <li key={`err-${idx}`}>
                        Row {err?.row}: {err?.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="portal-pageSubtitle inventory-importOkText">
                  Import completed without row errors.
                </div>
              )}
            </div>
          ) : null}
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
          {stockNote ? (
            <div className="portal-formSuccess" role="status">
              {stockNote}
            </div>
          ) : null}

          <div className="portal-modalGrid2">
            <label className="portal-field">
            <span className="portal-label">Product</span>
            <InventorySearchableDropdown
              value={stockForm.productId}
              placeholder="Select product"
              emptyValueLabel="Select product"
              options={stockInOptions.map((p) => ({
                value: String(p.id),
                label: toStockOptionLabel(p),
              }))}
              onChange={(nextId) => {
                const selected = stockInOptions.find((it) => String(it.id) === String(nextId))
                const isRetailSelection = String(selected?.group || '').toLowerCase() === 'retail'
                const sku = isRetailSelection ? '' : buildInventorySkuFromSelection(selected, '')
                const selectedItem = items.find((it) => String(it?.id || '') === String(sku || ''))
                setStockForId(String(sku || ''))
                setStockForm((p) => ({
                  ...p,
                  productId: String(nextId || ''),
                  variantId: '',
                  newVariantName: '',
                  inventoryItemId: sku,
                  importPrice: selected ? resolveStockInImportPriceInputValue(selectedItem) : p.importPrice,
                  sellPrice: selected ? resolveStockInSellPriceInputValue(selectedItem) : p.sellPrice,
                  supplier: selected?.supplier ? selected.supplier : p.supplier,
                }))
              }}
            />
          </label>
            {(() => {
              const selectedProduct = stockInOptions.find((it) => String(it?.id || '') === String(stockForm.productId || ''))
              const isRetail = String(selectedProduct?.group || '').toLowerCase() === 'retail'
              if (!isRetail) {
                const selectedSupply = items.find((it) => String(it?.id || '') === String(selectedProduct?.id || ''))
                const supplyVariants = listSupplyVariantsFromLots(selectedSupply?.lots)
                const isCreatingSupplyVariant = String(stockForm.variantId || '') === STOCK_IN_NEW_SUPPLY_VARIANT_VALUE
                const supplyVariantOptions = [
                  ...(isCreatingSupplyVariant && String(stockForm.newVariantName || '').trim()
                    ? [{ value: STOCK_IN_NEW_SUPPLY_VARIANT_VALUE, label: `New: ${String(stockForm.newVariantName || '').trim()}` }]
                    : []),
                  ...supplyVariants.map((v) => ({
                    value: String(v.name || ''),
                    label: `${v.name} (${formatVnd(v.stock || 0)})`,
                  })),
                ]
                return (
                  <label className="portal-field">
                    <span className="portal-label">Variant</span>
                    <InventorySearchableDropdown
                      value={stockForm.variantId}
                      placeholder="No variant"
                      emptyValueLabel="No variant"
                      options={supplyVariantOptions}
                      createOptionLabel={(typed) => `+ Create variant "${typed}"`}
                      onCreateFromQuery={(typed) => {
                        const sku = String(buildInventorySkuFromSelection(selectedProduct, '') || '')
                        const selectedItem = items.find((it) => String(it?.id || '') === sku)
                        setStockForId(sku)
                        setStockForm((p) => ({
                          ...p,
                          variantId: STOCK_IN_NEW_SUPPLY_VARIANT_VALUE,
                          newVariantName: typed,
                          inventoryItemId: sku,
                          importPrice: resolveStockInImportPriceInputValue(selectedItem),
                          sellPrice: '',
                        }))
                      }}
                      onChange={(nextVariantValue) => {
                        const nextSku = String(buildInventorySkuFromSelection(selectedProduct, '') || '')
                        const selectedItem = items.find((it) => String(it?.id || '') === nextSku)
                        setStockForm((p) => ({
                          ...p,
                          variantId: String(nextVariantValue || ''),
                          newVariantName: '',
                          importPrice: resolveStockInImportPriceInputValue(selectedItem),
                          sellPrice: '',
                        }))
                      }}
                    />
                  </label>
                )
              }

              const productId = String(selectedProduct?.productId || '').trim()
              const variantOptions = variantOptionsByProductId.get(productId) || []
              const isCreatingRetailVariant = String(stockForm.variantId || '') === STOCK_IN_NEW_VARIANT_VALUE
              const variantDropdownOptions = [
                ...(isCreatingRetailVariant && String(stockForm.newVariantName || '').trim()
                  ? [{ value: STOCK_IN_NEW_VARIANT_VALUE, label: `New: ${String(stockForm.newVariantName || '').trim()}` }]
                  : []),
                ...variantOptions.map((v) => ({
                  value: String(v.id),
                  label: String(v.name || ''),
                })),
              ]
              return (
                <label className="portal-field">
                  <span className="portal-label">Variant</span>
                  <InventorySearchableDropdown
                    value={stockForm.variantId}
                    placeholder="Select variant"
                    emptyValueLabel="Select variant"
                    options={variantDropdownOptions}
                    createOptionLabel={(typed) => `+ Create variant "${typed}"`}
                    onCreateFromQuery={(typed) => {
                      const productSku = String(buildInventorySkuFromSelection(selectedProduct, '') || '')
                      const selectedItem = items.find((it) => String(it?.id || '') === productSku)
                      setStockForId('')
                      setStockForm((p) => ({
                        ...p,
                        variantId: STOCK_IN_NEW_VARIANT_VALUE,
                        newVariantName: typed,
                        inventoryItemId: '',
                        importPrice: resolveStockInImportPriceInputValue(selectedItem),
                        sellPrice: resolveStockInSellPriceInputValue(selectedItem),
                      }))
                    }}
                    onChange={(nextVariantId) => {
                      const sku = buildInventorySkuFromSelection(selectedProduct, nextVariantId)
                      const selectedItem = items.find((it) => String(it?.id || '') === String(sku || ''))
                      setStockForId(String(sku || ''))
                      setStockForm((p) => ({
                        ...p,
                        variantId: String(nextVariantId || ''),
                        newVariantName: '',
                        inventoryItemId: sku,
                        importPrice: resolveStockInImportPriceInputValue(selectedItem),
                        sellPrice: resolveStockInSellPriceInputValue(selectedItem),
                      }))
                    }}
                  />
                </label>
              )
            })()}
          </div>

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

          {(() => {
            const selectedProduct = stockInOptions.find((it) => String(it?.id || '') === String(stockForm.productId || ''))
            const isRetail = String(selectedProduct?.group || '').toLowerCase() === 'retail'
            if (!isRetail) return null
            return (
              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Sell Price (VND)</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  value={stockForm.sellPrice}
                  onChange={(e) => setStockForm((p) => ({ ...p, sellPrice: digitsOnly(e.target.value) }))}
                />
              </label>
            )
          })()}

          <label className="portal-field">
            <span className="portal-label">Stock-in Date</span>
            <input
              className="portal-input"
              type="date"
              value={stockForm.date}
              max={getTodayDateInput()}
              onChange={(e) => setStockForm((p) => ({ ...p, date: e.target.value }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">
              Expiry Date
              {(() => {
                const selectedId = stockForId || stockForm.inventoryItemId
                const selected = items.find((it) => String(it?.id || '') === String(selectedId || ''))
                const sku = parseSkuKey(selectedId)
                const required = String(selected?.group || '').toLowerCase() === 'service' || sku.type === 'service'
                return required ? <span className="products-required">*</span> : null
              })()}
            </span>
            <input
              className="portal-input"
              type="date"
              required={(() => {
                const selectedId = stockForId || stockForm.inventoryItemId
                const selected = items.find((it) => String(it?.id || '') === String(selectedId || ''))
                const sku = parseSkuKey(selectedId)
                return String(selected?.group || '').toLowerCase() === 'service' || sku.type === 'service'
              })()}
              value={stockForm.expiryDate}
              onChange={(e) => setStockForm((p) => ({ ...p, expiryDate: e.target.value }))}
            />
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
          {stockOutNote ? (
            <div className="portal-formSuccess" role="status">
              {stockOutNote}
            </div>
          ) : null}

          <div className="portal-modalGrid2">
            <label className="portal-field">
            <span className="portal-label">Product</span>
            <InventorySearchableDropdown
              value={stockOutForm.productId}
              placeholder="Select product"
              emptyValueLabel="Select product"
              options={stockOutOptions.map((p) => ({
                value: String(p.id),
                label: isBelowMinThreshold(p)
                  ? `${toStockOptionLabel(p)} (Below min threshold)`
                  : toStockOptionLabel(p),
                disabled: isBelowMinThreshold(p),
              }))}
              onChange={(nextProductId) => {
                const selected = stockOutOptions.find((it) => String(it.id) === String(nextProductId))
                const isRetailSelection = String(selected?.group || '').toLowerCase() === 'retail'
                const sku = isRetailSelection ? '' : buildInventorySkuFromSelection(selected, '')
                setStockForId(String(sku || ''))
                setStockOutForm((p) => ({
                  ...p,
                  productId: String(nextProductId || ''),
                  variantId: '',
                  supplyVariantName: '',
                  inventoryItemId: sku,
                }))
              }}
            />
          </label>
            {(() => {
              const selectedProduct = stockOutOptions.find((it) => String(it?.id || '') === String(stockOutForm.productId || ''))
              const isRetail = String(selectedProduct?.group || '').toLowerCase() === 'retail'
              if (!isRetail) {
                const selectedSupply = items.find((it) => String(it?.id || '') === String(selectedProduct?.id || ''))
                const supplyVariants = listSupplyVariantsFromLots(selectedSupply?.lots)
                return (
                  <label className="portal-field">
                    <span className="portal-label">Variant</span>
                    <InventorySearchableDropdown
                      value={stockOutForm.supplyVariantName}
                      placeholder="No variant filter"
                      emptyValueLabel="No variant filter"
                      options={supplyVariants.map((v) => ({
                        value: v.name,
                        label: `${v.name} (${formatVnd(v.stock)})`,
                      }))}
                      onChange={(nextVariantName) => {
                        setStockOutForm((p) => ({
                          ...p,
                          supplyVariantName: String(nextVariantName || ''),
                        }))
                      }}
                    />
                  </label>
                )
              }
              const productId = String(selectedProduct?.productId || '').trim()
              const variantOptions = variantOptionsByProductId.get(productId) || []
              return (
                <label className="portal-field">
                  <span className="portal-label">Variant</span>
                  <InventorySearchableDropdown
                    value={stockOutForm.variantId}
                    placeholder="Select variant"
                    emptyValueLabel="Select variant"
                    options={variantOptions.map((v) => ({
                      value: String(v.id),
                      label: `${String(v.name || '')} (${formatVnd(v.stock || 0)})`,
                    }))}
                    onChange={(nextVariantId) => {
                      const sku = buildInventorySkuFromSelection(selectedProduct, nextVariantId)
                      setStockForId(String(sku || ''))
                      setStockOutForm((p) => ({
                        ...p,
                        variantId: String(nextVariantId || ''),
                        supplyVariantName: '',
                        inventoryItemId: sku,
                      }))
                    }}
                  />
                </label>
              )
            })()}
          </div>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Stock-out Quantity <span className="products-required">*</span></span>
            <input
              className="portal-input"
              inputMode="numeric"
              value={stockOutForm.qty}
              onChange={(e) => setStockOutForm((p) => ({ ...p, qty: digitsOnly(e.target.value) }))}
            />
          </label>

          <div className="inventory-fifoPreview">
            <div className="inventory-fifoTitle">FIFO Preview</div>
            {fifoPreviewLoading ? (
              <div className="portal-pageSubtitle">Loading preview...</div>
            ) : fifoPreviewError ? (
              <div className="portal-formError" role="alert">{fifoPreviewError}</div>
            ) : fifoPreview.length ? (
              <div className="inventory-fifoList">
                {fifoPreview.map((row) => (
                  <div key={row.lotId} className="inventory-fifoRow">
                    <span className="inventory-fifoLot">{row.lotId}</span>
                    <span className="inventory-fifoQty">x{row.take}</span>
                    <span className="inventory-fifoPrice">
                      {Number(row.price || 0) > 0 ? `${formatVnd(row.price)} VND` : '-'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="portal-pageSubtitle">Select a supplies item to see lot usage.</div>
            )}
          </div>

          <label className="portal-field">
            <span className="portal-label">Stock-out Date</span>
            <input
              className="portal-input"
              type="date"
              value={stockOutForm.date}
              max={getTodayDateInput()}
              onChange={(e) => setStockOutForm((p) => ({ ...p, date: e.target.value }))}
            />
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
        modalClassName="inventory-editModal"
        bodyClassName="inventory-editModalBody"
        footer={
          <>
            {editFor?.id ? (
              <button type="button" className="portal-modalBtn" onClick={onRequestDeleteItem}>
                Deactivate
              </button>
            ) : null}
            <button type="button" className="portal-modalBtn" onClick={closeEdit}>
              Cancel
            </button>
            <button type="submit" form="edit-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save
            </button>
          </>
        }
      >
        <form id="edit-form" onSubmit={onEditItem} className="inventory-editForm">
          {editError ? (
            <div className="portal-formError" role="alert">
              {editError}
            </div>
          ) : null}
          <div className="inventory-editSection">
            <div className="inventory-editSectionTitle">Basic Information</div>

            <label className="portal-field">
              <span className="portal-label">Product Name <span className="products-required">*</span></span>
              <input
                className="portal-input"
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </label>

            <div className="portal-modalGrid2">
              <label className="portal-field">
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

              <label className="portal-field">
                <span className="portal-label">Type</span>
                <select
                  className="portal-select"
                  value={editForm.group || (editFor?.group || 'service')}
                  onChange={(e) => {
                    const nextGroup = e.target.value
                    setEditForm((p) => ({
                      ...p,
                      group: nextGroup,
                      sellPriceVnd: nextGroup === 'retail' ? p.sellPriceVnd : '',
                    }))
                  }}
                >
                  <option value="service">Supplies</option>
                  <option value="retail">Retail</option>
                </select>
              </label>
            </div>
          </div>

          <div className="inventory-editSection">
            <div className="inventory-editSectionTitle">Stock And Pricing</div>

            <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Stock</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  value={editForm.stock}
                  onChange={(e) => setEditForm((p) => ({ ...p, stock: digitsOnly(e.target.value) }))}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Import Price (VND)</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  value={editForm.priceVnd}
                  onChange={(e) => setEditForm((p) => ({ ...p, priceVnd: digitsOnly(e.target.value) }))}
                />
              </label>
            </div>

            <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Stock-in Date</span>
                <input
                  className="portal-input"
                  type="date"
                  value={editForm.receivedDate}
                  max={getTodayDateInput()}
                  onChange={(e) => setEditForm((p) => ({ ...p, receivedDate: e.target.value }))}
                />
              </label>

              {editFor?.group !== 'retail' ? (
                <label className="portal-field">
                  <span className="portal-label">Expiry Date</span>
                  <input
                    className="portal-input"
                    type="date"
                    value={editForm.expiryDate}
                    onChange={(e) => setEditForm((p) => ({ ...p, expiryDate: e.target.value }))}
                  />
                </label>
              ) : (
                <label className="portal-field">
                  <span className="portal-label">Sell Price (VND)</span>
                  <input
                    className="portal-input"
                    inputMode="numeric"
                    required={false}
                    disabled={(editForm.group || editFor?.group) !== 'retail'}
                    placeholder={(editForm.group || editFor?.group) === 'retail' ? 'Optional for Retail' : 'Not allowed for Supplies'}
                    value={editForm.sellPriceVnd}
                    onChange={(e) => setEditForm((p) => ({ ...p, sellPriceVnd: digitsOnly(e.target.value) }))}
                  />
                </label>
              )}
            </div>
          </div>

          {editFor?.group === 'retail' ? (
            <>
              <div className="inventory-editSection">
                <div className="inventory-editSectionTitle">Media And Description</div>

              <label className="portal-field">
                <span className="portal-label">Image</span>
                <div
                  style={{
                    border: '1px solid rgba(48,17,3,0.15)',
                    borderRadius: 10,
                    padding: 8,
                    minHeight: 120,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(255,255,255,0.2)',
                  }}
                >
                  {Array.isArray(editForm.images) && editForm.images.length ? (
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      {editForm.images.map((url, idx) => (
                        <div
                          key={`${url}-${idx}`}
                          draggable
                          onDragStart={(e) => onEditImageDragStart(idx, e)}
                          onDragOver={(e) => onEditImageDragOver(idx, e)}
                          onDrop={(e) => onEditImageDrop(idx, e)}
                          style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'grab' }}
                        >
                          <img
                            src={resolveAssetUrl(url)}
                            alt={`${editForm.name || 'product'}-${idx + 1}`}
                            style={{ width: '100%', height: 110, objectFit: 'contain', display: 'block', background: '#fff' }}
                          />
                          <button
                            type="button"
                            onClick={() => onRemoveEditImageAt(idx)}
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              border: 'none',
                              background: 'rgba(0,0,0,0.65)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                            aria-label="Remove image"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : <span className="portal-pageSubtitle">No image</span>}
                </div>
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
                  disabled={(editForm.images || []).length >= 4}
                  onClick={() => editImageInputRef.current?.click()}
                >
                  Add Image ({(editForm.images || []).length}/4)
                </button>
              </div>

              <label className="portal-field">
                <span className="portal-label">Description</span>
                <textarea
                  className="portal-textarea"
                  placeholder="Product description (optional)"
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                />
              </label>
              </div>
            </>
          ) : (
            <>
              <div className="inventory-editSection">
                <div className="inventory-editSectionTitle">Supplies Detail</div>

              <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Unit</span>
                <input
                  className="portal-input"
                  value={editForm.unit}
                  onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))}
                />
              </label>

              <label className="portal-field">
                <span className="portal-label">Minimum Stock</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  value={editForm.minQty}
                  onChange={(e) => setEditForm((p) => ({ ...p, minQty: digitsOnly(e.target.value) }))}
                />
              </label>
              </div>

              <label className="portal-field">
                <span className="portal-label">Image</span>
                <div
                  style={{
                    border: '1px solid rgba(48,17,3,0.15)',
                    borderRadius: 10,
                    padding: 8,
                    minHeight: 120,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(255,255,255,0.2)',
                  }}
                >
                  {Array.isArray(editForm.images) && editForm.images.length ? (
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      {editForm.images.map((url, idx) => (
                        <div
                          key={`${url}-${idx}`}
                          draggable
                          onDragStart={(e) => onEditImageDragStart(idx, e)}
                          onDragOver={(e) => onEditImageDragOver(idx, e)}
                          onDrop={(e) => onEditImageDrop(idx, e)}
                          style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'grab' }}
                        >
                          <img
                            src={resolveAssetUrl(url)}
                            alt={`${editForm.name || 'item'}-${idx + 1}`}
                            style={{ width: '100%', height: 110, objectFit: 'contain', display: 'block', background: '#fff' }}
                          />
                          <button
                            type="button"
                            onClick={() => onRemoveEditImageAt(idx)}
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              border: 'none',
                              background: 'rgba(0,0,0,0.65)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                            aria-label="Remove image"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : <span className="portal-pageSubtitle">No image</span>}
                </div>
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
                  disabled={(editForm.images || []).length >= 4}
                  onClick={() => editImageInputRef.current?.click()}
                >
                  Add Image ({(editForm.images || []).length}/4)
                </button>
              </div>

              <label className="portal-field">
                <span className="portal-label">Description</span>
                <textarea
                  className="portal-textarea"
                  placeholder="Item description (optional)"
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                />
              </label>
              </div>
            </>
          )}
        </form>
      </PortalModal>

      <PortalModal
        open={openDeleteConfirm}
        title="Confirm Deactivate"
        onClose={() => setOpenDeleteConfirm(false)}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={() => setOpenDeleteConfirm(false)}>
              Cancel
            </button>
            <button type="button" className="portal-modalBtn danger" onClick={onDeleteItem}>
              Deactivate
            </button>
          </>
        }
      >
        <div className="portal-pageSubtitle" style={{ marginTop: 4 }}>
          Deactivate <b>{editFor?.name || 'this item'}</b>?
        </div>
      </PortalModal>

      <PortalModal
        open={openLotEdit}
        title="Edit Lot"
        onClose={closeEditLot}
        footer={
          <>
            {lotEditFor?.lotId ? (
              <button type="button" className="portal-modalBtn" onClick={() => setOpenLotDeleteConfirm(true)}>
                Delete Lot
              </button>
            ) : null}
            <button type="button" className="portal-modalBtn" onClick={closeEditLot}>
              Cancel
            </button>
            <button type="submit" form="lot-edit-form" className="portal-modalBtn portal-modalBtnPrimary">
              Save
            </button>
          </>
        }
      >
        <form id="lot-edit-form" onSubmit={onSaveLot}>
          {lotEditError ? (
            <div className="portal-formError" role="alert">
              {lotEditError}
            </div>
          ) : null}

          <div className="portal-pageSubtitle" style={{ marginBottom: 8 }}>
            Item: <b>{lotEditFor?.itemName || '-'}</b> | Lot: <b>{lotEditFor?.lotId || '-'}</b>
          </div>

          <label className="portal-field" style={{ marginTop: 6 }}>
            <span className="portal-label">Variant</span>
            <input
              className="portal-input"
              placeholder="Variant name (optional)"
              value={lotEditForm.variantName}
              onChange={(e) => setLotEditForm((p) => ({ ...p, variantName: e.target.value }))}
            />
          </label>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Remaining Qty</span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={lotEditForm.remainingQty}
                onChange={(e) => setLotEditForm((p) => ({ ...p, remainingQty: digitsOnly(e.target.value) }))}
              />
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Import Price (VND)</span>
              <input
                className="portal-input"
                inputMode="numeric"
                value={lotEditForm.price}
                onChange={(e) => setLotEditForm((p) => ({ ...p, price: digitsOnly(e.target.value) }))}
              />
            </label>
          </div>

          {(() => {
            const currentItem = items.find((it) => String(it?.id || '') === String(lotEditFor?.itemId || ''))
            const isRetail = String(currentItem?.group || '').toLowerCase() === 'retail'
            if (!isRetail) return null
            return (
              <label className="portal-field" style={{ marginTop: 12 }}>
                <span className="portal-label">Sell Price (VND)</span>
                <input
                  className="portal-input"
                  inputMode="numeric"
                  value={lotEditForm.sellPrice}
                  onChange={(e) => setLotEditForm((p) => ({ ...p, sellPrice: digitsOnly(e.target.value) }))}
                />
              </label>
            )
          })()}

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Received Date</span>
              <input
                className="portal-input"
                type="date"
                value={lotEditForm.receivedAt}
                onChange={(e) => setLotEditForm((p) => ({ ...p, receivedAt: e.target.value }))}
              />
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Expiry Date</span>
              <input
                className="portal-input"
                type="date"
                value={lotEditForm.expiryDate}
                onChange={(e) => setLotEditForm((p) => ({ ...p, expiryDate: e.target.value }))}
              />
            </label>
          </div>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Supplier</span>
            <input
              className="portal-input"
              value={lotEditForm.supplier}
              onChange={(e) => setLotEditForm((p) => ({ ...p, supplier: e.target.value }))}
            />
          </label>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Note</span>
            <textarea
              className="portal-textarea"
              value={lotEditForm.note}
              onChange={(e) => setLotEditForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
        </form>
      </PortalModal>

      <PortalModal
        open={openLotDeleteConfirm}
        title="Confirm Delete Lot"
        onClose={() => setOpenLotDeleteConfirm(false)}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={() => setOpenLotDeleteConfirm(false)}>
              Cancel
            </button>
            <button type="button" className="portal-modalBtn danger" onClick={onDeleteLot}>
              Delete
            </button>
          </>
        }
      >
        <div className="portal-pageSubtitle" style={{ marginTop: 4 }}>
          Delete lot <b>{lotEditFor?.lotId || '-'}</b>?
        </div>
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
                        <button
                          type="button"
                          className="portal-ghostBtn danger"
                          onClick={() => onDeleteVariant(v)}
                          disabled={Number(digitsOnly(v?.stock) || 0) > 0}
                          title={Number(digitsOnly(v?.stock) || 0) > 0 ? 'Set stock to 0 before deleting' : 'Delete variant'}
                        >
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
          title="Total Products"
          style={{
            '--kpi-accent': 'var(--primary)',
            '--kpi-icon-bg': 'var(--primary-soft)',
          }}
          right={
            <div className="portal-kpiIcon" aria-hidden="true">
              <IconCube />
            </div>
          }
        >
          <div className="portal-kpiValue">{formatVnd(totalProductsCount)}</div>
          <div className="portal-pageSubtitle">{totalProductsSubtitle}</div>
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
          <div className="portal-kpiValue portal-kpiValueLong">{formatVnd(totalImportVnd)} VND</div>
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
          <div className="portal-kpiValue portal-kpiValueLong">{formatVnd(totalStockOutVnd)} VND</div>
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
            {inventoryCategoryOptions.map((c) => (
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
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Date</span>
                      {renderSortToggle('date', 'date')}
                    </div>
                  </th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Transaction Type</span>
                      {renderSortToggle('type', 'transaction type')}
                    </div>
                  </th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Product</span>
                      {renderSortToggle('product', 'product')}
                    </div>
                  </th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Quantity</span>
                      {renderSortToggle('qty', 'quantity')}
                    </div>
                  </th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Total</span>
                      {renderSortToggle('value', 'total value')}
                    </div>
                  </th>
                  <th>Performed By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((h, idx) => {
                  const totalFallback = Number(h?.unitCost || 0) * Math.abs(Number(h?.qty || 0))
                  const totalValue = Number.isFinite(Number(h?.totalVnd))
                    ? Number(h.totalVnd)
                    : Number.isFinite(totalFallback)
                      ? totalFallback
                      : null

                  return (
                  <tr key={`${h.date}-${h.product}-${idx}`}>
                    <td>{h.date}</td>
                    <td>
                      <span className={`portal-badge ${h.type === 'Stock In' ? 'confirmed' : 'cancelled'}`.trim()}>
                        {h.type}
                      </span>
                    </td>
                    <td className="portal-invName">{h.product}</td>
                    <td>
                      <span className={`portal-invQty ${h.qty >= 0 ? 'pos' : 'neg'}`.trim()}>
                        {h.qty >= 0 ? `+${h.qty}` : h.qty}
                      </span>
                    </td>
                    <td>{totalValue !== null ? `${formatVnd(totalValue)} VND` : '-'}</td>
                    <td className="portal-invBy">{h.by}</td>
                    <td className="portal-invNote">{h.note}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </PortalCard>
      ) : (
        <PortalCard
          className="portal-invTableCard"
          title={tab === 'service' ? 'Service Supplies' : tab === 'retail' ? 'Retail Products' : 'Inventory List'}
        >
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Product Name</span>
                      {renderSortToggle('name', 'product name')}
                    </div>
                  </th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Stock</span>
                      {renderSortToggle('stock', 'stock')}
                    </div>
                  </th>
                  <th>Unit</th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Import Price</span>
                      {renderSortToggle('price', 'import price')}
                    </div>
                  </th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Sell Price</span>
                      {renderSortToggle('sellPrice', 'sell price')}
                    </div>
                  </th>
                  <th>
                    <div className="inventory-sortHeader">
                      <span>Total</span>
                      {renderSortToggle('total', 'total')}
                    </div>
                  </th>
                  <th>Last Stock-in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((it) => {
                  const low = Number(it.minQty || 0) > 0 && Number(it.stock || 0) <= Number(it.minQty || 0)
                  const isVariantRow = isVariantItem(it)
                  const typeLabel = it.group === 'retail'
                    ? (isVariantRow ? 'Retail Variant' : 'Retail')
                    : 'Supplies'
                  const importPrice = resolveImportPrice(it)
                  const sellPrice = resolveSellPrice(it)
                  const lots = Array.isArray(it.lots) ? it.lots : []
                  const totalQty = Number(it.totalQty || it.stock || 0)
                  const lotTotalCost = lots.reduce((sum, lot) => sum + Number(lot?.remaining || 0) * Number(lot?.price || 0), 0)
                  const total = lots.length
                    ? lotTotalCost
                    : importPrice !== null
                      ? Number(it.stock || 0) * importPrice
                      : null
                  const lotSummary = summarizeLots(lots)
                  return (
                    <React.Fragment key={it.id || it.name}>
                      <tr>
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
                            {totalQty}
                            <span className="portal-stockIcon" aria-hidden="true">
                              <IconAlertTriangle />
                            </span>
                          </span>
                        ) : (
                          <span>{totalQty}</span>
                        )}
                      </td>
                      <td>{it.unit || '-'}</td>
                      <td>
                        {lots.length > 1 && lotSummary.distinctPrices > 1
                          ? 'Multiple'
                          : importPrice !== null
                            ? `${formatVnd(importPrice)} VND`
                            : '-'}
                      </td>
                      <td>{it.group === 'service' ? 'N/A' : sellPrice !== null ? `${formatVnd(sellPrice)} VND` : '-'}</td>
                      <td>{total !== null ? `${formatVnd(total)} VND` : '-'}</td>
                      <td>{it.lastIn || '-'}</td>
                      <td>
                        <div className="portal-rowActions">
                          <button
                            type="button"
                            className="portal-ghostBtn"
                            onClick={() => {
                              if (!isVariantRow) {
                                openEditFor(it)
                                return
                              }
                              const parent = items.find((x) => {
                                const sameProduct = String(x?.productId || '') === String(it?.productId || '')
                                return sameProduct && !isVariantItem(x) && String(x?.group || '').toLowerCase() === 'retail'
                              })
                              if (parent) openEditFor(parent)
                            }}
                          >
                            {isVariantRow ? 'Edit Product' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="portal-ghostBtn"
                            onClick={() => {
                              setExpandedLots((prev) =>
                                prev.includes(it.id)
                                  ? prev.filter((x) => x !== it.id)
                                  : [...prev, it.id]
                              )
                            }}
                          >
                            {expandedLots.includes(it.id) ? 'Hide Lots' : `Lots (${lots.length})`}
                          </button>
                        </div>
                      </td>
                      </tr>
                      {expandedLots.includes(it.id) ? (
                        <tr className="inventory-lotRow">
                          <td colSpan={10}>
                            {lots.length ? (
                              <div className="inventory-lotTableWrap">
                                <table className="inventory-lotTable">
                                  <thead>
                                    <tr>
                                      <th>Lot</th>
                                      <th>Variant</th>
                                      <th>Remaining</th>
                                      <th>Import Price</th>
                                      <th>Sell Price</th>
                                      <th>Received</th>
                                      <th>Expiry</th>
                                      <th className="inventory-lotActionHead" aria-label="Edit"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lots.map((lot) => (
                                      <tr key={lot.lotId}>
                                        <td>{lot.lotId}</td>
                                        <td>{extractVariantFromLotNote(lot.note) || '-'}</td>
                                        <td>{Number(lot.remaining || 0)}</td>
                                        <td>{Number(lot.price || 0) > 0 ? `${formatVnd(lot.price)} VND` : '-'}</td>
                                        <td>
                                          {it.group === 'service'
                                            ? 'N/A'
                                            : (() => {
                                              const lotVariantName = extractVariantFromLotNote(lot.note)
                                              if (lotVariantName) {
                                                const productVariantId = String(it?.productId || '').trim()
                                                const variantList = variantOptionsByProductId.get(productVariantId) || []
                                                const match = variantList.find(
                                                  (v) => String(v?.name || '').trim().toLowerCase() === lotVariantName.toLowerCase()
                                                )
                                                if (match) {
                                                  const variantItem = items.find((x) => String(x?.id || '') === `variant:${String(match.id || '').trim()}`)
                                                  const variantSell = resolveSellPrice(variantItem)
                                                  if (variantSell !== null) return `${formatVnd(variantSell)} VND`
                                                }
                                              }
                                              const baseSell = resolveSellPrice(it)
                                              return baseSell !== null ? `${formatVnd(baseSell)} VND` : '-'
                                            })()}
                                        </td>
                                        <td>{formatShortDate(lot.receivedAt)}</td>
                                        <td>{formatShortDate(lot.expiryDate)}</td>
                                        <td className="inventory-lotActionCell">
                                          <button
                                            type="button"
                                            className="inventory-lotEditIconBtn"
                                            onClick={() => openEditLot(it, lot)}
                                            aria-label={`Edit lot ${lot.lotId}`}
                                            title="Edit lot"
                                          >
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                              <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                              <path d="m12.5 7.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="portal-pageSubtitle">No active lots</div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </PortalCard>
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

