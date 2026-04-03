import React from 'react'
import { Outlet } from 'react-router-dom'
import PortalHeader from './PortalHeader.jsx'
import PortalSidebar from './PortalSidebar.jsx'
import PortalToastCenter from './PortalToastCenter.jsx'
import SuccessModalCenter from './SuccessModalCenter.jsx'

export default function OwnerPortalLayout() {
  return (
    <div className="portal">
      <div className="portal-layout">
        <PortalSidebar />

        <div className="portal-main">
          <PortalHeader />
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
