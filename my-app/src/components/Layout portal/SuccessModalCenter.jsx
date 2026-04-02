import React from 'react'
import PortalModal from './PortalModal.jsx'

export default function SuccessModalCenter() {
  const [modal, setModal] = React.useState(null)

  React.useEffect(() => {
    function onSuccessModal(event) {
      const detail = event?.detail || {}
      const message = String(detail.message || '').trim()
      if (!message) return

      setModal({
        message,
        title: detail.title || 'Completed',
      })
    }

    window.addEventListener('portal:success-modal', onSuccessModal)
    return () => window.removeEventListener('portal:success-modal', onSuccessModal)
  }, [])

  function closeModal() {
    setModal(null)
  }

  if (!modal) return null

  return (
    <PortalModal
      open={true}
      title={modal.title}
      onClose={closeModal}
      variant="success"
      footer={
        <button
          type="button"
          className="portal-modalBtn portal-modalBtnPrimary"
          onClick={closeModal}
          style={{ minWidth: '80px' }}
        >
          OK
        </button>
      }
    >
      <p style={{ margin: 0, fontSize: '14px', color: '#374151' }}>{modal.message}</p>
    </PortalModal>
  )
}
