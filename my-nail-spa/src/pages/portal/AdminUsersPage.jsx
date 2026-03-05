import { useEffect, useMemo, useState } from 'react'
import { Save, Search, Trash2, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useI18n } from '../../context/I18nContext.jsx'

function normalizeDraft(u) {
  return {
    id: u?.id || '',
    name: u?.name || '',
    email: u?.email || '',
    role: u?.role || 'customer',
    salonId: u?.salonId || '',
    status: u?.status || 'active',
    createdAt: u?.createdAt || '',
  }
}

export function AdminUsersPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [rolesObj, setRolesObj] = useState({
    ADMIN: 'admin',
    OWNER: 'owner',
    STAFF: 'staff',
    CUSTOMER: 'customer',
  })

  const [activeId, setActiveId] = useState('')
  const [salons, setSalons] = useState([])
  const [allUsers, setAllUsers] = useState([])

  useEffect(() => {
    let alive = true
    async function load() {
      setError('')
      try {
        const [sRes, uRes, rRes] = await Promise.all([
          api.listSalons(),
          api.listUsers(),
          api.listRoles(),
        ])
        if (!alive) return
        const nextSalons = Array.isArray(sRes?.items) ? sRes.items : []
        const nextUsers = Array.isArray(uRes?.items) ? uRes.items : []
        const roleItems = Array.isArray(rRes?.items) ? rRes.items : []
        const nextRoles = roleItems.reduce((acc, it) => {
          if (!it || !it.key) return acc
          acc[String(it.key).toUpperCase()] = it.key
          return acc
        }, {})
        setRolesObj((p) => ({ ...p, ...nextRoles }))
        setSalons(nextSalons)
        setAllUsers(nextUsers)
        setActiveId((prev) => prev || nextUsers[0]?.id || '')
      } catch (e) {
        if (!alive) return
        setError(e?.message || t('portal.users.errorLoad', 'Failed to load users'))
        setSalons([])
        setAllUsers([])
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [refresh])

  const rows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    const all = allUsers
    if (!q) return all
    return all.filter((u) => `${u.name} ${u.email} ${u.role} ${u.salonId || ''}`.toLowerCase().includes(q))
  }, [allUsers, query])

  const active = useMemo(() => {
    if (!activeId) return null
    const found = rows.find((u) => u.id === activeId)
    return found || null
  }, [activeId, rows])

  const [draft, setDraft] = useState(() => normalizeDraft(null))

  useEffect(() => {
    if (!active) return
    setDraft(normalizeDraft(active))
  }, [active?.id])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  function save() {
    ;(async () => {
      setError('')
      try {
        const payload = {
          name: String(draft.name || '').trim() || t('portal.users.defaultName', 'User'),
          email: String(draft.email || '').trim().toLowerCase(),
          role: String(draft.role || rolesObj.CUSTOMER).trim().toLowerCase(),
          salonId: String(draft.salonId || '').trim(),
          status: String(draft.status || 'active').trim(),
        }

        const res = await api.updateUser(String(draft.id).trim(), payload)
        const record = res?.item
        setActiveId(record?.id || draft.id)
        setDraft(normalizeDraft(record || draft))
        setRefresh((x) => x + 1)
        markSaved()
      } catch (e) {
        setError(e?.message || t('portal.users.errorSave', 'Failed to save'))
      }
    })()
  }

  function remove() {
    if (!active?.id) return
    if (!confirm(t('portal.users.confirmDelete', 'Delete this user?'))) return
    ;(async () => {
      setError('')
      try {
        await api.deleteUser(active.id)
        setRefresh((x) => x + 1)
        setActiveId('')
        setDraft(normalizeDraft(null))
      } catch (e) {
        setError(e?.message || t('portal.users.errorDelete', 'Failed to delete user'))
      }
    })()
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.users.title', 'Users')}</h2>
        <div className="muted">{t('portal.users.subtitle', 'Create, edit, delete users and change roles (demo)')}</div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="salonsSearch" style={{ flex: 1 }}>
            <Search size={16} />
            <input
              className="input"
              placeholder={t('portal.users.search', 'Search users…')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveId('')
              }}
            />
          </div>
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          {saved ? t('portal.users.saved', 'Saved!') : `${t('portal.users.count', 'Users')}: ${rows.length}`}
        </div>
      </div>

      <div className="grid twoCol" style={{ gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 900, marginBottom: 10 }}>
            <Users size={16} /> {t('portal.users.listTitle', 'User list')}
          </div>

          {!rows.length ? (
            <div className="muted">{t('portal.users.none', 'No users found.')}</div>
          ) : (
            <div className="portalList">
              {rows.map((u) => {
                const activeRow = u.id === (active?.id || '')
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={activeRow ? 'portalListItem active' : 'portalListItem'}
                    onClick={() => {
                      setError('')
                      setActiveId(u.id)
                      setDraft(normalizeDraft(u))
                    }}
                  >
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontWeight: 600, color: activeRow ? '#fff' : 'rgba(255,255,255,0.9)' }}>{u.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
                    </div>
                    <span className="badge" style={{ 
                      fontSize: 11, 
                      padding: '4px 8px', 
                      background: activeRow ? 'rgba(255,59,122,0.2)' : 'rgba(255,255,255,0.08)',
                      borderColor: activeRow ? 'rgba(255,59,122,0.4)' : 'rgba(255,255,255,0.14)',
                      color: activeRow ? '#ff9dbf' : 'rgba(255,255,255,0.7)'
                    }}>{u.role}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>{t('portal.users.editTitle', 'Edit user')}</div>
            <div className="muted" style={{ fontSize: 13 }}>{draft?.id ? `${t('portal.users.id', 'ID')}: ${draft.id}` : '—'}</div>
          </div>

          {!active ? (
            <div className="muted" style={{ marginTop: 12 }}>{t('portal.users.selectPrompt', 'Select a user to edit.')}</div>
          ) : (
            <>
              {error ? (
                <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
                  <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.users.error', 'Error')}</div>
                  <div className="muted" style={{ marginTop: 6 }}>{error}</div>
                </div>
              ) : null}

              <label className="muted" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>{t('portal.users.name', 'Name')}</label>
              <input className="input" value={draft.name} disabled />

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.users.email', 'Email')}</label>
              <input className="input" value={draft.email} disabled />

              <div className="grid twoCol" style={{ gap: 10, marginTop: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.users.role', 'Role')}</label>
                  <select className="input" value={draft.role} onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}>
                    <option value={rolesObj.ADMIN}>{t('portal.users.role.admin', 'admin')}</option>
                    <option value={rolesObj.OWNER}>{t('portal.users.role.owner', 'owner')}</option>
                    <option value={rolesObj.STAFF}>{t('portal.users.role.staff', 'staff')}</option>
                    <option value={rolesObj.CUSTOMER}>{t('portal.users.role.customer', 'customer')}</option>
                  </select>
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.users.status', 'Status')}</label>
                  <select className="input" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
                    <option value="active">{t('portal.users.status.active', 'active')}</option>
                    <option value="disabled">{t('portal.users.status.disabled', 'disabled')}</option>
                  </select>
                </div>
              </div>

              <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.users.salon', 'Salon (optional)')}</label>
              <select className="input" value={draft.salonId} onChange={(e) => setDraft((p) => ({ ...p, salonId: e.target.value }))}>
                <option value="">{t('portal.users.salonNone', '— None —')}</option>
                {salons.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {t('portal.users.salonHint', 'Use salonId for owner/staff accounts.')}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" type="button" onClick={save}>
                  <Save size={16} style={{ marginRight: 8 }} />
                  {t('portal.users.save', 'Save')}
                </button>
                <button className="btn" type="button" onClick={remove}>
                  <Trash2 size={16} style={{ marginRight: 8 }} />
                  {t('portal.users.delete', 'Delete')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
