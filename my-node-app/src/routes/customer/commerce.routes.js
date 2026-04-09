const express = require('express')
const controller = require('../../controllers/customer/commerce.controller')
const { requireAuth } = require('../../middleware/auth')
const { query } = require('../../config/query')

const router = express.Router()

// Temporary debug endpoint to check StaffAvailability data
router.get('/debug/staff-availability', requireAuth, async (req, res) => {
  try {
    const staffId = String(req.query?.staffId || '').trim()
    const checkDate = String(req.query?.date || '').trim()
    
    if (!staffId) {
      return res.status(400).json({ error: 'Missing staffId' })
    }
    
    // Get all shifts for this staff
    const allShifts = await query(
      `SELECT 
        StaffId, 
        WeekStartDate,
        CAST(WeekStartDate AS DATE) as DateOnly,
        StartHour, 
        EndHour,
        CONVERT(VARCHAR, WeekStartDate, 120) as DateString
       FROM StaffAvailability
       WHERE StaffId = @staffId
       ORDER BY WeekStartDate`,
      { staffId }
    )
    
    // Check specific date with different methods
    let specificDateCheck = null
    if (checkDate) {
      specificDateCheck = await query(
        `SELECT 
          StaffId,
          WeekStartDate,
          CAST(WeekStartDate AS DATE) as DateCast,
          CONVERT(DATE, WeekStartDate) as DateConverted,
          StartHour,
          EndHour
         FROM StaffAvailability
         WHERE StaffId = @staffId
           AND CAST(WeekStartDate AS DATE) = @checkDate`,
        { staffId, checkDate }
      )
    }
    
    res.json({
      staffId,
      checkDate,
      allShifts: allShifts.recordset,
      specificDateCheck: specificDateCheck?.recordset || null,
      serverTime: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
router.post('/bookings/rating', requireAuth, controller.postBookingRating)
router.post('/bookings/:bookingId/services/:bookingServiceId/rating', requireAuth, controller.postBookingServiceRating)
router.get('/orders', requireAuth, controller.getOrders)
router.post('/orders/rating', requireAuth, controller.postOrderRating)
router.post('/orders/:orderId/items/:orderItemId/rating', requireAuth, controller.postOrderItemRating)
router.post('/orders/:orderId/cancel', requireAuth, controller.postCancelOrder)

router.get('/cart', requireAuth, controller.getCart)
router.post('/cart/items', requireAuth, controller.postCartItem)
router.put('/cart/items/:cartItemId', requireAuth, controller.putCartItem)
router.delete('/cart/items/:cartItemId', requireAuth, controller.deleteCartItem)
router.delete('/cart/items', requireAuth, controller.deleteCartItems)
router.post('/cart/checkout', requireAuth, controller.postCeckout)

module.exports = router
