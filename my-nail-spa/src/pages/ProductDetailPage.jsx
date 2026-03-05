import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShoppingCart, Star } from 'lucide-react'

import { formatUsd } from '../lib/money'
// import { loadJson, saveJson } from '../lib/storage'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'
import { api } from '../lib/api'

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

export function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const cart = useCart()
  const auth = useAuth()
  const { t } = useI18n()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!id) {
      setProduct(null)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    api
      .getProduct(id)
      .then((r) => {
        if (!alive) return
        setProduct(r?.item || r || null)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setProduct(null)
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [id])
  const canViewDraft = auth.user?.role === 'owner' || auth.user?.role === 'admin'
  const hiddenDraft = product && String(product.status || '') === 'draft' && !canViewDraft

  const [reviews, setReviews] = useState([])
  const stats = useMemo(() => computeStats(reviews), [reviews])

  // Fetch reviews from database
  useEffect(() => {
    if (!id) return
    api.listProductReviews(id)
      .then((res) => setReviews(Array.isArray(res?.items) ? res.items : []))
      .catch(() => setReviews([]))
  }, [id])

  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState({ rating: 5, text: '' })

  async function addReview(e) {
    e.preventDefault()
    if (!product) return
    if (!auth.isAuthed) {
      navigate('/login', { state: { from: `/products/${product.id}`, reason: 'review' } })
      return
    }

    const rating = Math.min(5, Math.max(1, Number(draft.rating) || 5))
    const text = String(draft.text || '').trim()
    if (!text) return

    try {
      const res = await api.createProductReview(product.id, {
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

  if (loading) {
    return (
      <section className="section">
        <div className="container">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>{t('site.product.loading', 'Loading product…')}</div>
          </div>
        </div>
      </section>
    )
  }

  if (!product || hiddenDraft) {
    return (
      <section className="section">
        <div className="container">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>{t('site.product.notFound', 'Product not found')}</div>
            <div className="muted" style={{ marginTop: 8 }}>
              {t('site.product.idLabel', 'Product id: {{id}}').replace('{{id}}', String(id))}
            </div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate('/shop')}>
              {t('site.common.backShop', 'Back to Shop')}
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

        <div className="detailGrid" style={{ marginTop: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="productDetailTop">
              <div className="productDetailImg">
                {product.image ? <img src={product.image} alt={product.name || product.title || 'Product'} /> : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="detailTitle">{product.name || product.title}</div>
                {product?.salon?.id ? (
                  <div style={{ marginTop: 10 }}>
                    <Link
                      className="badge"
                      to={`/salons/${encodeURIComponent(product.salon.id)}`}
                      title={product.salon.address || t('site.product.salon.linkTitle', 'View salon')}
                    >
                      {product.salon.name || t('nav.salons', 'Salons')}
                    </Link>
                  </div>
                ) : product?.salonId === 'global' ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    {t('site.home.global', 'Global product')}
                  </div>
                ) : null}
                <div className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
                  {product.description}
                </div>

                <div className="detailRatingRow" style={{ marginTop: 12 }}>
                  <div className="detailRatingValue">{stats.avg ? stats.avg.toFixed(1) : '5.0'}</div>
                  <Stars value={stats.avg || 5} />
                  <div className="muted">
                    {t('site.common.reviewsCount', '{{count}} reviews').replace('{{count}}', stats.total)}
                  </div>
                </div>

                <div className="row" style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 900, fontSize: 20 }}>{formatUsd(product.price)}</div>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (Number.isFinite(Number(product.stockQty)) && Number(product.stockQty) <= 0) return
                      cart.add(product.id, 1)
                    }}
                    disabled={Number.isFinite(Number(product.stockQty)) ? Number(product.stockQty) <= 0 : false}
                  >
                    <ShoppingCart size={16} style={{ marginRight: 8 }} />
                    {Number.isFinite(Number(product.stockQty)) && Number(product.stockQty) <= 0
                      ? t('site.home.outOfStock', 'Out of stock')
                      : t('site.home.addToCart', 'Add to cart')}
                  </button>
                </div>

                <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 14 }}>
                  <div style={{ fontWeight: 900 }}>{t('site.product.description', 'Description')}</div>
                  <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                    {product.description ? (
                      product.description.split('\n').map((p, i) => (
                        <p key={i} style={{ margin: '6px 0' }}>{p}</p>
                      ))
                    ) : (
                      <div className="muted">{t('site.product.description.empty', 'No description available.')}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="reviewHeader">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="reviewBig">{stats.avg ? stats.avg.toFixed(1) : '5.0'}</div>
                  <Stars value={stats.avg || 5} size={18} />
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
        </div>
      </div>
    </section>
  )
}
