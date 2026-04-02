import React from 'react'
import { Outlet } from 'react-router-dom'
import StaffPortalHeader from './StaffPortalHeader.jsx'
import StaffPortalSidebar from './StaffPortalSidebar.jsx'
import PortalToastCenter from './PortalToastCenter.jsx'
import SuccessModalCenter from './SuccessModalCenter.jsx'

export default function StaffPortalLayout() {
  return (
    <div className="portal">
      <div className="portal-layout">
        <StaffPortalSidebar />

        <div className="portal-main">
          <StaffPortalHeader />
          <PortalToastCenter />
          <SuccessModalCenter />
          <main className="portal-content">
            <div className="portal-contentInner">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
