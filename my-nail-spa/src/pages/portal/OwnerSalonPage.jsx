import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { OwnerServicesPage } from './OwnerServicesPage.jsx'
import { OwnerBookingsPage } from './OwnerBookingsPage.jsx'
import { OwnerReviewsPage } from './OwnerReviewsPage.jsx'
import { SalonProfileEditor } from '../../components/portal/SalonProfileEditor.jsx'

export function OwnerSalonPage() {
  const auth = useAuth()
  const { t } = useI18n()
  const salonId = auth.user?.salonId

  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') || 'profile').toLowerCase()
  const [tab, setTab] = useState(() => {
    if (initialTab === 'services') return 'services'
    if (initialTab === 'bookings') return 'bookings'
    return 'profile'
  })

  if (!salonId) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900 }}>{t('portal.ownerSalon.noSalon', 'No salon assigned')}</div>
        <div className="muted" style={{ marginTop: 8 }}>{t('portal.ownerSalon.noSalonHint', "This demo account doesn't have a salonId.")}</div>
      </div>
    )
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.ownerSalon.title', 'Salon')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Sparkles size={16} />
          {t('portal.ownerSalon.subtitle', 'Manage your salon profile and hours (SQL Server)')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          type="button"
          className={tab === 'profile' ? 'chip chipActive' : 'chip'}
          onClick={() => {
            setTab('profile')
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'profile')
              return next
            })
          }}
        >
          {t('portal.ownerSalon.tab.profile', 'Profile & Hours')}
        </button>
        <button
          type="button"
          className={tab === 'services' ? 'chip chipActive' : 'chip'}
          onClick={() => {
            setTab('services')
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'services')
              return next
            })
          }}
        >
          {t('portal.ownerSalon.tab.services', 'Services')}
        </button>

        <button
          type="button"
          className={tab === 'bookings' ? 'chip chipActive' : 'chip'}
          onClick={() => {
            setTab('bookings')
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'bookings')
              return next
            })
          }}
        >
          {t('portal.ownerSalon.tab.bookings', 'Bookings')}
        </button>
      </div>

      {tab === 'services' ? <OwnerServicesPage embedded /> : null}

      {tab === 'bookings' ? <OwnerBookingsPage embedded /> : null}

      {tab === 'profile' ? (
        <SalonProfileEditor salonId={salonId} userEmail={auth.user?.email} />
      ) : null}
    </>
  )
}
