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
import { useCustomerContext } from '../hooks/useCustomerCommerce'
import { formatVnd } from '../lib/currency'
import { resolveApiImageUrl } from '../lib/api'
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
  const { context } = useCustomerContext()

  const [giftCode, setGiftCode] = useState('')
  const [appliedPromotion, setAppliedPromotion] = useState(null)
  const [promoMessage, setPromoMessage] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [selectedMap, setSelectedMap] = useState({})
  const [orderSuccess, setOrderSuccess] = useState(null)
  const [quantityInputs, setQuantityInputs] = useState({})

  const cartItems = useMemo(() => (Array.isArray(cart?.Items) ? cart.Items : []), [cart])
  const defaultAddress = cart?.DefaultAddress || null
  const customer = cart?.Customer || null

  const bookingSettings = context?.bookingSettings || {}
  const promotionEnabled = Boolean(bookingSettings.promotionEnabled)
  const allowCustomerApply = bookingSettings.promotionAllowCustomerApply !== false
  const availablePromotions = useMemo(() => {
    const list = Array.isArray(bookingSettings.promotions) ? bookingSettings.promotions : []
    const now = new Date()
    return list.filter((promo) => {
      if (!promo || promo.isActive === false) return false
      const code = String(promo.code || '').trim()
      if (!code) return false

      const start = promo.startDate ? new Date(promo.startDate) : null
      const end = promo.endDate ? new Date(promo.endDate) : null
      if (start && !Number.isNaN(start.getTime()) && now < start) return false
      if (end && !Number.isNaN(end.getTime())) {
        const inclusiveEnd = new Date(end)
        inclusiveEnd.setHours(23, 59, 59, 999)
        if (now > inclusiveEnd) return false
      }
      return true
    })
  }, [bookingSettings.promotions])

  const selectedItems = useMemo(() => {
    if (cartItems.length === 0) return []
    const hasExplicit = Object.keys(selectedMap).length > 0
    return cartItems.filter((item) => (hasExplicit ? Boolean(selectedMap[item.CartItemId]) : true))
  }, [cartItems, selectedMap])

  const selectedCount = selectedItems.length
  const allSelected = cartItems.length > 0 && selectedCount === cartItems.length

  const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.Price || 0) * Number(item.Quantity || 0), 0)
  const discount = useMemo(() => {
    if (!appliedPromotion) return 0
    const value = Number(appliedPromotion.value || 0)
    if (!Number.isFinite(value) || value <= 0) return 0

    if (String(appliedPromotion.discountType || '').toLowerCase() === 'percentage') {
      return Math.min(subtotal, (subtotal * Math.min(100, value)) / 100)
    }

    return Math.min(subtotal, value)
  }, [appliedPromotion, subtotal])

  const shipping = selectedCount > 0 ? 30000 : 0
  const total = subtotal - discount + shipping

  const applyPromotionCode = () => {
    const code = String(giftCode || '').trim()
    setPromoMessage('')

    if (!code) {
      setAppliedPromotion(null)
      setPromoMessage('Please enter a promotion code.')
      return
    }

    if (!promotionEnabled) {
      setAppliedPromotion(null)
      setPromoMessage('Promotions are currently disabled.')
      return
    }

    if (!allowCustomerApply) {
      setAppliedPromotion(null)
      setPromoMessage('This salon does not allow customers to apply promotion codes.')
      return
    }

    const matched = availablePromotions.find(
      (promo) => String(promo.code || '').trim().toUpperCase() === code.toUpperCase(),
    )

    if (!matched) {
      setAppliedPromotion(null)
      setPromoMessage('Invalid or expired promotion code.')
      return
    }

    setAppliedPromotion(matched)
    setGiftCode(String(matched.code || '').trim())
    setPromoMessage(`Applied code: ${String(matched.code || '').trim()}`)
  }

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

  const handleVariantChange = async (item, nextVariantId) => {
    const variantId = String(nextVariantId || '').trim()
    if (!variantId || variantId === String(item.VariantId || '').trim()) return

    const targetVariant = Array.isArray(item?.VariantOptions)
      ? item.VariantOptions.find((variant) => String(variant?.VariantId || '').trim() === variantId)
      : null

    if (targetVariant && Number(targetVariant.Stock || 0) <= 0) {
      alert('Selected variant is out of stock')
      return
    }

    try {
      await updateItem(item.CartItemId, {
        quantity: Number(item.Quantity || 1),
        variantId,
      })
    } catch (err) {
      alert(err?.message || 'Failed to update variant')
    }
  }

  const changeQuantity = async (item, change) => {
    const cartItemId = String(item.CartItemId || '')
    const rawDraft = quantityInputs[cartItemId]
    const baseQuantity = Number.parseInt(String(rawDraft ?? item.Quantity ?? 0), 10)
    const currentQuantity = Number.isFinite(baseQuantity) ? baseQuantity : Number(item.Quantity || 0)
    const nextQuantity = currentQuantity + change
    if (nextQuantity < 1) return

    const maxStock = Number(item.Stock || 0)
    if (maxStock > 0 && nextQuantity > maxStock) return

    try {
      await updateItem(item.CartItemId, { quantity: nextQuantity })
      setQuantityInputs((prev) => {
        const next = { ...prev }
        delete next[cartItemId]
        return next
      })
    } catch (err) {
      alert(err?.message || 'Failed to update quantity')
      setQuantityInputs((prev) => ({
        ...prev,
        [cartItemId]: String(item.Quantity || 1),
      }))
    }
  }

  const handleQuantityInputChange = (item, rawValue) => {
    const cartItemId = String(item.CartItemId || '')
    const digitsOnly = String(rawValue || '').replace(/\D/g, '')
    setQuantityInputs((prev) => ({
      ...prev,
      [cartItemId]: digitsOnly,
    }))
  }

  const commitQuantityInput = async (item, rawValue) => {
    const cartItemId = String(item.CartItemId || '')
    const sourceValue = rawValue ?? quantityInputs[cartItemId] ?? String(item.Quantity || '')
    const parsed = Number.parseInt(String(sourceValue || '').trim(), 10)

    if (!Number.isFinite(parsed)) {
      setQuantityInputs((prev) => {
        const next = { ...prev }
        delete next[cartItemId]
        return next
      })
      return
    }

    const maxStock = Number(item.Stock || 0)
    const bounded = Math.max(1, maxStock > 0 ? Math.min(parsed, maxStock) : parsed)

    if (bounded === Number(item.Quantity || 0)) {
      setQuantityInputs((prev) => {
        const next = { ...prev }
        delete next[cartItemId]
        return next
      })
      return
    }

    try {
      await updateItem(item.CartItemId, { quantity: bounded })
      setQuantityInputs((prev) => {
        const next = { ...prev }
        delete next[cartItemId]
        return next
      })
    } catch (err) {
      alert(err?.message || 'Failed to update quantity')
      setQuantityInputs((prev) => ({
        ...prev,
        [cartItemId]: String(item.Quantity || 1),
      }))
    }
  }

  const getQuantityDisplayValue = (item) => {
    const cartItemId = String(item.CartItemId || '')
    const draft = quantityInputs[cartItemId]
    if (draft !== undefined) return draft
    return String(item.Quantity || 1)
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
        giftCode: appliedPromotion ? giftCode : '',
      })

      if (paymentMethod === 'online' && result?.PaymentUrl) {
        window.location.href = String(result.PaymentUrl)
        return
      }

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
                <p>{defaultAddress?.FullName || customer?.Name || 'Customer'}</p>
                <p>{defaultAddress?.PhoneNumber || '-'}</p>
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
                        {resolveApiImageUrl(item.ImageUrl) ? (
                          <img src={resolveApiImageUrl(item.ImageUrl)} alt={item.Name} />
                        ) : (
                          <div className="service-image-placeholder" />
                        )}
                      </div>

                      <div className="cart-item-info">
                        <h4>{item.Name}</h4>
                        {Array.isArray(item.VariantOptions) && item.VariantOptions.length > 0 ? (
                          <div className="cart-item-variant-row">
                            <select
                              className="cart-item-variant-select"
                              value={item.VariantId || ''}
                              onChange={(event) => handleVariantChange(item, event.target.value)}
                              disabled={busy || !item.VariantOptions.some((variant) => Number(variant?.Stock || 0) > 0)}
                            >
                              <option value="" disabled>
                                Select variant
                              </option>
                              {item.VariantOptions.map((variant) => (
                                <option
                                  key={variant.VariantId}
                                  value={variant.VariantId}
                                  disabled={Number(variant?.Stock || 0) <= 0}
                                >
                                  {variant.VariantName}{Number(variant?.Stock || 0) <= 0 ? ' (Out of stock)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : item.VariantName ? (
                          <p className="cart-item-variant">Variant: {item.VariantName}</p>
                        ) : null}
                        <p>{item.Description}</p>
                        <strong>{formatVnd(item.Price || 0)}</strong>
                      </div>

                      <div className="cart-item-actions">
                        <div className="qty-controller">
                          <button onClick={() => changeQuantity(item, -1)} disabled={busy || Number(item.Quantity || 0) <= 1}>-</button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            aria-label={`Quantity for ${item.Name}`}
                            value={getQuantityDisplayValue(item)}
                            onChange={(event) => handleQuantityInputChange(item, event.target.value)}
                            onBlur={(event) => commitQuantityInput(item, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                event.currentTarget.blur()
                              }
                              if (event.key === 'Escape') {
                                setQuantityInputs((prev) => {
                                  const next = { ...prev }
                                  delete next[String(item.CartItemId || '')]
                                  return next
                                })
                              }
                            }}
                            disabled={busy}
                          />
                          <button
                            onClick={() => changeQuantity(item, 1)}
                            disabled={
                              busy
                              || (Number(item.Stock || 0) > 0
                                && Number.parseInt(getQuantityDisplayValue(item) || String(item.Quantity || 0), 10) >= Number(item.Stock || 0))
                            }
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
                <strong>{formatVnd(subtotal)}</strong>
              </div>
            </div>
          </div>

          <aside className="cart-summary-card">
            <h3>Order Summary</h3>

            <div className="summary-rows">
              <div className="summary-row"><span>Subtotal</span><span>{formatVnd(subtotal)}</span></div>
              <div className="summary-row discount"><span>Discount</span><span>- {formatVnd(discount)}</span></div>
              <div className="summary-row"><span>Shipping</span><span>{formatVnd(shipping)}</span></div>
            </div>

            <div className="summary-total-row">
              <span>Total</span>
              <strong>{formatVnd(total)}</strong>
            </div>

            <div className="gift-code-box">
              <div className="gift-row">
                <input
                  type="text"
                  placeholder="Enter Gift code..."
                  value={giftCode}
                  onChange={(event) => {
                    setGiftCode(event.target.value)
                    setAppliedPromotion(null)
                    setPromoMessage('')
                  }}
                />
                <button type="button" onClick={applyPromotionCode}>Apply</button>
              </div>
              {promoMessage ? <p className="gift-feedback">{promoMessage}</p> : null}
              <div className="sale-row">
                <IoPricetagOutline />
                <span>Sale</span>
                <span>{formatVnd(discount)}</span>
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
