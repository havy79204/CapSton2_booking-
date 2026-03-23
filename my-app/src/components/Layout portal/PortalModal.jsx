import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function PortalModal({
  open,
  title,
  onClose,
  children,
  footer,
  modalClassName = '',
  bodyClassName = '',
  footerClassName = '',
}) {
  useEffect(() => {
    if (!open) return

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="portal-modalOverlay" role="presentation" onMouseDown={onClose}>
      <div
        className={`portal-modal ${modalClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="portal-modalHeader">
          <div className="portal-modalTitle">{title}</div>
          <button type="button" className="portal-modalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={`portal-modalBody ${bodyClassName}`.trim()}>{children}</div>

        {footer ? <div className={`portal-modalFooter ${footerClassName}`.trim()}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
