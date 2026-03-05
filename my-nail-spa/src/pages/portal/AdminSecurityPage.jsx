import { Shield } from 'lucide-react'

import { useI18n } from '../../context/I18nContext.jsx'

export function AdminSecurityPage() {
  const { t } = useI18n()

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.adminSecurity.title', 'Access & Roles')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Shield size={16} />
          {t('portal.adminSecurity.subtitle', 'Role-based access control (demo)')}
        </div>
      </div>

      <div className="portalGrid">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>{t('portal.adminSecurity.roles', 'Roles')}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            - {t('portal.adminSecurity.roleAdmin', 'admin: system wide dashboard, users, salons, AI reports')}
            <br />
            - {t('portal.adminSecurity.roleOwner', 'owner: staff scheduling, ERP inventory, orders, external PO')}
            <br />
            - {t('portal.adminSecurity.roleStaff', 'staff: schedule, time clock, earnings')}
            <br />
            - {t('portal.adminSecurity.roleCustomer', 'customer: booking + shop')}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>{t('portal.adminSecurity.permsTitle', 'Permissions (placeholder)')}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {t('portal.adminSecurity.permsDesc', 'Add granular permissions per feature: view/edit inventory, approve orders, manage staff, etc.')}
          </div>
        </div>
      </div>
    </>
  )
}
