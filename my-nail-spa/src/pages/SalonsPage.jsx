import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarCheck, Filter, MapPin, Search, Star } from 'lucide-react'

import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'

function ServiceHint({ serviceId, serviceById }) {
  const s = serviceById?.[serviceId]
  if (!s) return null
  return (
    <span className="badge" title={s.durationMin ? `${s.durationMin} min` : undefined}>{s.name}</span>
  )
}

export function SalonsPage() {
  const navigate = useNavigate()
  const { t } = useI18n()

  const [salons, setSalons] = useState([])
  const [profiles, setProfiles] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])

  const [query, setQuery] = useState('')
  const [service, setService] = useState('')
  const [sort, setSort] = useState('rating')

  useEffect(() => {
    let alive = true
    Promise.all([
      api.listSalons(),
      api.listSalonProfiles(),
      api.listServiceTypes(),
    ])
      .then(([salonRes, profilesRes, serviceRes]) => {
        if (!alive) return
        setSalons(Array.isArray(salonRes?.items) ? salonRes.items : [])
        setProfiles(Array.isArray(profilesRes?.items) ? profilesRes.items : [])
        setServiceTypes(Array.isArray(serviceRes?.items) ? serviceRes.items : [])
      })
      .catch(() => {
        if (!alive) return
        setSalons([])
        setProfiles([])
        setServiceTypes([])
      })
    return () => {
      alive = false
    }
  }, [])

  const profileBySalonId = useMemo(() => {
    const map = {}
    for (const p of profiles) {
      if (p?.salonId) map[p.salonId] = p
    }
    return map
  }, [profiles])

  const serviceById = useMemo(() => {
    const map = {}
    for (const s of serviceTypes) {
      if (s?.id) map[s.id] = s
    }
    return map
  }, [serviceTypes])

  const salonItems = useMemo(() => {
    return salons.map((s) => {
      const p = profileBySalonId?.[s.id]
      return {
        ...s,
        name: p?.name || s.name,
        address: p?.address || s.address,
        logo: p?.avatarImageUrl || p?.logoUrl || s.logo,
      }
    })
  }, [profileBySalonId, salons])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = salonItems

    if (q) {
      list = list.filter((s) => {
        const hay = `${s.name || ''} ${s.tagline || ''} ${s.address || ''}`.toLowerCase()
        return hay.includes(q)
      })
    }

    if (service) {
      list = list.filter((s) => Array.isArray(s?.serviceIds) && s.serviceIds.includes(service))
    }

    const copy = [...list]
    if (sort === 'rating') copy.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    if (sort === 'reviews') copy.sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
    if (sort === 'name') copy.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

    return copy
  }, [query, salonItems, service, sort])

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('site.salons.title', 'Salons')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <MapPin size={16} />
            {t('site.salons.subtitle', 'Browse and search all salons')}
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="salonsToolbar">
            <div className="salonsSearch">
              <Search size={16} />
              <input
                className="input"
                placeholder={t('site.salons.searchPlaceholder', 'Search by salon name / area / tagline...')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="salonsFilters">
              <div className="salonsFilter">
                <Filter size={16} />
                <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
                  <option value="">{t('site.salons.filter.allServices', 'All services')}</option>
                  {serviceTypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="salonsFilter">
                <ArrowRight size={16} />
                <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="rating">{t('site.salons.sort.rating', 'Sort: Rating')}</option>
                  <option value="reviews">{t('site.salons.sort.reviews', 'Sort: Reviews')}</option>
                  <option value="name">{t('site.salons.sort.name', 'Sort: Name')}</option>
                </select>
              </div>

              <button className="btn" onClick={() => (setQuery(''), setService(''), setSort('rating'))}>
                {t('site.salons.reset', 'Reset')}
              </button>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            {t('site.salons.results', 'Results: {{count}}').replace('{{count}}', items.length)}
          </div>
        </div>

        <div className="grid gridSalons">
          {items.map((s) => (
            <div key={s.id} className="card salonCard">
              <div
                className="salonThumb"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/salons/${s.id}`)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/salons/${s.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {s.logo ? <img className="thumbImg" src={s.logo} alt={`${s.name} logo`} /> : null}
                <div className="badge" style={{ background: 'rgba(0,0,0,0.22)' }}>
                  <Star size={14} /> {s.rating} · {s.reviews} reviews
                </div>
              </div>

              <h3
                className="salonName"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/salons/${s.id}`)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/salons/${s.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {s.name}
              </h3>

              <div className="salonMeta">
                {s.tagline} · {s.address}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {(Array.isArray(s.serviceIds) ? s.serviceIds : []).slice(0, 3).map((id) => (
                  <ServiceHint key={id} serviceId={id} serviceById={serviceById} />
                ))}
              </div>

              <div className="row">
                <button className="btn" onClick={() => navigate(`/salons/${s.id}`)}>
                  {t('site.salons.details', 'Details')}
                </button>
                <button className="btn btn-primary" onClick={() => navigate(`/booking?salon=${encodeURIComponent(s.id)}`)}>
                  <CalendarCheck size={16} style={{ marginRight: 8 }} />
                  {t('site.salons.book', 'Book')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
