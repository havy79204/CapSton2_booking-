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

import banner4 from '../assets/Nền/anhnen.jpg'
import bgPopular from '../assets/Nền/image.png'

import { formatCurrency } from '../lib/money'
import { api } from '../lib/api'
import { useCart } from '../context/CartContext.jsx'

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

  const [products, setProducts] = useState([])
  const [salonItems, setSalonItems] = useState([])
  const [profilesBySalonId, setProfilesBySalonId] = useState({})
  const [serviceTypesById, setServiceTypesById] = useState({})
  const [addedToCart, setAddedToCart] = useState(null)

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
              Book your next manicure
            </h1>
            <p className="heroSubtitle">
              Your digital marketplace for nail services and beauty shopping - fast, seamless, reliable.
            </p>
            <div className="heroActions">
              <button
                className="btn btnPrimary btnLg"
                onClick={() => navigate('/salons')}
              >
                Book Now
              </button>
            </div>
          </div>
        </div>
      </section>

      <section 
        className="section" 
        style={{ 
          backgroundImage: `url(${bgPopular})`,
        }}
      >
        <div className="container">
          <div className="sectionHeader">
            <h2 style={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '18px', fontWeight: 700 }}>
              POPULAR SALONS NEAR YOU
            </h2>
            <a
              href="/salons"
              onClick={(e) => (e.preventDefault(), navigate('/salons'))}
              className="muted"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              See All <ArrowRight size={16} />
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
                  <div className="salonRatingBadge">
                    <Star size={14} fill="#FFB800" stroke="#FFB800" /> 
                    <span>{s.rating}</span> · <span>{s.reviews} reviews</span>
                  </div>
                </div>
                <div className="salonCardContent">
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
                  <div className="serviceBadges">
                    {s.serviceIds.slice(0, 3).map((id) => (
                      <ServiceHint key={id} serviceId={id} serviceTypesById={serviceTypesById} />
                    ))}
                  </div>
                </div>
                {s.heroHint && (
                  <div className="salonPremiumBadge">Premium</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section 
        className="section" 
        style={{ 
          backgroundImage: `url(${bgPopular})`,
        }}
      >
        <div className="container">
          <div className="sectionHeader">
            <h2>Shop essentials</h2>
            <a
              href="/shop"
              onClick={(e) => (e.preventDefault(), navigate('/shop'))}
              className="muted"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              Browse shop <ArrowRight size={16} />
            </a>
          </div>

          <div className="grid gridProducts">
            {products.filter(p => p && p.id).slice(0, 4).map((p) => (
              <div 
                key={p.id} 
                className="card productCard"
              >
                <div 
                  className="productImageWrapper"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/products/${p.id}`)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/products/${p.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="productThumb">
                    {p.image ? (
                      <img className="thumbImg" src={p.image} alt={p.name} />
                    ) : null}
                    <div className="productBadgeOverlay">
                      <span className="productBadge">Premium</span>
                    </div>
                    <div className="productRatingBadge">
                      <Star size={14} fill="#FFB800" stroke="#FFB800" />
                      <span>4.8</span>
                    </div>
                  </div>
                </div>
                <div className="productCardContent">
                  <h3 
                    className="productTitle"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/products/${p.id}`)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/products/${p.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {p.name}
                  </h3>
                  <div className="productBrand">
                    {p?.salon?.name || '\u00A0'}
                  </div>
                  <div className="productPrice" style={{ marginTop: '12px' }}>
                    {formatCurrency(p.price)}
                  </div>
                  <button
                    className="btn btnAddToCart"
                    style={{ 
                      marginTop: '12px',
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      backgroundColor: addedToCart === p.id ? '#10b981' : 'white',
                      color: addedToCart === p.id ? 'white' : '#666',
                      border: addedToCart === p.id ? '1px solid #10b981' : '1px solid #ddd',
                      borderRadius: '8px',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      cart.add(p.id, 1)
                      setAddedToCart(p.id)
                      setTimeout(() => setAddedToCart(null), 2000)
                    }}
                    onMouseEnter={(e) => {
                      if (addedToCart !== p.id) {
                        e.currentTarget.style.borderColor = '#c28451'
                        e.currentTarget.style.color = '#c28451'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (addedToCart !== p.id) {
                        e.currentTarget.style.borderColor = '#ddd'
                        e.currentTarget.style.color = '#666'
                      }
                    }}
                  >
                    <ShoppingCart size={16} />
                    {addedToCart === p.id ? 'Added to cart!' : 'Add to cart'}
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
