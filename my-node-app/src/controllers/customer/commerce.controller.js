const { asyncHandler } = require('../../utils/asyncHandler')
const commerceService = require('../../services/customerCommerce.service')
const { sanitizeCustomerResponse } = require('./responseSanitizer')

function getUserIdFromReq(req) {
  const raw = req.userId
    || req.user?.sub
    || req.user?.userId
    || req.user?.UserId
    || req.user?.id
    || req.user?.uid
    || ''
  return String(raw).trim()
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

function mapAddressDto(address) {
  if (!address || typeof address !== 'object') return null
  return {
    AddressId: address.AddressId || null,
    FullName: address.FullName || '',
    AddressLine: address.AddressLine || '',
    City: address.City || '',
    Country: address.Country || '',
    IsDefault: Boolean(address.IsDefault),
  }
}

function mapBookingSettingsDto(settings) {
  if (!settings || typeof settings !== 'object') return {}
  return {
    openTime: settings.openTime || '08:00',
    closeTime: settings.closeTime || '20:00',
    breakStart: settings.breakStart || null,
    breakEnd: settings.breakEnd || null,
    slotMinutes: Number(settings.slotMinutes || 30),
    promotionEnabled: Boolean(settings.promotionEnabled),
    promotionAllowCustomerApply: settings.promotionAllowCustomerApply !== false,
    promotionIsStackable: Boolean(settings.promotionIsStackable),
    promotions: Array.isArray(settings.promotions) ? settings.promotions : [],
    weekdays: settings.weekdays && typeof settings.weekdays === 'object' ? settings.weekdays : {},
  }
}

function mapContextDto(raw) {
  const sanitized = sanitizeCustomerResponse(raw || {})
  const user = sanitized.user || {}
  return {
    user: {
      Name: user.Name || '',
      AvatarUrl: user.AvatarUrl || null,
      RoleKey: user.RoleKey || null,
      Status: user.Status || null,
    },
    defaultAddress: mapAddressDto(sanitized.defaultAddress),
    bookingSettings: mapBookingSettingsDto(sanitized.bookingSettings),
  }
}

function mapProfileDto(raw) {
  const sanitized = sanitizeCustomerResponse(raw || {})
  const user = raw?.user || {}
  return {
    user: {
      Name: user.Name || '',
      Email: user.Email || '',
      Phone: user.Phone || '',
      AvatarUrl: user.AvatarUrl || null,
      RoleKey: user.RoleKey || null,
      Status: user.Status || null,
    },
    defaultAddress: mapAddressDto(sanitized.defaultAddress),
    bookingSettings: mapBookingSettingsDto(sanitized.bookingSettings),
  }
}

function mapStaffDto(list) {
  const sanitized = sanitizeCustomerResponse(Array.isArray(list) ? list : [])
  return sanitized.map((item) => ({
    StaffId: item.StaffId || null,
    Name: item.Name || '',
    Specialty: item.Specialty || '',
    AvatarUrl: item.AvatarUrl || null,
    BookedSlots: Array.isArray(item.BookedSlots) ? item.BookedSlots : [],
    WorkingHours: item.WorkingHours || null,
  }))
}

function mapCartDto(raw) {
  const sanitized = sanitizeCustomerResponse(raw || {})
  const summary = sanitized.Summary || {}
  const items = Array.isArray(sanitized.Items) ? sanitized.Items : []
  return {
    CartId: sanitized.CartId || null,
    Customer: {
      Name: sanitized.Customer?.Name || '',
      AvatarUrl: sanitized.Customer?.AvatarUrl || null,
    },
    Items: items.map((item) => ({
      CartItemId: item.CartItemId || null,
      ProductId: item.ProductId || null,
      VariantId: item.VariantId || null,
      VariantName: item.VariantName || null,
      Quantity: Number(item.Quantity || 0),
      Name: item.Name || '',
      Description: item.Description || '',
      Price: Number(item.Price || 0),
      ImageUrl: item.ImageUrl || null,
      Stock: Number(item.Stock || 0),
      CategoryId: item.CategoryId || null,
      LineTotal: Number(item.LineTotal || 0),
      VariantOptions: Array.isArray(item.VariantOptions) ? item.VariantOptions : [],
    })),
    Summary: {
      ItemCount: Number(summary.ItemCount || 0),
      QuantityCount: Number(summary.QuantityCount || 0),
      Subtotal: Number(summary.Subtotal || 0),
    },
    DefaultAddress: mapAddressDto(sanitized.DefaultAddress),
  }
}

const getCustomerContext = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.getCustomerContext(userId)
  res.json({ data: mapContextDto(data) })
})

const getCustomerProfileFull = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.getCustomerContext(userId)
  res.json({ data: mapProfileDto(data) })
})

const getStaff = asyncHandler(async (req, res) => {
  const serviceIds = String(req.query?.serviceIds || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const selectedDate = String(req.query?.date || '').trim()

  const shouldDebugStaff = process.env.NODE_ENV !== 'production'
    && String(process.env.DEBUG_CUSTOMER_STAFF || '').trim() === '1'
  if (shouldDebugStaff) {
    console.log('[DEBUG] getStaff:', { serviceIds, selectedDate, query: req.query })
  }

  const data = await commerceService.listAvailableStaff(serviceIds, selectedDate)
  
  // Add no-cache headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  })

  res.json({ data: mapStaffDto(data) })
})

const getAddresses = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.listAddresses(userId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const postAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.upsertAddress(userId, req.body || {})
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

const putAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { addressId } = req.params || {}
  const data = await commerceService.upsertAddress(userId, req.body || {}, addressId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const deleteAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { addressId } = req.params || {}
  const data = await commerceService.deleteAddress(userId, addressId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const postSetDefaultAddress = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { addressId } = req.params || {}
  const data = await commerceService.setDefaultAddress(userId, addressId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const getBookings = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
  const data = await commerceService.listBookings(userId, limit)
  res.json({ data: sanitizeCustomerResponse(data) })
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
    res.status(201).json({ data: sanitizeCustomerResponse(data) })
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
  res.json({ data: sanitizeCustomerResponse(data) })
})

const postCancelBooking = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { bookingId } = req.params || {}
  const data = await commerceService.cancelBooking(userId, bookingId)
  res.json({ data: sanitizeCustomerResponse(data) })
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
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
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
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
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
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
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
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

const postCancelOrder = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId } = req.params || {}
  const data = await commerceService.cancelOrder(userId, orderId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const patchCancelOrder = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId } = req.params || {}
  const data = await commerceService.cancelOrder(userId, orderId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const patchCompleteOrder = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId } = req.params || {}
  const data = await commerceService.completeOrder(userId, orderId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const postCompleteOrder = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId } = req.params || {}
  const data = await commerceService.completeOrder(userId, orderId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const postReorderOrder = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { orderId } = req.params || {}
  const data = await commerceService.reorderOrder(userId, orderId)
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

const getCart = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.getCart(userId)
  res.json({ data: mapCartDto(data) })
})

const postCartItem = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.addCartItem(userId, req.body || {})
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

const putCartItem = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { cartItemId } = req.params || {}
  const data = await commerceService.updateCartItem(userId, cartItemId, req.body || {})
  res.json({ data: sanitizeCustomerResponse(data) })
})

const deleteCartItem = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const { cartItemId } = req.params || {}
  const data = await commerceService.removeCartItem(userId, cartItemId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const deleteCartItems = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.clearCart(userId)
  res.json({ data: sanitizeCustomerResponse(data) })
})

const postCeckout = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await commerceService.checkoutCart(userId, req.body || {}, {
    ipAddress: getClientIp(req),
    frontendOrigin: getFrontendOrigin(req),
  })
  res.status(201).json({ data: sanitizeCustomerResponse(data) })
})

module.exports = {
  getCustomerContext,
  getCustomerProfileFull,
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
  patchCancelOrder,
  patchCompleteOrder,
  postCompleteOrder,
  postReorderOrder,
  getCart,
  postCartItem,
  putCartItem,
  deleteCartItem,
  deleteCartItems,
  postCeckout,
}