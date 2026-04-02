import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  IconBarCart,
  IconBox,
  IconCalendar,
  IconClock,
  IconScissors,
  IconUsers,
} from './PortalIcons.jsx'

const staffNavItems = [
  { to: '/portals/staff/schedule', label: 'Schedule', Icon: IconClock },
  { to: '/portals/staff/appointments', label: 'Appointments', Icon: IconCalendar },
  { to: '/portals/staff/services', label: 'Services', Icon: IconScissors },
  { to: '/portals/staff/products', label: 'Products', Icon: IconBox },
  { to: '/portals/staff/orders', label: 'Orders', Icon: IconBarCart },
  { to: '/portals/staff/inventory', label: 'Inventory', Icon: IconBox },
  { to: '/portals/staff/staff', label: 'Staff', Icon: IconUsers },
]

export default function StaffPortalSidebar() {
  return (
    <aside className="portal-sidebar" aria-label="Staff sidebar navigation">
      <div className="portal-brand">
        <span className="portal-brandMark" aria-hidden="true" />
        <span className="portal-brandText">NIOM&CE Staff</span>
      </div>

      <nav className="portal-nav">
        {staffNavItems.map((item) => (
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
