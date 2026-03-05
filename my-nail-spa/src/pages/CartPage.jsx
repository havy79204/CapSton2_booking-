import { useEffect, useMemo, useState } from 'react'
import { Trash2, Minus, Plus, CreditCard, ShoppingCart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useCart } from '../context/CartContext.jsx'
import { formatUsd } from '../lib/money'
import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'
import { api } from '../lib/api'

function calcTotals(lineItems) {
  const subtotal = lineItems.reduce((sum, x) => sum + x.price * x.qty, 0)
  const tax = Math.round(subtotal * 0.08)
  const total = subtotal + tax
  return { subtotal, tax, total }
}

export function CartPage() {
  const cart = useCart()
  const auth = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()

  const [productsById, setProductsById] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [activePanel, setActivePanel] = useState('checkout')

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
  const { subtotal: selSubtotal, tax: selTax, total: selTotal } = useMemo(() => calcTotals(selectedLineItems), [selectedLineItems])
  const [giftCode, setGiftCode] = useState('')
  const [giftApplied, setGiftApplied] = useState(0)
  const [giftMessage, setGiftMessage] = useState('')
  const [applyingGift, setApplyingGift] = useState(false)
  const netTotal = useMemo(() => Math.max(0, selTotal - giftApplied), [giftApplied, selTotal])

  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', address: '' })
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
      alert(t('site.cart.selectPrompt', 'Please select at least one item to purchase'))
      return
    }
    if (!effectiveCustomer.name.trim()) {
      alert(t('site.cart.namePrompt', 'Please enter your name'))
      return
    }

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
          name: effectiveCustomer.name,
          phone: effectiveCustomer.phone,
          email: effectiveCustomer.email,
          address: effectiveCustomer.address,
        },
        items: selectedLineItems.map((x) => ({
          productId: x.id,
          name: x.name,
          price: x.price,
          qty: x.qty,
        })),
        totals: { subtotal: selSubtotal, tax: selTax, total: selTotal },
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
            alert(t('site.cart.vnpayFallback', 'VNPAY is not configured on the server. Falling back to Cash on Delivery.'))
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
      alert(err?.message || t('site.cart.checkoutError', 'Checkout failed'))
    } finally {
      setProcessing(false)
    }
  }

  async function applyGift() {
    const code = giftCode.trim();
    if (!code) {
      setGiftMessage(t('site.cart.gift.enter', 'Enter a gift card or promotion code'));
      return;
    }
    if (!selTotal) {
      setGiftMessage(t('site.cart.gift.select', 'Select items first'));
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
        setGiftMessage(t('site.cart.gift.applied', 'Applied {{amount}}').replace('{{amount}}', formatUsd(applied)));
        return;
      }
    } catch (err) {
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
        setGiftMessage(t('site.cart.gift.applied', 'Applied {{amount}}').replace('{{amount}}', formatUsd(discount)));
        return;
      } else {
        setGiftApplied(0);
        setGiftMessage(t('site.cart.gift.none', 'No remaining balance'));
      }
    } catch (err) {
      setGiftApplied(0);
      setGiftMessage(t('site.cart.gift.error', 'Gift card or promotion could not be applied'));
    } finally {
      setApplyingGift(false);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('site.cart.title', 'Cart')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <ShoppingCart size={16} />
            {t('site.cart.subtitle', 'Review your items')}
          </div>
        </div>

        {done ? (
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.cart.doneTitle', 'Payment successful (demo)')}</h3>
            <div className="muted">
              {t('site.cart.doneThanks', 'Thanks {{name}}! Your order has been recorded.').replace('{{name}}', effectiveCustomer.name || t('site.cart.customer', 'customer'))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                {t('site.cart.orderLabel', 'Order:')} <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{orderId || t('site.common.none', '—')}</strong>
              </div>
              <div style={{ flex: 1 }} />
              {auth.isAuthed ? (
                <button className="btn" type="button" onClick={() => navigate('/orders')}>
                  {t('site.cart.viewOrders', 'View orders')}
                </button>
              ) : (
                <button className="btn" type="button" onClick={() => navigate('/login', { state: { from: '/orders' } })}>
                  {t('site.cart.loginToView', 'Login to view orders')}
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid twoCol" style={{ gap: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>{t('site.cart.items.title', 'Items')}</h3>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={lineItems.length > 0 && selectedIds.size === lineItems.length}
                onChange={() => {
                  setSelectedIds((prev) => {
                    if (lineItems.length > 0 && prev.size === lineItems.length) return new Set()
                    return new Set(lineItems.map((x) => x.id))
                  })
                }}
                style={{ width: 18, height: 18 }}
              />
              <div className="muted" style={{ fontSize: 13 }}>
                {t('site.cart.items.selected', '{{count}} selected').replace('{{count}}', selectedIds.size)}
              </div>
            </div>

            {!lineItems.length ? (
              <div className="muted">{t('site.cart.items.empty', 'Your cart is empty.')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lineItems.map((x) => (
                  <div
                    key={x.id}
                    className="card"
                    style={{ padding: 12, boxShadow: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(x.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(x.id)) next.delete(x.id)
                            else next.add(x.id)
                            return next
                          })
                        }}
                        style={{ width: 18, height: 18, marginRight: 8 }}
                      />
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 6 }}>{t('site.cart.items.select', 'Select to purchase')}</div>
                    </div>
                    {Number.isFinite(Number(x.stockQty)) ? (
                      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                        {t('site.cart.items.stock', 'In stock: {{qty}}').replace('{{qty}}', Math.max(0, Number(x.stockQty)))}
                      </div>
                    ) : null}
                    <div className="row">
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div
                          className="thumbMini"
                          aria-hidden="true"
                          style={{ borderRadius: 14, overflow: 'hidden' }}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/products/${x.id}`)}
                          onKeyDown={(e) =>
                            (e.key === 'Enter' || e.key === ' ') && navigate(`/products/${x.id}`)
                          }
                        >
                          {x.image ? (
                            <img
                              src={x.image}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : null}
                        </div>
                        <div>
                          <div
                            style={{ fontWeight: 900, cursor: 'pointer' }}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/products/${x.id}`)}
                            onKeyDown={(e) =>
                              (e.key === 'Enter' || e.key === ' ') &&
                              navigate(`/products/${x.id}`)
                            }
                          >
                            {x.name}
                          </div>
                          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                            {(() => {
                              const d = String(x.description || '').trim()
                              return d.length > 120 ? `${d.slice(0, 117)}...` : d || `${formatUsd(x.price)} · Qty ${x.qty}`
                            })()}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={() => cart.remove(x.id)} title="Remove">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="row" style={{ marginTop: 12 }}>
                      <div className="pill">
                        <button
                          className="btn"
                          style={{ padding: '8px 10px' }}
                          onClick={() => cart.setQty(x.id, x.qty - 1)}
                          aria-label={t('site.cart.items.decrease', 'Decrease')}
                        >
                          <Minus size={16} />
                        </button>
                        <div style={{ minWidth: 30, textAlign: 'center', fontWeight: 800 }}>
                          {x.qty}
                        </div>
                        <button
                          className="btn"
                          style={{ padding: '8px 10px' }}
                          onClick={() => {
                            const maxQty = Number.isFinite(Number(x.stockQty)) ? Math.max(0, Number(x.stockQty)) : null
                            const next = x.qty + 1
                            if (maxQty !== null && next > maxQty) {
                              cart.setQty(x.id, maxQty)
                              return
                            }
                            cart.setQty(x.id, next)
                          }}
                          aria-label={t('site.cart.items.increase', 'Increase')}
                          disabled={Number.isFinite(Number(x.stockQty)) ? x.qty >= Math.max(0, Number(x.stockQty)) : false}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div style={{ fontWeight: 900 }}>{formatUsd(x.price * x.qty)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
              <h3 style={{ marginTop: 0 }}>
                {activePanel === 'orders'
                  ? t('site.cart.orders.title', 'My orders')
                  : t('site.cart.checkout.title', 'Checkout')}
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn"
                  onClick={() => setActivePanel('checkout')}
                  style={{
                    padding: '6px 12px',
                    background: activePanel === 'checkout' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: activePanel === 'checkout' ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {t('site.cart.tab.checkout', 'Checkout')}
                </button>
                <button
                  className="btn"
                  onClick={() => setActivePanel('orders')}
                  style={{
                    padding: '6px 12px',
                    background: activePanel === 'orders' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: activePanel === 'orders' ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {t('site.cart.tab.orders', 'My orders')}
                </button>
              </div>
            </div>

            {activePanel === 'checkout' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  className="input"
                  placeholder={t('site.cart.checkout.name', 'Full name')}
                  value={effectiveCustomer.name}
                  onChange={(e) => setCustomer((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  className="input"
                  placeholder={t('site.cart.checkout.phone', 'Phone number')}
                  value={effectiveCustomer.phone}
                  onChange={(e) => setCustomer((p) => ({ ...p, phone: e.target.value }))}
                />
                <input
                  className="input"
                  placeholder={t('site.cart.checkout.email', 'Email')}
                  value={effectiveCustomer.email}
                  onChange={(e) => setCustomer((p) => ({ ...p, email: e.target.value }))}
                />

                <input
                  className="input"
                  placeholder={t('site.cart.checkout.address', 'Address (optional)')}
                  value={effectiveCustomer.address}
                  onChange={(e) => setCustomer((p) => ({ ...p, address: e.target.value }))}
                />

                <div className="card" style={{ padding: 10, boxShadow: 'none' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      className="input"
                      placeholder={t('site.cart.gift.placeholder', 'Gift card code')}
                      value={giftCode}
                      onChange={(e) => setGiftCode(e.target.value)}
                    />
                    <button className="btn" onClick={applyGift} disabled={applyingGift || !selTotal}>
                      {applyingGift ? t('site.cart.gift.checking', 'Checking…') : t('site.cart.gift.apply', 'Apply')}
                    </button>
                  </div>
                  {giftMessage ? <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{giftMessage}</div> : null}
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={{ fontWeight: 900, display: 'block', marginBottom: 8 }}>
                    {t('site.cart.pay.title', 'Payment Method')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="COD"
                        checked={paymentMethod === 'COD'}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>{t('site.cart.pay.cod', 'Cash on Delivery (COD)')}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {t('site.cart.pay.codDesc', 'Pay with cash when you receive your order')}
                        </div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="VNPAY"
                        checked={paymentMethod === 'VNPAY'}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>{t('site.cart.pay.vnpay', 'VNPAY (ATM/QR)')}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {t('site.cart.pay.vnpayDesc', 'Redirect to VNPAY to pay securely')}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div className="row">
                    <span className="muted">{t('site.cart.summary.subtotal', 'Selected subtotal')}</span>
                    <strong>{formatUsd(selSubtotal)}</strong>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="muted">{t('site.cart.summary.tax', 'Tax (8%)')}</span>
                    <strong>{formatUsd(selTax)}</strong>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="muted">{t('site.cart.summary.gift', 'Gift card')}</span>
                    <strong>-{formatUsd(giftApplied)}</strong>
                  </div>
                  <div
                    className="row"
                    style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    <span style={{ fontWeight: 900 }}>{t('site.cart.summary.total', 'Total')}</span>
                    <span style={{ fontWeight: 900, fontSize: 18 }}>{formatUsd(netTotal)}</span>
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={checkout}
                  disabled={!selectedLineItems.length || processing}
                >
                  <CreditCard size={16} style={{ marginRight: 8 }} />
                  {processing ? t('site.cart.pay.processing', 'Processing...') : t('site.cart.pay.submit', 'Pay selected')}
                </button>
                <button className="btn" onClick={() => cart.clear()} disabled={!lineItems.length}>
                  {t('site.cart.clear', 'Clear cart')}
                </button>
              </div>
            ) : (
              <div>
                <div className="muted" style={{ marginBottom: 12 }}>
                  {t('site.cart.orders.subtitle', 'View your order history and status.')}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    auth.isAuthed
                      ? navigate('/orders')
                      : navigate('/login', { state: { from: '/orders' } })
                  }
                >
                  {t('site.cart.orders.view', 'Go to orders')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
