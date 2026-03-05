import { useEffect, useMemo, useState } from 'react'
import { Trash2, Minus, Plus, CreditCard, ShoppingCart, ArrowLeft, CheckCircle2, Banknote, Ticket } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useCart } from '../context/CartContext.jsx'
import { formatUsd } from '../lib/money'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api'
import '../styles/CartPage.css'

function calcTotals(lineItems) {
  const subtotal = lineItems.reduce((sum, x) => sum + x.price * x.qty, 0)
  const tax = Math.round(subtotal * 0.10) // 10% tax
  const shipping = lineItems.length > 0 ? 300 : 0 // $3.00 shipping
  const total = subtotal + tax + shipping
  return { subtotal, tax, shipping, total }
}

export function CartPage() {
  const cart = useCart()
  const auth = useAuth()
  const navigate = useNavigate()

  const [productsById, setProductsById] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [defaultAddress, setDefaultAddress] = useState(null)

  // Load user addresses
  useEffect(() => {
    if (!auth.isAuthed) return
    let alive = true
    api.getAddresses()
      .then((res) => {
        if (!alive) return
        const items = Array.isArray(res?.items) ? res.items : []
        const defAddr = items.find(addr => addr.isDefault === true || addr.isDefault === 1)
        setDefaultAddress(defAddr || items[0] || null)
      })
      .catch(() => {
        // no-op
      })
    return () => { alive = false }
  }, [auth.isAuthed])

  useEffect(() => {
    const ids = (cart.items || []).map((x) => x.productId).filter(Boolean)
    if (!ids.length) return
    let alive = true
    api
      .getProductsBulk(ids)
      .then((r) => {
        if (!alive) return
        const map = {}
        for (const p of Array.isArray(r?.items) ? r.items : []) {
          if (p?.id) map[p.id] = p
        }
        setProductsById(map)
      })
      .catch(() => {
        // no-op
      })
    return () => {
      alive = false
    }
  }, [cart.items])

  // prune selectedIds if cart items change (remove selections for removed products)
  useEffect(() => {
    setSelectedIds((prev) => {
      const present = new Set((cart.items || []).map((i) => i.productId))
      const next = new Set()
      for (const id of prev) if (present.has(id)) next.add(id)
      return next
    })
  }, [cart.items])

  const lineItems = useMemo(() => {
    return cart.items
      .map((it) => {
        const p = productsById[it.productId]
        if (!p) return null
        return { ...p, qty: it.qty }
      })
      .filter(Boolean)
  }, [cart.items, productsById])

  // Removed unused destructured variables to fix no-unused-vars error
  useMemo(() => calcTotals(lineItems), [lineItems])
  const selectedLineItems = useMemo(() => lineItems.filter((x) => selectedIds.has(x.id)), [lineItems, selectedIds])
  const { subtotal: selSubtotal, tax: selTax, shipping: selShipping, total: selTotal } = useMemo(() => calcTotals(selectedLineItems), [selectedLineItems])
  const [giftCode, setGiftCode] = useState('')
  const [giftApplied, setGiftApplied] = useState(0)
  const [giftMessage, setGiftMessage] = useState('')
  const [applyingGift, setApplyingGift] = useState(false)
  const netTotal = useMemo(() => Math.max(0, selTotal - giftApplied), [giftApplied, selTotal])

  const [customer] = useState({ name: '', phone: '', email: '', address: '' })
  const [paymentMethod, setPaymentMethod] = useState('COD')
  const [done, setDone] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [processing, setProcessing] = useState(false)

  const effectiveCustomer = useMemo(() => {
    if (!auth.isAuthed) return customer
    return {
      ...customer,
      name: customer.name || auth.user?.name || '',
      email: customer.email || auth.user?.email || '',
    }
  }, [auth.isAuthed, auth.user?.email, auth.user?.name, customer])

  async function checkout() {
    if (!selectedLineItems.length) {
      alert('Please select at least one item to purchase')
      return
    }
    
    const customerName = effectiveCustomer.name || defaultAddress?.name || auth.user?.name
    if (!customerName?.trim()) {
      alert('Please enter your name or add a shipping address')
      return
    }

    const shippingAddress = defaultAddress ? [
      defaultAddress.address,
      defaultAddress.city,
      defaultAddress.country
    ].filter(Boolean).join(', ') : (effectiveCustomer.address || '')

    setProcessing(true)
    try {
      const salonIds = Array.from(new Set(selectedLineItems.map((x) => String(x?.salonId || 'global').trim() || 'global')))
      const singleSalonId = salonIds.length === 1 ? salonIds[0] : null
      const salonKey = singleSalonId || 'mixed'

      const orderPayload = {
        salonKey,
        salonId: singleSalonId && singleSalonId !== 'global' ? singleSalonId : null,
        customerUserId: auth.user?.id || null,
        customerEmail: effectiveCustomer.email || auth.user?.email || '',
        customer: {
          name: customerName,
          phone: defaultAddress?.phone || effectiveCustomer.phone || auth.user?.phone || '',
          email: effectiveCustomer.email || auth.user?.email || '',
          address: shippingAddress,
        },
        items: selectedLineItems.map((x) => ({
          productId: x.id,
          name: x.name,
          price: x.price,
          qty: x.qty,
        })),
        totals: { subtotal: selSubtotal, tax: selTax, shipping: selShipping, total: selTotal },
        paymentMethod,
        giftCode: giftCode.trim() || undefined,
      }

      if (paymentMethod === 'VNPAY') {
        try {
          const resp = await api.createVnpayPayment(orderPayload)
          // Do not clear cart until payment confirmed; let user retry if they abandon
          window.location.href = resp?.paymentUrl || '/'
          return
        } catch (err) {
          const msg = err?.message || ''
          if (msg.toLowerCase().includes('vnpay is not configured')) {
            alert('VNPAY is not configured on the server. Falling back to Cash on Delivery.')
            setPaymentMethod('COD')
          } else {
            throw err
          }
        }
      }

      const record = await api.createOrder(orderPayload)

      setOrderId(record?.item?.id || '')
      setDone(true)
      setGiftApplied(0)
      setGiftCode('')
      // remove only purchased items from cart
      for (const it of selectedLineItems) cart.remove(it.id)
      setSelectedIds(new Set())
    } catch (err) {
      alert(err?.message || 'Checkout failed')
    } finally {
      setProcessing(false)
    }
  }

  async function applyGift() {
    const code = giftCode.trim();
    if (!code) {
      setGiftMessage('Enter a gift card or promotion code');
      return;
    }
    if (!selTotal) {
      setGiftMessage('Select items first');
      return;
    }
    setApplyingGift(true);
    setGiftMessage('');
    setGiftApplied(0);
    // Try Gift Card first
    try {
      const res = await api.checkGiftCardByTitle(code, selTotal);
      const applied = Number(res?.applied || 0);
      if (applied > 0) {
        setGiftApplied(applied);
        setGiftMessage('Applied {{amount}}'.replace('{{amount}}', formatUsd(applied)));
        return;
      }
    } catch {
      // Ignore and try promotion next
    }
    // Try Promotion
    try {
      const promoRes = await fetch('/api/promotions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, total: selTotal })
      });
      if (!promoRes.ok) throw new Error('Promotion not found');
      const promo = await promoRes.json();
      const discount = Number(promo.discount || 0);
      if (discount > 0) {
        setGiftApplied(discount);
        setGiftMessage('Applied {{amount}}'.replace('{{amount}}', formatUsd(discount)));
        return;
      } else {
        setGiftApplied(0);
        setGiftMessage('No remaining balance');
      }
    } catch {
      setGiftApplied(0);
      setGiftMessage('Gift card or promotion could not be applied');
    } finally {
      setApplyingGift(false);
    }
  }

  if (done) {
    const displayName = effectiveCustomer.name || defaultAddress?.name || auth.user?.name || 'Customer'
    return (
      <div className="cartPageContainer">
        <div className="successModal">
          <CheckCircle2 className="icon" size={64} />
          <h3>Order Placed Successfully!</h3>
          <p>Thank you {displayName}!</p>
          <p>Your order has been confirmed and will be processed shortly.</p>
          {orderId && <div className="orderId">Order #{orderId}</div>}
          <div className="actions">
            {auth.isAuthed ? (
              <button className="primary" onClick={() => navigate('/orders')}>
                View Orders
              </button>
            ) : (
              <button className="primary" onClick={() => navigate('/login', { state: { from: '/orders' } })}>
                Login to View Orders
              </button>
            )}
            <button className="secondary" onClick={() => navigate('/shop')}>
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cartPageContainer">
      {/* Header with Back Button */}
      <div className="cartPageHeader">
        <button className="backButton" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
          Back
        </button>
      </div>

      {!lineItems.length ? (
        <div className="emptyCart">
          <ShoppingCart className="icon" size={80} />
          <h3>Your cart is empty</h3>
          <p>Add some products to get started</p>
          <button onClick={() => navigate('/shop')}>
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="cartGrid">
          {/* Left Column - Address + Cart Items */}
          <div className="cartMainSection">
            {/* Shipping Address Card */}
            <div className="shippingAddressCard">
              <div className="shippingAddressHeader">
                <h3>Shipping Address</h3>
                <button className="editBtn" onClick={() => navigate('/profile/edit')}>
                  Edit
                </button>
              </div>
              {auth.isAuthed && defaultAddress ? (
                <div className="shippingAddressInfo">
                  <div className="name">{defaultAddress.name || auth.user?.name || 'N/A'}</div>
                  <div>{defaultAddress.phone || 'No phone number'}</div>
                  <div>
                    {[
                      defaultAddress.address,
                      defaultAddress.city,
                      defaultAddress.country
                    ].filter(Boolean).join(', ') || 'No address provided'}
                  </div>
                  <div className="addressBadge">Address</div>
                </div>
              ) : (
                <div className="shippingAddressInfo">
                  <div className="name">{auth.user?.name || 'Guest User'}</div>
                  <div>{auth.user?.phone || 'No phone number'}</div>
                  <div>No address provided</div>
                  <div className="addressBadge">Address</div>
                </div>
              )}
            </div>

            {/* Shopping Cart Card */}
            <div className="shoppingCartCard">
              <div className="shoppingCartHeader">
                <h3>Shopping Cart</h3>
                <button className="clearCartBtn" onClick={() => cart.clear()} disabled={!lineItems.length}>
                  Clear Cart
                </button>
              </div>

              {/* Select All Row */}
              <div className="selectAllRow">
                <input
                  type="checkbox"
                  id="selectAll"
                  checked={lineItems.length > 0 && selectedIds.size === lineItems.length}
                  onChange={() => {
                    setSelectedIds((prev) => {
                      if (lineItems.length > 0 && prev.size === lineItems.length) return new Set()
                      return new Set(lineItems.map((x) => x.id))
                    })
                  }}
                />
                <label htmlFor="selectAll">
                  Select All <span className="selectAllCount">({selectedIds.size})</span>
                </label>
              </div>

              {/* Cart Items List */}
              <div className="cartItemsList">
                {lineItems.map((item) => (
                  <div key={item.id} className="cartItem">
                    <div className="cartItemHeader">
                      <div className="cartItemCheckbox">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(item.id)) next.delete(item.id)
                              else next.add(item.id)
                              return next
                            })
                          }}
                        />
                      </div>
                      <div className="cartItemImage" onClick={() => navigate(`/products/${item.id}`)}>
                        {item.image && <img src={item.image} alt={item.name} />}
                      </div>
                      <div className="cartItemInfo">
                        <div className="cartItemName" onClick={() => navigate(`/products/${item.id}`)}>
                          {item.name}
                        </div>
                        <div className="cartItemType">Type: {item.category || 'General'}</div>
                        <div className="cartItemBrand">By: {item.brand || item.salonName || 'NIOM&CE'}</div>
                      </div>
                      <div className="cartItemPrice">{formatUsd(item.price)}</div>
                    </div>
                    <div className="cartItemFooter">
                      <div className="quantityControls">
                        <button
                          onClick={() => cart.setQty(item.id, item.qty - 1)}
                          disabled={item.qty <= 1}
                          aria-label="Decrease quantity"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="quantity">{item.qty}</span>
                        <button
                          onClick={() => {
                            const maxQty = Number.isFinite(Number(item.stockQty)) ? Math.max(0, Number(item.stockQty)) : null
                            const next = item.qty + 1
                            if (maxQty !== null && next > maxQty) {
                              cart.setQty(item.id, maxQty)
                              return
                            }
                            cart.setQty(item.id, next)
                          }}
                          disabled={Number.isFinite(Number(item.stockQty)) ? item.qty >= Math.max(0, Number(item.stockQty)) : false}
                          aria-label="Increase quantity"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <button className="removeItemBtn" onClick={() => cart.remove(item.id)} title="Remove item">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cart Total */}
              <div className="cartTotal">
                <span>Total({selectedLineItems.length}):</span>
                <span className="amount">{formatUsd(selSubtotal)}</span>
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="orderSummaryCard">
            <h3>Order Summary</h3>

            {/* Summary Rows */}
            <div className="summaryRow">
              <span className="label">Subtotal</span>
              <span className="value">{formatUsd(selSubtotal)}</span>
            </div>
            <div className="summaryRow discount">
              <span className="label">Discount</span>
              <span className="value">-{formatUsd(giftApplied)}</span>
            </div>
            <div className="summaryRow">
              <span className="label">Tax (10%)</span>
              <span className="value">{formatUsd(selTax)}</span>
            </div>
            <div className="summaryRow">
              <span className="label">Shipping</span>
              <span className="value">{formatUsd(selShipping)}</span>
            </div>
            <div className="summaryRow total">
              <span className="label">Total</span>
              <span className="value">{formatUsd(netTotal)}</span>
            </div>

            {/* Gift Code Section */}
            <div className="giftCodeSection">
              <div className="giftCodeInput">
                <input
                  type="text"
                  placeholder="Enter Gift code..."
                  value={giftCode}
                  onChange={(e) => setGiftCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyGift()}
                />
                <button onClick={applyGift} disabled={applyingGift || !selTotal}>
                  {applyingGift ? 'Applying...' : 'Apply'}
                </button>
              </div>
              {giftMessage && (
                <div className="muted" style={{ marginTop: 8, fontSize: 13, color: giftApplied > 0 ? '#48bb78' : '#e53e3e' }}>
                  {giftMessage}
                </div>
              )}
              {giftApplied > 0 && (
                <div className="saleAmount">
                  <Ticket className="icon" size={18} />
                  <span className="label">Sale</span>
                  <span className="value">{formatUsd(giftApplied)}</span>
                </div>
              )}
            </div>

            {/* Payment Method Section */}
            <div className="paymentMethodSection">
              <h4>Payment method</h4>
              <div
                className={`paymentMethodOption ${paymentMethod === 'COD' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('COD')}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={paymentMethod === 'COD'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <Banknote className="paymentMethodIcon" size={24} />
                <div className="paymentMethodInfo">
                  <div className="name">Cash on Delivery (COD)</div>
                  <div className="description">Pay with cash when you receive your order</div>
                </div>
                {paymentMethod === 'COD' && <CheckCircle2 className="paymentMethodCheckmark" size={20} />}
              </div>
              <div
                className={`paymentMethodOption ${paymentMethod === 'VNPAY' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('VNPAY')}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="VNPAY"
                  checked={paymentMethod === 'VNPAY'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <CreditCard className="paymentMethodIcon" size={24} />
                <div className="paymentMethodInfo">
                  <div className="name">Pay online (ATM/QR)</div>
                  <div className="description">Redirect to VNPAY to pay securely</div>
                </div>
                {paymentMethod === 'VNPAY' && <CheckCircle2 className="paymentMethodCheckmark" size={20} />}
              </div>
            </div>

            {/* Buy Now Button */}
            <button
              className="buyNowBtn"
              onClick={checkout}
              disabled={!selectedLineItems.length || processing}
            >
              <ShoppingCart size={18} />
              {processing ? 'Processing...' : 'Buy Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
