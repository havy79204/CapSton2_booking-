import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/customers.css'
import {
  IconSearch,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function getAccountStatus(statusFromDb, lastVisitDateString) {
  // Prefer explicit DB status when provided
  const s = statusFromDb ? String(statusFromDb).trim().toLowerCase() : ''
  if (s) {
    if (s === 'deleted') return { status: 'Deleted', color: '#6c757d' }
    if (s === 'inactive') return { status: 'Inactive', color: '#ff7b00' }
    if (s === 'active') return { status: 'Active', color: '#28a745' }
    // unknown token from DB — fallthrough to last-visit logic below
  }

  // If never visited, return inactive
  if (!lastVisitDateString || lastVisitDateString === 'Never' || lastVisitDateString === '') {
    return { status: 'Inactive', color: '#dc3545' }
  }

  // Parse the date (assuming format like "10/3/2026" or "DD/MM/YYYY")
  try {
    const parts = String(lastVisitDateString).split('/')
    if (parts.length < 3) {
      return { status: 'Inactive', color: '#dc3545' }
    }
    
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1 // JS months are 0-indexed
    const year = parseInt(parts[2], 10)
    
    const lastVisitDate = new Date(year, month, day)
    const now = new Date()
    const daysDifference = Math.floor((now - lastVisitDate) / (1000 * 60 * 60 * 24))
    
    // If last visit is within 90 days, mark as active
    if (daysDifference <= 90) {
      return { status: 'Active', color: '#28a745' }
    } else {
      return { status: 'Inactive', color: '#dc3545' }
    }
  } catch {
    return { status: 'Unknown', color: '#6c757d' }
  }
}

export default function OwnerCustomersPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [customers, setCustomers] = useState([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [customerToDelete, setCustomerToDelete] = useState(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    status: 'Active',
  })
  const [deletingId, setDeletingId] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      const data = await api.get('/api/owner/customers')
      if (Array.isArray(data)) setCustomers(data)
    } catch (err) {
      console.error(err)
    }
  }

  function close() {
    setOpen(false)
    setEditing(null)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', phone: '', email: '', status: 'Active' })
    setOpen(true)
  }

  function openEdit(customer) {
    if (!customer) return
    setEditing(customer)
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      status: customer.status || 'Active',
    })
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    // For create require a name; for edit allow partial updates (status-only, etc.)
    if (!editing && !form.name) return

    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        status: form.status,
      }

      if (editing?.id) {
        // For edit, remove empty name to allow partial update
        const putPayload = { ...payload }
        if (!putPayload.name) delete putPayload.name
        await api.put(`/api/owner/customers/${editing.id}`, putPayload)
      } else {
        await api.post('/api/owner/customers', payload)
      }

      setForm({ name: '', phone: '', email: '', status: 'Active' })
      close()
      await loadCustomers()
    } catch (err) {
      console.error(err)
    }
  }

  async function onDeleteCustomer(customer) {
    if (!customer) return
    setCustomerToDelete(customer)
    setDeleteConfirmOpen(true)
  }

  async function confirmDelete() {
    if (!customerToDelete) return
    const customerId = customerToDelete?.id || customerToDelete?.email
    if (!customerId) return

    try {
      setDeletingId(customerId)
      await api.del(`/api/owner/customers/${customerId}`)
      await loadCustomers()
      setDeleteConfirmOpen(false)
      setCustomerToDelete(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId('')
    }
  }

  function cancelDelete() {
    setDeleteConfirmOpen(false)
    setCustomerToDelete(null)
  }

  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const parseDate = (dateString) => {
    if (!dateString || dateString === 'Never') return new Date(0)
    try {
      const parts = String(dateString).split('/')
      if (parts.length < 3) return new Date(0)
      const day = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const year = parseInt(parts[2], 10)
      return new Date(year, month, day)
    } catch {
      return new Date(0)
    }
  }

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase()
    let result = customers
    
    if (q) {
      result = customers.filter((c) => {
        const name = String(c?.name || '').toLowerCase()
        const phone = String(c?.phone || '').toLowerCase()
        const email = String(c?.email || '').toLowerCase()
        return name.includes(q) || phone.includes(q) || email.includes(q)
      })
    }

    // Filter by date range
    if (fromDate || toDate) {
      result = result.filter((c) => {
        const customerDate = parseDate(c.last)
        if (fromDate) {
          const from = new Date(fromDate)
          from.setHours(0, 0, 0, 0)
          if (customerDate < from) return false
        }
        if (toDate) {
          const to = new Date(toDate)
          to.setHours(23, 59, 59, 999)
          if (customerDate > to) return false
        }
        return true
      })
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let aValue, bValue

      switch (sortBy) {
        case 'name':
          aValue = (a.name || '').toLowerCase()
          bValue = (b.name || '').toLowerCase()
          break
        case 'phone':
          aValue = (a.phone || '').toLowerCase()
          bValue = (b.phone || '').toLowerCase()
          break
        case 'email':
          aValue = (a.email || '').toLowerCase()
          bValue = (b.email || '').toLowerCase()
          break
        case 'status':
          aValue = (a.status || '').toLowerCase()
          bValue = (b.status || '').toLowerCase()
          break
        case 'last':
          aValue = parseDate(a.last)
          bValue = parseDate(b.last)
          break
        default:
          return 0
      }

      if (typeof aValue === 'string') {
        const comparison = aValue.localeCompare(bValue)
        return sortOrder === 'asc' ? comparison : -comparison
      } else {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue
      }
    })

    return result
  }, [customers, query, sortBy, sortOrder, fromDate, toDate])

  return (
    <div className="customers-page">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <button type="button" className="portal-primaryBtn" onClick={openCreate}>
          <span className="portal-primaryBtnIcon" aria-hidden="true">
            +
          </span>
          Add customer
        </button>
      </div>

      <PortalModal
        open={open}
        title={editing ? 'Edit customer' : 'Add new customer'}
        onClose={close}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form="customer-form" className="portal-modalBtn portal-modalBtnPrimary">
              {editing ? 'Save changes' : 'Add customer'}
            </button>
          </>
        }
      >
        <form id="customer-form" onSubmit={onSubmit}>
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
            <span className="portal-label">Account Status</span>
            <select className="portal-select" value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Deleted">Deleted</option>
            </select>
          </label>
        </form>
      </PortalModal>

      <PortalModal
        open={deleteConfirmOpen}
        title="Delete Customer"
        onClose={cancelDelete}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={cancelDelete}>
              Cancel
            </button>
            <button 
              type="button" 
              className="portal-modalBtn portal-modalBtnPrimary" 
              onClick={confirmDelete}
              disabled={deletingId === (customerToDelete?.id || customerToDelete?.email)}
              style={{ backgroundColor: deletingId === (customerToDelete?.id || customerToDelete?.email) ? '#ccc' : '#e74c3c' }}
            >
              {deletingId === (customerToDelete?.id || customerToDelete?.email) ? 'Deleting...' : 'Delete'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '15px', color: '#1f2937', marginBottom: '12px', lineHeight: '1.5', fontWeight: '500' }}>
          Are you sure you want to delete <strong>{customerToDelete?.name}</strong>?
        </p>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0' }}>
          This action cannot be undone.
        </p>
      </PortalModal>

      <div className="portal-customer">
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div className="portal-search portal-searchFull" role="search" style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center' }}>
          <span className="portal-searchIcon" aria-hidden="true">
            <IconSearch />
          </span>
          <input
            className="portal-searchInput"
            placeholder="Search customers by name, phone number, or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', justifyContent: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#301103', whiteSpace: 'nowrap', marginBottom: '6px' }}>
            From:
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid #d4af86',
              fontSize: '12px',
              backgroundColor: '#fff',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', justifyContent: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#301103', whiteSpace: 'nowrap', marginBottom: '6px' }}>
            To:
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid #d4af86',
              fontSize: '12px',
              backgroundColor: '#fff',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => {
              setFromDate('')
              setToDate('')
            }}
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#f0f0f0',
              color: '#666',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: '0.2s',
              marginBottom: '0px',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e0e0e0'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#f0f0f0'}
          >
            Clear dates
          </button>
        )}
      </div>

      <div className="portal-tableWrap" style={{ marginTop: 8 }}>
        <table className="portal-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                Name {sortBy === 'name' && <span style={{ marginLeft: '4px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('phone')}>
                Phone {sortBy === 'phone' && <span style={{ marginLeft: '4px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('email')}>
                Email {sortBy === 'email' && <span style={{ marginLeft: '4px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                Account Status {sortBy === 'status' && <span style={{ marginLeft: '4px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th>Visits</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('last')}>
                Last visit {sortBy === 'last' && <span style={{ marginLeft: '4px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={7}>No customers found.</td>
              </tr>
            ) : (
              filteredCustomers.map((c) => (
                <tr key={c.id || c.email || c.name}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.email}</td>
                  <td><span className="portal-invPill">{getAccountStatus(c.status, c.last).status}</span></td>
                  <td>{c.visits}</td>
                  <td>{c.last}</td>
                  <td>
                    <button type="button" className="portal-ghostBtn" onClick={() => openEdit(c)}>
                      Edit
                    </button>
                    <button type="button" className="portal-ghostBtn" onClick={() => navigate(`/portals/owner/customers/${c.id || c.email}`)}>
                      View
                    </button>
                    <button 
                      type="button" 
                      className="portal-ghostBtn" 
                      onClick={() => onDeleteCustomer(c)}
                      disabled={deletingId === (c.id || c.email)}
                    >
                      {deletingId === (c.id || c.email) ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
