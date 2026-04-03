import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoCheckmarkCircleOutline, IoReceiptOutline, IoTimeOutline } from 'react-icons/io5'
import { useCustomerOrders } from '../hooks/useCustomerCommerce'
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

function fmtMoney(value) {
  return Number(value || 0).toFixed(2)
}

const OrderHistoryPage = () => {
  const navigate = useNavigate()
  const { orders, loading, error, cancelOrder } = useCustomerOrders(100)
  const [cancellingId, setCancellingId] = useState('')

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
                    <p className="history-kv-value">-${fmtMoney(order.DiscountAmount || 0)}</p>
                  </div>
                  <div className="history-kv">
                    <p className="history-kv-label">Total</p>
                    <p className="history-kv-value">${fmtMoney(order.Total || 0)}</p>
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
                            <td>${fmtMoney(item.Price || 0)}</td>
                            <td>$0.00</td>
                            <td>${fmtMoney(item.LineTotal || 0)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}><strong>Subtotal</strong></td>
                        <td><strong>-${fmtMoney(order.DiscountAmount || 0)}</strong></td>
                        <td><strong>${fmtMoney(order.Subtotal || 0)}</strong></td>
                      </tr>
                      <tr>
                        <td colSpan={4}><strong>Total</strong></td>
                        <td><strong>${fmtMoney(order.Total || 0)}</strong></td>
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
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default OrderHistoryPage
