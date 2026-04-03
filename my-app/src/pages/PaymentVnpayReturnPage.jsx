import { Link, useLocation } from 'react-router-dom'
import { IoCheckmarkCircle, IoCloseCircle } from 'react-icons/io5'
import '../styles/PaymentVnpayReturnPage.css'

function PaymentVnpayReturnPage() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)

  const explicitStatus = (params.get('status') || '').toLowerCase()
  const vnpResponseCode = String(params.get('vnp_ResponseCode') || '').trim()
  const status = explicitStatus || (vnpResponseCode === '00' ? 'success' : (vnpResponseCode ? 'failed' : ''))

  const code = params.get('code') || vnpResponseCode || ''
  const transactionId = params.get('transactionId') || params.get('vnp_TransactionNo') || params.get('vnp_TxnRef') || ''
  const orderId = params.get('orderId') || params.get('vnp_OrderInfo') || ''
  const amountRaw = params.get('amount') || ''
  const vnpAmountRaw = params.get('vnp_Amount') || ''

  const isSuccess = status === 'success'
  const title = isSuccess ? 'Thanh toan thanh cong' : 'Thanh toan that bai'
  const message = isSuccess
    ? 'Giao dich da duoc xac nhan boi VNPAY.'
    : 'Khong the xac nhan thanh toan. Vui long thu lai hoac lien he ho tro.'
  const isBooking = /^BKG-/i.test(orderId)

  const amount = vnpAmountRaw
    ? Number(vnpAmountRaw) / 100
    : Number(amountRaw)
  const normalizedAmount = Number.isFinite(amount) && amount > 0 ? amount.toLocaleString('vi-VN') : ''

  return (
    <section className="payment-return-page">
      <div className="payment-return-background" />
      <div className="payment-return-card">
        <div className={`payment-return-icon ${isSuccess ? 'success' : 'failed'}`}>
          {isSuccess ? <IoCheckmarkCircle /> : <IoCloseCircle />}
        </div>

        <h1>{title}</h1>
        <p className="payment-return-message">{message}</p>

        <div className="payment-return-meta">
          <div className="payment-return-row"><span>Trang thai</span><strong>{status || 'unknown'}</strong></div>
          <div className="payment-return-row"><span>Ma</span><strong>{code || 'N/A'}</strong></div>
          <div className="payment-return-row"><span>Ma giao dich</span><strong>{transactionId || 'N/A'}</strong></div>
          <div className="payment-return-row"><span>Thong tin don</span><strong>{orderId || 'N/A'}</strong></div>
          <div className="payment-return-row"><span>So tien</span><strong>{normalizedAmount ? `${normalizedAmount} VND` : 'N/A'}</strong></div>
        </div>

        <div className="payment-return-actions">
          {isBooking ? <Link to="/booking">Xem lich hen</Link> : <Link to="/orders">Xem don hang</Link>}
          {!isSuccess && isBooking ? <Link to="/booking">Thu lai thanh toan</Link> : null}
          {!isSuccess && !isBooking ? <Link to="/cart">Thu lai thanh toan</Link> : null}
          <Link to="/">Ve trang chu</Link>
        </div>
      </div>
    </section>
  )
}

export default PaymentVnpayReturnPage
