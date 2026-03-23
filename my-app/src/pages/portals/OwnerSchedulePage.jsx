import React, { useEffect, useMemo, useState } from 'react'
import '../../styles/schedule.css'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import {
  IconCalendar,
  IconCevronLeft,
  IconCevronRight,
  IconClock,
  IconUser,
  IconUsers,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function parseIsoDateLocal(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function formatIsoDateLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function StaffAvatar({ initial }) {
  return <div className="portal-staffAvatar">{initial}</div>
}

function ShiftPill({ label }) {
  return (
    <div className="portal-shiftPill">
      <span className="portal-shiftPillIcon" aria-hidden="true">
        <IconClock />
      </span>
      {label}
    </div>
  )
}

export default function OwnerSchedulePage() {
  const [open, setOpen] = useState(false)
  const [weekRange, setWeekRange] = useState(null)
  const [columns, setColumns] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [weekStart, setWeekStart] = useState('')
  const [form, setForm] = useState({
    staffId: '',
    date: '',
    start: '08:00',
    end: '12:00',
  })

  async function refreshSchedule(nextWeekStart) {
    try {
      const qs = nextWeekStart ? `?weekStart=${encodeURIComponent(nextWeekStart)}` : ''
      const data = await api.get(`/api/owner/schedule${qs}`)
      if (data && typeof data === 'object') {
        if (data.weekRange) setWeekRange(data.weekRange)
        if (Array.isArray(data.columns)) setColumns(data.columns)
        if (Array.isArray(data.staffRows)) setStaffRows(data.staffRows)
        if (data.weekRange?.weekStart) setWeekStart(data.weekRange.weekStart)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => refreshSchedule())
  }, [])

  const staffOptions = useMemo(() => staffRows.map((s) => ({ id: s.staffId, name: s.name })), [staffRows])
  const staffWorking = staffRows.length
  const totalShifts = staffRows.reduce(
    (sum, s) => sum + (s.shifts ? Object.values(s.shifts) : []).reduce((a, list) => a + list.length, 0),
    0,
  )

  function shiftWeek(deltaDays) {
    if (!weekStart) return
    const d = parseIsoDateLocal(weekStart)
    if (Number.isNaN(d.getTime())) return
    d.setDate(d.getDate() + deltaDays)
    const next = formatIsoDateLocal(d)
    refreshSchedule(next)
  }

  function close() {
    setOpen(false)
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.staffId || !form.date) return

    try {
      await api.post('/api/owner/schedule/shifts', {
        staffId: form.staffId,
        date: form.date,
        start: form.start,
        end: form.end,
      })

      await refreshSchedule(weekStart)
      setForm({ staffId: '', date: '', start: '08:00', end: '12:00' })
      close()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className=".portal-cardInner">
      <div className="portal-pageHeader">
        <div className="portal-pageHeaderLeft" />

        <button type="button" className="portal-primaryBtn" onClick={() => setOpen(true)}>
          <span className="portal-primaryBtnIcon" aria-hidden="true">
            +
          </span>
          Add Work Shift
        </button>
      </div>

      <PortalModal
        open={open}
        title="Add New Work Shift"
        onClose={close}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form="shift-form" className="portal-modalBtn portal-modalBtnPrimary">
              Add Shift
            </button>
          </>
        }
      >
        <form id="shift-form" onSubmit={onSubmit}>
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

          <label className="portal-field">
            <span className="portal-label">Work Date</span>
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

          <div className="portal-modalGrid2">
            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Start Time</span>
              <div className="portal-inputWithIcon">
                <input
                  className="portal-input"
                  type="time"
                  value={form.start}
                  onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))}
                />
                <span className="portal-inputIcon" aria-hidden="true">
                  <IconClock />
                </span>
              </div>
            </label>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">End Time</span>
              <div className="portal-inputWithIcon">
                <input
                  className="portal-input"
                  type="time"
                  value={form.end}
                  onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))}
                />
                <span className="portal-inputIcon" aria-hidden="true">
                  <IconClock />
                </span>
              </div>
            </label>
          </div>
        </form>
      </PortalModal>
        <div className="portal-grid3" style={{ marginTop: 18 }}>
        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'rgba(37, 99, 235, 0.10)', '--mini-fg': 'var(--info)' }}>
              <IconUsers />
            </div>
            <div>
              <div className="portal-miniKpiLabel">Working Staff</div>
              <div className="portal-miniKpiValue">{staffWorking}</div>
            </div>
          </div>
        </PortalCard>

        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'var(--success-soft)', '--mini-fg': 'var(--success)' }}>
              <IconClock />
            </div>
            <div>
              <div className="portal-miniKpiLabel">Total Shifts This Week</div>
              <div className="portal-miniKpiValue">{totalShifts}</div>
            </div>
          </div>
        </PortalCard>

        <PortalCard>
          <div className="portal-miniKpi">
            <div className="portal-miniKpiIcon" style={{ '--mini-bg': 'rgba(124, 58, 237, 0.10)', '--mini-fg': 'var(--purple)' }}>
              <IconUser />
            </div>
            <div>
              <div className="portal-miniKpiLabel">Status</div>
            </div>
          </div>
        </PortalCard>
      </div>
      <PortalCard className="portal-weekNavCard">
        <div className="portal-weekNav">
          <button type="button" className="portal-outlineBtn" onClick={() => shiftWeek(-7)}>
            <span className="portal-outlineBtnIcon" aria-hidden="true">
              <IconCevronLeft />
            </span>
            Previous Week
          </button>

          <div className="portal-weekNavCenter">
            <div className="portal-weekRange">
              {weekRange?.from ? `${weekRange.from} - ${weekRange.to}` : '—'}
            </div>
            <div className="portal-weekLabel">{weekRange?.weekLabel || ''}</div>
          </div>

          <button type="button" className="portal-outlineBtn" onClick={() => shiftWeek(7)}>
            Next Week
            <span className="portal-outlineBtnIcon" aria-hidden="true">
              <IconCevronRight />
            </span>
          </button>
        </div>
      </PortalCard>

      <PortalCard title="Weekly Work Schedule" className="portal-scheduleCard">
        <div className="portal-scheduleWrap">
          <table className="portal-scheduleTable" aria-label="Work schedule">
            <thead>
              <tr>
                <th className="portal-scheduleTh portal-scheduleThStaff">Staff</th>
                {columns.map((c) => (
                  <th key={c.date} className="portal-scheduleTh">
                    <div className="portal-scheduleDay">{c.day}</div>
                    <div className="portal-scheduleDate">{c.date}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffRows.map((s) => (
                <tr key={s.staffId || s.name}>
                  <td className="portal-scheduleTd portal-scheduleTdStaff">
                    <div className="portal-staffCell">
                      <StaffAvatar initial={s.initial} />
                      <div className="portal-staffMeta">
                        <div className="portal-staffName">{s.name}</div>
                        <div className="portal-staffRole">{s.role}</div>
                      </div>
                    </div>
                  </td>

                  {columns.map((c) => {
                    const shiftList = s.shifts[c.date]
                    return (
                      <td key={`${s.staffId || s.name}-${c.date}`} className="portal-scheduleTd">
                        {shiftList && shiftList.length ? (
                          <div className="portal-shiftStack">
                            {shiftList.map((label) => (
                              <ShiftPill key={label} label={label} />
                            ))}
                          </div>
                        ) : (
                          <div className="portal-off">Off</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>
    </div>
  )
}
