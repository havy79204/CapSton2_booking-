const { asyncHandler } = require('../../utils/asyncHandler')
const commerceService = require('../../services/customerCommerce.service')

function getUserIdFromReq(req) {
  return String(req.user?.sub || '').trim()
}

function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  return String(req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '').trim()
}

function getFrontendOrigin(req) {
  const originHeader = String(req.headers?.origin || '').trim()
  if (originHeader) return originHeader

  const refererHeader = String(req.headers?.referer || '').trim()
  if (!refererHeader) return ''

  try {
    const u = new URL(refererHeader)
    return `${u.protocol}//${u.host}`
  } catch (_err) {
    return ''
  }
}

const getCustomerContext = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.getCustomerContext(userId)
  res.json({ ok: true, data })
})

const getStaff = asyncHandler(async (req, res) => {
  const serviceIds = String(req.query?.serviceIds || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const selectedDate = String(req.query?.date || '').trim()

  // Debug output can be silenced by setting environment variable `SILENT_LOGS=1`
  if (!(String(process.env.SILENT_LOGS || '').trim() === '1')) {
    console.log('[DEBUG] getStaff:', { serviceIds, selectedDate, query: req.query })
  }

  const data = await commerceService.listAvailableStaff(serviceIds, selectedDate)
  
  // Add no-cache headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  })
  
  res.json({ ok: true, data, debug: { selectedDate, serviceIds } })
})

const getAddresses = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.listAddresses(userId)
  res.json({ ok: true, data })
})

const postAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.upsertAddress(userId, req.body || {})
  res.status(201).json({ ok: true, data })
})

const putAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { addressId } = req.params || {}
  const data = await commerceService.upsertAddress(userId, req.body || {}, addressId)
  res.json({ ok: true, data })
})

const deleteAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { addressId } = req.params || {}
  const data = await commerceService.deleteAddress(userId, addressId)
  res.json({ ok: true, data })
})

const postSetDefaultAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { addressId } = req.params || {}
  const data = await commerceService.setDefaultAddress(userId, addressId)
  res.json({ ok: true, data })
})

const getBookings = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
  const data = await commerceService.listBookings(userId, limit)
  res.json({ ok: true, data })
})

const postBooking = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  console.log('[DEBUG CONTROLLER] postBooking called with body:', req.body)
  try {
    const data = await commerceService.createBooking(userId, req.body || {}, {
      ipAddress: getClientIp(req),
      frontendOrigin: getFrontendOrigin(req),
    })
    console.log('[DEBUG CONTROLLER] Booking created successfully:', data)
    res.status(201).json({ ok: true, data })
  } catch (error) {
    console.error('[DEBUG CONTROLLER] Error creating booking:', error.message, 'status:', error.status)
    const statusCode = error.status || 500
    res.status(statusCode).json({ ok: false, error: error.message })
  }
})

const getOrders = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
  const data = await commerceService.listOrders(userId, limit)
  res.json({ ok: true, data })
})

const postCancelBooking = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { bookingId } = req.params || {}
  const data = await commerceService.cancelBooking(userId, bookingId)
  res.json({ ok: true, data })
})

const postBookingRating = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { bookingId, rating, comment, images, imageDataUrls, reviewImages } = req.body || {}
  const data = await commerceService.rateBooking(
    userId,
    bookingId,
    rating,
    comment,
    images || imageDataUrls || reviewImages,
  )
  res.status(201).json({ ok: true, data })
})

const postBookingServiceRating = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { bookingId, bookingServiceId } = req.params || {}
  const { rating, comment, images, imageDataUrls, reviewImages } = req.body || {}
  const data = await commerceService.rateBookingService(
    userId,
    bookingId,
    bookingServiceId,
    rating,
    comment,
    images || imageDataUrls || reviewImages,
  )
  res.status(201).json({ ok: true, data })
})

const postOrderRating = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId, rating, comment, images, imageDataUrls, reviewImages } = req.body || {}
  const data = await commerceService.rateOrder(
    userId,
    orderId,
    rating,
    comment,
    images || imageDataUrls || reviewImages,
  )
  res.status(201).json({ ok: true, data })
})

const postOrderItemRating = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId, orderItemId } = req.params || {}
  const { rating, comment, images, imageDataUrls, reviewImages } = req.body || {}
  const data = await commerceService.rateOrderItem(
    userId,
    orderId,
    orderItemId,
    rating,
    comment,
    images || imageDataUrls || reviewImages,
  )
  res.status(201).json({ ok: true, data })
})

const postCancelOrder = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId } = req.params || {}
  const data = await commerceService.cancelOrder(userId, orderId)
  res.json({ ok: true, data })
})

const getCart = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.getCart(userId)
  res.json({ ok: true, data })
})

const postCartItem = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.addCartItem(userId, req.body || {})
  res.status(201).json({ ok: true, data })
})

const putCartItem = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { cartItemId } = req.params || {}
  const data = await commerceService.updateCartItem(userId, cartItemId, req.body || {})
  res.json({ ok: true, data })
})

const deleteCartItem = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { cartItemId } = req.params || {}
  const data = await commerceService.removeCartItem(userId, cartItemId)
  res.json({ ok: true, data })
})

const deleteCartItems = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.clearCart(userId)
  res.json({ ok: true, data })
})

const postCeckout = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.checkoutCart(userId, req.body || {}, {
    ipAddress: getClientIp(req),
    frontendOrigin: getFrontendOrigin(req),
  })
  res.status(201).json({ ok: true, data })
})

module.exports = {
  getCustomerContext,
  getStaff,
  getAddresses,
  postAddress,
  putAddress,
  deleteAddress,
  postSetDefaultAddress,
  getBookings,
  postBooking,
  postBookingRating,
  postBookingServiceRating,
  postOrderRating,
  postOrderItemRating,
  getOrders,
  postCancelBooking,
  postCancelOrder,
  getCart,
  postCartItem,
  putCartItem,
  deleteCartItem,
  deleteCartItems,
  postCeckout,
}