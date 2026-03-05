import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Trash2, ArrowRight } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import { formatCurrency } from '../lib/money'
import { api } from '../lib/api'

export function CartDropdown({ isOpen, onClose }) {
  const cart = useCart()
  const navigate = useNavigate()
  const [productsById, setProductsById] = useState({})

  useEffect(() => {
    if (!isOpen) return
    const ids = (cart.items || []).map((x) => x.productId).filter(Boolean)
    if (!ids.length) return
    
    let alive = true
    api
      .getProductsBulk(ids)
      .then((r) => {
        if (!alive) return
        const map = {}
        for (const p of Array.isArray(r?.items) ? r.items : []) {
          if (p?.id) map[p.id] = p
        }
        setProductsById(map)
      })
      .catch(() => {
        // no-op
      })
    return () => {
      alive = false
    }
  }, [cart.items, isOpen])

  const lineItems = (cart.items || [])
    .map((it) => {
      const p = productsById[it.productId]
      if (!p) return null
      return { ...p, qty: it.qty }
    })
    .filter(Boolean)

  const subtotal = lineItems.reduce((sum, x) => sum + (x.price || 0) * x.qty, 0)

  if (!isOpen) return null

  return (
    <div className="cartDropdown">
      <div className="cartDropdownHeader">
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
          <ShoppingCart size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Cart ({cart.count()})
        </h3>
      </div>

      {lineItems.length === 0 ? (
        <div style={{ 
          padding: '48px 24px', 
          textAlign: 'center', 
          color: '#999',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <ShoppingCart size={64} style={{ opacity: 0.2, color: '#c28451' }} />
          <div style={{ fontSize: '15px', fontWeight: 500, color: '#666' }}>Your cart is empty</div>
          <div style={{ fontSize: '13px', color: '#999' }}>Add some products to get started</div>
        </div>
      ) : (
        <>
          <div className="cartDropdownItems">
            {lineItems.map((item) => (
              <div key={item.id} className="cartDropdownItem">
                <div className="cartItemImage">
                  {item.image && <img src={item.image} alt={item.name} />}
                </div>
                <div className="cartItemDetails">
                  <div className="cartItemName">{item.name}</div>
                  <div className="cartItemPriceRow">
                    <span className="cartItemPrice">{formatCurrency(item.price)}</span>
                    <span className="cartItemMultiplier">×</span>
                    <span className="cartItemQty">{item.qty}</span>
                  </div>
                </div>
                <div className="cartItemRight">
                  <div className="cartItemTotal">
                    {formatCurrency(item.price * item.qty)}
                  </div>
                  <button
                    className="cartItemRemove"
                    onClick={() => cart.remove(item.id)}
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="cartDropdownFooter">
            <div className="cartSubtotal">
              <span>Subtotal:</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <button
              className="btn btn-primary"
              style={{ 
                width: '100%', 
                padding: '12px 24px',
                fontSize: '15px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #c28451 0%, #b0764a 100%)',
                border: 'none',
                borderRadius: '10px',
                transition: 'all 0.3s ease'
              }}
              onClick={() => {
                navigate('/cart')
                onClose()
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(194, 132, 81, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              View Cart
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
