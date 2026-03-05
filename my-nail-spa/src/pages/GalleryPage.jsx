import { useEffect, useMemo, useState } from 'react'
import { Images, Search, X } from 'lucide-react'
import { useI18n } from '../context/I18nContext.jsx'

function titleFromPath(path) {
  const base = String(path || '').split('/').pop() || ''
  const noExt = base.replace(/\.[^.]+$/, '')
  const cleaned = noExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : 'Image'
}

function categoryFromPath(path) {
  const p = String(path || '')
  if (p.includes('/assets/images/salons/')) return 'Salons'
  if (p.includes('/assets/images/products/')) return 'Products'
  if (p.includes('/assets/Logo/')) return 'Brand'
  if (p.includes('/assets/Nền/')) return 'Banners'
  if (p.includes('/assets/ẢNH/')) return 'Gallery'
  if (p.includes('/assets/images/')) return 'Assets'
  return 'Other'
}

export function GalleryPage() {
  const { t } = useI18n()
  const all = useMemo(() => {
    const modules = import.meta.glob('../assets/**/*.{avif,svg,png,jpg,jpeg,webp}', {
      eager: true,
      import: 'default',
    })

    return Object.entries(modules)
      .map(([path, src]) => ({
        id: path,
        path,
        src,
        title: titleFromPath(path),
        category: categoryFromPath(path),
      }))
      // Skip hero/logo to keep the gallery focused
      .filter(
        (x) =>
          !x.path.endsWith('/assets/images/hero.avif') &&
          !x.path.endsWith('/assets/images/logo.avif') &&
          !x.path.endsWith('/assets/images/image.png')
      )
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  }, [])

  const categories = useMemo(() => {
    const counts = new Map()
    for (const item of all) counts.set(item.category, (counts.get(item.category) || 0) + 1)
    const keys = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b))
    return [{ key: 'All', count: all.length }, ...keys.map((k) => ({ key: k, count: counts.get(k) }))]
  }, [all])

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [active, setActive] = useState(null)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((x) => {
      if (filter !== 'All' && x.category !== filter) return false
      if (!q) return true
      return `${x.title} ${x.category}`.toLowerCase().includes(q)
    })
  }, [all, filter, query])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('gallery.title', 'Gallery')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Images size={16} />
            {t('gallery.subtitle', 'Browse photos & brand assets')}
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="galleryToolbar">
            <div className="gallerySearch">
              <Search size={16} />
              <input
                className="input"
                placeholder={t('gallery.search', 'Search images...')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="galleryFilters">
              {categories.map((c) => (
                <button
                  key={c.key}
                  className={filter === c.key ? 'chip chipActive' : 'chip'}
                  onClick={() => setFilter(c.key)}
                  type="button"
                >
                  {c.key}
                  <span className="muted" style={{ fontSize: 12 }}>({c.count})</span>
                </button>
              ))}

              <button className="btn" onClick={() => (setQuery(''), setFilter('All'))}>
                {t('gallery.reset', 'Reset')}
              </button>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            {t('gallery.showing', 'Showing {{count}} images').replace('{{count}}', items.length)}
          </div>
        </div>

        <div className="galleryGrid">
          {items.map((img) => (
            <button
              key={img.id}
              className="galleryItem"
              type="button"
              onClick={() => setActive(img)}
              title={`${img.category} · ${img.title}`}
            >
              <img src={img.src} alt={img.title} loading="lazy" />
              <div className="galleryMeta">
                <div className="galleryTitle">{img.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>{img.category}</div>
              </div>
            </button>
          ))}
        </div>

        {active ? (
          <div className="galleryLightbox" role="dialog" aria-modal="true" aria-label={t('gallery.preview', 'Image preview')}>
            <button className="galleryLightboxBg" type="button" onClick={() => setActive(null)} aria-label="Close" />
            <div className="galleryLightboxCard">
              <div className="galleryLightboxTop">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>{active.title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{active.category}</div>
                </div>
                <button className="btn" type="button" onClick={() => setActive(null)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="galleryLightboxImg">
                <img src={active.src} alt={active.title} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
