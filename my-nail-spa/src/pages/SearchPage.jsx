import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarCheck, Search, ShoppingCart, Star } from 'lucide-react'

import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatUsd } from '../lib/money'
import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'
import '../styles/SearchPage.css'
import { Loader } from '@googlemaps/js-api-loader'

function norm(s) {
  return String(s || '').trim().toLowerCase()
}

function findServiceIdsFromQuery(serviceTypes, q) {
  const query = norm(q)
  if (!query) return []

  return (serviceTypes || [])
    .filter((svc) => {
      const name = norm(svc.name)
      if (!name) return false
      return name.includes(query) || query.includes(name)
    })
    .map((svc) => svc.id)
}

const EFFECTS = [
  { key: 'Manicure', keywords: ['manicure'] },
  { key: 'Pedicure', keywords: ['pedicure'] },
  { key: 'Gel', keywords: ['gel'] },
  { key: 'Acrylic', keywords: ['acrylic'] },
  { key: 'Dip', keywords: ['dip'] },
  { key: 'Art', keywords: ['design', 'art'] },
]

function parseCsvParam(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function unique(arr) {
  return Array.from(new Set(arr))
}

function aiExtraServiceKeywords(q) {
  const x = norm(q)
  if (!x) return []

  const out = []
  if (x.includes('french') || x.includes('ombr') || x.includes('design') || x.includes('art')) out.push('design')
  if (x.includes('long') || x.includes('chip') || x.includes('durable')) out.push('gel')
  if (x.includes('powder')) out.push('dip')
  if (x.includes('extension')) out.push('acrylic')
  return out
}

function productTags(product) {
  const id = String(product?.id || '')
  const category = norm(product?.category)
  const name = norm(product?.name || product?.title)
  const desc = norm(product?.description)
  const hay = `${id} ${category} ${name} ${desc}`
  const tags = []
  if (hay.includes('gel') || hay.includes('top coat') || hay.includes('base coat')) tags.push('Gel')
  if (hay.includes('art') || hay.includes('design') || hay.includes('brush')) tags.push('Art')
  if (hay.includes('manicure') || hay.includes('polish')) tags.push('Manicure')
  if (hay.includes('cuticle') || hay.includes('cream') || hay.includes('oil') || hay.includes('care')) tags.push('Care')
  return tags
}

function salonMatches(salon, query, locationQuery, matchedServiceIds, serviceById) {
  const q = norm(query)
  const loc = norm(locationQuery)

  if (loc) {
    const hayLoc = norm(`${salon.name} ${salon.address}`)
    if (!hayLoc.includes(loc)) return false
  }

  if (matchedServiceIds.length) {
    const ids = salon.serviceIds || []
    const hasAny = matchedServiceIds.some((id) => ids.includes(id))
    if (!hasAny) return false
  }

  if (!q) return true

  const serviceNames = (salon.serviceIds || [])
    .map((id) => serviceById?.[id]?.name)
    .filter(Boolean)
    .join(' ')

  const hay = norm(`${salon.name} ${salon.tagline} ${salon.address} ${serviceNames}`)
  return hay.includes(q)
}

function productMatches(product, query) {
  const q = norm(query)
  if (!q) return true
  const hay = norm(`${product.name || product.title || ''} ${product.description || ''} ${product.badge || ''} ${product.category || ''}`)
  return hay.includes(q)
}

export function SearchPage() {
  const navigate = useNavigate()
  const cart = useCart()
  const [params, setParams] = useSearchParams()
  const { t } = useI18n()
  const auth = useAuth()

  const [salons, setSalons] = useState([])
  const [profiles, setProfiles] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [products, setProducts] = useState([])
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const directionsRendererRef = useRef(null)
  const loaderRef = useRef(null)
  const [userLocation, setUserLocation] = useState(null)
  const [maxDistanceKm, setMaxDistanceKm] = useState(0)
  const [maxPrice, setMaxPrice] = useState(0)
  const [mapsLoaded, setMapsLoaded] = useState(() => {
    try {
      return Boolean(typeof window !== 'undefined' && window.google && window.google.maps)
    } catch  {
      return false
    }
  })

  // UI filters
  const [minRating, setMinRating] = useState(0)
  

  useEffect(() => {
    let alive = true
    Promise.all([
      api.listSalons(),
      api.listSalonProfiles(),
      api.listServiceTypes(),
      api.listProducts(),
    ])
      .then(([salonRes, profileRes, serviceRes, productRes]) => {
        if (!alive) return
        setSalons(Array.isArray(salonRes?.items) ? salonRes.items : [])
        setProfiles(Array.isArray(profileRes?.items) ? profileRes.items : [])
        setServiceTypes(Array.isArray(serviceRes?.items) ? serviceRes.items : [])
        setProducts(Array.isArray(productRes?.items) ? productRes.items : [])
      })
      .catch(() => {
        if (!alive) return
        setSalons([])
        setProfiles([])
        setServiceTypes([])
        setProducts([])
      })
    return () => {
      alive = false
    }
  }, [])

  async function geocodeMissingProfiles() {
    try {
      const missing = (profiles || []).filter((p) => p && (p.latitude === undefined || p.latitude === null || p.longitude === undefined || p.longitude === null))
      if (!missing.length) return
      for (const p of missing) {
        try {
          await api.geocodeSalon(p.salonId)
        } catch (err) {
          // ignore individual errors
        }
      }
      // refresh profiles
      const refreshed = await api.listSalonProfiles()
      setProfiles(Array.isArray(refreshed?.items) ? refreshed.items : [])
    } catch (err) {
      // swallow
    }
  }

  // load Google Maps script using the recommended loader
  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key) return
    if (typeof window !== 'undefined' && window.google && window.google.maps) {
      // Already loaded — state initialized from window, avoid synchronous setState here
      return
    }
    const loader = new Loader({ apiKey: key, libraries: ['places', 'geometry'] })
    loaderRef.current = loader
    let alive = true
    loader
      .load()
      .then(() => {
        if (!alive) return
        setMapsLoaded(true)
      })
      .catch(() => {
        if (!alive) return
        setMapsLoaded(false)
      })
    return () => {
      alive = false
    }
  }, [])

  function retryLoadMaps() {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key) return
    const loader = loaderRef.current || new Loader({ apiKey: key, libraries: ['places', 'geometry'] })
    loaderRef.current = loader
    loader
      .load()
      .then(() => setMapsLoaded(true))
      .catch(() => setMapsLoaded(false))
  }

  useEffect(() => {
    // try to get user location
    if (!navigator?.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {},
      { maximumAge: 1000 * 60 * 5 }
    )
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

  const getSalonLatLng = useCallback((s) => {
    if (s?.latitude && s?.longitude) return { lat: Number(s.latitude), lng: Number(s.longitude) }
    if (s?.location?.lat && s?.location?.lng) return { lat: Number(s.location.lat), lng: Number(s.location.lng) }
    // fallback: try profile
    const p = profileBySalonId?.[s.id]
    if (p?.latitude && p?.longitude) return { lat: Number(p.latitude), lng: Number(p.longitude) }
    return null
  }, [profileBySalonId])
    const computeDistanceKm = useCallback((a, b) => {
      if (!window.google?.maps?.geometry) {
        const R = 6371
        const toRad = (x) => (x * Math.PI) / 180
        const dLat = toRad(b.lat - a.lat)
        const dLon = toRad(b.lng - a.lng)
        const lat1 = toRad(a.lat)
        const lat2 = toRad(b.lat)
        const aa = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
        const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
        return R * c
      }
      const p1 = new window.google.maps.LatLng(a.lat, a.lng)
      const p2 = new window.google.maps.LatLng(b.lat, b.lng)
      return window.google.maps.geometry.spherical.computeDistanceBetween(p1, p2) / 1000
    }, [])

  const initialQuery = params.get('q') ?? params.get('service') ?? ''
  const initialLocation = params.get('location') ?? ''
  const initialEffects = parseCsvParam(params.get('effects'))
  const initialAi = (params.get('ai') ?? '0') === '1'

  const [query, setQuery] = useState(initialQuery)
  const [location, setLocation] = useState(initialLocation)
  const [effects, setEffects] = useState(initialEffects)
  const [aiAssist, setAiAssist] = useState(initialAi)

  const matchedServiceIds = useMemo(() => {
    const fromQuery = findServiceIdsFromQuery(serviceTypes, query)
    const fromEffects = effects
      .map((k) => EFFECTS.find((e) => e.key === k)?.keywords || [])
      .flat()
    const fromEffectsIds = fromEffects
      .map((kw) => findServiceIdsFromQuery(serviceTypes, kw))
      .flat()
    const fromAi = aiAssist ? aiExtraServiceKeywords(query) : []
    const fromAiIds = fromAi
      .map((kw) => findServiceIdsFromQuery(serviceTypes, kw))
      .flat()
    return unique([...fromQuery, ...fromEffectsIds, ...fromAiIds])
  }, [aiAssist, effects, query, serviceTypes])

  const matchedSalons = useMemo(() => {
    return salonItems.filter((s) => salonMatches(s, query, location, matchedServiceIds, serviceById))
  }, [location, matchedServiceIds, query, salonItems, serviceById])

  const matchedSalonsFiltered = useMemo(() => {
    const center = userLocation || (matchedSalons[0] && getSalonLatLng(matchedSalons[0]))
    return matchedSalons.filter((s) => {
      if (minRating > 0 && Number(s.rating || 0) < Number(minRating)) return false
      
      if (maxPrice > 0) {
        const ids = s.serviceIds || []
        const prices = ids.map((id) => Number(serviceById?.[id]?.price || 0)).filter(Boolean)
        if (prices.length && Math.min(...prices) > maxPrice) return false
      }
      if (maxDistanceKm > 0 && center) {
        const loc = getSalonLatLng(s)
        if (!loc) return false
        const d = computeDistanceKm(center, loc)
        if (d > maxDistanceKm) return false
      }
      return true
    })
  }, [matchedSalons, minRating, maxDistanceKm, maxPrice, userLocation, profileBySalonId, serviceById, getSalonLatLng, computeDistanceKm])

  const matchedProducts = useMemo(() => {
    const base = products.filter((p) => p && p.id && productMatches(p, query))
    if (!effects.length) return base
    return base.filter((p) => {
      const tags = productTags(p)
      return effects.some((e) => tags.includes(e))
    })
  }, [effects, products, query])

  function submit(e) {
    e.preventDefault()

    const next = new URLSearchParams()
    if (location.trim()) next.set('location', location.trim())
    if (query.trim()) next.set('q', query.trim())
    if (effects.length) next.set('effects', effects.join(','))
    if (aiAssist) next.set('ai', '1')
    setParams(next, { replace: false })
  }


  const ensureMap = useCallback(() => {
    if (!mapRef.current) return null
    if (mapInstance.current) return mapInstance.current
    if (!mapsLoaded) return null
    if (!window.google || !window.google.maps || typeof window.google.maps.Map !== 'function') return null
    const defaultCenter = userLocation || { lat: 14.0583, lng: 108.2772 }
    const defaultZoom = userLocation ? 12 : 6
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,      minZoom: 4,
      scrollwheel: true,
      gestureHandling: 'auto',
      zoomControl: true,
      draggable: true,
    })
    return mapInstance.current
  }, [userLocation, mapsLoaded])

  useEffect(() => {
    const map = ensureMap()
    if (!map) return
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    const toShow = matchedSalonsFiltered
    const bounds = new window.google.maps.LatLngBounds()
    for (const s of toShow) {
      const loc = getSalonLatLng(s)
      if (!loc) continue
      const marker = new window.google.maps.Marker({ position: loc, map, title: s.name })
      marker.addListener('click', () => {
        navigate(`/salons/${s.id}`)
      })
      markersRef.current.push(marker)
      bounds.extend(loc)
    }
    if (markersRef.current.length) map.fitBounds(bounds, 80)
  }, [matchedSalonsFiltered, userLocation, ensureMap, getSalonLatLng, navigate])

  function showDirectionsTo(loc) {
    const map = ensureMap()
    if (!map) return
    if (!window.google?.maps?.DirectionsService) return
    const ds = new window.google.maps.DirectionsService()
    if (!directionsRendererRef.current) directionsRendererRef.current = new window.google.maps.DirectionsRenderer({ map })
    const origin = userLocation || map.getCenter().toJSON()
    ds.route(
      { origin, destination: loc, travelMode: window.google.maps.TravelMode.DRIVING },
      (res, status) => {
        if (status === 'OK') directionsRendererRef.current.setDirections(res)
      }
    )
  }

  return (
    <section className="section search-page">
      <div className="container layout" >
        {/* Left column: search, filters, results */}
        <div className="left-column">
          <div>
            <form className="card" style={{ padding: 14, marginBottom: 14, maxWidth: 1100, width: '100%' }} onSubmit={submit}>
              <div className="salonsToolbar">
                <div className="salonsSearch" style={{ flex: 1 }}>
                  <Search size={16} />
                  <input className="input" placeholder={t('site.search.placeholder', 'Search salons, services, or products...')} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                    <button className="btn btn-primary" type="submit">{t('site.search.submit', 'Search')}</button>
                    <button className="btn" type="button" onClick={() => { setQuery(''); setLocation(''); setEffects([]); setAiAssist(false); setParams(new URLSearchParams(), { replace: false }) }}>Reset</button>
                    {auth?.isAuthed && auth?.user?.role === 'admin' ? (
                      <button className="btn" type="button" onClick={geocodeMissingProfiles} title="Geocode missing salon addresses">Geocode missing</button>
                    ) : null}
              </div>

              <div className="search-bottom-row" style={{ marginTop: 12 }}>
                <div className="search-left-controls">
                  <div className="star-filter" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label className="muted" style={{ fontSize: 13 }}>{t('site.search.filterRating', 'Filter rating')}</label>
                    {[1,2,3,4,5].map((n) => (
                      <button key={n} type="button" className={`star-btn ${minRating >= n ? 'active' : ''}`} onClick={() => setMinRating(minRating === n ? 0 : n)} aria-pressed={minRating >= n} title={`${n}★ & up`}>
                        {minRating >= n ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffb400" xmlns="http://www.w3.org/2000/svg"><path d="M12 .587l3.668 7.431L23.6 9.75l-5.8 5.64L19.335 24 12 20.201 4.665 24l1.535-8.61L.4 9.75l7.932-1.732L12 .587z"/></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9c9c9" strokeWidth="1.6" xmlns="http://www.w3.org/2000/svg"><path d="M12 .587l3.668 7.431L23.6 9.75l-5.8 5.64L19.335 24 12 20.201 4.665 24l1.535-8.61L.4 9.75l7.932-1.732L12 .587z"/></svg>
                        )}
                      </button>
                    ))}
                    <button type="button" className="btn" style={{ marginLeft: 6, padding: '6px 10px', height: 36 }} onClick={() => setMinRating(0)}>Clear</button>
                  </div>
                </div>
                <div className="search-right-controls" />
              </div>
            </form>
            {/* duplicate toolbar removed (controls are inside the search card now) */}

            <div className="left-scroll">
            <div className="sectionHeader"><h2>{t('site.search.salonsTitle', 'Salons')}</h2><div className="muted">{t('site.search.salonsSub', 'Matches near you')}</div></div>

            {matchedSalonsFiltered.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {matchedSalonsFiltered.map((s) => {
                  const loc = getSalonLatLng(s)
                  const dist = (loc && (userLocation ? computeDistanceKm(userLocation, loc) : 0)) || 0
                  return (
                    <div key={s.id} className="card salonCard">
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {s.logo ? <img src={s.logo} alt="logo" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} /> : null}
                            <div>
                              <div style={{ fontWeight: 800 }}>{s.name}</div>
                              <div className="muted">{s.address}</div>
                              <div className="muted" style={{ marginTop: 6 }}><Star size={12} /> {s.rating || '—'} · {s.reviews || 0} reviews{loc ? ` • ${dist ? dist.toFixed(1) : '—'} km` : ''}</div>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <button className="btn" onClick={() => navigate(`/salons/${s.id}`)}>Details</button>
                          <button className="btn btn-primary" onClick={() => navigate(`/booking?salon=${encodeURIComponent(s.id)}`)}><CalendarCheck size={16} style={{ marginRight: 8 }} /> Book</button>
                          {loc ? <button className="btn" onClick={() => showDirectionsTo(loc)} type="button">Directions</button> : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="card" style={{ padding: 14 }}><div style={{ fontWeight: 800, marginBottom: 6 }}>{t('site.search.salonsEmptyTitle', 'No salons found')}</div><div className="muted">{t('site.search.salonsEmptyDesc', 'Try a different query (e.g. “Queens”, “Gel”, “Acrylic”).')}</div></div>
            )}

            <div className="sectionHeader" style={{ marginTop: 22 }}><h2>{t('site.search.productsTitle', 'Products')}</h2><div className="muted">{t('site.search.productsSub', 'Care essentials that match')}</div></div>

            {matchedProducts.length ? (
              <div className="grid gridProducts">
                {matchedProducts.map((p) => (
                  <div key={p.id} className="card productCard" role="button" tabIndex={0} onClick={() => navigate(`/products/${p.id}`)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/products/${p.id}`)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ flex: '0 0 64px', width: 64, height: 64 }}>
                        {p.image ? <img src={p.image} alt={p.name || p.title || 'Product'} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} /> : null}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800 }}>{p.name || p.title}</div>
                        {p?.salon?.id ? <div style={{ marginTop: 6 }}><Link className="badge" to={`/salons/${encodeURIComponent(p.salon.id)}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/salons/${encodeURIComponent(p.salon.id)}`) }} title={p.salon.address || 'View salon'}>{p.salon.name || 'Salon'}</Link></div> : p?.salonId === 'global' ? <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Global product</div> : null}
                        <div className="muted productDesc clamp2" style={{ marginTop: 6 }}>{p.description}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', alignItems: 'flex-end' }}>
                        <div style={{ fontWeight: 900 }}>{formatUsd(p.price)}</div>
                        <button className="btn btn-primary" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0) return; cart.add(p.id, 1) }} disabled={Number.isFinite(Number(p.stockQty)) ? Number(p.stockQty) <= 0 : false}><ShoppingCart size={16} style={{ marginRight: 8 }} />{Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0 ? t('site.search.outOfStock', 'Out of stock') : t('site.search.addToCart', 'Add to cart')}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card" style={{ padding: 14 }}><div style={{ fontWeight: 800, marginBottom: 6 }}>{t('site.search.productsEmptyTitle', 'No products found')}</div><div className="muted">{t('site.search.productsEmptyDesc', 'Try “oil”, “top coat”, “brush”, or “remover”.')}</div></div>
            )}
            </div>
          </div>
        </div>

        {/* Map column */}
        <div className="right-column">
          <div ref={mapRef} id="search-map" style={{ width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }} />
          {!mapsLoaded ? (
            <div className="map-unavailable-overlay">
              <div className="map-unavailable-box">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Map unavailable</div>
                <div className="muted">Google Maps failed to load. Check API key, billing, or referrer restrictions.</div>
                <button className="btn btn-primary" type="button" onClick={retryLoadMaps} style={{ marginTop: 8 }}>Retry</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
  
}
