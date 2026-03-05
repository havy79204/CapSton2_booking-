import { apiFetch } from './apiClient'

export const api = {
  // Apply SalonGiftCard by Title as discount code
  checkGiftCardByTitle(title, amount = 0) {
    return apiFetch('/api/gift-cards/apply-title', {
      method: 'POST',
      body: JSON.stringify({ title, amount }),
    })
  },
  // Auth
  signup(payload) {
    return apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) })
  },
  login(payload) {
    return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) })
  },
  verifyEmail(token) {
    const qs = new URLSearchParams()
    qs.set('token', String(token || ''))
    return apiFetch(`/api/auth/verify-email?${qs.toString()}`)
  },
  resendVerification(payload) {
    return apiFetch('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify(payload) })
  },
  me() {
    return apiFetch('/api/auth/me')
  },
  forgotPassword(payload) {
    return apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) })
  },
  resetPassword(payload) {
    return apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateMe(payload) {
    return apiFetch('/api/auth/me', { method: 'PATCH', body: JSON.stringify(payload) })
  },
  changePassword(payload) {
    return apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify(payload) })
  },

  // Catalog
  listSalons() {
    return apiFetch('/api/salons')
  },
  listRoles() {
    return apiFetch('/api/roles')
  },
  getSalon(id) {
    return apiFetch(`/api/salons/${encodeURIComponent(id)}`)
  },
  listSalonProfiles() {
    return apiFetch('/api/salons/profiles')
  },
  getSalonProfile(salonId) {
    return apiFetch(`/api/salons/${encodeURIComponent(salonId)}/profile`)
  },
  // ...existing code...
  listSalonProductReviews(salonId) {
    return apiFetch(`/api/reviews/salons/${encodeURIComponent(salonId)}/products`)
  },
  deleteReview(id) {
    return apiFetch(`/api/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  listServiceTypes() {
    return apiFetch('/api/salons/service-types')
  },
  listSalonServices(salonId, { includeDraft = false } = {}) {
    const qs = new URLSearchParams()
    if (includeDraft) qs.set('includeDraft', 'true')
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/salons/${encodeURIComponent(salonId)}/services${suffix}`)
  },
  getSalonServiceRecipe(salonId, serviceTypeId) {
    return apiFetch(
      `/api/salons/${encodeURIComponent(salonId)}/services/${encodeURIComponent(serviceTypeId)}/recipe`,
    )
  },
  updateSalonServiceRecipe(salonId, serviceTypeId, payload) {
    return apiFetch(
      `/api/salons/${encodeURIComponent(salonId)}/services/${encodeURIComponent(serviceTypeId)}/recipe`,
      { method: 'PUT', body: JSON.stringify(payload) },
    )
  },

  checkGiftCard(code, amount = 0) {
    return apiFetch('/api/gift-cards/apply', {
      method: 'POST',
      body: JSON.stringify({ code, amount, mode: 'preview' }),
    })
  },
  redeemGiftCard(code, amount, refType, refId) {
    return apiFetch('/api/gift-cards/apply', {
      method: 'POST',
      body: JSON.stringify({ code, amount, mode: 'redeem', refType, refId }),
    })
  },

  // Portal: Salons
  createSalon(payload) {
    return apiFetch('/api/salons', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateSalon(id, payload) {
    return apiFetch(`/api/salons/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  deleteSalon(id) {
    return apiFetch(`/api/salons/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  upsertSalonProfile(salonId, payload) {
    return apiFetch(`/api/salons/${encodeURIComponent(salonId)}/profile`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  geocodeSalon(salonId) {
    return apiFetch(`/api/salons/${encodeURIComponent(salonId)}/geocode`, { method: 'POST' })
  },
  upsertSalonService(salonId, payload) {
    return apiFetch(`/api/salons/${encodeURIComponent(salonId)}/services`, { method: 'POST', body: JSON.stringify(payload) })
  },
  deleteSalonService(salonId, serviceTypeId) {
    return apiFetch(`/api/salons/${encodeURIComponent(salonId)}/services/${encodeURIComponent(serviceTypeId)}`, { method: 'DELETE' })
  },

  listProducts({ salonId, includeDraft = false } = {}) {
    const qs = new URLSearchParams()
    if (salonId) qs.set('salonId', salonId)
    if (includeDraft) qs.set('includeDraft', 'true')
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/products${suffix}`)
  },
  getProduct(id) {
    return apiFetch(`/api/products/${encodeURIComponent(id)}`)
  },
  createProduct(payload) {
    return apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateProduct(id, payload) {
    return apiFetch(`/api/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  deleteProduct(id) {
    return apiFetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  getProductsBulk(ids) {
    const qs = new URLSearchParams()
    qs.set('ids', ids.join(','))
    return apiFetch(`/api/products/bulk?${qs.toString()}`)
  },

  // Portal: Users
  listUsers({ salonId, role } = {}) {
    const qs = new URLSearchParams()
    if (salonId) qs.set('salonId', salonId)
    if (role) qs.set('role', role)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/users${suffix}`)
  },
  getUser(id) {
    return apiFetch(`/api/users/${encodeURIComponent(id)}`)
  },
  createUser(payload) {
    return apiFetch('/api/users', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateUser(id, payload) {
    return apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  deleteUser(id) {
    return apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  // Portal: Inventory
  listInventoryItems({ salonKey } = {}) {
    const qs = new URLSearchParams()
    if (salonKey) qs.set('salonKey', salonKey)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/inventory/items${suffix}`)
  },
  upsertInventoryItem(payload) {
    return apiFetch('/api/inventory/items', { method: 'POST', body: JSON.stringify(payload) })
  },
  listInventoryTransactions({ salonKey, limit } = {}) {
    const qs = new URLSearchParams()
    if (salonKey) qs.set('salonKey', salonKey)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/inventory/transactions${suffix}`)
  },
  createInventoryTransaction(payload) {
    return apiFetch('/api/inventory/transactions', { method: 'POST', body: JSON.stringify(payload) })
  },
  createExternalPO(payload) {
    return apiFetch('/api/inventory/external-pos', { method: 'POST', body: JSON.stringify(payload) })
  },

  // Portal: Schedule
  getStaffAvailability({ staffId, weekStartISO, startHour, endHour } = {}) {
    const qs = new URLSearchParams()
    if (staffId) qs.set('staffId', staffId)
    if (weekStartISO) qs.set('weekStartISO', weekStartISO)
    if (startHour !== undefined && startHour !== null) qs.set('startHour', String(startHour))
    if (endHour !== undefined && endHour !== null) qs.set('endHour', String(endHour))
    return apiFetch(`/api/schedule/availability?${qs.toString()}`)
  },
  setStaffAvailability(payload) {
    return apiFetch('/api/schedule/availability', { method: 'PUT', body: JSON.stringify(payload) })
  },
  listShifts({ salonId, weekStartISO } = {}) {
    const qs = new URLSearchParams()
    if (salonId) qs.set('salonId', salonId)
    if (weekStartISO) qs.set('weekStartISO', weekStartISO)
    return apiFetch(`/api/schedule/shifts?${qs.toString()}`)
  },
  createShift(payload) {
    return apiFetch('/api/schedule/shifts', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateShift(id, payload) {
    return apiFetch(`/api/schedule/shifts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  deleteShift(id) {
    return apiFetch(`/api/schedule/shifts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  autoGenerateShifts(payload) {
    return apiFetch('/api/schedule/auto-generate', { method: 'POST', body: JSON.stringify(payload || {}) })
  },

  // Public: staff availability for booking
  listPublicAvailability({ salonId, dateISO } = {}) {
    const qs = new URLSearchParams()
    if (salonId) qs.set('salonId', salonId)
    if (dateISO) qs.set('dateISO', dateISO)
    return apiFetch(`/api/schedule/public/availability?${qs.toString()}`)
  },

  // Portal: Time clock + tips
  listTimeLogs({ staffId } = {}) {
    const qs = new URLSearchParams()
    if (staffId) qs.set('staffId', staffId)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/time/logs${suffix}`)
  },
  createTimeLog(payload) {
    return apiFetch('/api/time/logs', { method: 'POST', body: JSON.stringify(payload) })
  },
  listTipLogs({ staffId } = {}) {
    const qs = new URLSearchParams()
    if (staffId) qs.set('staffId', staffId)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/time/tips${suffix}`)
  },
  createTipLog(payload) {
    return apiFetch('/api/time/tips', { method: 'POST', body: JSON.stringify(payload) })
  },

  // Bookings
  listBookings(params = {}) {
    const qs = new URLSearchParams()
    if (params.salonId) qs.set('salonId', params.salonId)
    if (params.dateISO) qs.set('dateISO', params.dateISO)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/bookings${suffix}`)
  },
  createBooking(payload) {
    return apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(payload) })
  },
  createBookingVnpayPayment(payload) {
    return apiFetch('/api/payments/vnpay/booking', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateBookingStatus(id, status) {
    return apiFetch(`/api/bookings/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  cancelBooking(id) {
    return apiFetch(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  // Orders
  listOrders(params = {}) {
    const qs = new URLSearchParams()
    if (params.userId) qs.set('userId', params.userId)
    if (params.email) qs.set('email', params.email)
    if (params.salonKey) qs.set('salonKey', params.salonKey)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/api/orders${suffix}`)
  },
  createOrder(payload) {
    return apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateOrderStatus(id, status) {
    return apiFetch(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  cancelOrder(id) {
    return apiFetch(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  // Gift cards
  listGiftCards({ salonId }) {
    if (!salonId) return Promise.resolve({ items: [] })
    return apiFetch(`/api/gift-cards/public/${encodeURIComponent(salonId)}`)
  },
  createGiftCard(payload) {
    return apiFetch('/api/gift-cards', { method: 'POST', body: JSON.stringify(payload) })
  },
  applyGiftCard(payload) {
    return apiFetch('/api/gift-cards/apply', { method: 'POST', body: JSON.stringify(payload) })
  },

  // Payments
  createVnpayPayment(payload) {
    return apiFetch('/api/payments/vnpay', { method: 'POST', body: JSON.stringify(payload) })
  },

  // Notifications
  getNotificationSettings() {
    return apiFetch('/api/notifications/settings')
  },
  updateNotificationSettings(payload) {
    return apiFetch('/api/notifications/settings', { method: 'PUT', body: JSON.stringify(payload) })
  },
  listNotifications() {
    return apiFetch('/api/notifications')
  },
  markNotificationsRead(ids) {
    return apiFetch('/api/notifications/read', { method: 'PATCH', body: JSON.stringify({ ids }) })
  },

  // Carts
  getCart(id) {
    return apiFetch(`/api/carts/${encodeURIComponent(id)}`)
  },
  createCart(payload) {
    return apiFetch('/api/carts', { method: 'POST', body: JSON.stringify(payload) })
  },
  getCartItems(cartId) {
    return apiFetch(`/api/carts/${encodeURIComponent(cartId)}/items`)
  },
  addCartItem(cartId, payload) {
    return apiFetch(`/api/carts/${encodeURIComponent(cartId)}/items`, { method: 'POST', body: JSON.stringify(payload) })
  },
  deleteCartItem(cartId, itemId) {
    return apiFetch(`/api/carts/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
  },

  // Reviews
  listSalonReviews(salonId) {
    return apiFetch(`/api/reviews/salons/${encodeURIComponent(salonId)}`)
  },
  createSalonReview(salonId, payload) {
    return apiFetch(`/api/reviews/salons/${encodeURIComponent(salonId)}`, { method: 'POST', body: JSON.stringify(payload) })
  },
  listProductReviews(productId) {
    return apiFetch(`/api/reviews/products/${encodeURIComponent(productId)}`)
  },
  createProductReview(productId, payload) {
    return apiFetch(`/api/reviews/products/${encodeURIComponent(productId)}`, { method: 'POST', body: JSON.stringify(payload) })
  },

  // Promotions (Admin)
  listPromotions() {
    return apiFetch('/api/promotions')
  },
  createPromotion(payload) {
    return apiFetch('/api/promotions', { method: 'POST', body: JSON.stringify(payload) })
  },
  updatePromotion(id, payload) {
    return apiFetch(`/api/promotions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  deletePromotion(id) {
    return apiFetch(`/api/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  // Messages
  listThreads(salonId) {
    return apiFetch(`/api/messages/threads?salonId=${encodeURIComponent(salonId)}`)
  },
  getOrCreateThread(payload) {
    return apiFetch('/api/messages/threads', { method: 'POST', body: JSON.stringify(payload) })
  },
  listMessages(threadId) {
    return apiFetch(`/api/messages/threads/${encodeURIComponent(threadId)}/messages`)
  },
  sendMessage(threadId, payload) {
    return apiFetch(`/api/messages/threads/${encodeURIComponent(threadId)}/messages`, { method: 'POST', body: JSON.stringify(payload) })
  },
}
export default api
