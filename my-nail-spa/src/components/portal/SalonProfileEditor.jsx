import { useEffect, useState } from 'react'
import {
  BadgePercent,
  ExternalLink,
  Gift,
  Image,
  Mail,
  MapPin,
  Phone,
  Save,
  Store,
  Ticket,
} from 'lucide-react'

import { api } from '../../lib/api'
import { useI18n } from '../../context/I18nContext.jsx'
import { OwnerReviewsPage } from '../../pages/portal/OwnerReviewsPage.jsx'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.onload = () => resolve(String(reader.result || ''))
      reader.readAsDataURL(file)
    } catch (e) {
      reject(e)
    }
  })
}

function defaultHours() {
  return DAYS.reduce((acc, d) => {
    acc[d] = { open: '10:00', close: '19:00', closed: d === 'Sun' }
    return acc
  }, {})
}

export function SalonProfileEditor({ salonId, userEmail }) {
  const { t } = useI18n()
  const defaultName = t('portal.salonProfile.defaultName', 'My Salon')
  const defaultPolicy = t(
    'portal.salonProfile.policyDefault',
    'Please arrive 5–10 minutes early. Rescheduling is allowed up to 2 hours before your appointment.',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState(() => ({
    name: defaultName,
    address: '',
    phone: '',
    email: userEmail || '',
    policy: defaultPolicy,
    avatarImage: '',
    coverImage: '',
    description: '',
    dailyDeals: [],
    photos: [],
    giftCards: [],
    hours: defaultHours(),
  }))

  useEffect(() => {
    let alive = true
    if (!salonId) return undefined

    setLoading(true)
    setError('')

    Promise.all([
      api.getSalon(salonId).catch(() => null),
      api.getSalonProfile(salonId).catch(() => ({ item: null })),
    ])
      .then(([salonRes, profileRes]) => {
        if (!alive) return
        const salonItem = salonRes?.item || salonRes || null
        const profileItem = profileRes?.item || null

        const hours = profileItem?.hours || defaultHours()
        setForm({
          name: profileItem?.name || salonItem?.name || defaultName,
          address: profileItem?.address || salonItem?.address || '',
          phone: profileItem?.phone || '',
          email: profileItem?.email || userEmail || '',
          policy: profileItem?.policy || defaultPolicy,
          avatarImage: profileItem?.avatarImageUrl || profileItem?.avatarImage || '',
          coverImage: profileItem?.coverImageUrl || profileItem?.coverImage || '',
          description: profileItem?.description || '',
          dailyDeals: Array.isArray(profileItem?.dailyDeals) ? profileItem.dailyDeals : [],
          photos: Array.isArray(profileItem?.photos) ? profileItem.photos : [],
          giftCards: Array.isArray(profileItem?.giftCards) ? profileItem.giftCards : [],
          hours,
        })
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || t('portal.salonProfile.loadError', 'Failed to load salon profile'))
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [userEmail, salonId])

  function updateHours(day, patch) {
    setForm((p) => ({
      ...p,
      hours: {
        ...(p.hours || {}),
        [day]: { ...(p.hours?.[day] || {}), ...patch },
      },
    }))
  }

  async function save() {
    if (!salonId) return
    setError('')
    try {
      await api.upsertSalonProfile(salonId, {
        name: form.name,
        address: form.address,
        phone: form.phone,
        email: form.email,
        policy: form.policy,
        avatarImageUrl: form.avatarImage,
        coverImageUrl: form.coverImage,
        description: form.description,
        hours: form.hours,
        dailyDeals: Array.isArray(form.dailyDeals) ? form.dailyDeals : [],
        giftCards: Array.isArray(form.giftCards) ? form.giftCards : [],
        photos: Array.isArray(form.photos) ? form.photos : [],
      })

      // Reload to stay in sync with DB-generated IDs.
      const refreshed = await api.getSalonProfile(salonId).catch(() => ({ item: null }))
      
      if (refreshed?.item) {
        const p = refreshed.item
        setForm((prev) => ({
          ...prev,
          name: p.name || prev.name,
          address: p.address || prev.address,
          phone: p.phone || prev.phone,
          email: p.email || prev.email,
          policy: p.policy || prev.policy,
          avatarImage: p.avatarImageUrl || prev.avatarImage,
          coverImage: p.coverImageUrl || prev.coverImage,
          description: p.description || prev.description,
          hours: p.hours || prev.hours,
          dailyDeals: Array.isArray(p.dailyDeals) ? p.dailyDeals : [],
          giftCards: Array.isArray(p.giftCards) ? p.giftCards : [],
          photos: Array.isArray(p.photos) ? p.photos : [],
        }))
      }

      setSaved(true)
      window.setTimeout(() => setSaved(false), 1200)
    } catch (e) {
      setError(e?.message || t('portal.salonProfile.saveError', 'Failed to save'))
    }
  }

  async function onPickImage(kind, file) {
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setForm((p) => ({ ...p, [kind]: dataUrl }))
  }

  async function onAddPhotos(files) {
    const list = Array.from(files || []).filter(Boolean)
    if (!list.length) return

    const added = []
    for (const f of list) {
      const src = await fileToDataUrl(f)
      added.push({ id: uid(), src, caption: '' })
    }

    setForm((p) => ({ ...p, photos: [...added, ...(Array.isArray(p.photos) ? p.photos : [])] }))
  }

  return (
    <>
      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="portalGrid">
        <div className="card" style={{ padding: 14, gridColumn: 'span 2' }}>
          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 900, marginBottom: 10 }}>
            <Store size={16} /> {t('portal.salonProfile.title', 'Profile')}
          </div>

          <div className="grid twoCol" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Image size={14} /> {t('portal.salonProfile.avatar', 'Avatar')}
              </div>
              <div className="card" style={{ padding: 12, boxShadow: 'none', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: 14,
                    background: form.avatarImage ? `url(${form.avatarImage}) center/cover no-repeat` : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <input
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPickImage('avatarImage', e.target.files?.[0])}
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {t('portal.salonProfile.avatarHint', 'Saved in SQL Server when you click Save.')}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Ticket size={14} /> {t('portal.salonProfile.cover', 'Cover image')}
              </div>
              <div className="card" style={{ padding: 12, boxShadow: 'none', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  style={{
                    width: 118,
                    height: 62,
                    borderRadius: 14,
                    background: form.coverImage ? `url(${form.coverImage}) center/cover no-repeat` : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <input
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPickImage('coverImage', e.target.files?.[0])}
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {t('portal.salonProfile.coverHint', 'Used as your salon header background.')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <label className="muted" style={{ fontSize: 12 }}>{t('portal.salonProfile.name', 'Salon name')}</label>
          <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />

          <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <MapPin size={14} /> {t('portal.salonProfile.address', 'Address')}
            </span>
          </label>
          <input className="input" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />

          <div className="grid twoCol" style={{ gap: 10, marginTop: 10 }}>
            <div>
              <label className="muted" style={{ fontSize: 12 }}>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Phone size={14} /> {t('portal.salonProfile.phone', 'Phone')}
                </span>
              </label>
              <input className="input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className="muted" style={{ fontSize: 12 }}>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Mail size={14} /> {t('auth.email', 'Email')}
                </span>
              </label>
              <input className="input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
          </div>

          <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.salonProfile.policies', 'Policies')}</label>
          <textarea
            className="input"
            style={{ minHeight: 92, resize: 'vertical' }}
            value={form.policy}
            onChange={(e) => setForm((p) => ({ ...p, policy: e.target.value }))}
          />

          <label className="muted" style={{ fontSize: 12, marginTop: 10, display: 'block' }}>{t('portal.salonProfile.description', 'Description')}</label>
          <textarea
            className="input"
            style={{ minHeight: 92, resize: 'vertical' }}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />

          {/* Daily Deals UI removed */}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <Image size={16} /> {t('portal.salonProfile.photos.title', 'Photos')}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{t('portal.salonProfile.photos.hint', 'Add / edit / delete photos')}</div>
          </div>

          <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
            <input
              className="input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onAddPhotos(e.target.files)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {t('portal.salonProfile.photos.tip', 'Tip: upload small images to keep things fast.')}
            </div>

            {(form.photos || []).length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
                {(form.photos || []).map((ph) => (
                  <div key={ph.id} className="card" style={{ padding: 10, boxShadow: 'none' }}>
                    <div
                      style={{
                        width: '100%',
                        height: 110,
                        borderRadius: 14,
                        background: ph.src ? `url(${ph.src}) center/cover no-repeat` : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        marginBottom: 10,
                      }}
                    />
                    <input
                      className="input"
                      placeholder={t('portal.salonProfile.photos.caption', 'Caption')}
                      value={ph.caption || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          photos: (p.photos || []).map((x) => (x.id === ph.id ? { ...x, caption: e.target.value } : x)),
                        }))
                      }
                    />
                    <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setForm((p) => ({ ...p, photos: (p.photos || []).filter((x) => x.id !== ph.id) }))}
                      >
                        {t('portal.common.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>{t('portal.salonProfile.photos.empty', 'No photos yet.')}</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <Gift size={16} /> {t('site.salon.gift.title', 'Gift Cards')}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{t('portal.salonProfile.gift.hint', 'Add / edit / delete gift cards')}</div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {(form.giftCards || []).map((g) => (
              <div key={g.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                <div className="grid twoCol" style={{ gap: 10 }}>
                  <input
                    className="input"
                    placeholder={t('portal.salonProfile.gift.namePlaceholder', 'Gift card name')}
                    value={g.title || ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        giftCards: (p.giftCards || []).map((x) => (x.id === g.id ? { ...x, title: e.target.value } : x)),
                      }))
                    }
                  />
                  <input
                    className="input"
                    placeholder={t('portal.salonProfile.gift.amountPlaceholder', 'Amount (e.g. 50)')}
                    value={g.amount ?? ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        giftCards: (p.giftCards || []).map((x) => (x.id === g.id ? { ...x, amount: e.target.value } : x)),
                      }))
                    }
                  />
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, marginTop: 10 }}>
                   <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, opacity: 0.8 }}>Bonus & Rules</div>
                   <div className="grid twoCol" style={{ gap: 10 }}>
                      <div>
                        <label className="muted" style={{ fontSize: 11 }}>{t('portal.salonProfile.giftCards.bonus', 'Bonus Amount')}</label>
                        <input className="input" type="number" step="1"
                            value={(() => {
                                try { const n = JSON.parse(g.description || '{}'); return n.bonus || '' } catch { return '' }
                            })()}
                            onChange={(e) => setForm(p => ({
                                ...p,
                                giftCards: p.giftCards.map(x => {
                                    if (x.id !== g.id) return x;
                                    try {
                                        const n = JSON.parse(x.description || '{}');
                                        n.bonus = e.target.value;
                                        return { ...x, description: JSON.stringify(n) };
                                    } catch {
                                        return { ...x, description: JSON.stringify({ bonus: e.target.value }) };
                                    }
                                })
                            }))}
                        />
                      </div>
                      <div>
                        <label className="muted" style={{ fontSize: 11 }}>{t('portal.salonProfile.giftCards.expiry', 'Expires (days)')}</label>
                        <input className="input" type="number" step="1"
                            value={(() => {
                                try { const n = JSON.parse(g.description || '{}'); return n.expiryDays || '' } catch { return '' }
                            })()}
                            onChange={(e) => setForm(p => ({
                                ...p,
                                giftCards: p.giftCards.map(x => {
                                    if (x.id !== g.id) return x;
                                    try {
                                        const n = JSON.parse(x.description || '{}');
                                        n.expiryDays = e.target.value;
                                        return { ...x, description: JSON.stringify(n) };
                                    } catch {
                                        return { ...x, description: JSON.stringify({ expiryDays: e.target.value }) };
                                    }
                                })
                            }))}
                        />
                      </div>
                   </div>
                </div>

                <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                  <label className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(g.active ?? true)}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          giftCards: (p.giftCards || []).map((x) => (x.id === g.id ? { ...x, active: e.target.checked } : x)),
                        }))
                      }
                    />
                      {t('portal.salonProfile.gift.active', 'Active')}
                  </label>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setForm((p) => ({ ...p, giftCards: (p.giftCards || []).filter((x) => x.id !== g.id) }))}
                  >
                      {t('portal.common.delete', 'Delete')}
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn"
              onClick={() =>
                setForm((p) => ({
                  ...p,
                  giftCards: [{ id: uid(), title: '', amount: '', description: '', active: true }, ...(p.giftCards || [])],
                }))
              }
            >
                {t('portal.salonProfile.gift.add', 'Add gift card')}
            </button>
          </div>

          <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <div className="muted" style={{ fontSize: 13 }}>
              {loading
                ? t('portal.common.saving', 'Saving…')
                : saved
                  ? t('portal.common.saved', 'Saved!')
                  : t('portal.salonProfile.saveHint', 'Changes save to SQL Server')}
            </div>
            <button className="btn btn-primary" type="button" onClick={() => void save()}>
              <Save size={16} style={{ marginRight: 8 }} />
              {t('portal.common.save', 'Save')}
            </button>
          </div>
        </div>

        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{t('portal.salonProfile.hours.title', 'Opening hours')}</div>
            <div style={{ display: 'grid', gap: 10 }}>
            {DAYS.map((d) => {
              const h = form.hours?.[d] || { open: '10:00', close: '19:00', closed: false }
              return (
                <div key={d} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div className="row" style={{ alignItems: 'center' }}>
                    <div style={{ fontWeight: 900, width: 56 }}>{t(`site.common.weekday.${d.toLowerCase()}`, d)}</div>
                    <label className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(h.closed)}
                        onChange={(e) => updateHours(d, { closed: e.target.checked })}
                      />
                      {t('site.salon.hours.closed', 'Closed')}
                    </label>
                    <div style={{ flex: 1 }} />
                    <input
                      className="input"
                      style={{ maxWidth: 140, opacity: h.closed ? 0.5 : 1 }}
                      value={h.open}
                      disabled={h.closed}
                      onChange={(e) => updateHours(d, { open: e.target.value })}
                    />
                    <div className="muted">{t('portal.salonProfile.hours.to', 'to')}</div>
                    <input
                      className="input"
                      style={{ maxWidth: 140, opacity: h.closed ? 0.5 : 1 }}
                      value={h.close}
                      disabled={h.closed}
                      onChange={(e) => updateHours(d, { close: e.target.value })}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            {t(
              'portal.salonProfile.hours.tip',
              'Tip: once saved, these hours can be shown on the consumer Salon Detail page.',
            )}
          </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <OwnerReviewsPage />
          </div>
        </div>
      </div>
    </>
  )
}
