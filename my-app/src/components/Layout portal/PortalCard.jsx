import React from 'react'

export default function PortalCard({ title, right, children, className = '', style, ...rest }) {
  // If className contains 'portal-scheduleCard', add a dedicated class for cardInner
  const isSchedule = className.includes('portal-scheduleCard');
  return (
    <section className={`portal-card ${className}`.trim()} style={style} {...rest}>
      <div className={`portal-cardInner${isSchedule ? ' portal-cardInner--schedule' : ''}`}>
        {(title || right) && (
          <div className="portal-cardHeader">
            {title ? <h3 className="portal-cardTitle">{title}</h3> : <span />}
            {right ? <div>{right}</div> : null}
          </div>
        )}
        {children}
      </div>
    </section>
  )
}
