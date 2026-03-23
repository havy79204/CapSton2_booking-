const express = require('express')
const controller = require('../../controllers/customer/commerce.controller')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

router.get('/context', requireAuth, controller.getCustomerContext)
router.get('/staff', requireAuth, controller.getStaff)
router.get('/addresses', requireAuth, controller.getAddresses)
router.post('/addresses', requireAuth, controller.postAddress)
router.put('/addresses/:addressId', requireAuth, controller.putAddress)
router.delete('/addresses/:addressId', requireAuth, controller.deleteAddress)
router.post('/addresses/:addressId/default', requireAuth, controller.postSetDefaultAddress)

router.get('/bookings', requireAuth, controller.getBookings)
router.post('/bookings', requireAuth, controller.postBooking)
router.post('/bookings/:bookingId/cancel', requireAuth, controller.postCancelBooking)
router.get('/orders', requireAuth, controller.getOrders)
router.post('/orders/:orderId/cancel', requireAuth, controller.postCancelOrder)

router.get('/cart', requireAuth, controller.getCart)
router.post('/cart/items', requireAuth, controller.postCartItem)
router.put('/cart/items/:cartItemId', requireAuth, controller.putCartItem)
router.delete('/cart/items/:cartItemId', requireAuth, controller.deleteCartItem)
router.delete('/cart/items', requireAuth, controller.deleteCartItems)
router.post('/cart/checkout', requireAuth, controller.postCeckout)

module.exports = router
