import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import { api, resolveApiImageUrl } from '../../lib/api.js'

function StaffAvatar({ avatarUrl, name }) {
  const src = resolveApiImageUrl(avatarUrl)
  if (src) return <div className="portal-staffAvatar"><img src={src} alt={name || 'Staff'} /></div>
  return <div className="portal-staffAvatar">{(name || 'S').slice(0, 1)}</div>
}

export default function PendingRequestsPage() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filteredRequests, setFilteredRequests] = useState([])
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  async function load() {
    setLoading(true)
    try {
      // Request all off-schedule rows from the backend (no week filtering)
      const data = await api.get('/api/owner/schedule?all=1')
      if (data && Array.isArray(data.pendingRequests)) setRequests(data.pendingRequests)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  function weekdayNameFromIndex(idx) {
    const map = {
      1: 'Mon',
      2: 'Tue',
      3: 'Wed',
      4: 'Thu',
      5: 'Fri',
      6: 'Sat',
      7: 'Sun',
    }
    return map[Number(idx)] || ''
  }

  function formatDateDMY(val) {
    if (!val) return ''
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return String(val)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  function shiftLabel(startHour) {
    if (startHour === null || startHour === undefined) return ''
    const s = String(startHour || '').trim()
    if (!s) return ''

    // Exact mappings preferred (handles SQL Server formats like '08:00:00.0000000')
    if (/^\s*08\b|^08:\d{2}/.test(s)) return 'Morning'
    if (/^\s*13\b|^13:\d{2}/.test(s)) return 'Afternoon'
    if (/^\s*16\b|^16:\d{2}/.test(s)) return 'Evening'

    // Full day / keywords
    if (/full|all|ca ngay|cả ngày/i.test(s)) return 'Full Day'

    // Fallback: try to extract leading hour number
    const m = s.match(/(\d{1,2})/)
    if (m) {
      const hh = Number(m[1])
      if (!Number.isNaN(hh)) {
        if (hh < 12) return 'Morning'
        if (hh < 16) return 'Afternoon'
        return 'Evening'
      }
    }

    return s
  }

  function monthRange(monthDate) {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)
    return {
      start,
      end,
      label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }

  const inSelectedMonth = useCallback((row) => {
    const { start, end } = monthRange(currentMonth)
    const rowStart = row?.StartDate ? new Date(row.StartDate) : null
    const rowEnd = row?.EndDate ? new Date(row.EndDate) : rowStart
    if (!rowStart || Number.isNaN(rowStart.getTime())) return false
    const endDate = rowEnd && !Number.isNaN(rowEnd.getTime()) ? rowEnd : rowStart
    return rowStart <= end && endDate >= start
  }, [currentMonth])

  const applyFilters = useCallback((source = requests) => {
    const s = String(search || '').trim().toLowerCase()
    const base = (source || []).filter((r) => {
      const name = String(r?.StaffName || '').toLowerCase()
      if (s && !name.includes(s)) return false
      return true
    })
    const byMonth = base.filter((r) => inSelectedMonth(r))
    setFilteredRequests(byMonth.length ? byMonth : base)
  }, [requests, search, inSelectedMonth])

  useEffect(() => { load() }, [])
  useEffect(() => { applyFilters(requests) }, [requests, applyFilters])

  async function approve(r) {
    try {
      await api.post('/api/owner/schedule/shifts/approve', { offScheduleId: r.OffScheduleId, staffId: r.StaffId, weekStartDate: r.StartDate || '', dayIndex: (r.DayIndex ? (Number(r.DayIndex) - 1) : 0), date: r.StartDate || '' })
      await load()
    } catch (err) {
      console.error(err)
    }
  }

  async function rejectReq(r) {
    try {
      await api.post('/api/owner/schedule/shifts/reject', { offScheduleId: r.OffScheduleId, staffId: r.StaffId, weekStartDate: r.StartDate || '', dayIndex: (r.DayIndex ? (Number(r.DayIndex) - 1) : 0), date: r.StartDate || '' })
      await load()
    } catch (err) {
      console.error(err)
    }
  }

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editStatus, setEditStatus] = useState('Pending')

  function closeEdit() {
    setEditOpen(false)
    setEditing(null)
  }

  async function doUpdateStatus() {
    if (!editing) return
    try {
      if (String(editStatus).toLowerCase() === 'approved') {
        await api.post('/api/owner/schedule/shifts/approve', { offScheduleId: editing.OffScheduleId, staffId: editing.StaffId, weekStartDate: editing.StartDate || '', dayIndex: (editing.DayIndex ? (Number(editing.DayIndex) - 1) : 0), date: editing.StartDate || '' })
      } else if (String(editStatus).toLowerCase() === 'rejected') {
        await api.post('/api/owner/schedule/shifts/reject', { offScheduleId: editing.OffScheduleId, staffId: editing.StaffId, weekStartDate: editing.StartDate || '', dayIndex: (editing.DayIndex ? (Number(editing.DayIndex) - 1) : 0), date: editing.StartDate || '' })
      }
      await load()
      closeEdit()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="schedule-page portal-cardInner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Pending Time-off Requests</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="portal-outlineBtn" onClick={() => navigate(-1)}>Back</button>
          <button className="portal-primaryBtn" onClick={() => navigate('/portals/owner/schedule')}>Schedule</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 56px', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button type="button" className="portal-outlineBtn" onClick={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month">&lt;</button>
        <div style={{ textAlign: 'center', fontSize: 34, fontWeight: 700, color: '#111827' }}>{monthRange(currentMonth).label}</div>
        <button type="button" className="portal-outlineBtn" onClick={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month">&gt;</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input placeholder="Tìm tên nhân viên..." value={search} onChange={(e) => setSearch(e.target.value)} className="portal-input" style={{ width: 260 }} />
        <button type="button" className="portal-primaryBtn" onClick={() => applyFilters(requests)}>Apply</button>
        <button type="button" className="portal-outlineBtn" onClick={() => { setSearch(''); setFilteredRequests(requests.filter((r) => inSelectedMonth(r))) }}>Clear</button>
      </div>

      <PortalCard>
        <div style={{ overflowX: 'auto' }}>
          <table className="portal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="portal-table-th">StaffName</th>
                <th className="portal-table-th">Weekday</th>
                <th className="portal-table-th">Shift</th>
                <th className="portal-table-th">IsRecurring</th>
                <th className="portal-table-th">StartDate</th>
                <th className="portal-table-th">EndDate</th>
                <th className="portal-table-th">Note</th>
                <th className="portal-table-th">Status</th>
                <th className="portal-table-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding: 12 }}>Loading...</td></tr>
              )}
              {!loading && filteredRequests.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 12 }}>No requests</td></tr>
              )}
              {!loading && filteredRequests.map((r) => (
                <tr key={r.OffScheduleId} className={String(r.Status || '').toLowerCase() === 'pending' ? 'is-pending' : ''}>
                  <td className="portal-table-td" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StaffAvatar avatarUrl={r.AvatarUrl} name={r.StaffName} />
                    <span>{r.StaffName}</span>
                  </td>
                  <td className="portal-table-td">{weekdayNameFromIndex(r.DayIndex)}</td>
                  <td className="portal-table-td">{r.Shift || r.StartHourStr || r.ShiftVN || shiftLabel(r.StartHour)}</td>
                  <td className="portal-table-td">{Number(r.IsRecurring) === 1 ? 'Yes' : 'No'}</td>
                  <td className="portal-table-td">{formatDateDMY(r.StartDate)}</td>
                  <td className="portal-table-td">{formatDateDMY(r.EndDate) || '—'}</td>
                  <td className="portal-table-td" title={String(r.Note || '')}>{String(r.Note || '')}</td>
                  <td className="portal-table-td">{r.Status || 'Pending'}</td>
                  <td className="portal-table-td">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="portal-successBtn" onClick={() => approve(r)}>Approve</button>
                      <button className="portal-dangerBtn" onClick={() => rejectReq(r)}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      {editOpen && editing && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Request — {editing.StaffName}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><strong>Weekday</strong><div>{weekdayNameFromIndex(editing.DayIndex)}</div></div>
              <div><strong>Shift</strong><div>{shiftLabel(editing.StartHour)}</div></div>
              <div><strong>IsRecurring</strong><div>{Number(editing.IsRecurring) === 1 ? 'Yes' : 'No'}</div></div>
              <div><strong>StartDate</strong><div>{formatDateDMY(editing.StartDate)}</div></div>
              <div><strong>EndDate</strong><div>{formatDateDMY(editing.EndDate) || '—'}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><strong>Note</strong><div>{editing.Note || '—'}</div></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label><strong>Status</strong></label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ marginLeft: 8 }}>
                  <option>Pending</option>
                  <option>Approved</option>
                  <option>Rejected</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="portal-outlineBtn" onClick={closeEdit}>Close</button>
              <button className="portal-successBtn" onClick={doUpdateStatus}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
