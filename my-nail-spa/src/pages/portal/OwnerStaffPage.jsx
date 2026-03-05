import { useEffect, useMemo, useState } from 'react'
import { Search, UserCheck, UserPlus, Users } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'

export function OwnerStaffPage() {
  const auth = useAuth()
  const { t } = useI18n()
  const salonId = auth.user?.salonId
  const [query, setQuery] = useState('')

  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState({ name: '', email: '' })

  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [busyId, setBusyId] = useState('')

  async function loadStaff(nextSalonId) {
    const sid = nextSalonId || salonId
    if (!sid) {
      setUsers([])
      return
    }
    setError('')
    const res = await api.listUsers({ salonId: sid, role: 'staff' })
    setUsers(Array.isArray(res?.items) ? res.items : [])
  }

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        await loadStaff(salonId)
        if (!alive) return
      } catch (e) {
        if (!alive) return
        setError(e?.message || t('portal.ownerStaff.errorLoad', 'Failed to load staff'))
        setUsers([])
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [salonId])

  const rows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    const base = users
      .filter((u) => String(u.role || '').toLowerCase() === 'staff')
      .map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        statusKey: String(s.status || 'active').toLowerCase() === 'active' ? 'active' : 'disabled',
        statusLabel: String(s.status || 'active').toLowerCase() === 'active'
          ? t('portal.ownerStaff.status.active', 'Active')
          : t('portal.ownerStaff.status.disabled', 'Disabled'),
      }))

    if (!q) return base
    return base.filter((s) => `${s.name} ${s.email} ${s.statusLabel}`.toLowerCase().includes(q))
  }, [query, users])

  async function createStaff() {
    if (!salonId) return
    const name = String(createDraft?.name || '').trim()
    const email = String(createDraft?.email || '').trim().toLowerCase()
    if (!name || !email) {
      setError(t('portal.ownerStaff.missing', 'Please enter name and email'))
      return
    }

    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.createUser({
        name,
        email,
        role: 'staff',
        salonId,
        status: 'active',
      })
      setCreateDraft({ name: '', email: '' })
      await loadStaff(salonId)
      
      if (res?.emailSent) {
        setSuccess(t('portal.ownerStaff.successEmail', 'Staff added! Password sent to {{email}}').replace('{{email}}', email))
        window.setTimeout(() => setSuccess(''), 5000)
      } else {
        setSuccess(t('portal.ownerStaff.successNoEmail', 'Staff added! (Email not configured - contact admin for password)'))
        window.setTimeout(() => setSuccess(''), 5000)
      }
    } catch (e) {
      setError(e?.message || t('portal.ownerStaff.errorAdd', 'Failed to add staff'))
    } finally {
      setCreating(false)
    }
  }

  async function setStaffStatus(userId, nextStatus) {
    if (!userId) return
    setBusyId(userId)
    setError('')
    try {
      await api.updateUser(String(userId), { status: nextStatus })
      await loadStaff(salonId)
    } catch (e) {
      setError(e?.message || t('portal.ownerStaff.errorUpdate', 'Failed to update staff'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.ownerStaff.title', 'Staff')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Users size={16} />
          {t('portal.ownerStaff.subtitle', 'Add staff accounts and disable staff access')}
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="salonsSearch" style={{ flex: 1, minWidth: 220 }}>
            <Search size={16} />
            <input
              className="input"
              placeholder={t('portal.ownerStaff.search', 'Search staff…')}
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder={t('portal.ownerStaff.name', 'Staff name')}
            name="staff-name"
            autoComplete="off"
            value={createDraft.name}
            onChange={(e) => setCreateDraft((p) => ({ ...p, name: e.target.value }))}
          />
          <input
            className="input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder={t('portal.ownerStaff.email', 'Email')}
            type="email"
            inputMode="email"
            name="staff-email"
            autoComplete="off"
            value={createDraft.email}
            onChange={(e) => setCreateDraft((p) => ({ ...p, email: e.target.value }))}
          />
          <button className="btn btn-primary" type="button" onClick={() => void createStaff()} disabled={creating || !salonId}>
            <UserPlus size={16} style={{ marginRight: 8 }} />
            {creating ? t('portal.ownerStaff.adding', 'Adding…') : t('portal.ownerStaff.add', 'Add staff')}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {t('portal.ownerStaff.hint', 'Password will be auto-generated and sent to staff email')}
        </div>
      </div>

      {success ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(34,197,94,0.5)', marginBottom: 12 }}>
          <div style={{ fontWeight: 900, color: '#22c55e' }}>{t('portal.common.success', 'Success')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{success}</div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(255,59,122,0.35)', marginBottom: 12 }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="portalTable card">
        <div className="portalTableHead">
          <div>{t('portal.ownerStaff.table.name', 'Name')}</div>
          <div>{t('portal.ownerStaff.table.email', 'Email')}</div>
          <div>{t('portal.ownerStaff.table.status', 'Status')}</div>
          <div>{t('portal.ownerStaff.table.actions', 'Actions')}</div>
        </div>
        {rows.map((s) => (
          <div key={s.id} className="portalTableRow">
            <div style={{ fontWeight: 950, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <span className="badge"><UserCheck size={14} /></span>
              {s.name}
            </div>
            <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
            <div className="muted">{s.statusKey === 'active' ? t('portal.ownerStaff.status.active', 'Active') : t('portal.ownerStaff.status.disabled', 'Disabled')}</div>
            <div>
              {s.statusKey === 'active' ? (
                <button className="btn" type="button" disabled={busyId === s.id} onClick={() => void setStaffStatus(s.id, 'disabled')}>
                  {t('portal.ownerStaff.disable', 'Disable')}
                </button>
              ) : (
                <button className="btn" type="button" disabled={busyId === s.id} onClick={() => void setStaffStatus(s.id, 'active')}>
                  {t('portal.ownerStaff.enable', 'Enable')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
