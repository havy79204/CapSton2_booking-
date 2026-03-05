import React from 'react'
import { useProducts } from './hooks/useProducts'
import ProductCard from './components/ProductCard'

export function ProductList({ salonId }) {
  const { items, loading, error } = useProducts({ salonId })

  if (loading) return <div className="muted">Loading products…</div>
  if (error) return <div className="muted">Failed to load products</div>

  return (
    <div className="grid gridProducts">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}

export default ProductList
