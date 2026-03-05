import { CheckCircle, XCircle } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useI18n } from '../context/I18nContext.jsx'
import { useCart } from '../context/CartContext.jsx'
export function PaymentResultPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useI18n()

  const status = String(params.get('paymentStatus') || params.get('status') || '').toUpperCase() // canonical: SUCCESS / FAILED / PENDING
  const orderId = params.get('orderId') || ''
  const bookingId = params.get('bookingId') || ''
  const referenceId = orderId || bookingId
  const paymentCode = (params.get('paymentCode') || '').toUpperCase()
  const isSuccess = status === 'SUCCESS' || status === 'PAID'
  const isPending = status === 'PENDING'

  const banner = isSuccess
    ? { title: t('site.payment.title.success', 'Payment successful'), detail: t('site.payment.detail.success', 'We received your VNPAY payment. Your order is confirmed.'), color: '#16a34a' }
    : isPending
      ? { title: t('site.payment.title.pending', 'Payment processing'), detail: t('site.payment.detail.pending', 'The transaction is being verified. Please check your order status shortly.'), color: '#f59e0b' }
      : { title: t('site.payment.title.failed', 'Payment failed'), detail: t('site.payment.detail.failed', 'The transaction did not complete. Your order is still unpaid; you can retry from the cart.'), color: '#dc2626' }

  const codeMessage = (() => {
    switch (paymentCode) {
      case '00':
        return 'Thành công';
      case '11':
        return 'Thẻ bị hết hạn';
      case '04':
      case '79':
        return 'Thẻ bị khóa';
      case '05':
      case '09':
        return 'Thẻ chưa kích hoạt hoặc chưa đăng ký 3D Secure';
      case '51':
        return 'Thẻ không đủ số dư';
      case '24':
        return 'Hủy giao dịch';
      default:
        return paymentCode ? `Mã ngân hàng: ${paymentCode}` : ''
    }
  })()

  const toastText = useMemo(() => {
    if (isSuccess) return ''
    if (isPending) return t('site.payment.toast.pending', 'Payment is processing. Please check order status shortly.')
    if (codeMessage) return codeMessage
    return t('site.payment.toast.failed', 'Payment was not successful. Please try again.')
  }, [codeMessage, isPending, isSuccess])

  const cart = useCart()

  useEffect(() => {
    if (!status) return
    if (isSuccess) {
      // clear client cart immediately so UI reflects server-side deletion
      try { cart.clear() } catch {}
      return
    }

    const t = setTimeout(() => navigate('/cart'), 1800)
    return () => clearTimeout(t)
  }, [status, isSuccess, navigate, cart])

  return (
    <section className="section">
      <div className="container">
        {!isSuccess ? (
          <div
            style={{
              position: 'fixed',
              top: 16,
              right: 16,
              background: '#111827',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: 10,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              zIndex: 999,
              maxWidth: 320,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{t('site.payment.toastTitle', 'Payment failed')}</div>
            <div style={{ fontSize: 13, color: '#e5e7eb' }}>{toastText}</div>
            {referenceId ? (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Ref: {referenceId}</div>
            ) : null}
          </div>
        ) : null}

        <div className="card" style={{ padding: 18, maxWidth: 640, margin: '0 auto' }}>
          <div
            style={{
              background: `${banner.color}1a`,
              border: `1px solid ${banner.color}`,
              color: banner.color,
              padding: 12,
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 900 }}>{banner.title}</div>
            <div style={{ marginTop: 4 }}>{banner.detail}</div>
            {codeMessage ? <div style={{ marginTop: 6, fontWeight: 700 }}>{codeMessage}</div> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isSuccess ? (
              <span className="badge" style={{ background: '#16a34a', color: '#fff' }}>
                <CheckCircle size={18} />
              </span>
            ) : (
              <span className="badge" style={{ background: '#dc2626', color: '#fff' }}>
                <XCircle size={18} />
              </span>
            )}
            <div>
              <h3 style={{ margin: 0 }}>{isSuccess ? t('site.payment.title.success', 'Payment successful') : isPending ? t('site.payment.title.pending', 'Payment pending') : t('site.payment.title.failed', 'Payment failed')}</h3>
              <div className="muted" style={{ marginTop: 4 }}>
                {isSuccess
                  ? t('site.payment.body.success', 'Thank you. Your order was paid via VNPAY.')
                  : isPending
                    ? t('site.payment.body.pending', 'We are confirming the transaction. Please check your order status shortly.')
                    : t('site.payment.body.failed', 'The transaction was not completed. You can try again from the cart.')}
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <div className="muted">Reference</div>
            <div style={{ fontWeight: 900 }}>{referenceId || 'N/A'}</div>
          </div>

          {paymentCode ? (
            <div className="row" style={{ marginTop: 8 }}>
              <div className="muted">{t('site.payment.bankCode', 'Bank code')}</div>
              <div style={{ fontWeight: 900 }}>{paymentCode}</div>
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn" onClick={() => navigate('/cart')}>
              {t('site.payment.backCart', 'Back to cart')}
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={() => navigate('/orders')}>
              {t('site.payment.viewOrders', 'View orders')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
