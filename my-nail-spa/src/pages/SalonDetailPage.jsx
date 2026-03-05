import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, Heart, MapPin, MessageCircle, Share2, Star } from 'lucide-react'

import heroImg from '../assets/images/hero.avif'
import { formatCurrency } from '../lib/money'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'

function Stars({ value, size = 16 }) {
  const { t } = useI18n()
  const v = Math.round(Number(value) || 0)
  const ratingLabel = t('site.common.ratingOutOf', '{{value}} out of 5').replace('{{value}}', v)
  return (
    <div className="stars" aria-label={ratingLabel}>
      {Array.from({ length: 5 }, (_, i) => {
        const active = i < v
        const star = i + 1
        return (
          <Star
            key={i}
            size={size}
            className={active ? 'starFill' : 'starEmpty'}
            fill={active ? 'currentColor' : 'none'}
            aria-label={t('site.common.starLabel', '{{count}} stars').replace('{{count}}', star)}
          />
        )
      })}
    </div>
  )
}

function StarPicker({ value, onChange, size = 18 }) {
  const { t } = useI18n()
  const [hover, setHover] = useState(null)
  const shown = hover ?? value

  return (
    <div
      className="starPicker"
      role="radiogroup"
      aria-label={t('site.common.chooseRating', 'Choose rating')}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1
        const active = star <= (shown || 0)
        return (
          <button
            key={star}
            type="button"
            className="starBtn"
            role="radio"
            aria-checked={value === star}
            aria-label={t('site.common.starLabel', '{{count}} stars').replace('{{count}}', star)}
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(star)}
          >
            <Star
              size={size}
              className={active ? 'starFill' : 'starEmpty'}
              fill={active ? 'currentColor' : 'none'}
            />
          </button>
        )
      })}
    </div>
  )
}

function computeStats(reviews) {
  const counts = [0, 0, 0, 0, 0]
  for (const r of reviews) {
    const idx = Math.min(5, Math.max(1, Number(r.rating) || 0)) - 1
    counts[idx] += 1
  }
  const total = counts.reduce((a, b) => a + b, 0)
  const avg = total
    ? counts.reduce((sum, c, i) => sum + c * (i + 1), 0) / total
    : 0
  return { counts, total, avg }
}

function formatDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

export function SalonDetailPage({ id: propId }) {
  const { id: paramId } = useParams()
  const id = propId || paramId
  const navigate = useNavigate()
  const auth = useAuth()
  const { t } = useI18n()

  const [salon, setSalon] = useState(null)
  const [profile, setProfile] = useState(null)
  const [salonServices, setSalonServices] = useState([])
  const [salonProducts, setSalonProducts] = useState([])
  const [giftCards, setGiftCards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!id) {
      setSalon(null)
      setProfile(null)
      setSalonServices([])
      setSalonProducts([])
      setLoading(false)
      return undefined
    }

    setLoading(true)


    Promise.all([
      api.getSalon(id),
      api.getSalonProfile(id).catch(() => null),
      api.listSalonServices(id).catch(() => ({ items: [] })),
      api.listProducts({ salonId: id }).catch(() => ({ items: [] })),
      api.listGiftCards({ salonId: id }).catch(() => ({ items: [] })),
    ])
      .then(([salonRes, profileRes, servicesRes, productsRes, giftCardsRes]) => {
        if (!alive) return
        setSalon(salonRes?.item || salonRes || null)
        setProfile(profileRes?.item || profileRes || null)
        setSalonServices(Array.isArray(servicesRes?.items) ? servicesRes.items : [])
        setSalonProducts(Array.isArray(productsRes?.items) ? productsRes.items : [])
        setGiftCards(Array.isArray(giftCardsRes?.items) ? giftCardsRes.items : [])
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setSalon(null)
        setProfile(null)
        setSalonServices([])
        setSalonProducts([])
        setGiftCards([])
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [id])

  const displayName = profile?.name || salon?.name
  const displayAddress = profile?.address || salon?.address
  const displayLogo = profile?.avatarImageUrl || profile?.logoUrl || salon?.logo || salon?.logoUrl
  const baseRating = Number(salon?.rating ?? salon?.ratingAvg ?? 0) || 0

  const coverImage = profile?.coverImageUrl || heroImg

  const fallbackDescription = t(
    'site.salon.description.fallback',
    'We specialize in modern manicure, pedicure, and gel services— with a relaxing space and trusted products.',
  )

  const descriptionText = String(
    profile?.description && String(profile.description).trim()
      ? profile.description
      : salon?.tagline && String(salon.tagline).trim()
        ? `${salon.tagline}. ${fallbackDescription}`
        : fallbackDescription,
  )

  const profileDailyDeals = profile?.dailyDeals
  const profileDeals = profile?.deals
  const profilePhotos = profile?.photos

  const dailyDeals = useMemo(() => {
    const raw = Array.isArray(profileDailyDeals)
      ? profileDailyDeals
      : Array.isArray(profileDeals)
        ? profileDeals
        : []
    return raw.filter((d) => d && d.active !== false)
  }, [profileDailyDeals, profileDeals])

  const photos = useMemo(() => {
    const raw = Array.isArray(profilePhotos) ? profilePhotos : []
    return raw
      .filter((p) => p && p.active !== false)
      .slice()
      .sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
  }, [profilePhotos])

  const [reviews, setReviews] = useState([])
  const stats = useMemo(() => computeStats(reviews), [reviews])

  // Fetch reviews from database
  useEffect(() => {
    if (!id) return
    api.listSalonReviews(id)
      .then((res) => {
        setReviews(Array.isArray(res?.items) ? res.items : [])
      })
      .catch(() => setReviews([]))
  }, [id])

  const [tab, setTab] = useState('about')
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState({ rating: 5, text: '' })
  const [giftAmount, setGiftAmount] = useState(50)
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [giftNote, setGiftNote] = useState('')
  const [sendingGift, setSendingGift] = useState(false)
  const [giftResult, setGiftResult] = useState('')
  const [selectedGalleryImage, setSelectedGalleryImage] = useState(0)
  const [isFavorited, setIsFavorited] = useState(false)
  const canManageGiftCards = auth.user?.role === 'owner' || auth.user?.role === 'admin'

  // Load favorite status from localStorage
  useEffect(() => {
    if (!id) return
    try {
      const favorites = JSON.parse(localStorage.getItem('favoriteSalons') || '[]')
      setIsFavorited(favorites.includes(id))
    } catch {
      setIsFavorited(false)
    }
  }, [id])

  const salonServiceItems = useMemo(() => salonServices, [salonServices])

  function bookNow() {
    if (!salon) return
    navigate(`/booking?salon=${encodeURIComponent(salon.id)}`)
  }

  function handleMessage() {
    if (!salon) return
    if (!auth.isAuthed) {
      navigate('/login', { state: { from: `/salons/${salon.id}`, reason: 'message' } })
      return
    }
    navigate(`/messages?salon=${encodeURIComponent(salon.id)}`)
  }

  function handleShare() {
    if (!salon) return
    const url = `${window.location.origin}/salons/${salon.id}`
    if (navigator.share) {
      navigator.share({
        title: displayName || 'Salon',
        text: descriptionText || 'Check out this salon',
        url: url
      }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!')
      }).catch(() => {
        alert(`Share this link: ${url}`)
      })
    }
  }

  function toggleFavorite() {
    if (!salon) return
    try {
      const favorites = JSON.parse(localStorage.getItem('favoriteSalons') || '[]')
      const index = favorites.indexOf(salon.id)
      if (index > -1) {
        favorites.splice(index, 1)
        setIsFavorited(false)
      } else {
        favorites.push(salon.id)
        setIsFavorited(true)
      }
      localStorage.setItem('favoriteSalons', JSON.stringify(favorites))
    } catch (err) {
      console.error('Failed to update favorites:', err)
    }
  }

  async function addReview(e) {
    e.preventDefault()
    if (!salon) return
    if (!auth.isAuthed) {
      navigate('/login', { state: { from: `/salons/${salon.id}`, reason: 'review' } })
      return
    }

    const rating = Math.min(5, Math.max(1, Number(draft.rating) || 5))
    const text = String(draft.text || '').trim()
    if (!text) return

    try {
      const res = await api.createSalonReview(salon.id, {
        userName: auth.user?.name || 'User',
        rating,
        text,
      })
      if (res?.item) {
        setReviews((prev) => [res.item, ...prev])
      }
      setDraft({ rating: 5, text: '' })
      setWriting(false)
    } catch (err) {
      alert(
        `${t('site.review.submitError', 'Failed to submit review')}: ${
          err?.message || t('site.common.unknownError', 'Unknown error')
        }`,
      )
    }
  }

  async function buyGiftCard(amount) {
    if (!auth.isAuthed) {
      navigate('/login', { state: { from: `/salons/${salon?.id}`, reason: 'gift-card' } })
      return
    }
    if (!canManageGiftCards) {
      setGiftResult(t('site.salon.gift.notAllowed', 'Only salon owners and admins can create gift cards.'))
      return
    }
    const amt = Number(amount || giftAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      alert(t('site.salon.gift.invalidAmount', 'Please choose an amount'))
      return
    }
    setSendingGift(true)
    setGiftResult('')
    try {
      const noteParts = []
      if (recipientName) noteParts.push(`Recipient: ${recipientName}`)
      if (recipientEmail) noteParts.push(`Email: ${recipientEmail}`)
      if (giftNote) noteParts.push(giftNote)

      const res = await api.createGiftCard({
        salonId: salon?.id || undefined,
        amount: amt,
        note: noteParts.length ? noteParts.join(' | ') : undefined,
      })
      if (res?.item?.code) {
        setGiftResult(
          t('site.salon.gift.createdCode', 'Gift card created. Code: {{code}}').replace('{{code}}', res.item.code),
        )
      } else {
        setGiftResult(t('site.salon.gift.created', 'Gift card created.'))
      }
    } catch (err) {
      setGiftResult(err?.message || t('site.salon.gift.error', 'Failed to create gift card'))
    } finally {
      setSendingGift(false)
    }
  }

  function renderTechnicians() {    
    const techList = Array.isArray(salon?.technicians) && salon.technicians.length > 0
      ? salon.technicians.filter((tech) => tech?.id !== 'any')
      : [];
    
    if (techList.length === 0) {
      return (
        <div style={{ color: '#999', fontSize: 14, padding: '16px 0' }}>
          {t('site.salon.technicians.notAvailable', 'No technician information available')}
        </div>
      );
    }
    
    return techList.map((tech) => {
      return (
        <div 
          key={tech.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: 16,
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#c28451';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(194,132,81,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#f0f0f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #c28451 0%, #e8d5c4 100%)',
            flexShrink: 0,
            marginRight: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 700,
            color: 'white'
          }}>
            {tech.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#2d1b24', marginBottom: 4 }}>
              {tech.name}
            </div>
            <div style={{ fontSize: 13, color: '#999', marginBottom: 6 }}>
              {tech.role || t('site.salon.staff.role', 'Nail artist')}
            </div>
            {tech.rating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tech.rating}</span>
                  <Stars value={tech.rating} size={12} />
                </div>
                {tech.experience && (
                  <span style={{ fontSize: 12, color: '#999' }}>{tech.experience}</span>
                )}
              </div>
            )}
          </div>
          <button style={{
            padding: '8px 16px',
            border: '1px solid #e0e0e0',
            background: 'white',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: '#666',
            cursor: 'pointer'
          }}>
            View Profile →
          </button>
        </div>
      );
    });
  }

  if (loading) {
    return (
      <section className="section">
        <div className="container">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>{t('site.salon.loading', 'Loading salon…')}</div>
          </div>
        </div>
      </section>
    )
  }

  if (!salon) {
    return (
      <section className="section">
        <div className="container">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>{t('site.salon.notFound', 'Salon not found')}</div>
            <div className="muted" style={{ marginTop: 8 }}>
              {t('site.salon.idLabel', 'Salon id: {{id}}').replace('{{id}}', String(id))}
            </div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate('/')}
            >
              {t('site.common.backHome', 'Back to Home')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  // Get gallery images from photos or use cover image
  const galleryImages = photos.length > 0 
    ? photos.map(p => p.src || p.url || coverImage).slice(0, 3)
    : [coverImage, coverImage, coverImage]

  return (
    <section className="section" style={{ paddingTop: 20, paddingBottom: 40, background: '#fafafa' }}>
      <div className="container">
        <button className="btn" onClick={() => navigate(-1)} style={{ marginBottom: 20 }}>
          <ArrowLeft size={16} style={{ marginRight: 8 }} />
          {t('site.common.back', 'Back')}
        </button>

        {/* Header with Gallery */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          {/* Image Gallery */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: 0,
            height: 280,
            overflow: 'hidden'
          }}>
            {galleryImages.map((img, idx) => (
              <div 
                key={idx}
                style={{
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onClick={() => setSelectedGalleryImage(idx)}
              >
                <img 
                  src={img} 
                  alt={`Gallery ${idx + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.3s ease',
                    transform: selectedGalleryImage === idx ? 'scale(1.05)' : 'scale(1)'
                  }}
                />
              </div>
            ))}
          </div>

          {/* Salon Info */}
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1, minWidth: 0 }}>
                {displayLogo && (
                  <img 
                    src={displayLogo} 
                    alt={displayName}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '3px solid #fff',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 8px 0', color: '#2d1b24' }}>
                    {displayName}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <MapPin size={16} color="#666" />
                    <span style={{ fontSize: 14, color: '#666' }}>{displayAddress}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ 
                      background: '#fff',
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: '1px solid #e0e0e0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        {stats.avg ? stats.avg.toFixed(1) : baseRating.toFixed(1)}
                      </span>
                      <Stars value={stats.avg || baseRating} size={14} />
                    </div>
                    <span style={{ fontSize: 14, color: '#666' }}>
                      {stats.total} {t('site.common.reviews', 'Reviews')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button 
                  style={{
                    padding: '10px 20px',
                    border: '1px solid #e0e0e0',
                    background: 'white',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#666',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => alert('Book Now')}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e8d5c4'
                    e.currentTarget.style.borderColor = '#e8d5c4'
                    e.currentTarget.style.color = '#6b5444'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white'
                    e.currentTarget.style.borderColor = '#e0e0e0'
                    e.currentTarget.style.color = '#666'
                  }}
                >
                  <CalendarCheck size={16} />
                  Book Now
                </button>
                <button 
                  style={{
                    padding: '10px 20px',
                    border: '1px solid #e0e0e0',
                    background: 'white',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#666',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={handleMessage}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#c28451'
                    e.currentTarget.style.color = '#c28451'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e0e0e0'
                    e.currentTarget.style.color = '#666'
                  }}
                >
                  <MessageCircle size={16} />
                  Message
                </button>
                <button 
                  style={{
                    padding: '10px 16px',
                    border: '1px solid #e0e0e0',
                    background: 'white',
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: 'pointer',
                    color: '#666',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={handleShare}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#c28451'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
                >
                  <Share2 size={16} />
                </button>
                <button 
                  onClick={toggleFavorite}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#ff69b4'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
                  style={{
                    padding: '10px 16px',
                    border: '1px solid #e0e0e0',
                    background: isFavorited ? '#fff0f5' : 'white',
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: 'pointer',
                    color: isFavorited ? '#ff69b4' : '#666',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Heart size={16} fill={isFavorited ? '#ff69b4' : 'none'} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ 
              display: 'flex', 
              gap: 32, 
              marginTop: 24,
              borderBottom: '2px solid #f0f0f0',
              flexWrap: 'wrap'
            }}>
              {[
                { key: 'about', label: t('site.salon.tab.about', 'About') },
                { key: 'technicians', label: t('site.salon.tab.staff', 'Technicians') },
                { key: 'services', label: t('site.salon.tab.services', 'Services') },
                { key: 'products', label: t('site.salon.tab.products', 'Products') },
                { key: 'gift', label: t('site.salon.tab.gift', 'Gift Cards') }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    padding: '12px 0',
                    border: 'none',
                    background: 'transparent',
                    fontSize: 15,
                    fontWeight: tab === key ? 700 : 500,
                    color: tab === key ? '#2d1b24' : '#666',
                    cursor: 'pointer',
                    borderBottom: tab === key ? '2px solid #2d1b24' : '2px solid transparent',
                    marginBottom: '-2px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (tab !== key) e.currentTarget.style.color = '#2d1b24'
                  }}
                  onMouseLeave={(e) => {
                    if (tab !== key) e.currentTarget.style.color = '#666'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === 'about' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20, marginTop: 20 }}>
            {/* Left Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* About Us */}
              <div className="card" style={{ padding: 32 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>About Us</h3>
                <p style={{ color: '#666', lineHeight: 1.7, marginBottom: 20, fontSize: 14 }}>
                  {descriptionText}
                </p>
                {profile?.features && Array.isArray(profile.features) && profile.features.length > 0 && (
                  <ul style={{ color: '#666', lineHeight: 2, paddingLeft: 20, fontSize: 14 }}>
                    {profile.features.map((feature, idx) => (
                      <li key={idx}>{feature}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card" style={{ padding: 32, marginTop: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>{t('site.salon.dailyDeals', 'Daily Deals')}</h3>
                <div className="dealGrid">
                  {dailyDeals.length ? (
                    dailyDeals.slice(0, 4).map((d, idx) => (
                      <div key={d.id || `${idx}`} className="dealCard">
                        <div className={idx % 2 ? 'dealThumb dealThumb2' : 'dealThumb'} aria-hidden="true" />
                        <div className="dealMeta">
                          <div style={{ fontWeight: 900 }}>{d.title || t('site.salon.deal.defaultTitle', 'Deal')}</div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {d.text || d.notes || ''}
                          </div>
                        </div>
                        <div className="dealTag">{d.priceLabel || t('site.salon.deal.defaultTitle', 'Deal')}</div>
                      </div>
                    ))
                  ) : (
                    <div className="muted" style={{ fontSize: 13 }}>{t('site.salon.deals.empty', 'No deals yet.')}</div>
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 32, marginTop: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>{t('site.salon.photos', 'Photos')}</h3>
                {photos.length > 0 ? (
                  <div className="photoGrid">
                    {photos.slice(0, 4).map((p, i) => {
                      const src = p?.src || p?.url
                      const remaining = photos.length - 4
                      const isMore = i === 3 && remaining > 0
                      return (
                        <div key={p.id || `${i}`} className={isMore ? 'photoItem photoMore' : 'photoItem'}>
                          {src ? <img src={src} alt={p.caption || ''} /> : <img src={heroImg} alt="" />}
                          {isMore
                            ? (
                              <div className="photoOverlay">
                                {t('site.salon.photos.more', '+ {{count}} more').replace('{{count}}', remaining)}
                              </div>
                            )
                            : null}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ color: '#999', fontSize: 14, padding: '16px 0' }}>
                    {t('site.salon.photos.notAvailable', 'No photos available')}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Business Hours */}
              <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>{t('site.salon.businessHours', 'Business Hours')}</h3>
              <div className="hours">
                {profile?.hours ? [
                  [t('site.common.weekday.mon', 'Monday'), profile.hours.Mon],
                  [t('site.common.weekday.tue', 'Tuesday'), profile.hours.Tue],
                  [t('site.common.weekday.wed', 'Wednesday'), profile.hours.Wed],
                  [t('site.common.weekday.thu', 'Thursday'), profile.hours.Thu],
                  [t('site.common.weekday.fri', 'Friday'), profile.hours.Fri],
                  [t('site.common.weekday.sat', 'Saturday'), profile.hours.Sat],
                  [t('site.common.weekday.sun', 'Sunday'), profile.hours.Sun],
                ].map(([d, h]) => {
                  const val = h?.closed
                    ? t('site.salon.hours.closed', 'Closed')
                    : `${h?.open || '—'} - ${h?.close || '—'}`
                  return (
                    <div key={d} className="hoursRow">
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#666' }}>{d}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#2d1b24' }}>{val}</span>
                    </div>
                  )
                }) : (
                  <div style={{ color: '#999', fontSize: 14, padding: '16px 0' }}>
                    {t('site.salon.hours.notAvailable', 'Business hours not available')}
                  </div>
                )}
              </div>

              {profile?.phone || profile?.email ? (
                <div className="card" style={{ padding: 16, boxShadow: 'none', marginTop: 12, background: '#fafafa' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#2d1b24' }}>{t('site.salon.contact', 'Contact')}</div>
                  {profile?.phone ? <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>{t('site.salon.contact.phone', 'Phone')}: {profile.phone}</div> : null}
                  {profile?.email ? <div style={{ fontSize: 14, color: '#666' }}>{t('site.salon.contact.email', 'Email')}: {profile.email}</div> : null}
                </div>
              ) : null}
            </div>

            {/* Quick Actions */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>{t('site.salon.quickActions', 'Quick actions')}</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <button className="btn btn-primary" onClick={bookNow}>
                  {t('site.salon.bookNow', 'Book Now')}
                </button>
                <button className="btn" onClick={() => setTab('reviews')}>
                  {t('site.salon.seeReviews', 'See reviews')}
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {tab === 'technicians' ? (
          <div style={{ marginTop: 20 }}>
            <div className="card" style={{ padding: 32 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>Technicians</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {renderTechnicians()}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'services' ? (
          <div style={{ marginTop: 20 }}>
            <div className="card" style={{ padding: 32 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>Services</h3>
              
              {/* Services Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: 13, fontWeight: 600, color: '#666' }}>Service</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: 13, fontWeight: 600, color: '#666' }}>Duration</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: 13, fontWeight: 600, color: '#666' }}>Price</th>
                      <th style={{ width: 120, padding: '12px 8px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {salonServiceItems.map((s) => (
                      <tr 
                        key={s.id}
                        style={{ borderBottom: '1px solid #f8f8f8' }}
                      >
                        <td style={{ padding: '16px 8px' }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#2d1b24' }}>{s.name}</div>
                        </td>
                        <td style={{ padding: '16px 8px' }}>
                          <div style={{ fontSize: 14, color: '#666' }}>
                            {Math.floor((s.durationMin || 60) / 60)} Hour{Math.floor((s.durationMin || 60) / 60) !== 1 ? 's' : ''}
                          </div>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#2d1b24' }}>From {formatCurrency(s.price)}</div>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          <button 
                            style={{
                              padding: '8px 20px',
                              background: '#e8d5c4',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#6b5444',
                              cursor: 'pointer'
                            }}
                            onClick={() => bookNow()}
                          >
                            Book
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'staff' ? (
          <div style={{ marginTop: 20 }}>
            <div className="card" style={{ padding: 32 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>Staff</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {Array.isArray(salon?.technicians) && salon.technicians.length > 0 ? (
                  salon.technicians.filter((tech) => tech?.id !== 'any').map((tech) => (
                  <div key={tech.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                    <div style={{ fontWeight: 900 }}>{tech.name}</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                      {tech.role || t('site.salon.staff.role', 'Nail artist')}
                    </div>
                  </div>
                ))
                ) : (
                  <div style={{ color: '#999', fontSize: 14, padding: '16px 0' }}>
                    {t('site.salon.staff.notAvailable', 'No staff information available')}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'products' ? (
          <div style={{ marginTop: 20 }}>
            <div className="card" style={{ padding: 32, background: 'white' }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, textAlign: 'center', marginTop: 0, marginBottom: 32 }}>You May Also Like...</h2>
              {salonProducts.length > 0 ? (
                <div className="gridProducts">
                  {salonProducts.map((p) => (
                <div 
                  key={p.id} 
                  className="card productCard"
                >
                  <div 
                    className="productImageWrapper"
                    onClick={() => navigate(`/products/${p.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="productThumb">
                      {p.image && <img className="thumbImg" src={p.image} alt={p.name} />}
                    </div>
                  </div>
                  <div className="productCardContent">
                    <h3 
                      className="productTitle"
                      onClick={() => navigate(`/products/${p.id}`)}
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
                        backgroundColor: 'white',
                        color: '#666',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      Add to cart
                    </button>
                  </div>
                </div>
              ))}
              </div>
              ) : (
                <div style={{ color: '#999', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
                  {t('site.salon.products.notAvailable', 'No products available')}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'gift' ? (
          <div className="card" style={{ padding: 16, marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.salon.gift.title', 'Gift Cards')}</h3>
            {giftCards.length > 0 ? (
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                {giftCards.map((g) => (
                  <div key={g.GiftCardId || g.id} className="serviceRow">
                    <div>
                      <div style={{ fontWeight: 900 }}>{g.Title || g.title || t('site.salon.gift.cardLabel', 'Gift Card')}</div>
                      {g.Description ? (
                        <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{g.Description}</div>
                      ) : null}
                    </div>
                    <div style={{ fontWeight: 900 }}>{formatCurrency(g.Amount || g.amount)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
                {t(
                  'site.salon.gift.info',
                  'Gift cards are issued by the salon. Apply your gift code during booking or checkout to enjoy a discount.',
                )}
              </div>
            )}
            {canManageGiftCards && (
              <>
                <div className="muted" style={{ lineHeight: 1.7, marginTop: 16 }}>
                  {t(
                    'site.salon.gift.adminNote',
                    'Only salon owners and admins can issue gift cards. Set an amount and we will generate a code to share with customers.',
                  )}
                </div>
                <div className="dealGrid" style={{ marginTop: 14 }}>
                  {[25, 50, 100].map((v) => (
                    <button key={v} className="btn" onClick={() => buyGiftCard(v)} disabled={sendingGift}
                    >
                      {t('site.salon.gift.cardLabel', 'Gift card {{amount}}').replace('{{amount}}', formatCurrency(v))}
                    </button>
                  ))}
                </div>

                <div className="giftForm" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                  <div className="field">
                    <label>{t('site.salon.gift.customAmount', 'Custom amount')}</label>
                    <input
                      type="number"
                      min="1"
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(e.target.value)}
                      placeholder={t('site.salon.gift.enterAmount', 'Enter amount')}
                    />
                  </div>
                  <div className="field">
                    <label>{t('site.salon.gift.recipientName', 'Recipient name (optional)')}</label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder=""
                    />
                  </div>
                  <div className="field">
                    <label>{t('site.salon.gift.recipientEmail', 'Recipient email (optional)')}</label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder=""
                    />
                  </div>
                  <div className="field">
                    <label>{t('site.salon.gift.note', 'Note (optional)')}</label>
                    <textarea
                      value={giftNote}
                      onChange={(e) => setGiftNote(e.target.value)}
                      placeholder=""
                      rows={3}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  <button className="btn btn-primary" onClick={() => buyGiftCard()} disabled={sendingGift}>
                    {sendingGift
                      ? t('site.salon.gift.creating', 'Creating…')
                      : t('site.salon.gift.create', 'Create gift card')}
                  </button>
                  {giftResult ? <div className="muted">{giftResult}</div> : null}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === 'reviews' ? (
          <div style={{ marginTop: 20 }}>
            <div className="card" style={{ padding: 32, background: 'white' }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, textAlign: 'center', marginTop: 0, marginBottom: 32 }}>
                Reviews
              </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 30 }}>
              {/* Left: Average Rating */}
              <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#2d1b24', marginBottom: 8 }}>
                  {stats.avg ? stats.avg.toFixed(1) : baseRating.toFixed(1)}
                </div>
                <Stars value={stats.avg || baseRating} size={20} />
                <div style={{ marginTop: 12, fontSize: 14, color: '#666' }}>
                  Based on {stats.total} review{stats.total !== 1 ? 's' : ''}
                </div>
                {stats.total > 0 && (
                  <div style={{ marginTop: 16, fontSize: 14, color: '#2d1b24', fontWeight: 600 }}>
                    {Math.round((stats.counts[4] || 0) / stats.total * 100)}% would recommend this salon
                  </div>
                )}
              </div>

              {/* Right: Rating Breakdown */}
              <div className="card" style={{ padding: 32 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const star = 5 - i
                    const count = stats.counts[star - 1] || 0
                    const pct = stats.total ? (count / stats.total) * 100 : 0
                    return (
                      <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 40 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#2d1b24' }}>{star}</span>
                          <Star size={14} fill="#FFB800" stroke="#FFB800" />
                        </div>
                        <div style={{ 
                          flex: 1, 
                          height: 8, 
                          background: '#f0f0f0', 
                          borderRadius: 4,
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${pct}%`, 
                            height: '100%', 
                            background: star === 5 ? '#2d1b24' : '#666',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#666', minWidth: 30, textAlign: 'right' }}>
                          {count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Add a Review Form */}
            <div className="card" style={{ padding: 32, marginBottom: 30 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Add a review</h3>
              
              {writing || !auth.isAuthed ? (
                <form onSubmit={addReview}>
                  {!auth.isAuthed && (
                    <div style={{ 
                      padding: 16, 
                      background: '#fff9e6', 
                      borderRadius: 8, 
                      marginBottom: 20,
                      fontSize: 14,
                      color: '#666'
                    }}>
                      Please sign in to write a review.
                    </div>
                  )}
                  
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 14, color: '#666', marginBottom: 8, display: 'block' }}>
                      Your rating*
                    </label>
                    <StarPicker
                      value={draft.rating}
                      onChange={(v) => setDraft((p) => ({ ...p, rating: v }))}
                      size={24}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div>
                      <input
                        type="text"
                        className="input"
                        placeholder="Name"
                        value={auth.user?.name || ''}
                        disabled={auth.isAuthed}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px',
                          border: '1px solid #e0e0e0',
                          borderRadius: 8,
                          fontSize: 14
                        }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="input"
                        placeholder="Review Title"
                        style={{ 
                          width: '100%',
                          padding: '12px 16px',
                          border: '1px solid #e0e0e0',
                          borderRadius: 8,
                          fontSize: 14
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <textarea
                      className="input"
                      rows={5}
                      placeholder="Review Descriptions"
                      value={draft.text}
                      onChange={(e) => setDraft((p) => ({ ...p, text: e.target.value }))}
                      style={{ 
                        width: '100%',
                        padding: '12px 16px',
                        border: '1px solid #e0e0e0',
                        borderRadius: 8,
                        fontSize: 14,
                        resize: 'vertical',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setWriting(false)}
                      style={{
                        padding: '12px 24px',
                        border: '1px solid #e0e0e0',
                        background: 'white',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                        color: '#666',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#c28451'
                        e.currentTarget.style.color = '#c28451'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e0e0e0'
                        e.currentTarget.style.color = '#666'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!auth.isAuthed || !draft.text.trim()}
                      style={{
                        padding: '12px 32px',
                        border: 'none',
                        background: auth.isAuthed && draft.text.trim() ? '#e8d5c4' : '#e0e0e0',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: auth.isAuthed && draft.text.trim() ? 'pointer' : 'not-allowed',
                        color: '#6b5444',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (auth.isAuthed && draft.text.trim()) {
                          e.currentTarget.style.background = '#d4c0ac'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (auth.isAuthed && draft.text.trim()) {
                          e.currentTarget.style.background = '#e8d5c4'
                        }
                      }}
                    >
                      Submit
                    </button>
                  </div>
                </form>
              ) : (
                <button 
                  className="btn"
                  onClick={() => setWriting(true)}
                  style={{
                    padding: '12px 24px',
                    border: '1px solid #c28451',
                    background: 'white',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    color: '#c28451',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fff9f5'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white'
                  }}
                >
                  Write a review
                </button>
              )}
            </div>

            {/* Review List */}
            {reviews.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {reviews.map((r) => (
                  <div key={r.id} className="card" style={{ padding: 24 }}>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #c28451 0%, #e8d5c4 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'white',
                        flexShrink: 0
                      }}>
                        {String(r.userName || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: '#2d1b24' }}>
                                {r.userName}
                              </span>
                              {r.verified && (
                                <span style={{
                                  background: '#e8f5e9',
                                  color: '#2e7d32',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600
                                }}>
                                  ✓ Verified Customer
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: '#999' }}>
                              {formatDate(r.createdAt)}
                            </div>
                          </div>
                        </div>
                        <Stars value={r.rating} size={16} />
                      </div>
                    </div>

                    <p style={{ 
                      fontSize: 14, 
                      lineHeight: 1.6, 
                      color: '#666',
                      marginBottom: 16 
                    }}>
                      {r.text}
                    </p>

                    <div style={{ display: 'flex', gap: 12 }}>
                      <button style={{
                        padding: '6px 12px',
                        border: '1px solid #e0e0e0',
                        background: 'white',
                        borderRadius: 6,
                        fontSize: 13,
                        color: '#666',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#c28451'
                        e.currentTarget.style.color = '#c28451'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e0e0e0'
                        e.currentTarget.style.color = '#666'
                      }}
                      >
                        👍 Helpful
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 16, color: '#999' }}>
                  No reviews yet. Be the first to review this salon!
                </div>
              </div>
            )}
          </div>
        </div>
        ) : null}
      </div>
    </section>
  )
}
