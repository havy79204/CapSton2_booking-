import { ShoppingCart, ShoppingBag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { formatUsd } from '../lib/money'
import { api } from '../lib/api'

export function ShopPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [addedToCart, setAddedToCart] = useState(null)

  const [products, setProducts] = useState([])

  useEffect(() => {
    let alive = true
    api
      .listProducts()
      .then((r) => {
        if (!alive) return
        setProducts(Array.isArray(r?.items) ? r.items : [])
      })
      .catch(() => {
        if (!alive) return
        setProducts([])
      })
    return () => {
      alive = false
    }
  }, [])

  const items = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    let list = products.filter(p => p && p.id)
    if (!q) return list
    return list.filter((p) => {
      const name = String(p.name || p.title || '').toLowerCase()
      const desc = String(p.description || '').toLowerCase()
      const salon = String(p.salon?.name || '').toLowerCase()
      return name.includes(q) || desc.includes(q) || salon.includes(q)
    })
  }, [products, query])

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>Shop</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <ShoppingBag size={16} />
            Curated nail care essentials
          </div>
        </div>


        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              aria-label="Search products"
              placeholder="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 22, border: '1px solid #f0dfe6', minWidth: 300, flex: '1 1 300px' }}
            />
            <div className="muted" style={{ fontSize: 13 }}>Showing {items.length} products</div>
          </div>
        </div>

        <div className="grid gridProducts">
          {items.map((p) => (
            <div
              key={p.id}
              className="card productCard"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/products/${p.id}`)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/products/${p.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="productThumb">
                {p.image ? <img className="thumbImg" src={p.image} alt={p.name} /> : null}
                <div className="badge">{p.badge ?? 'Care'}</div>
                <div className="priceOverlay">{formatUsd(p.price)}</div>
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
                    Global product
                  </div>
              ) : null}
              <div className="muted productDesc clamp2">
                {p.description}
              </div>
              <div className="row productActions" style={{ marginTop: 14, display: 'block' }}>
                <div style={{ fontWeight: 900, marginBottom: '12px', fontSize: '18px', color: '#c28451' }}>
                  {formatUsd(p.price)}
                </div>
                <button
                  className="btn btnAddToCart"
                  disabled={Number.isFinite(Number(p.stockQty)) ? Number(p.stockQty) <= 0 : false}
                  style={{ 
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
                    cursor: Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0 ? 'not-allowed' : 'pointer',
                    opacity: Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0 ? 0.5 : 1
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0) return
                    cart.add(p.id, 1)
                    setAddedToCart(p.id)
                    setTimeout(() => setAddedToCart(null), 2000)
                  }}
                  onMouseEnter={(e) => {
                    if (addedToCart !== p.id && !(Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0)) {
                      e.currentTarget.style.borderColor = '#c28451'
                      e.currentTarget.style.color = '#c28451'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (addedToCart !== p.id && !(Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0)) {
                      e.currentTarget.style.borderColor = '#ddd'
                      e.currentTarget.style.color = '#666'
                    }
                  }}
                >
                  <ShoppingCart size={16} />
                  {Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0 
                    ? 'Out of stock' 
                    : addedToCart === p.id 
                      ? 'Added to cart!'
                      : 'Add to cart'
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
