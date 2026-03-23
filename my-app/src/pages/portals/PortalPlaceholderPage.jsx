import React from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'

export default function PortalPlaceholderPage({ title }) {
  return (
    <div>
      <PortalCard title={title}>
        <p className="portal-pageSubtitle">This page will be implemented next.</p>
      </PortalCard>
    </div>
  )
}
