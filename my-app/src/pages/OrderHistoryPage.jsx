import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoCheckmarkCircleOutline, IoReceiptOutline, IoTimeOutline } from 'react-icons/io5'
import { useCustomerOrders } from '../hooks/useCustomerCommerce'
import PortalModal from '../components/Layout portal/PortalModal.jsx'
import { api } from '../lib/api'
import '../styles/HistoryPage.css'

function normalizeOrderStatus(status) {
  const value = String(status || '').toLowerCase()
  if (value.includes('cancel')) return 'CANCELLED'
  if (value === 'delivered') return 'CONFIRMED'
  if (value === 'confirmed' || value === 'customer confirmed') return 'CONFIRMED'
  if (value.includes('complete')) return 'COMPLETED'
  if (value.includes('deliver')) return 'CONFIRMED'
  if (value.includes('ship')) return 'SHIPPING'
  if (value.includes('process')) return 'PROCESSING'
  if (value.includes('pending') || value.includes('await')) return 'PENDING'
  return String(status || 'PENDING').trim().toUpperCase()
}

function normalizePaymentStatus(status) {
  const value = String(status || '').toLowerCase()
  if (value.includes('paid') || value.includes('success')) return 'PAID'
  if (value.includes('fail') || value.includes('cancel') || value.includes('refund')) return 'FAILED'
  if (value.includes('pending') || value.includes('await')) return 'PENDING'
  return String(status || 'PENDING').trim().toUpperCase()
}

function normalizePaymentMethod(method) {
  const value = String(method || '').trim().toLowerCase()
  if (!value) return 'COD'
  if (value === 'cod' || value === 'cash') return 'COD'
  if (value === 'online' || value === 'vnpay') return 'ONLINE'
  return value.toUpperCase()
}

function statusClass(status, kind = 'order') {
  if (kind === 'paymentMethod') return 'confirmed'

  if (kind === 'paymentStatus') {
    if (status === 'PAID') return 'completed'
    if (status === 'FAILED') return 'cancelled'
    if (status === 'PENDING') return 'pending'
    return 'default'
  }

  if (status === 'PENDING') return 'pending'
  if (status === 'PROCESSING') return 'processing'
  if (status === 'SHIPPING') return 'shipping'
  if (status === 'CONFIRMED') return 'confirmed'
  if (status === 'COMPLETED') return 'completed'
  if (status === 'CANCELLED') return 'cancelled'
  return 'default'
}

function paymentMethodClass(method) {
  const normalized = normalizePaymentMethod(method)
  if (normalized === 'COD') return 'payment-method-cod'
  if (normalized === 'ONLINE') return 'payment-method-online'
  return 'payment-method-default'
}

function isPending(status) {
  return normalizeOrderStatus(status) === 'PENDING'
}
function isProcessing(status) {
  return normalizeOrderStatus(status) === 'PROCESSING'
}
function isShipping(status) {
  return normalizeOrderStatus(status) === 'SHIPPING'
}
function isConfirmed(status) {
  return normalizeOrderStatus(status) === 'CONFIRMED'
}
function isCompleted(status) {
  return normalizeOrderStatus(status) === 'COMPLETED'
}

function fmtMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function cleanProductName(item) {
  const name = String(item?.ProductName || '').trim()
  const variantName = String(item?.VariantName || '').trim()
  const baseName = name || String(item?.ProductId || 'Product')
  const invalidNames = ['null', 'undefined', 'nan', 'n/a', '-']
  const normalizedBase = String(baseName || '').trim()
  const safeBase = invalidNames.includes(normalizedBase.toLowerCase())
    ? String(item?.ProductId || 'Product')
    : normalizedBase

  if (!variantName) return safeBase
  if (safeBase.toLowerCase().includes(variantName.toLowerCase())) {
    return safeBase
  }
  return `${safeBase} - ${variantName}`
}

const OrderHistoryPage = () => {
  const navigate = useNavigate()
  const { orders, loading, error, cancelOrder, confirmReceivedOrder, reorderOrder, refresh } = useCustomerOrders(100)
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [cancellingId, setCancellingId] = useState('')
  const [completingId, setCompletingId] = useState('')
  const [reorderingId, setReorderingId] = useState('')
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState(null)
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
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false)
  const [orderToComplete, setOrderToComplete] = useState(null)

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

  const handleConfirmReceived = async (order) => {
    const orderId = order?.OrderId
    if (!orderId) return
    if (!isConfirmed(order.Status)) {
      setResultTitle('Notice')
      setResultMessage('Only confirmed orders can be completed by customer')
      setResultModalOpen(true)
      return
    }

    setOrderToComplete(order)
    setConfirmCompleteOpen(true)
  }

  const confirmCompleteOrder = async () => {
    const orderId = String(orderToComplete?.OrderId || '').trim()
    if (!orderId) {
      setConfirmCompleteOpen(false)
      return
    }

    try {
      setConfirmCompleteOpen(false)
      setCompletingId(orderId)
      await confirmReceivedOrder(orderId)
      setResultTitle('Successfully!')
      setResultMessage('Order has been completed successfully.')
      setResultModalOpen(true)
    } catch (err) {
      setResultTitle('Error')
      setResultMessage(err?.message || 'Failed to confirm receipt')
      setResultModalOpen(true)
    } finally {
      setCompletingId('')
      setOrderToComplete(null)
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

  const openDetailModal = (order) => {
    setDetailOrder(order)
    setDetailModalOpen(true)
  }

  const closeDetailModal = () => {
    setDetailModalOpen(false)
    setDetailOrder(null)
  }

  const handleReorder = async (order) => {
    const orderId = String(order?.OrderId || '').trim()
    if (!orderId) return

    try {
      setReorderingId(orderId)
      const result = await reorderOrder(orderId)
      const added = Number(result?.AddedItemCount || 0)
      const failed = Number(result?.FailedItemCount || 0)
      setResultTitle('Successfully!')
      if (failed > 0) {
        setResultMessage(`Added ${added} item(s) to cart, ${failed} item(s) failed. Please review your cart.`)
      } else {
        setResultMessage(`Added ${added} item(s) to cart. You can review and checkout now.`)
      }
      setResultModalOpen(true)
    } catch (err) {
      setResultTitle('Error')
      setResultMessage(err?.message || 'Failed to reorder items')
      setResultModalOpen(true)
    } finally {
      setReorderingId('')
    }
  }

  const visibleOrders = useMemo(() => {
    const filtered = (Array.isArray(orders) ? orders : []).filter((order) => {
      const normalized = normalizeOrderStatus(order?.Status)
      if (activeFilter === 'pending') return normalized === 'PENDING' || normalized === 'PROCESSING'
      if (activeFilter === 'shipping') return normalized === 'SHIPPING' || normalized === 'CONFIRMED'
      if (activeFilter === 'completed') return normalized === 'COMPLETED'
      if (activeFilter === 'cancelled') return normalized === 'CANCELLED'
      return true
    })

    const sorted = [...filtered]
    if (sortBy === 'oldest') {
      sorted.sort((a, b) => new Date(a?.CreatedAt || 0).getTime() - new Date(b?.CreatedAt || 0).getTime())
    } else if (sortBy === 'totalHigh') {
      sorted.sort((a, b) => Number(b?.Total || 0) - Number(a?.Total || 0))
    } else if (sortBy === 'totalLow') {
      sorted.sort((a, b) => Number(a?.Total || 0) - Number(b?.Total || 0))
    } else {
      sorted.sort((a, b) => new Date(b?.CreatedAt || 0).getTime() - new Date(a?.CreatedAt || 0).getTime())
    }

    return sorted
  }, [orders, activeFilter, sortBy])

  if (loading) return <div className="loading">Loading orders...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <section className="history-page order-history-page">
      <div className="history-container">
        <div className="history-head">
          <div>
            <h2 className="history-title"><IoReceiptOutline /> Order History</h2>
            <p className="history-subtitle">Track all retail orders with clear status and quick actions.</p>
          </div>
          <button className="history-link-btn history-link-btn-primary" onClick={() => navigate('/cart')}>Go To Cart</button>
        </div>

        <div className="history-controls">
          <div className="history-filter-tabs" role="tablist" aria-label="Order filter">
            <button
              type="button"
              className={`history-filter-tab ${activeFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`history-filter-tab ${activeFilter === 'pending' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('pending')}
            >
              Pending
            </button>
            <button
              type="button"
              className={`history-filter-tab ${activeFilter === 'shipping' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('shipping')}
            >
              Shipping
            </button>
            <button
              type="button"
              className={`history-filter-tab ${activeFilter === 'completed' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('completed')}
            >
              Completed
            </button>
            <button
              type="button"
              className={`history-filter-tab ${activeFilter === 'cancelled' ? 'is-active' : ''}`}
              onClick={() => setActiveFilter('cancelled')}
            >
              Cancelled
            </button>
          </div>

          <label className="history-sort-box">
            Sort
            <select className="history-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="totalHigh">Total: High to Low</option>
              <option value="totalLow">Total: Low to High</option>
            </select>
          </label>
        </div>

        {visibleOrders.length === 0 ? (
          <div className="history-empty">No orders found.</div>
        ) : (
          <div className="history-list">
            {visibleOrders.map((order) => {
              const items = Array.isArray(order.Items) ? order.Items : []
              const orderStatus = normalizeOrderStatus(order.Status)
              const paymentMethod = normalizePaymentMethod(order.PaymentMethod)

              return (
                <article key={order.OrderId} className="history-card">
                  <header className="history-card-head">
                    <div>
                      <h3 className="history-card-id">{order.OrderId}</h3>
                      <p className="history-card-time"><IoTimeOutline /> {new Date(order.CreatedAt).toLocaleString('vi-VN')}</p>
                    </div>
                    <div className="history-badges">
                      <span className={`history-badge ${statusClass(orderStatus)}`}>
                        <IoCheckmarkCircleOutline /> Order: {orderStatus}
                      </span>
                      <span className={`history-badge ${statusClass(paymentMethod, 'paymentMethod')} ${paymentMethodClass(paymentMethod)}`}>
                        Method: {paymentMethod}
                      </span>
                    </div>
                  </header>

                  <div className="history-summary-row">
                    <span>{items.length} items</span>
                    <span>Subtotal: {fmtMoney(order.Subtotal || 0)}</span>
                    <span>Discount: - {fmtMoney(order.DiscountAmount || 0)}</span>
                    <strong>Total: {fmtMoney(order.Total || 0)}</strong>
                  </div>

                  <div className="history-items">
                    <table className="history-items-table order-items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={4}>No product details found for this order.</td>
                          </tr>
                        ) : (
                          items.map((item) => (
                            <tr key={item.OrderItemId}>
                              <td>{cleanProductName(item)}</td>
                              <td>{Number(item.Quantity || 0)}</td>
                              <td>{fmtMoney(item.Price || 0)}</td>
                              <td>{fmtMoney(item.LineTotal || 0)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="history-actions history-actions-wrap">
                    <button
                      className="history-link-btn history-action-secondary"
                      onClick={() => openDetailModal(order)}
                    >
                      View Detail
                    </button>
                    {isCompleted(order.Status) ? (
                      <button
                        className="history-link-btn history-action-secondary"
                        onClick={() => handleReorder(order)}
                        disabled={reorderingId === order.OrderId || items.length === 0}
                      >
                        {reorderingId === order.OrderId ? 'Reordering...' : 'Reorder'}
                      </button>
                    ) : null}

                    {isPending(order.Status) ? (
                      <button
                        className="history-cancel-btn"
                        disabled={cancellingId === order.OrderId}
                        onClick={() => handleCancel(order)}
                      >
                        {cancellingId === order.OrderId ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    ) : null}

                    {isProcessing(order.Status) ? (
                      <button
                        className="history-link-btn history-action-secondary"
                        type="button"
                        disabled
                      >
                        Waiting
                      </button>
                    ) : null}

                    {isConfirmed(order.Status) ? (
                      <button
                        className="history-link-btn history-link-btn-primary"
                        onClick={() => handleConfirmReceived(order)}
                        disabled={completingId === order.OrderId}
                      >
                        {completingId === order.OrderId ? 'Verifying...' : 'I have received the goods'}
                      </button>
                    ) : null}

                    {isCompleted(order.Status) ? (
                      <button
                        className="history-rate-btn"
                        onClick={() => openRatingModal(order)}
                      >
                        {order.IsRated ? 'Review / Override Product' : 'Rate Order'}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <PortalModal
        open={detailModalOpen}
        title="Order Detail"
        onClose={closeDetailModal}
      >
        {detailOrder ? (
          <div className="order-detail-modal">
            <div className="order-detail-meta">
              <p><strong>Order ID:</strong> {detailOrder.OrderId}</p>
              <p><strong>Created:</strong> {new Date(detailOrder.CreatedAt).toLocaleString('vi-VN')}</p>
              <p><strong>Payment Status:</strong> {normalizePaymentStatus(detailOrder.PaymentStatus)}</p>
            </div>

            <div className="order-detail-statusRow">
              <span className={`history-badge ${statusClass(normalizeOrderStatus(detailOrder.Status))}`}>
                Order: {normalizeOrderStatus(detailOrder.Status)}
              </span>
              <span className={`history-badge ${statusClass(normalizePaymentMethod(detailOrder.PaymentMethod), 'paymentMethod')} ${paymentMethodClass(detailOrder.PaymentMethod)}`}>
                Method: {normalizePaymentMethod(detailOrder.PaymentMethod)}
              </span>
            </div>

            <div className="order-detail-items">
              {(Array.isArray(detailOrder.Items) ? detailOrder.Items : []).map((item) => (
                <div key={item.OrderItemId} className="order-detail-itemRow">
                  <div className="order-detail-itemInfo">
                    <p className="order-detail-itemName">{cleanProductName(item)}</p>
                    <p className="order-detail-itemQty">Qty: {Number(item.Quantity || 0)}</p>
                  </div>
                  <p className="order-detail-itemPrice">{fmtMoney(item.LineTotal || 0)}</p>
                </div>
              ))}
            </div>

            <div className="order-detail-totalRow">
              <span>Total</span>
              <strong>{fmtMoney(detailOrder.Total || 0)}</strong>
            </div>
          </div>
        ) : null}
      </PortalModal>

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
                className={`portal-modalBtn history-reviewTypeBtn ${ratingTarget === 'order' ? 'is-active' : ''}`}
                onClick={() => setRatingTarget('order')}
              >
                Whole Order
              </button>
              <button
                type="button"
                className={`portal-modalBtn history-reviewTypeBtn ${ratingTarget === 'item' ? 'is-active' : ''}`}
                onClick={() => setRatingTarget('item')}
                disabled={!Array.isArray(orderToRate?.Items) || orderToRate.Items.length === 0}
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
                    {cleanProductName(item)}
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

      <PortalModal
        open={confirmCompleteOpen}
        title="Confirm Received"
        onClose={() => {
          if (completingId) return
          setConfirmCompleteOpen(false)
          setOrderToComplete(null)
        }}
        footer={
          <>
            <button
              type="button"
              className="portal-modalBtn"
              onClick={() => {
                setConfirmCompleteOpen(false)
                setOrderToComplete(null)
              }}
              disabled={Boolean(completingId)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="portal-modalBtn portal-modalBtnPrimary"
              onClick={confirmCompleteOrder}
              disabled={Boolean(completingId)}
            >
              {completingId ? 'Confirming...' : 'Yes, I received it'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '15px', color: '#1f2937', lineHeight: '1.6', fontWeight: '500' }}>
          Confirm you have received this order?
        </p>
      </PortalModal>
    </section>
  )
}

export default OrderHistoryPage
