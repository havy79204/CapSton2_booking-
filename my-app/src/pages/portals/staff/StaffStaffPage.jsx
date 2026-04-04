import React, { useEffect, useState } from 'react'
import PortalCard from '../../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../../components/Layout portal/PortalModal.jsx'
import '../../../styles/staff.css'
import '../../../styles/global-buttons.css'
import { IconCalendar, IconDollar, IconUsers } from '../../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../../lib/api.js'

function formatMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '0 ₫'
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} ₫`
}

function todayDateInputValue() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function StaffStaffPage() {
  const PAGE_SIZE = 10
  const [staffMembers, setStaffMembers] = useState([])
  const [staffSummary, setStaffSummary] = useState({ totalStaff: 0, totalBookings: 0, totalSalary: 0 })
  const [staffLoading, setStaffLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', hireDate: todayDateInputValue() })

  async function loadStaffMembers() {
    setStaffLoading(true)
    try {
      const params = new URLSearchParams({ keyword: query.trim(), page: '1', pageSize: '100' })
      const data = await api.get(`/api/staff/staff?${params.toString()}`)
      setStaffMembers(Array.isArray(data.items) ? data.items : [])
      setStaffSummary(data.summary || { totalStaff: 0, totalBookings: 0, totalSalary: 0 })
    } catch (err) {
      console.error(err)
    } finally {
      setStaffLoading(false)
    }
  }

  useEffect(() => {
    loadStaffMembers()
  }, [query])

  function close() {
    setOpen(false)
  }

  function openAddModal() {
    setForm({ name: '', phone: '', email: '', address: '', hireDate: todayDateInputValue() })
    setOpen(true)
  }

  function openDetail(member) {
    setSelectedStaff(member)
    setDetailOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    try {
      await api.post('/api/staff/staff', form)
      await loadStaffMembers()
      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Staff added successfully', title: 'Completed' } 
      }))
      close()
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Unable to add staff')
    }
  }

  const totalRows = staffMembers.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const visibleStaffMembers = staffMembers.slice(pageStart, pageStart + PAGE_SIZE)

  return (
    <div className="staff-page">
      <div className="staff-dashboardGrid">
        <PortalCard className="staff-dashboardCard" title="Total Staff">
          <div className="staff-dashboardStatRow">
            <div className="staff-dashboardValue">{Number(staffSummary.totalStaff || 0)}</div>
            <div className="staff-dashboardIcon"><IconUsers /></div>
          </div>
        </PortalCard>
        <PortalCard className="staff-dashboardCard" title="Total Booking">
          <div className="staff-dashboardStatRow">
            <div className="staff-dashboardValue">{Number(staffSummary.totalBookings || 0)}</div>
            <div className="staff-dashboardIcon"><IconCalendar /></div>
          </div>
        </PortalCard>
        <PortalCard className="staff-dashboardCard" title="Total Salary">
          <div className="staff-dashboardStatRow">
            <div className="staff-dashboardValue">{formatMoney(staffSummary.totalSalary)}</div>
            <div className="staff-dashboardIcon"><IconDollar /></div>
          </div>
        </PortalCard>
      </div>

      <PortalModal open={open} title="Add new staff member" onClose={close}
        footer={<>
          <button type="button" className="portal-modalBtn" onClick={close}>Cancel</button>
          <button type="submit" form="staff-form" className="portal-modalBtn portal-modalBtnPrimary">Add staff</button>
        </>}>
        <form id="staff-form" onSubmit={onSubmit}>
          <div className="staff-detailGrid">
            <label className="portal-field">
              <span className="portal-label">Full name</span>
              <input className="portal-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="portal-field">
              <span className="portal-label">Phone number</span>
              <input className="portal-input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </label>
            <label className="portal-field">
              <span className="portal-label">Email</span>
              <input className="portal-input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </label>
            <label className="portal-field">
              <span className="portal-label">Hire Date</span>
              <input type="date" className="portal-input" value={form.hireDate} onChange={(e) => setForm((p) => ({ ...p, hireDate: e.target.value }))} />
            </label>
          </div>
          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Address</span>
            <textarea className="portal-input" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          </label>
        </form>
      </PortalModal>

      <PortalModal open={detailOpen} title="Staff profile" onClose={() => setDetailOpen(false)}
        footer={<button type="button" className="portal-modalBtn" onClick={() => setDetailOpen(false)}>Close</button>}>
        {selectedStaff && (
          <div className="staff-detailForm">
            <div className="staff-detailSection">
              <div className="staff-detailSectionTitle">Basic Information</div>
              <div className="staff-detailGrid">
                <div><strong>Name:</strong> {selectedStaff.name}</div>
                <div><strong>Phone:</strong> {selectedStaff.phone}</div>
                <div><strong>Email:</strong> {selectedStaff.email}</div>
                <div><strong>Hire Date:</strong> {selectedStaff.hireDate}</div>
              </div>
            </div>
            <div className="staff-detailSection">
              <div className="staff-detailSectionTitle">Address</div>
              <p>{selectedStaff.address || '-'}</p>
            </div>
          </div>
        )}
      </PortalModal>

      <PortalCard title="Staff List" right={<button type="button" className="portal-primaryBtn" onClick={openAddModal}>+ Add Staff</button>}>
        <div className="portal-search" style={{ marginBottom: 16 }}>
          <input className="portal-searchInput" placeholder="Search staff..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {staffLoading ? <div>Loading...</div> : (
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr><th>Name</th><th>Phone</th><th>Email</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {visibleStaffMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.phone}</td>
                    <td>{m.email}</td>
                    <td><span className="portal-badge">{m.status || 'Active'}</span></td>
                    <td><button type="button" className="portal-ghostBtn" onClick={() => openDetail(m)}>View</button></td>
                  </tr>
                ))}
                {visibleStaffMembers.length === 0 && <tr><td colSpan={5}>No staff found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="products-pagination">
          <button type="button" className="products-paginationBtn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>‹</button>
          <span>Page {currentPage} / {totalPages}</span>
          <button type="button" className="products-paginationBtn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>›</button>
        </div>
      </PortalCard>
    </div>
  )
}
