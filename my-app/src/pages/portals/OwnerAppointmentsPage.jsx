import React, { useEffect, useMemo, useState } from 'react'
import '../../styles/appointments.css'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import {
  IconCalendar,
  IconClock,
  IconSearch,
  IconUser,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

export default function OwnerAppointmentsPage() {
  const [open, setOpen] = useState(false)
  const [appointments, setAppointments] = useState([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [customers, setCustomers] = useState([])
  const [services, setServices] = useState([])
  const [staffMembers, setStaffMembers] = useState([])
  const [form, setForm] = useState({
    customerUserId: '',
    serviceId: '',
    staffId: '',
    date: '',
    time: '',
    note: '',
  })

  async function reloadAppointments() {
    const appt = await api.get('/api/owner/appointments')
    if (Array.isArray(appt)) setAppointments(appt)
  }

  useEffect(() => {
    Promise.all([
      api.get('/api/owner/appointments'),
      api.get('/api/owner/customers'),
      api.get('/api/owner/services'),
      api.get('/api/owner/staff'),
    ])
      .then(([appt, cust, svcSections, staff]) => {
        if (Array.isArray(appt)) setAppointments(appt)
        if (Array.isArray(cust)) setCustomers(cust)
        if (Array.isArray(staff)) setStaffMembers(staff)

        const flatServices = []
        if (Array.isArray(svcSections)) {
          for (const section of svcSections) {
            if (section && Array.isArray(section.items)) {
              for (const it of section.items) {
                flatServices.push(it)
              }
            }
          }
        }
        setServices(flatServices)
      })
      .catch((err) => console.error(err))
  }, [])

  const customerOptions = useMemo(
    () => customers.map((c) => ({ id: c.id, name: c.name })),
    [customers]
  )
  const serviceOptions = useMemo(
    () => services.map((s) => ({ id: s.id, name: s.name })),
    [services]
  )
  const staffOptions = useMemo(
    () => staffMembers.map((s) => ({ id: s.id, name: s.name })),
    [staffMembers]
  )

  function close() {
    setOpen(false)
    setEditing(null)
  }

  function openCreate() {
    setEditing(null)
    setForm({ customerUserId: '', serviceId: '', staffId: '', date: '', time: '', note: '' })
    setOpen(true)
  }

  function openEdit(appt) {
    if (!appt) return
    setEditing(appt)
    setForm({
      customerUserId: appt.customerUserId ? String(appt.customerUserId) : '',
      serviceId: appt.serviceId ? String(appt.serviceId) : '',
      staffId: appt.staffId ? String(appt.staffId) : '',
      date: appt.date || '',
      time: appt.timeValue || '',
      note: appt.note || '',
    })
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()

    try {
      const payload = {
        customerUserId: form.customerUserId,
        serviceId: form.serviceId,
        staffId: form.staffId,
        date: form.date,
        time: form.time,
        note: form.note,
      }

      if (editing?.id) {
        await api.put(`/api/owner/appointments/${editing.id}`, payload)
      } else {
        await api.post('/api/owner/appointments', payload)
      }

      await reloadAppointments()

      setForm({ customerUserId: '', serviceId: '', staffId: '', date: '', time: '', note: '' })
      close()
    } catch (err) {
      console.error(err)
    }
  }

  async function onCancel(appt) {
    if (!appt?.id) return

    try {
      await api.del(`/api/owner/appointments/${appt.id}`)
      await reloadAppointments()
    } catch (err) {
      console.error(err)
    }
  }

  const filteredAppointments = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return appointments

    return appointments.filter((a) => {
      const customer = String(a?.customer || '').toLowerCase()
      const service = String(a?.service || '').toLowerCase()
      const staff = String(a?.staff || '').toLowerCase()
      const status = String(a?.status || '').toLowerCase()
      const time = String(a?.time || '').toLowerCase()
      const day = String(a?.day || '').toLowerCase()
      const month = String(a?.month || '').toLowerCase()
      return (
        customer.includes(q) ||
        service.includes(q) ||
        staff.includes(q) ||
        status.includes(q) ||
        time.includes(q) ||
        day.includes(q) ||
        month.includes(q)
      )
    })
  }, [appointments, query])

  return (
    <div className="appointments-page">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <button type="button" className="portal-primaryBtn" onClick={openCreate}>
          <span className="portal-primaryBtnIcon" aria-hidden="true">
            +
          </span>
          Add Appointment
        </button>
      </div>

      <PortalModal
        open={open}
        title={editing ? 'Edit Appointment' : 'Add New Appointment'}
        onClose={close}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form="appt-form" className="portal-modalBtn portal-modalBtnPrimary">
              {editing ? 'Save Changes' : 'Create Appointment'}
            </button>
          </>
        }
      >
        <form id="appt-form" onSubmit={onSubmit}>
          <label className="portal-field">
            <span className="portal-label">Customer</span>
            <select
              className="portal-select"
              value={form.customerUserId}
              onChange={(e) => setForm((p) => ({ ...p, customerUserId: e.target.value }))}
            >
              <option value="">Select customer</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="portal-field">
            <span className="portal-label">Service</span>
            <select
              className="portal-select"
              value={form.serviceId}
              onChange={(e) => setForm((p) => ({ ...p, serviceId: e.target.value }))}
            >
              <option value="">Select service</option>
              {serviceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="portal-field">
            <span className="portal-label">Staff</span>
            <select
              className="portal-select"
              value={form.staffId}
              onChange={(e) => setForm((p) => ({ ...p, staffId: e.target.value }))}
            >
              <option value="">Select staff</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Date</span>
              <div className="portal-inputWithIcon">
                <input
                  className="portal-input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                />
                <span className="portal-inputIcon" aria-hidden="true">
                  <IconCalendar />
                </span>
              </div>
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Time</span>
              <div className="portal-inputWithIcon">
                <input
                  className="portal-input"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                />
                <span className="portal-inputIcon" aria-hidden="true">
                  <IconClock />
                </span>
              </div>
            </label>
          </div>

          <label className="portal-field">
            <span className="portal-label">Notes</span>
            <textarea
              className="portal-textarea"
              placeholder="Add notes (optional)"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
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
          placeholder="Search appointments by customer, service, staff..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <PortalCard className="portal-apptCard">
        <div className="portal-apptList" role="list">
          {filteredAppointments.map((a) => (
            <div
              key={a.id || `${a.customer}-${a.time}`}
              className="portal-apptItem"
              role="listitem"
            >
              <div className="portal-apptDate" aria-label="Appointment date">
                <div className="portal-apptDay">{a.day}</div>
                <div className="portal-apptMonth">{a.month}</div>
              </div>

              <div className="portal-apptInfo">
                <div className="portal-apptTop">
                  <div className="portal-apptName">{a.customer}</div>
                  <span className="portal-pill portal-pillBlue">{a.status}</span>
                </div>

                <div className="portal-apptMetaRow">
                  <span className="portal-apptMeta">
                    <span className="portal-apptMetaIcon" aria-hidden="true">
                      <IconClock />
                    </span>
                    {a.time} ({a.duration})
                  </span>
                  <span className="portal-apptMeta">
                    <span className="portal-apptMetaIcon" aria-hidden="true">
                      <IconUser />
                    </span>
                    {a.staff}
                  </span>
                </div>

                <div className="portal-apptService">
                  <span className="portal-apptServiceIcon" aria-hidden="true">
                    <IconCalendar />
                  </span>
                  {a.service}
                </div>
              </div>

              <div className="portal-apptRight">
                <div className="portal-apptPrice">{a.price}</div>
                <div className="portal-apptActions">
                  <button type="button" className="portal-ghostBtn" onClick={() => openEdit(a)}>
                    Edit
                  </button>
                  <button type="button" className="portal-ghostBtn danger" onClick={() => onCancel(a)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PortalCard>
    </div>
  )
}
