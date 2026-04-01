import { Link, useLocation } from 'react-router-dom'

function PaymentVnpayReturnPage() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)

  const status = (params.get('status') || '').toLowerCase()
  const code = params.get('code') || ''
  const transactionId = params.get('transactionId') || ''
  const orderId = params.get('orderId') || ''
  const amountRaw = params.get('amount') || ''

  const isSuccess = status === 'success'
  const title = isSuccess ? 'Thanh toan thanh cong' : 'Thanh toan that bai'
  const message = isSuccess
    ? 'Giao dich da duoc xac nhan boi VNPAY.'
    : 'Khong the xac nhan thanh toan. Vui long thu lai hoac lien he ho tro.'

  const amount = Number(amountRaw)
  const normalizedAmount = Number.isFinite(amount) && amount > 0
    ? (amount / 100).toLocaleString('vi-VN')
    : ''

  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: 16 }}>
      <h1>{title}</h1>
      <p>{message}</p>
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16 }}>
        <p><strong>Trang thai:</strong> {status || 'unknown'}</p>
        <p><strong>Ma:</strong> {code || 'N/A'}</p>
        <p><strong>Ma giao dich:</strong> {transactionId || 'N/A'}</p>
        <p><strong>Thong tin don:</strong> {orderId || 'N/A'}</p>
        <p><strong>So tien:</strong> {normalizedAmount ? `${normalizedAmount} VND` : 'N/A'}</p>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <Link to="/orders">Xem don hang</Link>
        <Link to="/">Ve trang chu</Link>
      </div>
    </div>
  )
}

export default PaymentVnpayReturnPage
