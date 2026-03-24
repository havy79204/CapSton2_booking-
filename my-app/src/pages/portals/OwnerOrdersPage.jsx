import React, { useCallback, useEffect, useMemo, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../components/Layout portal/PortalModal.jsx'
import { api } from '../../lib/api.js'
import '../../styles/orders.css'

function formatVnd(value) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US')
}

function defaultFilters() {
  return {
    status: '',
    keyword: '',
    sortBy: 'createdAt',
    sortDir: 'desc',
  }
}

function toOrderQueryString(filters) {
  const p = new URLSearchParams()
  if (filters.status) p.set('status', filters.status)
  if (filters.keyword) p.set('keyword', filters.keyword)
  if (filters.sortBy) p.set('sortBy', filters.sortBy)
  if (filters.sortDir) p.set('sortDir', filters.sortDir)
  return p.toString()
}

function hasDangerousInput(value) {
  const raw = String(value || '')
  const lower = raw.toLowerCase()
  if (/<\s*script\b/i.test(raw)) return true
  if (/on\w+\s*=\s*/i.test(raw)) return true
  if (/\bor\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i.test(lower)) return true
  if (/\bunion\b\s+\bselect\b/i.test(lower)) return true
  return false
}

function defaultCreateOrderForm() {
  return {
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    paymentMethod: 'COD',
    status: 'Pending',
  }
}

function normalizeDisplayStatus(status) {
  const raw = String(status || '').trim().toLowerCase()
  if (!raw) return '-'
  if (raw === 'c') return 'Pending'
  return status
}

export default function OwnerOrdersPage() {
  const [orderFilters, setOrderFilters] = useState(defaultFilters)
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [orderReport, setOrderReport] = useState({
    summary: { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, totalQuantity: 0, fromDate: null, toDate: null },
    items: [],
    pagination: { page: 1, pageSize: 20, totalRows: 0 },
  })
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')

  const [openOrderModal, setOpenOrderModal] = useState(false)
  const [orderEditing, setOrderEditing] = useState(null)
  const [orderForm, setOrderForm] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    paymentMethod: '',
    status: '',
  })
  const [orderSaving, setOrderSaving] = useState(false)
  const [deletingOrderId, setDeletingOrderId] = useState('')

  const [products, setProducts] = useState([])
  const [openCreateOrderModal, setOpenCreateOrderModal] = useState(false)
  const [createOrderForm, setCreateOrderForm] = useState(defaultCreateOrderForm)
  const [createItems, setCreateItems] = useState([{ productId: '', quantity: '1' }])
  const [createOrderSaving, setCreateOrderSaving] = useState(false)

  const loadOrders = useCallback(async (nextFilters) => {
    try {
      setOrdersLoading(true)
      setOrdersError('')
      const qs = toOrderQueryString(nextFilters)
      const data = await api.get(`/api/owner/retail/orders${qs ? `?${qs}` : ''}`)
      setOrderReport({
        summary: data?.summary || { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, totalQuantity: 0, fromDate: null, toDate: null },
        items: Array.isArray(data?.items) ? data.items : [],
        pagination: data?.pagination || { page: 1, pageSize: 20, totalRows: 0 },
      })
    } catch (err) {
      console.error(err)
      setOrdersError(err?.message || 'Unable to load order report')
      setOrderReport({
        summary: { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, totalQuantity: 0, fromDate: null, toDate: null },
        items: [],
        pagination: { page: 1, pageSize: 20, totalRows: 0 },
      })
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.get('/api/owner/retail/products')
      setProducts(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setProducts([])
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadOrders, loadProducts])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(orderFilters.keyword || '')
    }, 300)
    return () => clearTimeout(timer)
  }, [orderFilters.keyword])

  useEffect(() => {
    loadOrders({ ...orderFilters, keyword: debouncedKeyword })
  }, [loadOrders, orderFilters, debouncedKeyword])

  const productsById = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      if (p?.id) map.set(String(p.id), p)
    }
    return map
  }, [products])

  const createOrderTotal = useMemo(() => {
    return createItems.reduce((sum, line) => {
      const qty = Number(line.quantity || 0)
      const product = productsById.get(String(line.productId || ''))
      const price = Number(product?.price || 0)
      if (!product || !Number.isFinite(qty) || qty <= 0) return sum
      return sum + qty * price
    }, 0)
  }, [createItems, productsById])

  function resetCreateOrder() {
    setCreateOrderForm(defaultCreateOrderForm())
    setCreateItems([{ productId: '', quantity: '1' }])
  }

  function openCreateOrder() {
    resetCreateOrder()
    setOpenCreateOrderModal(true)
  }

  function addCreateItemLine() {
    setCreateItems((prev) => [...prev, { productId: '', quantity: '1' }])
  }

  function removeCreateItemLine(index) {
    setCreateItems((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, idx) => idx !== index)
    })
  }

  function patchCreateItemLine(index, patch) {
    setCreateItems((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)))
  }

  function openEditOrder(order) {
    if (!order?.OrderId) return
    setOrderEditing(order)
    setOrderForm({
      customerName: order.CustomerName || '',
      customerPhone: order.CustomerPhone || '',
      customerAddress: order.CustomerAddress || '',
      paymentMethod: order.PaymentMethod || 'COD',
      status: normalizeDisplayStatus(order.Status) === '-' ? 'Pending' : normalizeDisplayStatus(order.Status),
    })
    setOpenOrderModal(true)
  }

  async function onSaveOrder(e) {
    e.preventDefault()
    if (!orderEditing?.OrderId) return

    try {
      setOrderSaving(true)
      await api.put(`/api/owner/retail/orders/${orderEditing.OrderId}`, {
        customerName: orderForm.customerName,
        customerPhone: orderForm.customerPhone,
        customerAddress: orderForm.customerAddress,
        paymentMethod: orderForm.paymentMethod,
        status: orderForm.status,
      })

      setOpenOrderModal(false)
      await loadOrders(orderFilters)
    } catch (err) {
      console.error(err)
      setOrdersError(err?.message || 'Unable to update order')
    } finally {
      setOrderSaving(false)
    }
  }

  async function onCreateOrder(e) {
    e.preventDefault()

    if (hasDangerousInput(createOrderForm.customerName) || hasDangerousInput(createOrderForm.customerAddress)) {
      setOrdersError('Invalid customer information')
      return
    }

    const lines = createItems
      .map((line) => ({
        productId: String(line.productId || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.productId && Number.isFinite(line.quantity) && line.quantity > 0)

    if (!lines.length) {
      setOrdersError('Please add at least one product with valid quantity')
      return
    }

    try {
      setCreateOrderSaving(true)
      setOrdersError('')
      await api.post('/api/owner/retail/orders', {
        customerName: createOrderForm.customerName,
        customerPhone: createOrderForm.customerPhone,
        customerAddress: createOrderForm.customerAddress,
        paymentMethod: createOrderForm.paymentMethod,
        status: createOrderForm.status,
        items: lines,
      })

      setOpenCreateOrderModal(false)
      resetCreateOrder()
      await loadOrders(orderFilters)
      await loadProducts()
    } catch (err) {
      console.error(err)
      setOrdersError(err?.message || 'Unable to create order')
    } finally {
      setCreateOrderSaving(false)
    }
  }

  async function onDeleteOrder(order) {
    const orderId = String(order?.OrderId || '').trim()
    if (!orderId) return
    if (!window.confirm(`Delete order ${order.OrderCode || orderId}?`)) return

    try {
      setDeletingOrderId(orderId)
      setOrdersError('')
      await api.del(`/api/owner/retail/orders/${orderId}`)
      if (orderEditing?.OrderId === orderId) {
        setOpenOrderModal(false)
        setOrderEditing(null)
      }
      await loadOrders(orderFilters)
      await loadProducts()
    } catch (err) {
      console.error(err)
      setOrdersError(err?.message || 'Unable to delete order')
    } finally {
      setDeletingOrderId('')
    }
  }

  return (
    <div className="orders-page">
      <PortalCard className="portal-invTableCard">
        <div className="portal-orderFilters">
          <label className="portal-field">
            <span className="portal-label">Status</span>
            <select
              className="portal-select"
              value={orderFilters.status}
              onChange={(e) => setOrderFilters((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Shipping">Shipping</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Failed">Failed</option>
            </select>
          </label>

          <label className="portal-field">
            <span className="portal-label">Search</span>
            <input
              className="portal-input"
              placeholder="Order ID / customer name / phone"
              value={orderFilters.keyword}
              onChange={(e) => setOrderFilters((p) => ({ ...p, keyword: e.target.value }))}
            />
          </label>

          <label className="portal-field">
            <span className="portal-label">Sort</span>
            <select
              className="portal-select"
              value={`${orderFilters.sortBy}:${orderFilters.sortDir}`}
              onChange={(e) => {
                const [sortBy, sortDir] = String(e.target.value || '').split(':')
                setOrderFilters((p) => ({ ...p, sortBy, sortDir: sortDir || 'desc' }))
              }}
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="total:desc">Highest total</option>
              <option value="total:asc">Lowest total</option>
              <option value="customerName:asc">Customer name A-Z</option>
            </select>
          </label>
        </div>

        <div className="portal-rowActions" style={{ marginBottom: 10 }}>
          <button type="button" className="portal-modalBtn portal-modalBtnPrimary" onClick={openCreateOrder}>
            Create Order
          </button>
          <button
            type="button"
            className="portal-modalBtn"
            onClick={() => {
              setOrderFilters(defaultFilters())
            }}
          >
            Reset
          </button>
        </div>

        <div className="portal-orderSummary">
          <div className="portal-orderSummaryItem">
            <span>Total orders</span>
            <b>{Number(orderReport.summary?.totalOrders || 0)}</b>
          </div>
          <div className="portal-orderSummaryItem">
            <span>Total items sold</span>
            <b>{Number(orderReport.summary?.totalQuantity || 0)}</b>
          </div>
          <div className="portal-orderSummaryItem">
            <span>Revenue</span>
            <b>{formatVnd(orderReport.summary?.totalRevenue || 0)} VND</b>
          </div>
        </div>

        {ordersError ? <div className="portal-formError" role="alert">{ordersError}</div> : null}
        {ordersLoading ? <div className="portal-pageSubtitle">Loading order report...</div> : null}

        <div className="portal-tableWrap" style={{ marginTop: 8 }}>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Order date</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Discount</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(orderReport.items || []).length === 0 ? (
                <tr>
                  <td colSpan={9}>No orders found for the current filters.</td>
                </tr>
              ) : (
                (orderReport.items || []).map((o) => (
                  <tr key={o.OrderId}>
                    <td className="portal-invName">{o.OrderCode || o.OrderId}</td>
                    <td>{o.CreatedAt ? new Date(o.CreatedAt).toLocaleString('en-US') : '-'}</td>
                    <td>
                      <div>{o.CustomerName || '-'}</div>
                      <small>{o.CustomerPhone || '-'}</small>
                    </td>
                    <td>{o.CustomerAddress || '-'}</td>
                    <td>{formatVnd(o.DiscountAmount || 0)} VND</td>
                    <td>{formatVnd(o.Total)} VND</td>
                    <td><span className="portal-invPill">{normalizeDisplayStatus(o.Status)}</span></td>
                    <td>{o.PaymentMethod || '-'}</td>
                    <td>
                      <button type="button" className="portal-ghostBtn" onClick={() => openEditOrder(o)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <PortalModal
        open={openOrderModal}
        title={orderEditing?.OrderId ? `Update order ${orderEditing.OrderCode || orderEditing.OrderId}` : 'Update order'}
        onClose={() => setOpenOrderModal(false)}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={() => setOpenOrderModal(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="portal-modalBtn"
              onClick={() => onDeleteOrder(orderEditing)}
              disabled={!orderEditing?.OrderId || deletingOrderId === orderEditing?.OrderId || orderSaving}
            >
              {deletingOrderId === orderEditing?.OrderId ? 'Deleting...' : 'Delete order'}
            </button>
            <button type="submit" form="order-edit-form" className="portal-modalBtn portal-modalBtnPrimary" disabled={orderSaving}>
              {orderSaving ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      >
        <form id="order-edit-form" onSubmit={onSaveOrder}>
          <div className="portal-modalGrid2">
            <label className="portal-field">
              <span className="portal-label">Customer name</span>
              <input className="portal-input" value={orderForm.customerName} onChange={(e) => setOrderForm((p) => ({ ...p, customerName: e.target.value }))} />
            </label>
            <label className="portal-field">
              <span className="portal-label">Phone number</span>
              <input className="portal-input" value={orderForm.customerPhone} onChange={(e) => setOrderForm((p) => ({ ...p, customerPhone: e.target.value }))} />
            </label>
          </div>

          <label className="portal-field" style={{ marginTop: 12 }}>
            <span className="portal-label">Address</span>
            <textarea className="portal-textarea" value={orderForm.customerAddress} onChange={(e) => setOrderForm((p) => ({ ...p, customerAddress: e.target.value }))} />
          </label>

          <div className="portal-modalGrid2" style={{ marginTop: 8 }}>
            <label className="portal-field">
              <span className="portal-label">Payment method</span>
              <select className="portal-select" value={orderForm.paymentMethod} onChange={(e) => setOrderForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                <option value="COD">COD</option>
                <option value="ONLINE">ONLINE</option>
              </select>
            </label>
            <label className="portal-field">
              <span className="portal-label">Order status</span>
              <select className="portal-select" value={orderForm.status} onChange={(e) => setOrderForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="Pending">Pending</option>
                <option value="Processing">Processing</option>
                <option value="Shipping">Shipping</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Failed">Failed</option>
              </select>
            </label>
          </div>

          <PortalCard title="Product details" style={{ marginTop: 12 }}>
            <div className="portal-tableWrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {(orderEditing?.Items || []).map((item) => (
                    <tr key={item.OrderItemId || `${item.ProductId}-${item.ProductName}`}>
                      <td>{item.ProductName || item.ProductId}</td>
                      <td>{Number(item.Quantity || 0)}</td>
                      <td>{formatVnd(item.Price || 0)} VND</td>
                      <td>{formatVnd(item.LineTotal || 0)} VND</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PortalCard>
        </form>
      </PortalModal>

      <PortalModal
        open={openCreateOrderModal}
        title="Create Order"
        onClose={() => setOpenCreateOrderModal(false)}
        modalClassName="orders-createModal"
        bodyClassName="orders-createModalBody"
        footerClassName="orders-createModalFooter"
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={() => setOpenCreateOrderModal(false)}>
              Cancel
            </button>
            <button type="submit" form="order-create-form" className="portal-modalBtn portal-modalBtnPrimary" disabled={createOrderSaving}>
              {createOrderSaving ? 'Creating...' : 'Create order'}
            </button>
          </>
        }
      >
        <form id="order-create-form" onSubmit={onCreateOrder} className="orders-createForm">
          <div className="orders-createTopSection">
            <div className="portal-modalGrid2">
              <label className="portal-field">
                <span className="portal-label">Customer name</span>
                <input
                  className="portal-input"
                  value={createOrderForm.customerName}
                  onChange={(e) => setCreateOrderForm((p) => ({ ...p, customerName: e.target.value }))}
                />
              </label>
              <label className="portal-field">
                <span className="portal-label">Phone number</span>
                <input
                  className="portal-input"
                  value={createOrderForm.customerPhone}
                  onChange={(e) => setCreateOrderForm((p) => ({ ...p, customerPhone: e.target.value }))}
                />
              </label>
            </div>

            <label className="portal-field" style={{ marginTop: 12 }}>
              <span className="portal-label">Address</span>
              <textarea
                className="portal-textarea"
                value={createOrderForm.customerAddress}
                onChange={(e) => setCreateOrderForm((p) => ({ ...p, customerAddress: e.target.value }))}
              />
            </label>

            <div className="portal-modalGrid2" style={{ marginTop: 8 }}>
              <label className="portal-field">
                <span className="portal-label">Payment method</span>
                <select
                  className="portal-select"
                  value={createOrderForm.paymentMethod}
                  onChange={(e) => setCreateOrderForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                >
                  <option value="COD">COD</option>
                  <option value="CASH">CASH</option>
                  <option value="CARD">CARD</option>
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="ONLINE">ONLINE</option>
                </select>
              </label>
              <label className="portal-field">
                <span className="portal-label">Order status</span>
                <select
                  className="portal-select"
                  value={createOrderForm.status}
                  onChange={(e) => setCreateOrderForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="Pending">Pending</option>
                  <option value="Processing">Processing</option>
                  <option value="Shipping">Shipping</option>
                  <option value="Completed">Completed</option>
                </select>
              </label>
            </div>
          </div>

          <PortalCard title="Products" className="orders-createProductsCard">
            <div className="orders-createProductsBox">
              <div className="portal-tableWrap orders-createProductsTableWrap">
                <table className="portal-table orders-createProductsTable">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Line total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {createItems.map((line, idx) => {
                      const product = productsById.get(String(line.productId || ''))
                      const qty = Number(line.quantity || 0)
                      const unitPrice = Number(product?.price || 0)
                      const lineTotal = product && Number.isFinite(qty) && qty > 0 ? qty * unitPrice : 0
                      return (
                        <tr key={`line-${idx}`}>
                          <td>
                            <select
                              className="portal-select"
                              value={line.productId}
                              onChange={(e) => patchCreateItemLine(idx, { productId: e.target.value })}
                            >
                              <option value="">Select product</option>
                              {(products || [])
                                .filter((p) => Number(p.stock || 0) > 0)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} - {formatVnd(p.price)} VND (stock: {p.stock})
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="portal-input orders-createQtyInput"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => patchCreateItemLine(idx, { quantity: String(e.target.value || '').replace(/[^0-9]/g, '') })}
                            />
                          </td>
                          <td>{formatVnd(unitPrice)} VND</td>
                          <td>{formatVnd(lineTotal)} VND</td>
                          <td>
                            <button type="button" className="portal-ghostBtn danger" onClick={() => removeCreateItemLine(idx)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="portal-rowActions orders-createActions">
              <button type="button" className="portal-ghostBtn" onClick={addCreateItemLine}>
                + Add product line
              </button>
            </div>
          </PortalCard>

          <div className="orders-createTotal">Total: {formatVnd(createOrderTotal)} VND</div>
        </form>
      </PortalModal>
    </div>
  )
}
