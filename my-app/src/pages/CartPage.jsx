import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IoCartOutline,
  IoCardOutline,
  IoPricetagOutline,
  IoTrashOutline,
  IoWalletOutline,
} from 'react-icons/io5'
import { useCustomerCart } from '../hooks/useCustomerCommerce'
import '../styles/CartPage.css'

const CartPage = () => {
  const navigate = useNavigate()
  const {
    cart,
    loading,
    error,
    busy,
    updateItem,
    removeItem,
    clearItems,
    checkout,
  } = useCustomerCart()

  const [giftCode, setGiftCode] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [selectedMap, setSelectedMap] = useState({})
  const [orderSuccess, setOrderSuccess] = useState(null)

  const cartItems = useMemo(() => (Array.isArray(cart?.Items) ? cart.Items : []), [cart])
  const defaultAddress = cart?.DefaultAddress || null
  const customer = cart?.Customer || null

  const selectedItems = useMemo(() => {
    if (cartItems.length === 0) return []
    const hasExplicit = Object.keys(selectedMap).length > 0
    return cartItems.filter((item) => (hasExplicit ? Boolean(selectedMap[item.CartItemId]) : true))
  }, [cartItems, selectedMap])

  const selectedCount = selectedItems.length
  const allSelected = cartItems.length > 0 && selectedCount === cartItems.length

  const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.Price || 0) * Number(item.Quantity || 0), 0)
  const discount = subtotal >= 30 ? 5 : 0
  const tax = (subtotal - discount) * 0.1
  const shipping = selectedCount > 0 ? 3 : 0
  const total = subtotal - discount + tax + shipping

  const toggleAll = () => {
    if (allSelected) {
      setSelectedMap({})
      return
    }

    const next = {}
    for (const item of cartItems) {
      next[item.CartItemId] = true
    }
    setSelectedMap(next)
  }

  const toggleItem = (itemId) => {
    setSelectedMap((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  const changeQuantity = async (item, change) => {
    const nextQuantity = Number(item.Quantity || 0) + change
    if (nextQuantity < 1) return

    try {
      await updateItem(item.CartItemId, { quantity: nextQuantity })
    } catch (err) {
      alert(err?.message || 'Failed to update quantity')
    }
  }

  const handleRemoveItem = async (item) => {
    try {
      await removeItem(item.CartItemId)
      setSelectedMap((prev) => {
        const next = { ...prev }
        delete next[item.CartItemId]
        return next
      })
    } catch (err) {
      alert(err?.message || 'Failed to remove item')
    }
  }

  const handleClearCart = async () => {
    try {
      await clearItems()
      setSelectedMap({})
    } catch (err) {
      alert(err?.message || 'Failed to clear cart')
    }
  }

  const handleBuyNow = async () => {
    if (selectedCount === 0) {
      alert('Please select at least one product.')
      return
    }

    try {
      const result = await checkout({
        itemIds: selectedItems.map((item) => item.CartItemId),
        paymentMethod,
        giftCode,
      })

      setOrderSuccess(result?.OrderId || '')
      setSelectedMap({})
    } catch (err) {
      alert(err?.message || 'Checkout failed')
    }
  }

  if (loading) {
    return <div className="loading">Loading cart...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  if (orderSuccess) {
    return (
      <section className="cart-page">
        <div className="cart-container">
          <div className="order-success-card">
            <div className="success-icon">
              <IoCartOutline />
            </div>
            <h2>Order #{orderSuccess} created successfully!</h2>
            <p>Thank you for your purchase. Your order has been placed.</p>
            <div className="success-buttons">
              <button className="home-btn" onClick={() => navigate('/')}>Go to Home</button>
              <button className="orders-btn" onClick={() => navigate('/orders')}>View Orders</button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="cart-page">
      <div className="cart-container">
        <div className="cart-grid">
          <div className="cart-left-column">
            <div className="shipping-card">
              <div className="card-head">
                <h3>Shipping Address</h3>
              </div>
              <div className="shipping-main-row">
                <p>{defaultAddress?.FullName || customer?.Name || customer?.UserId || 'Customer'}</p>
                <p>{defaultAddress?.PhoneNumber || customer?.Phone || '-'}</p>
              </div>
              <div className="shipping-bottom-row">
                <span className="address-badge">Address</span>
                <p>
                  {defaultAddress
                    ? `${defaultAddress.AddressLine}, ${defaultAddress.City}, ${defaultAddress.Country}`
                    : 'No default address found'}
                </p>
              </div>
            </div>

            <div className="cart-list-card">
              <div className="card-head">
                <h2>Shopping Cart</h2>
                <button type="button" onClick={handleClearCart} disabled={busy}>Clear Cart</button>
              </div>

              <label className="select-all-row">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                <span>Select All ({selectedCount})</span>
              </label>

              {cartItems.length === 0 ? (
                <div className="cart-empty">Your cart is empty.</div>
              ) : (
                <div className="cart-items-list">
                  {cartItems.map((item) => (
                    <div key={item.CartItemId} className="cart-item-row">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedMap[item.CartItemId]) || Object.keys(selectedMap).length === 0}
                        onChange={() => toggleItem(item.CartItemId)}
                      />

                      <div className="cart-item-image">
                        {item.ImageUrl ? <img src={item.ImageUrl} alt={item.Name} /> : <div className="service-image-placeholder" />}
                      </div>

                      <div className="cart-item-info">
                        <h4>{item.Name}</h4>
                        <p>{item.Description}</p>
                        <strong>${Number(item.Price || 0).toFixed(2)} USD</strong>
                      </div>

                      <div className="cart-item-actions">
                        <div className="qty-controller">
                          <button onClick={() => changeQuantity(item, -1)} disabled={busy || Number(item.Quantity || 0) <= 1}>-</button>
                          <span>{item.Quantity}</span>
                          <button
                            onClick={() => changeQuantity(item, 1)}
                            disabled={busy || Number(item.Quantity || 0) >= Number(item.Stock || 0)}
                          >
                            +
                          </button>
                        </div>
                        <button className="remove-item-btn" onClick={() => handleRemoveItem(item)} disabled={busy}>
                          <IoTrashOutline /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cart-total-footer">
                <span>Total({selectedCount}) :</span>
                <strong>${subtotal.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <aside className="cart-summary-card">
            <h3>Order Summary</h3>

            <div className="summary-rows">
              <div className="summary-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="summary-row discount"><span>Discount</span><span>-${discount.toFixed(2)}</span></div>
              <div className="summary-row discount"><span>Tax (10%)</span><span>${tax.toFixed(2)}</span></div>
              <div className="summary-row"><span>Shipping</span><span>${shipping.toFixed(2)}</span></div>
            </div>

            <div className="summary-total-row">
              <span>Total</span>
              <strong>${total.toFixed(2)}</strong>
            </div>

            <div className="gift-code-box">
              <div className="gift-row">
                <input
                  type="text"
                  placeholder="Enter Gift code..."
                  value={giftCode}
                  onChange={(event) => setGiftCode(event.target.value)}
                />
                <button type="button">Apply</button>
              </div>
              <div className="sale-row">
                <IoPricetagOutline />
                <span>Sale</span>
                <span>${discount.toFixed(2)}</span>
              </div>
            </div>

            <div className="payment-card">
              <h4>Payment method</h4>

              <label className={`payment-option ${paymentMethod === 'cod' ? 'active' : ''}`}>
                <div className="payment-left">
                  <IoWalletOutline />
                  <div>
                    <strong>Cash on Delivery (COD)</strong>
                    <p>Pay with cash when you receive your order</p>
                  </div>
                </div>
                <input
                  type="radio"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                />
              </label>

              <label className={`payment-option ${paymentMethod === 'online' ? 'active' : ''}`}>
                <div className="payment-left">
                  <IoCardOutline />
                  <div>
                    <strong>Pay online (ATM/QR)</strong>
                    <p>Online payment request will be recorded with your order</p>
                  </div>
                </div>
                <input
                  type="radio"
                  checked={paymentMethod === 'online'}
                  onChange={() => setPaymentMethod('online')}
                />
              </label>
            </div>

            <button className="buy-now-main-btn" onClick={handleBuyNow} disabled={selectedCount === 0 || busy}>
              <IoCartOutline /> {busy ? 'Processing...' : 'Buy Now'}
            </button>
          </aside>
        </div>
      </div>
    </section>
  )
}

export default CartPage
