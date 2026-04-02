import React, { useCallback, useEffect, useMemo, useState } from 'react'
import PortalCard from '../../../components/Layout portal/PortalCard.jsx'
import PortalModal from '../../../components/Layout portal/PortalModal.jsx'
import { api } from '../../../lib/api.js'
import '../../../styles/orders.css'
import '../../../styles/global-buttons.css'

function formatVnd(value) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US')
}

function defaultFilters() {
  return {
    status: '',
    keyword: '',
    page: 1,
    pageSize: 10,
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
  if (filters.page) p.set('page', String(filters.page))
  if (filters.pageSize) p.set('pageSize', String(filters.pageSize))
  return p.toString()
}

function normalizeDisplayStatus(status) {
  const raw = String(status || '').trim().toLowerCase()
  if (!raw) return '-'
  if (raw === 'c') return 'Pending'
  return status
}

export default function StaffOrdersPage() {
  const [orderFilters, setOrderFilters] = useState(defaultFilters)
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [orderReport, setOrderReport] = useState({
    summary: { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, totalQuantity: 0, fromDate: null, toDate: null },
    items: [],
    pagination: { page: 1, pageSize: 10, totalRows: 0 },
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
  const [editItems, setEditItems] = useState([])
  const [products, setProducts] = useState([])

  const loadOrders = useCallback(async (nextFilters) => {
    try {
      setOrdersLoading(true)
      setOrdersError('')
      const qs = toOrderQueryString(nextFilters)
      const data = await api.get(`/api/staff/orders${qs ? `?${qs}` : ''}`)
      setOrderReport({
        summary: data?.summary || { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, totalQuantity: 0, fromDate: null, toDate: null },
        items: Array.isArray(data?.items) ? data.items : [],
        pagination: data?.pagination || { page: 1, pageSize: 10, totalRows: 0 },
      })
    } catch (err) {
      console.error(err)
      setOrdersError(err?.message || 'Unable to load order report')
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.get('/api/staff/products')
      setProducts(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setProducts([])
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

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

  function openEditOrder(order) {
    const realId = order?.Id || order?.id || order?.OrderId || order?.OrderCode
    if (!realId) return
    setOrderEditing({ ...order, OrderId: realId })
    setOrderForm({
      customerName: order.CustomerName || '',
      customerPhone: order.CustomerPhone || '',
      customerAddress: order.CustomerAddress || '',
      paymentMethod: order.PaymentMethod || 'COD',
      status: normalizeDisplayStatus(order.Status) === '-' ? 'Pending' : normalizeDisplayStatus(order.Status),
    })
    setEditItems(
      (order.Items || []).map((it) => ({
        orderItemId: it.OrderItemId || '',
        productId: String(it.ProductId || ''),
        productName: it.ProductName || '',
        quantity: String(Number(it.Quantity || 0) || 0),
      }))
    )
    setOpenOrderModal(true)
  }

  async function onSaveOrder(e) {
    e.preventDefault()
    if (!orderEditing?.OrderId) return

    try {
      setOrderSaving(true)
      const itemsPayload = (editItems || [])
        .map((l) => ({
          orderItemId: l.orderItemId || undefined,
          productId: String(l.productId || '').trim(),
          quantity: Number(l.quantity || 0) || 0,
        }))
        .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)

      await api.put(`/api/staff/orders/${orderEditing.OrderId}`, {
        customerName: orderForm.customerName,
        customerPhone: orderForm.customerPhone,
        customerAddress: orderForm.customerAddress,
        paymentMethod: orderForm.paymentMethod,
        status: orderForm.status,
        items: itemsPayload,
      })

      window.dispatchEvent(new CustomEvent('portal:success-modal', { 
        detail: { message: 'Order updated successfully', title: 'Completed' } 
      }))

      setOpenOrderModal(false)
      await loadOrders(orderFilters)
    } catch (err) {
      console.error(err)
      setOrdersError(err?.message || 'Unable to update order')
    } finally {
      setOrderSaving(false)
    }
  }

  return (
    <div className="orders-page">
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

      <PortalCard className="portal-invTableCard">
        <div className="portal-orderFilters">
          <label className="portal-field">
            <span className="portal-label">Status</span>
            <select className="portal-select" value={orderFilters.status} onChange={(e) => setOrderFilters((p) => ({ ...p, status: e.target.value }))}>
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Shipping">Shipping</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>

          <label className="portal-field">
            <span className="portal-label">Search</span>
            <input className="portal-input" placeholder="Order ID / customer name" value={orderFilters.keyword} onChange={(e) => setOrderFilters((p) => ({ ...p, keyword: e.target.value }))} />
          </label>
        </div>

        {ordersError ? <div className="portal-formError" role="alert">{ordersError}</div> : null}
        {ordersLoading ? <div className="portal-pageSubtitle">Loading...</div> : null}

        <div className="portal-tableWrap" style={{ marginTop: 8 }}>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Order date</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(orderReport.items || []).length === 0 ? (
                <tr><td colSpan={6}>No orders found.</td></tr>
              ) : (
                (orderReport.items || []).map((o) => {
                  const realId = o.Id || o.id || o.OrderId || o.OrderCode
                  return (
                    <tr key={realId} onClick={() => openEditOrder(o)} style={{ cursor: 'pointer' }}>
                      <td className="portal-invName">{realId}</td>
                      <td>{o.CreatedAt ? new Date(o.CreatedAt).toLocaleString('en-US') : '-'}</td>
                      <td>
                        <div>{o.CustomerName || '-'}</div>
                        <small>{o.CustomerPhone || '-'}</small>
                      </td>
                      <td>{formatVnd(o.Total)} VND</td>
                      <td><span className="portal-invPill">{normalizeDisplayStatus(o.Status)}</span></td>
                      <td>
                        <button type="button" className="portal-ghostBtn" onClick={() => openEditOrder(o)}>Edit</button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="orders-pagination">
          <button type="button" className="orders-paginationBtn" disabled={orderReport.pagination.page <= 1 || ordersLoading} onClick={() => setOrderFilters((p) => ({ ...p, page: Math.max(1, (p.page || 1) - 1) }))}>‹</button>
          <span className="orders-paginationText">Page {orderReport.pagination.page || 1}</span>
          <button type="button" className="orders-paginationBtn" disabled={ordersLoading} onClick={() => setOrderFilters((p) => ({ ...p, page: (p.page || 1) + 1 }))}>›</button>
        </div>
      </PortalCard>

      <PortalModal open={openOrderModal} title={orderEditing?.OrderId ? `Update order ${orderEditing.OrderCode || orderEditing.OrderId}` : 'Update order'} onClose={() => setOpenOrderModal(false)}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={() => setOpenOrderModal(false)}>Cancel</button>
            <button type="submit" form="order-edit-form" className="portal-modalBtn portal-modalBtnPrimary" disabled={orderSaving}>{orderSaving ? 'Saving...' : 'Save changes'}</button>
          </>
        }>
        <form id="order-edit-form" onSubmit={onSaveOrder}>
          <div className="portal-modalGrid2">
            <label className="portal-field"><span className="portal-label">Customer name</span><input className="portal-input" value={orderForm.customerName} onChange={(e) => setOrderForm((p) => ({ ...p, customerName: e.target.value }))} /></label>
            <label className="portal-field"><span className="portal-label">Phone number</span><input className="portal-input" value={orderForm.customerPhone} onChange={(e) => setOrderForm((p) => ({ ...p, customerPhone: e.target.value }))} /></label>
          </div>
          <label className="portal-field" style={{ marginTop: 12 }}><span className="portal-label">Address</span><textarea className="portal-textarea" value={orderForm.customerAddress} onChange={(e) => setOrderForm((p) => ({ ...p, customerAddress: e.target.value }))} /></label>
          <div className="portal-modalGrid2" style={{ marginTop: 8 }}>
            <label className="portal-field"><span className="portal-label">Payment method</span>
              <select className="portal-select" value={orderForm.paymentMethod} onChange={(e) => setOrderForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                <option value="COD">COD</option><option value="ONLINE">ONLINE</option>
              </select>
            </label>
            <label className="portal-field"><span className="portal-label">Order status</span>
              <select className="portal-select" value={orderForm.status} onChange={(e) => setOrderForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="Pending">Pending</option><option value="Processing">Processing</option><option value="Shipping">Shipping</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option>
              </select>
            </label>
          </div>
        </form>
      </PortalModal>
    </div>
  )
}
