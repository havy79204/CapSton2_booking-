import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  IconBarCart,
  IconBox,
  IconCalendar,
  IconCevronDown,
  IconClock,
  IconGrid,
  IconScissors,
  IconSettings,
  IconUser,
  IconUsers,
} from './PortalIcons.jsx'

const navItems = [
  { to: '/portals/owner/dashboard', label: 'Dashboard', Icon: IconGrid },
  { to: '/portals/owner/customers', label: 'Customers', Icon: IconUser },
  { to: '/portals/owner/staff', label: 'Staff', Icon: IconUsers },
  { to: '/portals/owner/schedule', label: 'Schedule', Icon: IconClock },
  { to: '/portals/owner/appointments', label: 'Appointments', Icon: IconCalendar },
  { to: '/portals/owner/services', label: 'Services', Icon: IconScissors },
  { to: '/portals/owner/products', label: 'Products', Icon: IconBox },
  { to: '/portals/owner/orders', label: 'Orders', Icon: IconBarCart },
  { to: '/portals/owner/inventory', label: 'Inventory', Icon: IconBox },
  // { to: '/portals/owner/reports', label: 'Reports', Icon: IconBarCart },
  { to: '/portals/owner/settings', label: 'Settings', Icon: IconSettings },
]

export default function PortalSidebar() {
  return (
    <aside className="portal-sidebar" aria-label="Sidebar navigation">
      <div className="portal-brand">
        <span className="portal-brandMark" aria-hidden="true" />
        <span className="portal-brandText">NIOM&CE</span>
      </div>

      <nav className="portal-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `portal-navLink ${isActive ? 'portal-navLinkActive' : ''}`.trim()
            }
          >
            <span className="portal-navIcon" aria-hidden="true">
              <item.Icon />
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
