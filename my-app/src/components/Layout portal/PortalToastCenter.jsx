import React from 'react'

function nextId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export default function PortalToastCenter() {
  const [toasts, setToasts] = React.useState([])

  React.useEffect(() => {
    function onToast(event) {
      const detail = event?.detail || {}
      const message = String(detail.message || '').trim()
      const type = String(detail.type || 'error').toLowerCase()
      if (!message) return

      const id = nextId()
      const timeoutMs = Number(detail.timeoutMs || 3500)

      setToasts((prev) => [...prev, { id, type, message }])

      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id))
      }, timeoutMs)

      return () => window.clearTimeout(timer)
    }

    window.addEventListener('portal:toast', onToast)
    return () => window.removeEventListener('portal:toast', onToast)
  }, [])

  function dismiss(id) {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }

  if (!toasts.length) return null

  return (
    <div className="portal-toastStack" role="region" aria-label="Portal notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`portal-toast portal-toast-${toast.type === 'success' ? 'success' : 'error'}`}
          role="status"
          aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
        >
          <span className="portal-toastIcon" aria-hidden="true">
            {toast.type === 'success' ? '✓' : '!'}
          </span>
          <div className="portal-toastBody">
            <span className="portal-toastTitle">{toast.type === 'success' ? 'Success' : 'Error'}</span>
            <span className="portal-toastMessage">{toast.message}</span>
          </div>
          <button type="button" className="portal-toastClose" onClick={() => dismiss(toast.id)} aria-label="Close notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
