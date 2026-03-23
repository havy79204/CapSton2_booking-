const { asyncHandler } = require('../../utils/asyncHandler')
const commerceService = require('../../services/customerCommerce.service')

function getUserIdFromReq(req) {
  return String(req.user?.sub || '').trim()
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

  const data = await commerceService.listAvailableStaff(serviceIds)
  res.json({ ok: true, data })
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
  const data = await commerceService.createBooking(userId, req.body || {})
  res.status(201).json({ ok: true, data })
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
  const data = await commerceService.checkoutCart(userId, req.body || {})
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
