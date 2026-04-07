import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoCheckmarkCircleOutline, IoReceiptOutline, IoTimeOutline } from 'react-icons/io5'
import { useCustomerOrders } from '../hooks/useCustomerCommerce'
import PortalModal from '../components/Layout portal/PortalModal.jsx'
import { api } from '../lib/api'
import { formatVnd } from '../lib/currency'
import '../styles/HistoryPage.css'

function statusClass(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'pending') return 'pending'
  if (value.includes('cancel') || value.includes('failed')) return 'cancelled'
  if (value.includes('paid') || value.includes('deliver') || value.includes('complete')) return 'success'
  return 'default'
}

function isPending(status) {
  return String(status || '').trim().toLowerCase() === 'pending'
}

function isCompleted(status) {
  const value = String(status || '').trim().toLowerCase()
  return value.includes('complete') || value.includes('deliver') || value === 'paid' || value === 'confirmed'
}

function fmtMoney(value) {
  return formatVnd(value || 0)
}

const OrderHistoryPage = () => {
  const navigate = useNavigate()
  const { orders, loading, error, cancelOrder, refresh } = useCustomerOrders(100)
  const [cancellingId, setCancellingId] = useState('')
  const [ratingModalOpen, setRatingModalOpen] = useState(false)
  const [orderToRate, setOrderToRate] = useState(null)
  const [rating, setRating] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingImageDataUrls, setRatingImageDataUrls] = useState([])
  const [ratingTarget, setRatingTarget] = useState('order')
  const [selectedOrderItemId, setSelectedOrderItemId] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [resultTitle, setResultTitle] = useState('')
  const [resultMessage, setResultMessage] = useState('')

  const handleCancel = async (order) => {
    const orderId = order?.OrderId
    if (!orderId) return
    if (!isPending(order.Status)) {
      alert('Only pending orders can be cancelled')
      return
    }
    if (!window.confirm('Cancel this pending order?')) return

    try {
      setCancellingId(orderId)
      await cancelOrder(orderId)
      alert('Order cancelled successfully')
    } catch (err) {
      alert(err?.message || 'Failed to cancel order')
    } finally {
      setCancellingId('')
    }
  }

  const openRatingModal = (order) => {
    const firstItemId = String(order?.Items?.[0]?.OrderItemId || '').trim()
    setOrderToRate(order)
    setRating(5)
    setRatingComment('')
    setRatingImageDataUrls([])
    setRatingTarget('order')
    setSelectedOrderItemId(firstItemId)
    setRatingModalOpen(true)
  }

  const closeRatingModal = () => {
    setRatingModalOpen(false)
    setOrderToRate(null)
    setRating(5)
    setRatingComment('')
    setRatingImageDataUrls([])
    setRatingTarget('order')
    setSelectedOrderItemId('')
  }

  const handleRatingImageChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const toDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

    try {
      const dataUrls = await Promise.all(files.map((file) => toDataUrl(file)))
      setRatingImageDataUrls((prev) => {
        const merged = [...prev, ...dataUrls.filter(Boolean)]
        const unique = Array.from(new Set(merged))
        return unique.slice(0, 3)
      })
    } catch {
      alert('Failed to read selected image files')
    } finally {
      event.target.value = ''
    }
  }

  const submitRating = async () => {
    if (!orderToRate?.OrderId) return
    try {
      setSubmittingRating(true)
      if (ratingTarget === 'item') {
        const itemId = String(selectedOrderItemId || '').trim()
        if (!itemId) {
          setResultTitle('Error')
          setResultMessage('Please choose a product to review')
          setResultModalOpen(true)
          return
        }

        await api.post(
          `/api/customer/orders/${encodeURIComponent(orderToRate.OrderId)}/items/${encodeURIComponent(itemId)}/rating`,
          {
            rating: Number(rating),
            comment: ratingComment.trim(),
            images: ratingImageDataUrls,
          },
        )
      } else {
        await api.post('/api/customer/orders/rating', {
          orderId: orderToRate.OrderId,
          rating: Number(rating),
          comment: ratingComment.trim(),
          images: ratingImageDataUrls,
        })
      }

      await refresh().catch(() => {})
      closeRatingModal()
      setResultTitle('Successfully!')
      setResultMessage(
        ratingTarget === 'item'
          ? 'Product review submitted. This will override order review for that product.'
          : 'Order review submitted successfully.',
      )
      setResultModalOpen(true)
    } catch (err) {
      setResultTitle('Error')
      setResultMessage(err?.message || 'Failed to submit rating')
      setResultModalOpen(true)
    } finally {
      setSubmittingRating(false)
    }
  }

  if (loading) return <div className="loading">Loading orders...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <section className="history-page">
      <div className="history-container">
        <div className="history-head">
          <div>
            <h2 className="history-title"><IoReceiptOutline /> Order History</h2>
            <p className="history-subtitle">Compact view of all orders with quick actions.</p>
          </div>
          <button className="history-link-btn" onClick={() => navigate('/profile')}>Back To Profile</button>
        </div>

        {orders.length === 0 ? (
          <div className="history-empty">No orders found.</div>
        ) : (
          <div className="history-list">
            {orders.map((order) => (
              <article key={order.OrderId} className="history-card">
                <header className="history-card-head">
                  <div>
                    <h3 className="history-card-id">{order.OrderId}</h3>
                    <p className="history-card-time"><IoTimeOutline /> {new Date(order.CreatedAt).toLocaleString()}</p>
                  </div>
                  <div className="history-badges">
                    <span className={`history-badge ${statusClass(order.Status)}`}><IoCheckmarkCircleOutline /> {order.Status}</span>
                    <span className={`history-badge ${statusClass(order.PaymentStatus)}`}>{order.PaymentStatus}</span>
                  </div>
                </header>

                <div className="history-grid">
                  <div className="history-kv">
                    <p className="history-kv-label">Payment Method</p>
                    <p className="history-kv-value">{order.PaymentMethod}</p>
                  </div>
                  <div className="history-kv">
                    <p className="history-kv-label">Items</p>
                    <p className="history-kv-value">{Array.isArray(order.Items) ? order.Items.length : 0}</p>
                  </div>
                  <div className="history-kv">
                    <p className="history-kv-label">Discount</p>
                    <p className="history-kv-value">- {fmtMoney(order.DiscountAmount || 0)}</p>
                  </div>
                  <div className="history-kv">
                    <p className="history-kv-label">Total</p>
                    <p className="history-kv-value">{fmtMoney(order.Total || 0)}</p>
                  </div>
                </div>

                <div className="history-items">
                  <table className="history-items-table order-items-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Discount</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(order.Items) ? order.Items : []).length === 0 ? (
                        <tr>
                          <td colSpan={5}>No product details found for this order.</td>
                        </tr>
                      ) : (
                        (Array.isArray(order.Items) ? order.Items : []).map((item) => (
                          <tr key={item.OrderItemId}>
                            <td>{item.ProductName}</td>
                            <td>{Number(item.Quantity || 0)}</td>
                            <td>{fmtMoney(item.Price || 0)}</td>
                            <td>{formatVnd(0)}</td>
                            <td>{fmtMoney(item.LineTotal || 0)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}><strong>Subtotal</strong></td>
                        <td><strong>- {fmtMoney(order.DiscountAmount || 0)}</strong></td>
                        <td><strong>{fmtMoney(order.Subtotal || 0)}</strong></td>
                      </tr>
                      <tr>
                        <td colSpan={4}><strong>Total</strong></td>
                        <td><strong>{fmtMoney(order.Total || 0)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {isPending(order.Status) ? (
                  <div className="history-actions">
                    <button
                      className="history-cancel-btn"
                      disabled={cancellingId === order.OrderId}
                      onClick={() => handleCancel(order)}
                    >
                      {cancellingId === order.OrderId ? 'Cancelling...' : 'Cancel Order'}
                    </button>
                  </div>
                ) : isCompleted(order.Status) ? (
                  <div className="history-actions">
                    <button
                      className="history-rate-btn"
                      onClick={() => openRatingModal(order)}
                    >
                      {order.IsRated ? 'Review / Override Product' : 'Rate Order'}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <PortalModal
        open={ratingModalOpen}
        title="Rate Order"
        onClose={closeRatingModal}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeRatingModal}>
              Cancel
            </button>
            <button
              type="button"
              className="portal-modalBtn portal-modalBtnPrimary"
              onClick={submitRating}
              disabled={submittingRating}
            >
              {submittingRating ? 'Submitting...' : 'Submit Review'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Review Type
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                className="portal-modalBtn"
                onClick={() => setRatingTarget('order')}
                style={{
                  borderColor: ratingTarget === 'order' ? '#f59e0b' : '#e5e7eb',
                  color: ratingTarget === 'order' ? '#b45309' : '#6b7280',
                  background: ratingTarget === 'order' ? '#fff7ed' : '#ffffff',
                }}
              >
                Whole Order
              </button>
              <button
                type="button"
                className="portal-modalBtn"
                onClick={() => setRatingTarget('item')}
                disabled={!Array.isArray(orderToRate?.Items) || orderToRate.Items.length === 0}
                style={{
                  borderColor: ratingTarget === 'item' ? '#f59e0b' : '#e5e7eb',
                  color: ratingTarget === 'item' ? '#b45309' : '#6b7280',
                  background: ratingTarget === 'item' ? '#fff7ed' : '#ffffff',
                }}
              >
                Specific Product
              </button>
            </div>

            {ratingTarget === 'item' ? (
              <select
                value={selectedOrderItemId}
                onChange={(e) => setSelectedOrderItemId(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '0 10px',
                  fontSize: '14px',
                  color: '#111827',
                }}
              >
                {(Array.isArray(orderToRate?.Items) ? orderToRate.Items : []).map((item) => (
                  <option key={item.OrderItemId} value={item.OrderItemId}>
                    {item.ProductName || item.ProductId || item.OrderItemId}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Your Rating
            </label>
            <div style={{ display: 'flex', gap: '8px', fontSize: '28px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setRating(star)}
                  style={{
                    cursor: 'pointer',
                    color: star <= rating ? '#fbbf24' : '#d1d5db',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Your Comment (Optional)
            </label>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder={ratingTarget === 'item'
                ? 'Share your experience with this product...'
                : 'Share your experience with this order...'}
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Images (Optional, up to 3)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              multiple
              onChange={handleRatingImageChange}
              style={{
                width: '100%',
                padding: '8px 0',
                fontSize: '14px',
              }}
            />
            {ratingImageDataUrls.length > 0 ? (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {ratingImageDataUrls.map((img, index) => (
                  <img
                    key={`${img.slice(0, 30)}-${index}`}
                    src={img}
                    alt={`Selected rating ${index + 1}`}
                    style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </PortalModal>

      <PortalModal
        open={resultModalOpen}
        title={resultTitle}
        onClose={() => setResultModalOpen(false)}
      >
        <p style={{
          fontSize: '15px',
          color: '#1f2937',
          marginBottom: '12px',
          lineHeight: '1.6',
          fontWeight: '500',
        }}>
          {resultMessage}
        </p>
      </PortalModal>
    </section>
  )
}

export default OrderHistoryPage
