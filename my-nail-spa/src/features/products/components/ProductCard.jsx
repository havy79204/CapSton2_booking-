import React from 'react'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '../../../context/CartContext.jsx'
import { formatUsd } from '../../../lib/money'

export function ProductCard({ product }) {
  const cart = useCart()
  if (!product) return null
  return (
    <div className="card productCard">
      <div className="productThumb">
        {product.image ? <img className="thumbImg" src={product.image} alt={product.name || product.title} /> : null}
        {product.badge ? <div className="badge">{product.badge}</div> : null}
      </div>
      <div className="productTitle">{product.name || product.title}</div>
      {product.salon?.id || product.salonId ? (
        <div style={{ marginTop: 8 }}><span className="badge">{product.salon?.name || product.salonId}</span></div>
      ) : null}
      <div className="muted productDesc">{product.description}</div>
      <div className="row productActions">
        <div style={{ fontWeight: 900 }}>{formatUsd(product.price)}</div>
        <button className="btn btn-primary" type="button" onClick={() => cart.add(product.id, 1)}>
          <ShoppingCart size={16} style={{ marginRight: 8 }} /> Add to cart
        </button>
      </div>
    </div>
  )
}

export default ProductCard
