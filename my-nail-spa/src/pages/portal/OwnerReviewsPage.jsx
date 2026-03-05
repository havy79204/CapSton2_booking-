import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'

export function OwnerReviewsPage() {
  const auth = useAuth()
  const { t } = useI18n()
  const salonId = auth.user?.salonId

  const [filter, setFilter] = useState('all') // 'all', 'salon', 'product'
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      if (!salonId) return
      setLoading(true)
      setError('')
      try {
        const [salonRes, productRes] = await Promise.all([
          api.listSalonReviews(salonId),
          api.listSalonProductReviews(salonId).catch(() => ({ items: [] })) // Handle failure gracefully
        ])
        
        if (alive) {
          const salonList = (salonRes?.items || []).map(r => ({ ...r, type: 'salon' }))
          const productList = (productRes?.items || []).map(r => ({ ...r, type: 'product' }))
          
          // Sort both by createdAt desc
          const combined = [...salonList, ...productList].sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt) : 0
            const db = b.createdAt ? new Date(b.createdAt) : 0
            return db - da
          })
          
          setReviews(combined)
        }
      } catch (e) {
        if (alive) setError(e.message || t('portal.common.error', 'Error'))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [salonId])
  
  const filteredReviews = reviews.filter(r => {
    if (filter === 'salon') return r.type === 'salon'
    if (filter === 'product') return r.type === 'product'
    return true
  })

  if (!salonId) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900 }}>{t('portal.common.noSalon', 'No salon assigned')}</div>
        <div className="muted" style={{ marginTop: 8 }}>{t('portal.common.noSalonHint', "This owner account doesn't have a salonId.")}</div>
      </div>
    )
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h3>{t('portal.ownerReviews.title', 'Reviews')}</h3>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Star size={16} />
          {t('portal.ownerReviews.subtitle', 'Customer feedback')}
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', border: '1px solid rgba(255,59,122,0.35)', marginBottom: 12 }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}
      
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button 
          className="chip"
          style={filter === 'all' ? { background: 'rgba(255, 59, 122, 0.15)', borderColor: 'rgba(255, 59, 122, 0.4)', color: '#fff' } : { cursor: 'pointer' }}
          onClick={() => setFilter('all')}
        >
          {t('portal.ownerReviews.filter.all', 'All')}
        </button>
        <button 
          className="chip"
          style={filter === 'salon' ? { background: 'rgba(255, 59, 122, 0.15)', borderColor: 'rgba(255, 59, 122, 0.4)', color: '#fff' } : { cursor: 'pointer' }}
          onClick={() => setFilter('salon')}
        >
          {t('portal.ownerReviews.filter.salon', 'Salon')}
        </button>
        <button 
          className="chip"
          style={filter === 'product' ? { background: 'rgba(255, 59, 122, 0.15)', borderColor: 'rgba(255, 59, 122, 0.4)', color: '#fff' } : { cursor: 'pointer' }}
          onClick={() => setFilter('product')}
        >
          {t('portal.ownerReviews.filter.product', 'Products')}
        </button>
      </div>

      {loading && !reviews.length && (
        <div className="muted">{t('portal.common.loading', 'Loading…')}</div>
      )}

      {!loading && !filteredReviews.length ? (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div className="muted">{t('portal.ownerReviews.none', 'No reviews yet.')}</div>
        </div>
      ) : null}

      <div className="grid twoCol" style={{ gap: 14 }}>
        {filteredReviews.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{r.userName || 'Anonymous'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {r.type === 'product' && (
                        <span style={{ 
                          display: 'inline-block', 
                          padding: '2px 6px', 
                          borderRadius: 4, 
                          background: 'rgba(255,255,255,0.1)', 
                          marginRight: 6,
                          fontSize: 11
                        }}>Products</span>
                    )}
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''} 
                    {r.verified ? ` • ${t('site.review.verified', 'Verified')}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 2, color: '#FFD700' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} fill={i < (r.rating || 0) ? '#FFD700' : 'none'} stroke={i < (r.rating || 0) ? '#FFD700' : 'currentColor'} strokeWidth={1.5} />
                ))}
              </div>
            </div>
            
            {r.productName && (
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#4fc8b4' }}>
                   For: {r.productName}
                </div>
            )}
            
            <p style={{ margin: '8px 0', fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.9)' }}>
              {r.text}
            </p>

            {/* Read-only access: Delete button removed */}
          </div>
        ))}
      </div>
    </>
  )
}


