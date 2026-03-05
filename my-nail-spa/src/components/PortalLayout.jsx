import { createElement } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Boxes,
  CalendarClock,
  LogOut,
  MessageCircle,
  Star,
  Store,
  Timer,
  Users,
  Wallet,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'
import logo from '../assets/images/image.png'

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `portalNavItem${isActive ? ' active' : ''}`}
    >
      {createElement(icon, { size: 16 })}
      <span>{label}</span>
    </NavLink>
  )
}

export function PortalLayout() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()

  const roleRaw = auth.user?.role
  const role = String(roleRaw || '').trim().toLowerCase()
  const isAdmin = role === 'admin'
  const isOwner = role === 'owner'
  const isStaff = role === 'staff'
  const roleLabel = isAdmin
    ? t('portal.role.admin', 'Admin')
    : isOwner
      ? t('portal.role.owner', 'Salon Owner')
      : isStaff
        ? t('portal.role.staff', 'Staff')
        : t('portal.role.other', 'Customer')

  return (
    <div className="portalShell">
      <aside className="portalSidebar">
        <button className="portalBrand" type="button" onClick={() => navigate('/portal')}>
          <img className="portalBrandImg" src={logo} alt="NIOM&CE" />
          <div className="portalBrandText">
            <div className="portalBrandTitle">NIOM&CE</div>
            <div className="portalBrandSub">{t('portal.brandSub', 'Business Portal')}</div>
          </div>
        </button>

        <div className="portalUser">
          <div className="portalUserName">{auth.user?.name}</div>
          <div className="portalUserMeta">{auth.user?.email} · {roleLabel}</div>
        </div>

        <nav className="portalNav" aria-label="Portal navigation">
          <NavItem to="/portal/dashboard" icon={BarChart3} label={t('portal.dashboard', 'Dashboard')} />

          {isAdmin ? (
            <>
              <NavItem to="/portal/admin/users" icon={Users} label={t('portal.admin.users', 'Users')} />
              <NavItem to="/portal/admin/salons" icon={Store} label={t('portal.admin.salons', 'Salons')} />
              <NavItem to="/portal/admin/promotions" icon={Star} label={t('portal.admin.promotions', 'Promotions')} />
              <NavItem to="/portal/admin/ai" icon={Bot} label={t('portal.admin.ai', 'AI Reports')} />
            </>
          ) : null}

          {isOwner ? (
            <>
              <NavItem to="/portal/owner/staff" icon={Users} label={t('portal.owner.staff', 'Staff')} />
              <NavItem to="/portal/owner/salon" icon={Store} label={t('portal.owner.salon', 'Salon')} />
              <NavItem to="/portal/owner/schedule" icon={CalendarClock} label={t('portal.owner.schedule', 'AI Scheduling')} />
              <NavItem to="/portal/owner/inventory" icon={Boxes} label={t('portal.owner.inventory', 'Inventory')} />
              <NavItem to="/portal/owner/messages" icon={MessageCircle} label={t('portal.owner.messages', 'Messages')} />
              <NavItem to="/portal/owner/external-po" icon={Store} label={t('portal.owner.externalPO', 'External PO')} />
            </>
          ) : null}

          {isStaff ? (
            <>
              <NavItem to="/portal/staff/schedule" icon={CalendarClock} label={t('portal.staff.schedule', 'My Schedule')} />
              <NavItem to="/portal/staff/time" icon={Timer} label={t('portal.staff.time', 'Time Clock')} />
              <NavItem to="/portal/staff/earnings" icon={Wallet} label={t('portal.staff.earnings', 'Earnings')} />
            </>
          ) : null}
        </nav>

        <div className="portalFooter">
          <button className="btn" type="button" onClick={() => navigate('/')}
          >
            <ArrowLeft size={16} style={{ marginRight: 8 }} />
            {t('portal.consumerSite', 'Consumer Site')}
          </button>

          <button
            className="btn"
            type="button"
            onClick={() => {
              auth.logout()
              navigate('/')
            }}
          >
            <LogOut size={16} style={{ marginRight: 8 }} />
            {t('portal.logout', 'Logout')}
          </button>
        </div>
      </aside>

      <div className="portalMain">
        <div className="portalTop">
          <div className="portalTopTitle">{role === 'admin'
            ? t('portal.top.admin', 'Admin Workspace')
            : role === 'owner'
              ? t('portal.top.owner', 'Salon Owner Workspace')
              : t('portal.top.staff', 'Staff Workspace')}</div>
          <div className="portalTopHint">{t('portal.top.hint', 'ERP • Booking • AI • Operations (demo)')}</div>
        </div>

        <div className="portalContent">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
