import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/customers.css'
import {
  IconSearch,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function getAccountStatus(lastVisitDateString) {
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
  const [customers, setCustomers] = useState([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
  })
  const [deletingId, setDeletingId] = useState('')

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
    setForm({ name: '', phone: '', email: '' })
    setOpen(true)
  }

  function openEdit(customer) {
    if (!customer) return
    setEditing(customer)
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
    })
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.name) return

    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
      }

      if (editing?.id) {
        await api.put(`/api/owner/customers/${editing.id}`, payload)
      } else {
        await api.post('/api/owner/customers', payload)
      }

      setForm({ name: '', phone: '', email: '' })
      close()
      await loadCustomers()
    } catch (err) {
      console.error(err)
    }
  }

  async function onDeleteCustomer(customer) {
    const customerId = customer?.id || customer?.email
    if (!customerId) return
    if (!window.confirm(`Delete customer ${customer.name}?`)) return

    try {
      setDeletingId(customerId)
      await api.del(`/api/owner/customers/${customerId}`)
      await loadCustomers()
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId('')
    }
  }

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers

    return customers.filter((c) => {
      const name = String(c?.name || '').toLowerCase()
      const phone = String(c?.phone || '').toLowerCase()
      const email = String(c?.email || '').toLowerCase()
      return name.includes(q) || phone.includes(q) || email.includes(q)
    })
  }, [customers, query])

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
        </form>
      </PortalModal>

      <div className="portal-customer">
      <div className="portal-search portal-searchFull" role="search">
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

      <div className="portal-tableWrap" style={{ marginTop: 8 }}>
        <table className="portal-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Account Status</th>
              <th>Visits</th>
              <th>Last visit</th>
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
                  <td><span style={{ color: getAccountStatus(c.last).color, fontWeight: '600' }}>{getAccountStatus(c.last).status}</span></td>
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
