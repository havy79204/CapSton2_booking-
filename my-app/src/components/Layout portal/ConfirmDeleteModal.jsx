import React from 'react'
import PortalModal from './PortalModal.jsx'

export default function ConfirmDeleteModal({
  open,
  title = 'Confirm delete',
  message,
  detail,
  onClose,
  onConfirm,
  confirmText = 'Delete',
  confirming = false,
  disabled = false,
}) {
  return (
    <PortalModal
      open={open}
      title={title}
      variant="warning"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="portal-modalBtn" onClick={onClose} disabled={confirming}>
            Cancel
          </button>
          <button
            type="button"
            className="portal-modalBtn portal-modalBtnPrimary"
            onClick={onConfirm}
            disabled={disabled || confirming}
          >
            {confirming ? 'Deleting...' : confirmText}
          </button>
        </>
      }
    >
      <p style={{ fontSize: '15px', color: '#1f2937', marginBottom: detail ? '12px' : '0', lineHeight: '1.5', fontWeight: '500' }}>
        {message}
      </p>
      {detail ? <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{detail}</p> : null}
    </PortalModal>
  )
}
