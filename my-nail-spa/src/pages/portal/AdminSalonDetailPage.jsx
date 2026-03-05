import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, ExternalLink, MapPin, Receipt, Save, Trash2, X } from 'lucide-react'

import { useI18n } from '../../context/I18nContext.jsx'

import heroImg from '../../assets/images/hero.avif'
import { api } from '../../lib/api'
import { formatUsd } from '../../lib/money'
import { SalonDetailPage } from '../SalonDetailPage.jsx'

function safeNumber(v, fallback = 0) {
  const x = Number(v)
  return Number.isFinite(x) ? x : fallback
}

function normalizeDraft(s) {
  return {
    id: s?.id || '',
    name: s?.name || '',
    tagline: s?.tagline || '',
    address: s?.address || '',
    logo: s?.logo || '',
    status: s?.status || 'active',
    heroHint: s?.heroHint || '',
    serviceIds: Array.isArray(s?.serviceIds) ? s.serviceIds : [],
    createdAt: s?.createdAt || '',
  }
}

function getHoursRows(profile) {
  if (!profile?.hours) {
    return [
      ['Sunday', 'Closed'],
      ['Monday', '12:00 PM - 9:30 PM'],
      ['Tuesday', 'Closed'],
      ['Wednesday', '11:00 AM - 9:30 PM'],
      ['Thursday', '11:00 AM - 9:30 PM'],
      ['Friday', '11:00 AM - 9:30 PM'],
      ['Saturday', '10:00 AM - 10:05 AM'],
    ]
  }
  return [
    ['Monday', profile.hours.Mon],
    ['Tuesday', profile.hours.Tue],
    ['Wednesday', profile.hours.Wed],
    ['Thursday', profile.hours.Thu],
    ['Friday', profile.hours.Fri],
    ['Saturday', profile.hours.Sat],
    ['Sunday', profile.hours.Sun],
  ].map(([d, h]) => {
    const val = h?.closed ? 'Closed' : `${h?.open || '—'} - ${h?.close || '—'}`
    return [d, val]
  })
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function AdminSalonDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()

  const [showPreview, setShowPreview] = useState(false)
  const [tab, setTab] = useState('about')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [salon, setSalon] = useState(null)
  const [profile, setProfile] = useState(null)
  const [serviceTypes, setServiceTypes] = useState([])
  const [salonServices, setSalonServices] = useState([])
  const [bookings, setBookings] = useState([])
  const [orders, setOrders] = useState([])
  const [staff, setStaff] = useState([])

  useEffect(() => {
    let alive = true
    if (!id) {
      setSalon(null)
      setProfile(null)
      setServiceTypes([])
      setSalonServices([])
      setBookings([])
      setOrders([])
      setStaff([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    setError('')

    Promise.all([
      api.getSalon(id),
      api.getSalonProfile(id).catch(() => ({ item: null })),
      api.listServiceTypes().catch(() => ({ items: [] })),
      api.listSalonServices(id, { includeDraft: true }).catch(() => ({ items: [] })),
      api.listBookings({ salonId: id }).catch(() => ({ items: [] })),
      api.listOrders({ salonKey: id }).catch(() => ({ items: [] })),
      api.listUsers({ salonId: id }).catch(() => ({ items: [] })),
    ])
      .then(([salonRes, profileRes, svcTypesRes, salonSvcRes, bookingsRes, ordersRes, usersRes]) => {
        if (!alive) return
        setSalon(salonRes?.item || salonRes || null)
        setProfile(profileRes?.item || null)
        setServiceTypes(Array.isArray(svcTypesRes?.items) ? svcTypesRes.items : [])
        setSalonServices(Array.isArray(salonSvcRes?.items) ? salonSvcRes.items : [])
        setBookings(Array.isArray(bookingsRes?.items) ? bookingsRes.items : [])
        setOrders(Array.isArray(ordersRes?.items) ? ordersRes.items : [])
        const users = Array.isArray(usersRes?.items) ? usersRes.items : []
        setStaff(users.filter((u) => u?.role === 'staff'))
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || 'Failed to load salon')
        setSalon(null)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [id])

  const displayName = profile?.name || salon?.name
  const displayAddress = profile?.address || salon?.address

  const [draft, setDraft] = useState(() => normalizeDraft(null))

  useEffect(() => {
    if (!salon) return
    setDraft(normalizeDraft(salon))
  }, [salon])

  const serviceNameById = useMemo(() => {
    const map = new Map()
    for (const s of serviceTypes || []) map.set(s.id, s.name)
    for (const s of salonServices || []) map.set(s.id, s.name)
    return map
  }, [salonServices, serviceTypes])

  const activeServiceIds = useMemo(() => {
    const active = new Set()
    for (const s of salonServices || []) {
      const status = String(s.status || '').toLowerCase()
      if (status === 'published' || status === 'active') active.add(s.id)
    }
    return active
  }, [salonServices])

  function markSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  async function save() {
    setError('')
    try {
      if (!id) return

      await api.updateSalon(id, {
        name: draft.name,
        tagline: draft.tagline,
        address: draft.address,
        logo: draft.logo,
        status: draft.status,
        heroHint: draft.heroHint,
      })

      // Keep SalonProfiles in sync without wiping nested fields.
      const mergedProfile = {
        name: draft.name,
        address: draft.address,
        phone: profile?.phone,
        email: profile?.email,
        policy: profile?.policy,
        avatarImageUrl: draft.logo || profile?.avatarImageUrl,
        coverImageUrl: draft.logo || profile?.coverImageUrl,
        description: profile?.description,
        hours: profile?.hours,
        dailyDeals: profile?.dailyDeals,
        giftCards: profile?.giftCards,
        photos: profile?.photos,
      }

      await api.upsertSalonProfile(id, {
        ...mergedProfile,
        dailyDeals: Array.isArray(mergedProfile.dailyDeals) ? mergedProfile.dailyDeals : [],
        giftCards: Array.isArray(mergedProfile.giftCards) ? mergedProfile.giftCards : [],
        photos: Array.isArray(mergedProfile.photos) ? mergedProfile.photos : [],
      })

      const [salonRes, profileRes] = await Promise.all([
        api.getSalon(id).catch(() => null),
        api.getSalonProfile(id).catch(() => ({ item: null })),
      ])
      setSalon(salonRes?.item || salonRes || null)
      setProfile(profileRes?.item || null)

      markSaved()
    } catch (e) {
      setError(e?.message || 'Failed to save')
    }
  }

  async function remove() {
    if (!salon?.id) return
    if (!confirm('Delete this salon?')) return
    setError('')
    try {
      await api.deleteSalon(salon.id)
      navigate('/portal/admin/salons', { replace: true })
    } catch (e) {
      setError(e?.message || 'Failed to delete')
    }
  }

  async function toggleService(serviceType) {
    if (!id || !serviceType?.id) return
    setError('')
    try {
      const isActive = activeServiceIds.has(serviceType.id)
      if (isActive) {
        await api.deleteSalonService(id, serviceType.id)
      } else {
        await api.upsertSalonService(id, {
          id: serviceType.id,
          name: serviceType.name,
          durationMin: Number(serviceType.durationMin || 30),
          price: Number(serviceType.price || 0),
          status: 'published',
        })
      }

      const res = await api.listSalonServices(id, { includeDraft: true }).catch(() => ({ items: [] }))
      setSalonServices(Array.isArray(res?.items) ? res.items : [])

      const refreshedSalon = await api.getSalon(id).catch(() => null)
      setSalon(refreshedSalon?.item || refreshedSalon || null)
    } catch (e) {
      setError(e?.message || 'Failed to update services')
    }
  }

  if (loading) {
    return (
      <>
        <div className="sectionHeader" style={{ marginBottom: 14 }}>
          <h2>{t('portal.adminSalonDetail.title', 'Salon')}</h2>
          <div className="muted">{t('portal.adminSalonDetail.loading', 'Loading…')}</div>
        </div>
      </>
    )
  }

  if (!salon) {
    return (
      <>
        <div className="sectionHeader" style={{ marginBottom: 14 }}>
          <h2>{t('portal.adminSalonDetail.title', 'Salon')}</h2>
          <div className="muted">{t('portal.adminSalonDetail.notFound', 'Not found')}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 900 }}>{t('portal.adminSalonDetail.notFound', 'Not found')}</div>
          <div className="muted" style={{ marginTop: 8 }}>{t('portal.adminSalonDetail.notFoundHint', 'Salon id: {{id}}').replace('{{id}}', String(id))}</div>
          <button className="btn" type="button" style={{ marginTop: 12 }} onClick={() => navigate('/portal/admin/salons')}>
            <ArrowLeft size={16} style={{ marginRight: 8 }} />
            {t('portal.adminSalonDetail.backToSalons', 'Back to Salons')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <button className="btn" type="button" onClick={() => navigate('/portal/admin/salons')}>
        <ArrowLeft size={16} style={{ marginRight: 8 }} />
        {t('portal.adminSalonDetail.back', 'Back')}
      </button>

      <div className="detailHeader card" style={{ marginTop: 14 }}>
        <div className="detailCover" aria-hidden="true">
          <div className="detailCoverBg" style={{ backgroundImage: `url(${heroImg})` }} />
          <div className="detailCoverOverlay" />
        </div>

        <div className="detailHeaderInner">
          <div className="detailLogo">
            {salon.logo ? <img src={salon.logo} alt="" /> : null}
          </div>

          <div style={{ minWidth: 0 }}>
            <div className="detailTitle">{displayName}</div>
            <div className="detailSub">
              <MapPin size={16} />
              <span>{displayAddress}</span>
            </div>

            <div className="detailRatingRow">
              <div className="muted">{saved ? t('portal.common.saved', 'Saved!') : `${t('portal.adminSalonDetail.status', 'Status')}: ${salon.status || t('portal.ownerStaff.status.active', 'Active')}`}</div>
            </div>
          </div>

          <div className="detailHeaderActions">
            <button className="btn" type="button" onClick={() => setShowPreview(true)}>
              <ExternalLink size={16} style={{ marginRight: 8 }} />
              {t('portal.salonProfile.openDetails', 'Open details')}
            </button>
            <button className="btn btn-primary" type="button" onClick={() => void save()}>
              <Save size={16} style={{ marginRight: 8 }} />
              {t('portal.adminSalonDetail.save', 'Save')}
            </button>
            <button className="btn" type="button" onClick={() => void remove()}>
              <Trash2 size={16} style={{ marginRight: 8 }} />
              {t('portal.adminSalonDetail.delete', 'Delete')}
            </button>
          </div>
        </div>

        <div className="detailTabs">
          <button className={tab === 'about' ? 'tab active' : 'tab'} onClick={() => setTab('about')}>{t('portal.adminSalonDetail.tab.about', 'About')}</button>
          <button className={tab === 'staff' ? 'tab active' : 'tab'} onClick={() => setTab('staff')}>{t('portal.adminSalonDetail.tab.staff', 'Staff')}</button>
          <button className={tab === 'services' ? 'tab active' : 'tab'} onClick={() => setTab('services')}>{t('portal.adminSalonDetail.tab.services', 'Services')}</button>
          <button className={tab === 'bookings' ? 'tab active' : 'tab'} onClick={() => setTab('bookings')}>{t('portal.adminSalonDetail.tab.bookings', 'Bookings')}</button>
          <button className={tab === 'orders' ? 'tab active' : 'tab'} onClick={() => setTab('orders')}>{t('portal.adminSalonDetail.tab.orders', 'Orders')}</button>
        </div>
      </div>

      {tab === 'about' ? (
        <div className="detailGrid" style={{ marginTop: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t('portal.adminSalonDetail.edit', 'Edit salon')}</h3>

            {error ? (
              <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
                <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
                <div className="muted" style={{ marginTop: 6 }}>{error}</div>
              </div>
            ) : null}

            <label className="muted" style={{ fontSize: 12, display: 'block' }}>{t('portal.ownerServices.name', 'Name')}</label>
            <input className="input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />

            <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.adminSalons.tagline', 'Tagline')}</label>
            <input className="input" value={draft.tagline} onChange={(e) => setDraft((p) => ({ ...p, tagline: e.target.value }))} />

            <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.adminSalonDetail.address', 'Address')}</label>
            <input className="input" value={draft.address} onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))} />

            <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.adminSalonDetail.status', 'Status')}</label>
            <select className="input" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>

            <h3 style={{ marginTop: 18 }}>{t('portal.adminSalonDetail.description', 'Description')}</h3>
            <div className="muted" style={{ lineHeight: 1.7 }}>
              {profile?.description || draft.tagline || t('portal.adminSalonDetail.descriptionFallback', 'Modern nail studio with premium service (demo).')}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t('portal.adminSalonDetail.businessHours', 'Business Hours')}</h3>
            <div className="hours">
              {getHoursRows(profile).map(([d, v]) => (
                <div key={d} className="hoursRow">
                  <span className="muted">{d}</span>
                  <span style={{ fontWeight: 800 }}>{v}</span>
                </div>
              ))}
            </div>

            {profile?.phone || profile?.email ? (
              <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('portal.adminSalonDetail.contact', 'Contact')}</div>
                {profile?.phone ? <div className="muted">{`${t('portal.adminSalonDetail.phone', 'Phone')}: ${profile.phone}`}</div> : null}
                {profile?.email ? <div className="muted">{`${t('portal.adminSalonDetail.email', 'Email')}: ${profile.email}`}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'staff' ? (
        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>{t('portal.adminSalonDetail.staffList', 'Staff')}</h3>
          <div className="muted" style={{ marginBottom: 10 }}>{t('portal.adminSalonDetail.staffHint', 'Users with role=staff assigned to this salon.')}</div>
          {!staff.length ? (
            <div className="muted">{t('portal.adminSalonDetail.staffNone', 'No staff assigned yet.')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {staff.map((u) => (
                <div key={u.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div style={{ fontWeight: 900 }}>{u.name || u.email || u.id}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{u.email || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'services' ? (
        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>{t('portal.adminSalonDetail.servicesTitle', 'Services offered')}</h3>
          <div className="muted" style={{ marginBottom: 10 }}>{t('portal.adminSalonDetail.servicesHint', 'Used by Booking flow and salon filters.')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {(serviceTypes || []).map((s) => {
              const activeSvc = activeServiceIds.has(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  className={activeSvc ? 'chip chipActive' : 'chip'}
                  onClick={() => void toggleService(s)}
                  title={`${s.durationMin} min`}
                >
                  {s.name} · {formatUsd(s.price)}
                </button>
              )
            })}
          </div>
          <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>{t('portal.adminSalonDetail.selected', 'Selected: {{count}}').replace('{{count}}', activeServiceIds.size)}</div>
        </div>
      ) : null}

      {tab === 'bookings' ? (
        <div className="portalTable card portalCols5">
          <div className="portalTableHead">
            <div>{t('portal.ownerBookings.table.when', 'When')}</div>
            <div>{t('portal.ownerBookings.table.customer', 'Customer')}</div>
            <div>{t('portal.ownerBookings.table.services', 'Services')}</div>
            <div>{t('portal.ownerBookings.table.total', 'Total')}</div>
            <div>{t('portal.ownerBookings.table.status', 'Status')}</div>
          </div>
          {bookings.map((b) => {
            const ids = Array.isArray(b.serviceIds) ? b.serviceIds : []
            const names = ids.map((sid) => serviceNameById.get(sid) || sid).filter(Boolean)
            return (
              <div key={b.id} className="portalTableRow">
                <div style={{ fontWeight: 950, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                  <span className="badge"><CalendarCheck size={14} /></span>
                  {String(`${b.dateISO || ''} ${b.timeSlot || ''}`).trim() || t('portal.common.none', '—')}
                </div>
                <div className="muted">{b.customerName || t('portal.common.none', '—')}</div>
                <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names.join(', ') || t('portal.common.none', '—')}</div>
                <div style={{ fontWeight: 900 }}>{formatUsd(b.totalPrice || 0)}</div>
                <div><span className="badge">{b.status || t('portal.ownerBookings.status.pending', 'Pending')}</span></div>
              </div>
            )
          })}
          {!bookings.length ? (
            <div className="muted" style={{ padding: 14 }}>{t('portal.adminSalonDetail.bookingsNone', 'No bookings yet for this salon.')}</div>
          ) : null}
        </div>
      ) : null}

      {tab === 'orders' ? (
        <div className="portalTable card portalCols5">
          <div className="portalTableHead">
            <div>{t('portal.adminSalonDetail.order', 'Order')}</div>
            <div>{t('portal.adminSalonDetail.date', 'Date')}</div>
            <div>{t('portal.adminSalonDetail.items', 'Items')}</div>
            <div>{t('portal.ownerBookings.table.total', 'Total')}</div>
            <div>{t('portal.ownerBookings.table.status', 'Status')}</div>
          </div>
          {orders.map((o) => (
            <div key={o.id} className="portalTableRow">
              <div style={{ fontWeight: 950, display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <span className="badge"><Receipt size={14} /></span>
                {o.id}
              </div>
              <div className="muted">{formatDateTime(o.createdAt)}</div>
              <div className="muted">{(o.items || []).reduce((s, it) => s + (it.qty || 0), 0)}</div>
              <div style={{ fontWeight: 900 }}>{formatUsd(o.totals?.total ?? 0)}</div>
              <div><span className="badge">{o.status || 'Paid'}</span></div>
            </div>
          ))}
          {!orders.length ? (
            <div className="muted" style={{ padding: 14 }}>{t('portal.adminSalonDetail.ordersNone', 'No orders yet for this salon.')}</div>
          ) : null}
        </div>
      ) : null}

      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 1200, height: '90vh', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <button 
              onClick={() => setShowPreview(false)}
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, background: '#fff', border: '1px solid #ddd', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            >
              <X size={20} />
            </button>
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
               <SalonDetailPage id={id} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
