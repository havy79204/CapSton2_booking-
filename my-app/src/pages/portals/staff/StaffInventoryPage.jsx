import React, { useEffect, useMemo, useState } from 'react'
import PortalCard from '../../../components/Layout portal/PortalCard.jsx'
import '../../../styles/inventory.css'
import '../../../styles/global-buttons.css'
import { api } from '../../../lib/api.js'

import {
  IconAlertTriangle,
  IconCalendar,
  IconClock,
  IconCube,
  IconDownload,
  IconSearch,
} from '../../../components/Layout portal/PortalIcons.jsx'

function formatMoney(value) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US')
}

export default function StaffInventoryPage() {
  const [tab, setTab] = useState('all')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/api/staff/inventory')
      setItems(data)
    } catch (err) {
      setError(err?.message || 'Unable to load inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const categories = useMemo(() => {
    const set = new Set()
    for (const it of items) {
      if (it?.category) set.add(it.category)
    }
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = items.filter((it) => {
      const name = String(it?.name || '').toLowerCase()
      const category = String(it?.category || '').toLowerCase()
      const status = String(it?.status || '').toLowerCase()
      const queryMatch = !q || name.includes(q) || category.includes(q)
      const categoryMatch = categoryFilter === 'all' || it?.category === categoryFilter
      const statusMatch = statusFilter === 'all' || status === statusFilter
      return queryMatch && categoryMatch && statusMatch
    })
    if (tab === 'service') return base.filter((i) => i.group === 'service')
    if (tab === 'retail') return base.filter((i) => i.group === 'retail')
    return base
  }, [items, query, tab, categoryFilter, statusFilter])

  const serviceItems = useMemo(() => filtered.filter((i) => i.group === 'service'), [filtered])
  const retailItems = useMemo(() => filtered.filter((i) => i.group === 'retail'), [filtered])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length])

  function openEdit(item) {
    const itemName = String(item?.name || '').trim() || 'this item'
    setError(`View only mode: ${itemName}`)
  }

  return (
    <div className="inventory-page">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <div className="portal-headerActions">
          <h1 className="portal-pageTitle">Inventory</h1>
          
          <button
            type="button"
            className="portal-successBtn"
            onClick={() => {
              setError('Stock In feature - View Only Mode')
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
              setError('Stock Out feature - View Only Mode')
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
              setError('Add Product feature - View Only Mode')
            }}
          >
            <span className="portal-primaryBtnIcon" aria-hidden="true">
              +
            </span>
            Add Product
          </button>

          <button 
            type="button" 
            className="portal-primaryBtn" 
            onClick={() => {
              setError('Add Category feature - View Only Mode')
            }}
          >
            <span className="portal-primaryBtnIcon" aria-hidden="true">
              +
            </span>
            Add Category
          </button>
        </div>
      </div>

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
      </div>

      <div className="inventory-filterRow">
        <label className="portal-field inventory-filterField">
          <span className="portal-label">Search</span>
          <input 
            className="portal-input" 
            placeholder="Search items..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="portal-field inventory-filterField">
          <span className="portal-label">Category</span>
          <select className="portal-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="portal-field inventory-filterField">
          <span className="portal-label">Status</span>
          <select className="portal-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {tab === 'all' ? (
        <PortalCard className="portal-invTableCard" title="Inventory List">
          {error ? <div className="portal-formError" role="alert">{error}</div> : null}
          {loading ? <div className="portal-pageSubtitle">Loading...</div> : null}
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Min Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((it) => (
                  <tr key={it.id}>
                    <td className="portal-invName">{it.name}</td>
                    <td><span className="portal-invPill">{it.category || '-'}</span></td>
                    <td>{formatMoney(it.stock)}</td>
                    <td>{it.unit || '-'}</td>
                    <td>{formatMoney(it.minQty)}</td>
                    <td><span className="portal-invPill">{it.status || 'active'}</span></td>
                    <td>
                      <div className="portal-rowActions">
                        <button type="button" className="portal-ghostBtn" onClick={() => openEdit(it)}>View</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedItems.length === 0 && <tr><td colSpan={7}>No items found.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="inventory-pagination">
            <button 
              type="button" 
              className="inventory-paginationBtn" 
              disabled={page <= 1} 
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <span className="inventory-paginationText">Page {page} / {totalPages}</span>
            <button 
              type="button" 
              className="inventory-paginationBtn" 
              disabled={page >= totalPages} 
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
          </div>
        </PortalCard>
      ) : (
        <div className="portal-invSections">
          {(tab === 'all' || tab === 'service') && serviceItems.length > 0 ? (
            <PortalCard className="portal-invSection">
              <div className="portal-invSectionHead">
                <h3 className="portal-invSectionTitle">Service Supplies</h3>
                <span className="portal-invSectionCount">{serviceItems.length} items</span>
              </div>
              <div className="portal-tableWrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Quantity</th>
                      <th>Unit</th>
                      <th>Min Stock</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceItems.slice(0, 10).map((it) => (
                      <tr key={it.id}>
                        <td className="portal-invName">{it.name}</td>
                        <td><span className="portal-invPill">{it.category || '-'}</span></td>
                        <td>{formatMoney(it.stock)}</td>
                        <td>{it.unit || '-'}</td>
                        <td>{formatMoney(it.minQty)}</td>
                        <td><span className="portal-invPill">{it.status || 'active'}</span></td>
                        <td>
                          <div className="portal-rowActions">
                            <button type="button" className="portal-ghostBtn" onClick={() => openEdit(it)}>View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PortalCard>
          ) : null}

          {(tab === 'all' || tab === 'retail') && retailItems.length > 0 ? (
            <PortalCard className="portal-invSection">
              <div className="portal-invSectionHead">
                <h3 className="portal-invSectionTitle">Retail Products</h3>
                <span className="portal-invSectionCount">{retailItems.length} items</span>
              </div>
              <div className="portal-tableWrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Quantity</th>
                      <th>Unit</th>
                      <th>Min Stock</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retailItems.slice(0, 10).map((it) => (
                      <tr key={it.id}>
                        <td className="portal-invName">{it.name}</td>
                        <td><span className="portal-invPill">{it.category || '-'}</span></td>
                        <td>{formatMoney(it.stock)}</td>
                        <td>{it.unit || '-'}</td>
                        <td>{formatMoney(it.minQty)}</td>
                        <td><span className="portal-invPill">{it.status || 'active'}</span></td>
                        <td>
                          <div className="portal-rowActions">
                            <button type="button" className="portal-ghostBtn" onClick={() => openEdit(it)}>View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PortalCard>
          ) : null}
        </div>
      )}
    </div>
  )
}
