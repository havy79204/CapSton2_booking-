import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, MapPin, Share2, Star } from 'lucide-react'

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
  const canManageGiftCards = auth.user?.role === 'owner' || auth.user?.role === 'admin'

  const salonServiceItems = useMemo(() => salonServices, [salonServices])

  function bookNow() {
    if (!salon) return
    navigate(`/booking?salon=${encodeURIComponent(salon.id)}`)
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
        verified: true,
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

  return (
    <section className="section" style={{ paddingTop: 20 }}>
      <div className="container">
        <button className="btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} style={{ marginRight: 8 }} />
          {t('site.common.back', 'Back')}
        </button>

        <div className="detailHeader card" style={{ marginTop: 14 }}>
          <div className="detailCover" aria-hidden="true">
            <div className="detailCoverBg" style={{ backgroundImage: `url(${coverImage})` }} />
            <div className="detailCoverOverlay" />
          </div>

          <div className="detailHeaderInner">
            <div className="detailLogo">
              {displayLogo ? <img src={displayLogo} alt="" /> : null}
            </div>

            <div style={{ minWidth: 0 }}>
              <div className="detailTitle">{displayName}</div>
              <div className="detailSub">
                <MapPin size={16} />
                <span>{displayAddress}</span>
              </div>

              <div className="detailRatingRow">
                <div className="detailRatingValue">{stats.avg ? stats.avg.toFixed(1) : baseRating.toFixed(1)}</div>
                <Stars value={stats.avg || baseRating} />
                <div className="muted">
                  {t('site.common.reviewsCount', '{{count}} reviews').replace('{{count}}', stats.total)}
                </div>
              </div>
            </div>

            <div className="detailHeaderActions">
              <button className="btn" onClick={() => alert(t('site.salon.shareDemo', 'Demo: Share link'))}> 
                <Share2 size={16} style={{ marginRight: 8 }} />
                {t('site.salon.share', 'Share')}
              </button>
              <button className="btn btn-primary" onClick={bookNow}>
                <CalendarCheck size={16} style={{ marginRight: 8 }} />
                {t('site.salon.bookNow', 'Book Now')}
              </button>
            </div>
          </div>

          <div className="detailTabs">
            <button className={tab === 'about' ? 'tab active' : 'tab'} onClick={() => setTab('about')}
            >
              {t('site.salon.tab.about', 'About')}
            </button>
            <button className={tab === 'staff' ? 'tab active' : 'tab'} onClick={() => setTab('staff')}
            >
              {t('site.salon.tab.staff', 'Staff')}
            </button>
            <button className={tab === 'services' ? 'tab active' : 'tab'} onClick={() => setTab('services')}
            >
              {t('site.salon.tab.services', 'Services')}
            </button>
            <button className={tab === 'products' ? 'tab active' : 'tab'} onClick={() => setTab('products')}
            >
              {t('site.salon.tab.products', 'Products')}
            </button>
            <button className={tab === 'gift' ? 'tab active' : 'tab'} onClick={() => setTab('gift')}
            >
              {t('site.salon.tab.gift', 'Gift Cards')}
            </button>
            <button className={tab === 'reviews' ? 'tab active' : 'tab'} onClick={() => setTab('reviews')}
            >
              {t('site.salon.tab.reviews', 'Reviews')}
            </button>
          </div>
        </div>

        {tab === 'about' ? (
          <div className="detailGrid">
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>{t('site.salon.description', 'Description')}</h3>
              <div className="muted" style={{ lineHeight: 1.7 }}>
                {descriptionText}
              </div>

              <h3 style={{ marginTop: 18 }}>{t('site.salon.dailyDeals', 'Daily Deals')}</h3>
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

              <h3 style={{ marginTop: 18 }}>{t('site.salon.photos', 'Photos')}</h3>
              <div className="photoGrid">
                {photos.length ? (
                  photos.slice(0, 4).map((p, i) => {
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
                  })
                ) : (
                  Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={i === 3 ? 'photoItem photoMore' : 'photoItem'}>
                      <img src={heroImg} alt="" />
                      {i === 3
                        ? (
                          <div className="photoOverlay">
                            {t('site.salon.photos.more', '+ {{count}} more').replace('{{count}}', 4)}
                          </div>
                        )
                        : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>{t('site.salon.businessHours', 'Business Hours')}</h3>
              <div className="hours">
                {(profile?.hours
                  ? [
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
                      return [d, val]
                    })
                  : [
                      [t('site.common.weekday.sun', 'Sunday'), t('site.salon.hours.closed', 'Closed')],
                      [t('site.common.weekday.mon', 'Monday'), '12:00 PM - 9:30 PM'],
                      [t('site.common.weekday.tue', 'Tuesday'), t('site.salon.hours.closed', 'Closed')],
                      [t('site.common.weekday.wed', 'Wednesday'), '11:00 AM - 9:30 PM'],
                      [t('site.common.weekday.thu', 'Thursday'), '11:00 AM - 9:30 PM'],
                      [t('site.common.weekday.fri', 'Friday'), '11:00 AM - 9:30 PM'],
                      [t('site.common.weekday.sat', 'Saturday'), '10:00 AM - 10:05 AM'],
                    ]
                ).map(([d, v]) => (
                  <div key={d} className="hoursRow">
                    <span className="muted">{d}</span>
                    <span style={{ fontWeight: 800 }}>{v}</span>
                  </div>
                ))}
              </div>

              {profile?.phone || profile?.email ? (
                <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('site.salon.contact', 'Contact')}</div>
                  {profile?.phone ? <div className="muted">{t('site.salon.contact.phone', 'Phone')}: {profile.phone}</div> : null}
                  {profile?.email ? <div className="muted">{t('site.salon.contact.email', 'Email')}: {profile.email}</div> : null}
                </div>
              ) : null}

              <h3 style={{ marginTop: 18 }}>{t('site.salon.quickActions', 'Quick actions')}</h3>
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
        ) : null}

        {tab === 'staff' ? (
          <div className="card" style={{ padding: 16, marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.salon.staff.title', 'Staff')}</h3>
            <div className="staffGrid">
              {(Array.isArray(salon?.technicians) ? salon.technicians : []).filter((tech) => tech?.id !== 'any').map((tech) => (
                <div key={tech.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div style={{ fontWeight: 900 }}>{tech.name}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    {t('site.salon.staff.role', 'Nail artist')}{salon?.heroHint ? ` · ${salon.heroHint}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'services' ? (
          <div className="card" style={{ padding: 16, marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.salon.services.title', 'Services')}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {salonServiceItems.map((s) => (
                <div key={s.id} className="serviceRow">
                  <div>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                        {s.durationMin
                          ? t('site.salon.services.duration', '{{mins}} min').replace('{{mins}}', s.durationMin)
                          : null}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{formatCurrency(s.price)}</div>
                  <button className="btn" onClick={() => bookNow()}>
                    {t('site.salon.services.book', 'Book')}
                  </button>
                </div>
              ))}
            </div>
            {giftCards.length > 0 && (
              <>
                <h3 style={{ marginTop: 24 }}>{t('site.salon.gift.title', 'Gift Cards')}</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  {giftCards.map((g) => (
                    <div key={g.id} className="serviceRow">
                      <div>
                        <div style={{ fontWeight: 900 }}>{g.code ? `${t('site.salon.gift.cardLabel', 'Gift Card')} (${g.code})` : t('site.salon.gift.cardLabel', 'Gift Card')}</div>
                        {g.note ? (
                          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{g.note}</div>
                        ) : null}
                        {g.expiresAt ? (
                          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                            {t('site.salon.gift.expires', 'Expires:')} {formatDate(g.expiresAt)}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ fontWeight: 900 }}>{formatCurrency(g.amount)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === 'products' ? (
          <div className="card" style={{ padding: 16, marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.salon.products.title', 'Products')}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {salonProducts.length ? (
                salonProducts.map((p) => (
                  <div key={p.id} className="serviceRow">
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }}
                        />
                      ) : null}
                      <div>
                        <div style={{ fontWeight: 900 }}>{p.name}</div>
                        {p.description ? (
                          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                            {p.description}
                          </div>
                        ) : null}
                        {p.badge ? (
                          <span className="badge" style={{ marginTop: 6, display: 'inline-block' }}>
                            {p.badge}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{formatCurrency(p.price)}</div>
                    <button
                      className="btn"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      {t('site.salon.products.view', 'View')}
                    </button>
                  </div>
                ))
              ) : (
                <div className="muted">{t('site.salon.products.empty', 'No products available at this salon.')}</div>
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
          <div className="detailGrid" style={{ marginTop: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="reviewHeader">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="reviewBig">{(stats.avg || baseRating).toFixed(1)}</div>
                    <Stars value={stats.avg || baseRating} size={18} />
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {t('site.common.reviewsCount', '{{count}} reviews').replace('{{count}}', stats.total)}
                  </div>
                </div>
                <button className="btn" onClick={() => setWriting((v) => !v)}>
                  {t('site.review.write', 'Write a review')}
                </button>
              </div>

              <div className="ratingBars">
                {Array.from({ length: 5 }, (_, i) => {
                  const star = 5 - i
                  const count = stats.counts[star - 1] || 0
                  const pct = stats.total ? (count / stats.total) * 100 : 0
                  return (
                    <div key={star} className="ratingBarRow">
                      <span className="muted" style={{ width: 18 }}>{star}</span>
                      <div className="ratingBar">
                        <div className="ratingBarFill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="muted" style={{ width: 44, textAlign: 'right' }}>{count}</span>
                    </div>
                  )
                })}
              </div>

              {writing ? (
                <form className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 12 }} onSubmit={addReview}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {auth.isAuthed
                      ? t('site.review.postingAs', 'Posting as you.')
                      : t('site.review.signInPrompt', 'Please sign in to write a review.')}
                  </div>
                  <div className="reviewFormRow">
                    <label className="muted" style={{ fontSize: 13 }}>
                      {t('site.review.ratingLabel', 'Rating')}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StarPicker
                        value={draft.rating}
                        onChange={(v) => setDraft((p) => ({ ...p, rating: v }))}
                      />
                      <span className="muted" style={{ fontSize: 13 }}>{draft.rating}/5</span>
                    </div>
                  </div>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder={t('site.review.placeholder', 'Share your experience...')}
                    value={draft.text}
                    onChange={(e) => setDraft((p) => ({ ...p, text: e.target.value }))}
                    style={{ resize: 'vertical' }}
                  />
                  <div className="reviewFormActions">
                    <button className="btn" type="button" onClick={() => setWriting(false)}>
                      {t('site.common.cancel', 'Cancel')}
                    </button>
                    <button className="btn btn-primary" type="submit">
                      {t('site.common.submit', 'Submit')}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="reviewList">
                {reviews.length ? (
                  reviews.map((r) => (
                    <div key={r.id} className="reviewItem">
                      <div className="reviewAvatar">{String(r.userName || 'U').slice(0, 2).toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="reviewTop">
                          <div style={{ fontWeight: 900 }}>{r.userName}</div>
                          <div className="muted">{formatDate(r.createdAt)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                          <Stars value={r.rating} size={14} />
                          {r.verified ? <span className="badge">{t('site.review.verified', 'Verified')}</span> : null}
                        </div>
                        <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                          {r.text}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted">{t('site.review.none', 'No reviews yet.')}</div>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>{t('site.salon.review.overallTitle', 'Overall')}</h3>
              <div className="ratingKey">
                {[
                  t('site.salon.review.category.overall', 'Overall'),
                  t('site.salon.review.category.punctuality', 'Punctuality'),
                  t('site.salon.review.category.value', 'Value'),
                  t('site.salon.review.category.service', 'Service'),
                ].map((k) => (
                  <div key={k} className="ratingKeyRow">
                    <span className="muted">{k}</span>
                    <Stars value={stats.avg || baseRating} size={16} />
                  </div>
                ))}
              </div>
              <button className="btn" style={{ marginTop: 12 }} onClick={bookNow}>
                {t('site.salon.bookNow', 'Book Now')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
