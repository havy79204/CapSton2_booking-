import { ShoppingCart, ShoppingBag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { formatUsd } from '../lib/money'
import { api } from '../lib/api'
import { useI18n } from '../context/I18nContext.jsx'


function productTags(product) {
  const id = String(product?.id || '')
  const tags = []
  if (id.includes('base-coat') || id.includes('top-coat') || id.includes('remover')) tags.push('Gel')
  if (id.includes('nail-art') || id.includes('brush')) tags.push('Art')
  if (id.includes('nail-polish')) tags.push('Manicure')
  if (id.includes('cuticle') || id.includes('hand-cream') || id.includes('file')) tags.push('Care')
  return tags
}

export function ShopPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const [effect, setEffect] = useState('All')
  const [query, setQuery] = useState('')
  const { t } = useI18n()

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
    let list = products
    if (effect !== 'All') list = list.filter((p) => productTags(p).includes(effect))
    if (!q) return list
    return list.filter((p) => {
      const name = String(p.name || p.title || '').toLowerCase()
      const desc = String(p.description || '').toLowerCase()
      const salon = String(p.salon?.name || '').toLowerCase()
      return name.includes(q) || desc.includes(q) || salon.includes(q)
    })
  }, [effect, products, query])

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('site.shop.title', 'Shop')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <ShoppingBag size={16} />
            {t('site.shop.subtitle', 'Curated nail care essentials')}
          </div>
        </div>


        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              aria-label="Search products"
              placeholder={t('site.shop.searchPlaceholder', 'Search products')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: 22, border: '1px solid #f0dfe6', minWidth: 300, flex: '1 1 300px' }}
            />
            <div className="muted" style={{ fontSize: 13 }}>{t('site.shop.showing', 'Showing {{count}} products').replace('{{count}}', items.length)}</div>
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
                    {t('site.shop.global', 'Global product')}
                  </div>
              ) : null}
              <div className="muted productDesc clamp2">
                {p.description}
              </div>
              <div className="row productActions" style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900 }}>{formatUsd(p.price)}</div>
                <button
                  className="btn btn-primary"
                  disabled={Number.isFinite(Number(p.stockQty)) ? Number(p.stockQty) <= 0 : false}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0) return
                    cart.add(p.id, 1)
                  }}
                >
                  <ShoppingCart size={16} style={{ marginRight: 8 }} />
                  {Number.isFinite(Number(p.stockQty)) && Number(p.stockQty) <= 0 ? t('site.shop.outOfStock', 'Out of stock') : t('site.shop.addToCart', 'Add to cart')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
