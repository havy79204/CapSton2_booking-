import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import '../../styles/customers.css'
import {
  IconMail,
  IconPhone,
  IconSearch,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function initialOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase()
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

  useEffect(() => {
    api
      .get('/api/owner/customers')
      .then((data) => {
        if (Array.isArray(data)) setCustomers(data)
      })
      .catch((err) => console.error(err))
  }, [])

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

      const fresh = await api.get('/api/owner/customers')
      if (Array.isArray(fresh)) setCustomers(fresh)

      setForm({ name: '', phone: '', email: '' })
      close()
    } catch (err) {
      console.error(err)
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

      <div className="portal-customerGrid" role="list">
        {filteredCustomers.map((c) => (
          <PortalCard key={c.id || c.email || c.name} className="portal-customerCard" role="listitem">
            <div className="portal-customerTop">
              <div className="portal-customerAvatar" aria-hidden="true">
                {initialOf(c.name)}
              </div>

              <div className="portal-customerActions">
                <button type="button" className="portal-ghostBtn portal-customerEdit" onClick={() => openEdit(c)}>
                  Edit
                </button>
                <button type="button" className="portal-ghostBtn portal-customerView" onClick={() => navigate(`/portals/owner/customers/${c.id || c.email}`)}>
                  View
                </button>
              </div>
            </div>

            <div className="portal-customerName">{c.name}</div>

            <div className="portal-customerContacts">
              <div className="portal-staffContact">
                <span className="portal-staffContactIcon" aria-hidden="true">
                  <IconPhone />
                </span>
                <span className="portal-staffContactText">{c.phone}</span>
              </div>
              <div className="portal-staffContact">
                <span className="portal-staffContactIcon" aria-hidden="true">
                  <IconMail />
                </span>
                <span className="portal-staffContactText">{c.email}</span>
              </div>
            </div>

            <div className="portal-staffDivider" aria-hidden="true" />

            <div className="portal-customerStats">
              <div>
                <div className="portal-customerStatLabel">Visits</div>
                <div className="portal-customerStatValue">{c.visits}</div>
              </div>
              <div className="portal-customerStatRight">
                <div className="portal-customerStatLabel">Last visit</div>
                <div className="portal-customerStatValue">{c.last}</div>
              </div>
            </div>
          </PortalCard>
        ))}
      </div>
      </div>
    </div>
  )
}
