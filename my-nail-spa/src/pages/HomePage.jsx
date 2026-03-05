import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  MapPin,
  Search,
  Star,
  ArrowRight,
  ShoppingCart,
} from 'lucide-react'

import banner4 from '../assets/Nền/healthy-beautiful-manicure-manicurist.jpg'

import { useCart } from '../context/CartContext.jsx'
import { formatCurrency } from '../lib/money'
import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'

function ServiceHint({ serviceId, serviceTypesById }) {
  const s = serviceTypesById?.[serviceId]
  if (!s) return <span className="badge">{serviceId}</span>
  return (
    <span className="badge" title={`${s.durationMin} min`}>{s.name}</span>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const cart = useCart()
  const { t } = useI18n()

  const [products, setProducts] = useState([])
  const [salonItems, setSalonItems] = useState([])
  const [profilesBySalonId, setProfilesBySalonId] = useState({})
  const [serviceTypesById, setServiceTypesById] = useState({})

  useEffect(() => {
    let alive = true
    Promise.all([
      api.listProducts(),
      api.listSalons(),
      api.listSalonProfiles(),
      api.listServiceTypes(),
    ])
      .then(([pRes, sRes, profRes, stRes]) => {
        if (!alive) return
        setProducts(Array.isArray(pRes?.items) ? pRes.items : [])
        setSalonItems(Array.isArray(sRes?.items) ? sRes.items : [])

        const mapProfiles = {}
        for (const p of Array.isArray(profRes?.items) ? profRes.items : []) {
          if (p?.salonId) mapProfiles[p.salonId] = p
        }
        setProfilesBySalonId(mapProfiles)

        const mapServiceTypes = {}
        for (const s of Array.isArray(stRes?.items) ? stRes.items : []) {
          if (s?.id) mapServiceTypes[s.id] = s
        }
        setServiceTypesById(mapServiceTypes)
      })
      .catch(() => {
        // no-op
      })
    return () => {
      alive = false
    }
  }, [])

  const salonCards = useMemo(() => {
    return (salonItems || []).map((s) => {
      const p = profilesBySalonId?.[s.id]
      return {
        ...s,
        name: p?.name || s.name,
        address: p?.address || s.address,
        logo: p?.avatarImageUrl || p?.logoUrl || s.logo,
      }
    })
  }, [profilesBySalonId, salonItems])
  const banners = useMemo(() => [banner4].filter(Boolean), [])
  const [bannerIndex, setBannerIndex] = useState(0)

  useEffect(() => {
    if (banners.length <= 1) return undefined
    const id = window.setInterval(() => {
      setBannerIndex((i) => (i + 1) % banners.length)
    }, 10_000)
    return () => window.clearInterval(id)
  }, [banners.length])

  return (
    <>
      <section className="hero heroModern">
        <div
          className="heroBg"
          style={{ backgroundImage: `url(${banners[bannerIndex]})` }}
          aria-hidden="true"
        />
        <div className="heroOverlay" />
        <div className="heroContent container">
          <div className="heroTextWrap">
            <h1 className="heroTitle">
              {t('site.home.heroTitle', 'Book your next manicure')}
            </h1>
            <p className="heroSubtitle">
              {t('site.home.heroSubtitle', 'Pastel elegance, soft curves, and quick booking — inspired by Tina Nail.')}
            </p>
            <div className="heroActions">
              <button
                className="btn btnPrimary btnLg"
                onClick={() => navigate('/salons')}
              >
                {t('site.home.bookNow', 'Book Now')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 64 }}>
        <div className="container">
          <div className="sectionHeader">
            <h2>{t('site.home.popularTitle', 'Popular near you')}</h2>
            <a
              href="/salons"
              onClick={(e) => (e.preventDefault(), navigate('/salons'))}
              className="muted"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              {t('site.home.seeAll', 'See all')} <ArrowRight size={16} />
            </a>
          </div>

          <div className="grid gridSalons">
            {salonCards.map((s) => (
              <div key={s.id} className="card salonCard">
                <div
                  className="salonThumb"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/salons/${s.id}`)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/salons/${s.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  {s.logo ? (
                    <img className="thumbImg" src={s.logo} alt={`${s.name} logo`} />
                  ) : null}
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
                <div className="serviceBadges" style={{ marginBottom: 12 }}>
                  {s.serviceIds.slice(0, 3).map((id) => (
                    <ServiceHint key={id} serviceId={id} serviceTypesById={serviceTypesById} />
                  ))}
                </div>
                <div className="row">
                  <span className="muted" style={{ fontSize: 12 }}>
                    {s.heroHint}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="sectionHeader">
            <h2>{t('site.home.shopTitle', 'Shop essentials')}</h2>
            <a
              href="/shop"
              onClick={(e) => (e.preventDefault(), navigate('/shop'))}
              className="muted"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              {t('site.home.shopBrowse', 'Browse shop')} <ArrowRight size={16} />
            </a>
          </div>

          <div className="grid gridProducts">
            {products.slice(0, 4).map((p) => (
              <div key={p.id} className="card productCard">
                <div
                  className="productThumb"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/products/${p.id}`)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/products/${p.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  {p.image ? (
                    <img className="thumbImg" src={p.image} alt={p.name} />
                  ) : null}
                  <div className="badge">{p.badge ?? 'Care'}</div>
                </div>
                <div className="productTitle clamp2">{p.name}</div>
                {p?.salon?.id ? (
                  <div style={{ marginTop: 8 }}>
                    <Link
                      className="badge"
                      to={`/salons/${encodeURIComponent(p.salon.id)}`}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        navigate(`/salons/${encodeURIComponent(p.salon.id)}`)
                      }}
                      title={p.salon.address || 'View salon'}
                    >
                      {p.salon.name || 'Salon'}
                    </Link>
                  </div>
                ) : p?.salonId === 'global' ? (
                  <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    {t('site.home.global', 'Global product')}
                  </div>
                ) : null}
                <div className="muted productDesc clamp2">{p.description}</div>

                <div className="row productActions" style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 900 }}>{formatCurrency(p.price)}</div>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0) return
                      cart.add(p.id, 1)
                    }}
                    disabled={Number.isFinite(Number(p.stockQty)) ? Number(p.stockQty) <= 0 : false}
                  >
                    <ShoppingCart size={16} style={{ marginRight: 8 }} />
                    {Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0 ? t('site.home.outOfStock', 'Out of stock') : t('site.home.addToCart', 'Add to cart')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </>
  )
}
