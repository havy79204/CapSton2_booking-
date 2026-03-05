import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShoppingCart, Star, CreditCard, Heart, Plus, Minus } from 'lucide-react'

import { formatUsd } from '../lib/money'
// import { loadJson, saveJson } from '../lib/storage'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api'

function Stars({ value, size = 16 }) {
  const v = Math.round(Number(value) || 0)
  const ratingLabel = '{{value}} out of 5'.replace('{{value}}', v)
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
            aria-label={'{{count}} stars'.replace('{{count}}', star)}
          />
        )
      })}
    </div>
  )
}

function StarPicker({ value, onChange, size = 18 }) {
  const [hover, setHover] = useState(null)
  const shown = hover ?? value

  return (
    <div
      className="starPicker"
      role="radiogroup"
      aria-label={'Choose rating'}
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
            aria-label={'{{count}} stars'.replace('{{count}}', star)}
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

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [addedToCart, setAddedToCart] = useState(false)
  const [suggestedProducts, setSuggestedProducts] = useState([])
  const [loadingSuggested, setLoadingSuggested] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [isFavorite, setIsFavorite] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    let alive = true
    if (!id) {
      return undefined
    }

    api
      .getProduct(id)
      .then((r) => {
        if (!alive) return
        const productData = r?.item || r || null
        setProduct(productData)
        
        // Set default variant if available
        if (productData?.variants?.length > 0) {
          setSelectedVariant(productData.variants[0].name)
        } else {
          setSelectedVariant(null)
        }
      })
      .catch(() => {
        if (!alive) return
        setProduct(null)
      })
      .finally(() => {
        if (!alive) return
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

  // Fetch suggested products (similar products from the same salon or category)
  useEffect(() => {
    if (!product) return
    
    let isCancelled = false
    
    // Fetch products from the same salon
    const params = {}
    if (product.salonId && product.salonId !== 'global') {
      params.salonId = product.salonId
    }
    
    api.listProducts(params)
      .then((res) => {
        if (isCancelled) return
        const items = Array.isArray(res?.items) ? res.items : []
        // Filter out current product and limit to 4 suggestions
        const filtered = items
          .filter(p => p.id !== product.id && p.status !== 'draft')
          .slice(0, 4)
        setSuggestedProducts(filtered)
        setLoadingSuggested(false)
      })
      .catch(() => {
        if (isCancelled) return
        setSuggestedProducts([])
        setLoadingSuggested(false)
      })
    
    return () => {
      isCancelled = true
    }
  }, [product])

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
      })
      if (res?.item) {
        setReviews((prev) => [res.item, ...prev])
      }
      setDraft({ rating: 5, text: '' })
      setWriting(false)
    } catch (err) {
      alert(
        `${'Failed to submit review'}: ${
          err?.message || 'Unknown error'
        }`,
      )
    }
  }

  if (loading) {
    return (
      <section className="section">
        <div className="container">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>{'Loading product…'}</div>
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
            <div style={{ fontWeight: 900 }}>{'Product not found'}</div>
            <div className="muted" style={{ marginTop: 8 }}>
              {'Product id: {{id}}'.replace('{{id}}', String(id))}
            </div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate('/shop')}>
              {'Back to Shop'}
            </button>
          </div>
        </div>
      </section>
    )
  }

  // Extract variants from product data (no fallback)
  const variants = product?.variants?.length > 0 ? product.variants : []
  const hasVariants = variants.length > 0
  
  // Extract images from product data or use main image
  const productImages = product?.images?.length > 0
    ? product.images.map(img => img.url)
    : product?.image 
      ? [product.image, product.image, product.image]
      : []
  
  // Get selected variant data and calculate price
  const selectedVariantData = hasVariants && selectedVariant
    ? variants.find(v => v.name === selectedVariant)
    : null
  
  const productPrice = Number(product?.price || 0)
  const variantPriceAdjustment = selectedVariantData?.priceAdjustment || 0
  const finalPrice = productPrice + variantPriceAdjustment
  
  // Get stock quantity (variant stock takes priority over product stock)
  const stockQty = selectedVariantData?.stockQty !== null && selectedVariantData?.stockQty !== undefined
    ? Number(selectedVariantData.stockQty)
    : Number.isFinite(Number(product?.stockQty)) 
      ? Number(product.stockQty) 
      : 100
  
  const isOutOfStock = stockQty <= 0

  const handleQuantityChange = (delta) => {
    const newQty = Math.max(1, Math.min(stockQty, quantity + delta))
    setQuantity(newQty)
  }

  return (
    <section className="section" style={{ paddingTop: 20, paddingBottom: 40, background: '#fafafa' }}>
      <div className="container">
        <button className="btn" onClick={() => navigate(-1)} style={{ marginBottom: 20 }}>
          <ArrowLeft size={16} style={{ marginRight: 8 }} />
          {'Back'}
        </button>

        {/* Section 1: Product Description with Add to Cart and Buy Now buttons */}
        <div className="card" style={{ marginTop: 0, padding: 40, background: 'white' }}>
          <div className="productDetailLayout">
            {/* Left side: Image Gallery */}
            <div className="productGallery">
              <div className="mainImageContainer">
                <button 
                  className="wishlistBtn"
                  onClick={() => setIsFavorite(!isFavorite)}
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    zIndex: 10,
                    background: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <Heart 
                    size={20} 
                    fill={isFavorite ? '#ff69b4' : 'none'} 
                    color={isFavorite ? '#ff69b4' : '#666'}
                  />
                </button>
                {productImages.length > 0 ? (
                  <img 
                    src={productImages[selectedImage]} 
                    alt={product.name || product.title || 'Product'} 
                    className="mainProductImage"
                  />
                ) : null}
              </div>
              {productImages.length > 1 && (
                <div className="thumbnailContainer">
                  {productImages.map((img, idx) => (
                    <div 
                      key={idx}
                      className={`thumbnailItem ${selectedImage === idx ? 'active' : ''}`}
                      onClick={() => setSelectedImage(idx)}
                    >
                      <img src={img} alt={`View ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right side: Product Info */}
            <div className="productInfo">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div className="detailTitle" style={{ fontSize: 24, flex: 1 }}>{product.name || product.title}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Stars value={stats.avg || 5} size={18} />
                <span style={{ fontSize: 14, color: '#666' }}>
                  {stats.total} Reviews
                </span>
              </div>

              {product?.salon?.id ? (
                <div style={{ marginBottom: 16 }}>
                  <Link 
                    to={`/salons/${product.salon.id}`}
                    style={{
                      display: 'inline-block',
                      padding: '6px 16px',
                      background: '#f5e6d3',
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#8b6f47',
                      textDecoration: 'none',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#e8d4b8'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f5e6d3'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    By {product.salon.name || 'Salon'}
                  </Link>
                </div>
              ) : product?.salonId === 'global' ? (
                <div style={{ marginBottom: 16 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '6px 16px',
                    background: '#f5e6d3',
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#8b6f47'
                  }}>
                    Global Product
                  </span>
                </div>
              ) : null}

              <div style={{ marginBottom: 20, lineHeight: 1.7, color: '#666', fontSize: 14 }}>
                {product.description}
              </div>
              <div style={{ marginBottom: 20, lineHeight: 1.7, color: '#666', fontSize: 14 }}>
                {product.description}
              </div>

              {/* Type/Variant Selector - Only show if product has variants */}
              {hasVariants && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#333' }}>
                    {variants[0]?.type || 'Type'}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {variants.map((variant) => (
                      <button
                        key={variant.id}
                        onClick={() => setSelectedVariant(variant.name)}
                        style={{
                          padding: '10px 24px',
                          border: selectedVariant === variant.name ? '2px solid #c28451' : '1px solid #ddd',
                          background: selectedVariant === variant.name ? '#fff9f5' : 'white',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: selectedVariant === variant.name ? 600 : 400,
                          color: selectedVariant === variant.name ? '#c28451' : '#666',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {variant.name}
                        {variant.priceAdjustment !== 0 && variant.priceAdjustment && (
                          <span style={{ fontSize: 12, marginLeft: 6 }}>
                            ({variant.priceAdjustment > 0 ? '+' : ''}{formatUsd(variant.priceAdjustment)})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity Selector */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#333' }}>Quantity</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 6 }}>
                    <button
                      onClick={() => handleQuantityChange(-1)}
                      disabled={quantity <= 1}
                      style={{
                        padding: '10px 16px',
                        border: 'none',
                        background: 'transparent',
                        cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                        color: quantity <= 1 ? '#ccc' : '#666',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      type="text"
                      value={quantity}
                      readOnly
                      style={{
                        width: 60,
                        textAlign: 'center',
                        border: 'none',
                        borderLeft: '1px solid #ddd',
                        borderRight: '1px solid #ddd',
                        fontSize: 14,
                        padding: '10px 0',
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={() => handleQuantityChange(1)}
                      disabled={quantity >= stockQty}
                      style={{
                        padding: '10px 16px',
                        border: 'none',
                        background: 'transparent',
                        cursor: quantity >= stockQty ? 'not-allowed' : 'pointer',
                        color: quantity >= stockQty ? '#ccc' : '#666',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span style={{ fontSize: 13, color: '#999' }}>
                    {stockQty} products available
                  </span>
                </div>
              </div>

              {/* Price */}
              <div style={{ fontWeight: 700, fontSize: 24, color: '#c8a882', marginBottom: 24 }}>
                {formatUsd(finalPrice)}
                {hasVariants && variantPriceAdjustment !== 0 && (
                  <span style={{ fontSize: 14, color: '#999', fontWeight: 400, marginLeft: 8 }}>
                    (Base: {formatUsd(productPrice)})
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    fontSize: 15,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    backgroundColor: 'white',
                    color: '#c28451',
                    border: '1px solid #c28451',
                    borderRadius: 6,
                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                    opacity: isOutOfStock ? 0.5 : 1,
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => {
                    if (isOutOfStock) return
                    cart.add(product.id, quantity)
                    setAddedToCart(true)
                    setTimeout(() => setAddedToCart(false), 2000)
                  }}
                  disabled={isOutOfStock}
                  onMouseEnter={(e) => {
                    if (!isOutOfStock) {
                      e.currentTarget.style.backgroundColor = '#fff9f5'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isOutOfStock) {
                      e.currentTarget.style.backgroundColor = 'white'
                    }
                  }}
                >
                  <ShoppingCart size={18} />
                  {isOutOfStock ? 'Out of stock' : addedToCart ? 'Added!' : 'Add to cart'}
                </button>

                <button
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    fontSize: 15,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    backgroundColor: '#e8d5c4',
                    color: '#6b5444',
                    border: 'none',
                    borderRadius: 6,
                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                    opacity: isOutOfStock ? 0.5 : 1,
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => {
                    if (isOutOfStock) return
                    cart.add(product.id, quantity)
                    navigate('/cart')
                  }}
                  disabled={isOutOfStock}
                  onMouseEnter={(e) => {
                    if (!isOutOfStock) {
                      e.currentTarget.style.backgroundColor = '#d4c0ac'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isOutOfStock) {
                      e.currentTarget.style.backgroundColor = '#e8d5c4'
                    }
                  }}
                >
                  Buy now
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Suggested Products */}
        {suggestedProducts.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <div className="card" style={{ padding: 32, background: 'white' }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, textAlign: 'center', marginTop: 0, marginBottom: 32 }}>
                You May Also Like
              </h2>
              {loadingSuggested ? (
                <div className="muted">{'Loading suggestions...'}</div>
              ) : (
                <div className="gridProducts">
                {suggestedProducts.map((p) => (
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
                        {formatUsd(p.price)}
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
                          backgroundColor: addedToCart ? '#10b981' : 'white',
                          color: addedToCart ? 'white' : '#666',
                          border: addedToCart ? '1px solid #10b981' : '1px solid #ddd',
                          borderRadius: '8px',
                          transition: 'all 0.3s ease',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          cart.add(p.id, 1)
                          setAddedToCart(true)
                          setTimeout(() => setAddedToCart(false), 2000)
                        }}
                        onMouseEnter={(e) => {
                          if (!addedToCart) {
                            e.currentTarget.style.borderColor = '#c28451'
                            e.currentTarget.style.color = '#c28451'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!addedToCart) {
                            e.currentTarget.style.borderColor = '#ddd'
                            e.currentTarget.style.color = '#666'
                          }
                        }}
                      >
                        <ShoppingCart size={16} />
                        {addedToCart ? 'Added to cart!' : 'Add to cart'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Section 3: Product Reviews */}
        <div style={{ marginTop: 30 }}>
          <div className="card" style={{ padding: 32, background: 'white' }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, textAlign: 'center', marginTop: 0, marginBottom: 32 }}>
              Reviews
            </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 30 }}>
            {/* Left: Average Rating */}
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: '#2d1b24', marginBottom: 8 }}>
                {stats.avg ? stats.avg.toFixed(1) : '5.0'}
              </div>
              <Stars value={stats.avg || 5} size={20} />
              <div style={{ marginTop: 12, fontSize: 14, color: '#666' }}>
                Based on {stats.total} review{stats.total !== 1 ? 's' : ''}
              </div>
              <div style={{ marginTop: 16, fontSize: 14, color: '#2d1b24', fontWeight: 600 }}>
                {stats.total > 0 ? Math.round((stats.counts[4] || 0) / stats.total * 100) : 92}% would recommend this product
              </div>
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
                    style={{
                      padding: '12px 24px',
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#c28451'
                      e.currentTarget.style.color = '#c28451'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e0e0e0'
                      e.currentTarget.style.color = '#666'
                    }}
                  >
                    <span>📷</span> Add Photos or Videos
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
                                ✓ Verified Buyer
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: '#999' }}>
                            {formatDate(r.createdAt)} • Type: {r.variantType || 'Pink'}
                          </div>
                        </div>
                      </div>
                      <Stars value={r.rating} size={16} />
                    </div>
                  </div>

                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#2d1b24' }}>
                    {r.title || 'Cooling gel pink'}
                  </h4>
                  <p style={{ 
                    fontSize: 14, 
                    lineHeight: 1.6, 
                    color: '#666',
                    marginBottom: 16 
                  }}>
                    {r.text}
                  </p>

                  {r.images && r.images.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      {r.images.map((img, idx) => (
                        <img 
                          key={idx}
                          src={img} 
                          alt={`Review ${idx + 1}`}
                          style={{
                            width: 80,
                            height: 80,
                            objectFit: 'cover',
                            borderRadius: 8,
                            border: '1px solid #e0e0e0'
                          }}
                        />
                      ))}
                    </div>
                  )}

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

                  {r.sellerResponse && (
                    <div style={{
                      marginTop: 16,
                      padding: 16,
                      background: '#fafafa',
                      borderRadius: 8,
                      borderLeft: '3px solid #c28451'
                    }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>💬</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#2d1b24' }}>
                            Seller Response
                          </div>
                          <div style={{ fontSize: 13, color: '#999' }}>
                            {r.sellerResponseDate || '2 weeks ago'}
                          </div>
                        </div>
                      </div>
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: '#666', marginLeft: 32 }}>
                        {r.sellerResponse}
                      </p>
                      <div style={{ marginLeft: 32, marginTop: 8 }}>
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
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 16, color: '#999' }}>
                No reviews yet. Be the first to review this product!
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </section>
  )
}
