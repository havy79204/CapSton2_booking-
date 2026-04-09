import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import { api } from '../../lib/api.js'

function formatHours(h) {
  const n = Number(h || 0)
  if (!n) return '0h'
  if (n < 1) return `${Math.round(n * 60)} phút`
  if (Number.isInteger(n)) return `${n} giờ`
  return `${Math.round(n * 10) / 10} giờ`
}

  function formatDate(d) {
  const dt = d ? new Date(d) : null
  if (!dt || Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleDateString('en-US')
}

function formatTime(d) {
  const dt = d ? new Date(d) : null
  if (!dt || Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDurationMinutes(minutes) {
  const m = Number(minutes || 0)
  if (!m) return '0m'
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (!h) return `${mm}m`
  return `${h}h ${String(mm).padStart(2, '0')}m`
}

function formatScheduleWindow(startAt, endAt) {
  const s = formatTime(startAt)
  const e = formatTime(endAt)
  if (s === '-' && e === '-') return '-'
  return `${s} - ${e}`
}

export default function AttendanceReportPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [fullRows, setFullRows] = useState([])
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedRow, setSelectedRow] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailRows, setDetailRows] = useState([])

  function monthRange(monthDate) {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      startDate: toIso(start),
      endDate: toIso(end),
      label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const range = monthRange(currentMonth)
    api
      .get(`/api/owner/attendance-report?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`)
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data || []
        setFullRows(list)
        setRows(list)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Attendance report fetch error:', err)
        setError(err?.message || String(err || 'Error'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentMonth])

  function applyFilters() {
    const s = String(search || '').trim().toLowerCase()
    const filtered = (fullRows || []).filter((r) => {
      const name = String(r.StaffName || r.staffName || r.name || '').toLowerCase()
      if (s && !name.includes(s)) return false
      return true
    })
    setRows(filtered)
  }

  async function openDetail(row) {
    setSelectedRow(row)
    setDetailRows([])
    setDetailError('')
    const staffId = row?.StaffId ?? row?.staffId
    if (!staffId && staffId !== 0) return
    const range = monthRange(currentMonth)

    setDetailLoading(true)
    try {
      const data = await api.get(`/api/owner/attendance-report/${encodeURIComponent(String(staffId))}/details?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`)
      setDetailRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setDetailError(err?.message || 'Không tải được chi tiết chấm công')
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="portal-page attendance-report-page">
      <PortalCard
        title="Attendance Report"
        right={(
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="portal-outlineBtn" onClick={() => navigate('/portals/owner/schedule')}>Schedule</button>
            <button type="button" className="portal-outlineBtn" onClick={() => navigate('/portals/owner/pending-requests')}>Requests</button>
          </div>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 56px', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button type="button" className="portal-outlineBtn" onClick={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month">&lt;</button>
          <div style={{ textAlign: 'center', fontSize: 34, fontWeight: 700, color: '#111827' }}>{monthRange(currentMonth).label}</div>
          <button type="button" className="portal-outlineBtn" onClick={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month">&gt;</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input placeholder="Search staff name..." value={search} onChange={(e) => setSearch(e.target.value)} className="portal-input" style={{ width: 220 }} />
          <button type="button" className="portal-primaryBtn" onClick={applyFilters}>Apply</button>
          <button type="button" className="portal-outlineBtn" onClick={() => { setSearch(''); setRows(fullRows) }}>Clear</button>
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : error ? (
          <div role="alert">{error}</div>
        ) : (
          <div className="portal-tableWrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th style={{ textAlign: 'center' }}>Total Shifts</th>
                  <th style={{ textAlign: 'center' }}>On time</th>
                  <th style={{ textAlign: 'center' }}>Late</th>
                  <th style={{ textAlign: 'center' }}>Absent</th>
                  <th style={{ textAlign: 'center' }}>Total Hours</th>
                </tr>
              </thead>
              <tbody>
                {(rows || []).map((r) => (
                  <tr key={r.StaffId || r.staffId || r.name} onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>
                    <td>{r.StaffName || r.staffName || r.name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{r.TotalShifts ?? r.totalShifts ?? 0}</td>
                    <td style={{ textAlign: 'center' }}>{r.Present ?? r.present ?? 0}</td>
                    <td style={{ textAlign: 'center' }}>{r.Late ?? r.late ?? 0}</td>
                    <td style={{ textAlign: 'center' }}>{r.Absent ?? r.absent ?? 0}</td>
                    <td style={{ textAlign: 'center' }}>{formatHours(r.TotalHours ?? r.totalHours ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PortalModal open={!!selectedRow} title="Staff Details" onClose={() => setSelectedRow(null)}>
          {selectedRow ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div><strong>Name:</strong> {selectedRow.StaffName || selectedRow.staffName || selectedRow.name}</div>
              <div><strong>Total shifts:</strong> {selectedRow.TotalShifts ?? selectedRow.totalShifts ?? 0}</div>
              <div><strong>On time:</strong> {selectedRow.Present ?? selectedRow.present ?? 0}</div>
              <div><strong>Late:</strong> {selectedRow.Late ?? selectedRow.late ?? 0}</div>
              <div><strong>Absent:</strong> {selectedRow.Absent ?? selectedRow.absent ?? 0}</div>
              <div><strong>Total hours:</strong> {formatHours(selectedRow.TotalHours ?? selectedRow.totalHours ?? 0)}</div>

              {detailLoading ? <div>Loading details...</div> : null}
              {detailError ? <div role="alert">{detailError}</div> : null}

              {!detailLoading && !detailError ? (
                <div className="portal-tableWrap" style={{ maxHeight: 360, overflow: 'auto' }}>
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Shift</th>
                        <th>Schedule</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailRows || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center' }}>No detail data in the selected range</td>
                        </tr>
                      ) : (
                        (detailRows || []).map((item, idx) => (
                          <tr key={`${item.WorkDate || item.workDate || 'x'}-${item.ScheduleStartAt || item.scheduleStartAt || 'x'}-${idx}`}>
                            <td>{formatDate(item.WorkDate || item.workDate)}</td>
                            <td>{item.ShiftName || item.shiftName || '-'}</td>
                            <td>{formatScheduleWindow(item.ScheduleStartAt || item.scheduleStartAt, item.ScheduleEndAt || item.scheduleEndAt)}</td>
                            <td>{formatTime(item.CheckInAt || item.checkInAt)}</td>
                            <td>{formatTime(item.CheckOutAt || item.checkOutAt)}</td>
                            <td>{formatDurationMinutes(item.DurationMinutes ?? item.durationMinutes ?? 0)}</td>
                            <td>{item.Status || item.status || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </PortalModal>
      </PortalCard>
    </div>
  )
}
