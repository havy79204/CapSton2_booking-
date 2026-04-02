const crypto = require('crypto')
const { query } = require('../config/query')
const { env } = require('../config/config')
const { upsertPaymentRecord, resolveInvoiceIdForPayment } = require('../services/paymentPersistence.service')
const { notifyCustomerEvent, notifyOwnerEvent, scheduleBookingReminders } = require('../services/notifications.service')
const { getFrontendOriginForTxnRef, normalizeFrontendOrigin } = require('../services/vnpayFrontendReturnStore.service')

async function notifyPaymentResult(orderIdInput, isSuccess, reason = '') {
  const referenceId = String(orderIdInput || '').trim()
  if (!referenceId) return

  try {
    const orderRes = await query(
      `SELECT TOP 1 OrderId, UserId
       FROM Orders
       WHERE OrderId = @orderId`,
      { orderId: referenceId },
    )

    const order = orderRes.recordset?.[0] || null
    if (order) {
      const userId = String(order.UserId || '').trim()
      if (!userId) return

      await notifyCustomerEvent({
        userId,
        orderId: referenceId,
        event: isSuccess ? 'payment_success' : 'payment_failed',
        payload: { orderId: referenceId, reason },
      })

      await notifyOwnerEvent({
        event: isSuccess ? 'payment_success' : 'payment_failed',
        orderId: referenceId,
        payload: { reason },
      })

      return
    }

    const bookingRes = await query(
      `SELECT TOP 1 BookingId, CustomerUserId
       FROM Bookings
       WHERE BookingId = @bookingId`,
      { bookingId: referenceId },
    )

    const booking = bookingRes.recordset?.[0] || null
    if (!booking) return

    const bookingUserId = String(booking.CustomerUserId || '').trim()
    if (!bookingUserId) return

    await notifyCustomerEvent({
      userId: bookingUserId,
      bookingId: referenceId,
      event: isSuccess ? 'payment_success' : 'payment_failed',
      payload: { bookingId: referenceId, reason },
    })

    await notifyOwnerEvent({
      event: isSuccess ? 'payment_success' : 'payment_failed',
      bookingId: referenceId,
      payload: { reason },
    })
  } catch (err) {
    console.warn('[payment] notify payment result failed:', err?.message || err)
  }
}

async function notifySuccessCreationEvents(referenceId, { orderResult, bookingResult }) {
  try {
    if (orderResult?.changed) {
      const orderId = String(orderResult.orderId || referenceId || '').trim()
      const userId = String(orderResult.userId || '').trim()

      if (userId && orderId) {
        await notifyCustomerEvent({
          userId,
          event: 'order_created',
          orderId,
          payload: { orderId },
        })
      }

      if (orderId) {
        await notifyOwnerEvent({
          event: 'order_new',
          orderId,
        })
      }
    }

    if (bookingResult?.changed) {
      const bookingId = String(bookingResult.bookingId || referenceId || '').trim()
      const userId = String(bookingResult.userId || '').trim()

      if (userId && bookingId) {
        await notifyCustomerEvent({
          userId,
          event: 'booking_created',
          bookingId,
          payload: { bookingTime: bookingResult.bookingTime || null },
        })

        await scheduleBookingReminders({
          userId,
          bookingId,
          bookingTime: bookingResult.bookingTime || null,
        })
      }

      if (bookingId) {
        await notifyOwnerEvent({
          event: 'booking_new',
          bookingId,
          payload: { bookingTime: bookingResult.bookingTime || null },
        })
      }
    }
  } catch (err) {
    console.warn('[payment] notify success creation event failed:', err?.message || err)
  }
}

async function finalizeOrderAfterSuccessfulPayment(orderId, userId) {
  const safeOrderId = String(orderId || '').trim()
  const safeUserId = String(userId || '').trim()
  if (!safeOrderId || !safeUserId) return

  const itemsRes = await query(
    `SELECT ProductId, Quantity
     FROM OrderItems
     WHERE OrderId = @orderId`,
    { orderId: safeOrderId },
  )

  const items = itemsRes.recordset || []
  for (const item of items) {
    const productId = String(item.ProductId || '').trim()
    const quantity = Math.max(0, Number(item.Quantity || 0))
    if (!productId || quantity <= 0) continue

    // Remove ordered quantity from cart only after payment is confirmed.
    let remaining = quantity
    const cartRows = await query(
      `SELECT ci.CartItemId, ci.Quantity
       FROM CartItems ci
       INNER JOIN Cart c ON c.CartId = ci.CartId
       WHERE c.UserId = @userId
         AND ci.ProductId = @productId
       ORDER BY ci.CartItemId`,
      {
        userId: safeUserId,
        productId,
      },
    )

    for (const row of cartRows.recordset || []) {
      if (remaining <= 0) break

      const cartItemId = String(row.CartItemId || '').trim()
      const cartQty = Math.max(0, Number(row.Quantity || 0))
      if (!cartItemId || cartQty <= 0) continue

      if (cartQty <= remaining) {
        await query('DELETE FROM CartItems WHERE CartItemId = @cartItemId', { cartItemId })
        remaining -= cartQty
      } else {
        await query(
          `UPDATE CartItems
           SET Quantity = @quantity
           WHERE CartItemId = @cartItemId`,
          {
            quantity: cartQty - remaining,
            cartItemId,
          },
        )
        remaining = 0
      }
    }
  }
}

async function deleteOrderAfterPaymentFailure(orderId) {
  const safeOrderId = String(orderId || '').trim()
  if (!safeOrderId) return

  await query('DELETE FROM OrderItems WHERE OrderId = @orderId', { orderId: safeOrderId })
  await query('DELETE FROM Orders WHERE OrderId = @orderId', { orderId: safeOrderId })
}

async function deleteBookingAfterPaymentFailure(bookingId) {
  const safeBookingId = String(bookingId || '').trim()
  if (!safeBookingId) return

  await query('DELETE FROM BookingServices WHERE BookingId = @bookingId', { bookingId: safeBookingId })
  await query('DELETE FROM Bookings WHERE BookingId = @bookingId', { bookingId: safeBookingId })
}

async function applyOrderPaymentResult(orderIdInput, isSuccess) {
  const orderId = String(orderIdInput || '').trim()
  if (!orderId) return { exists: false, changed: false, orderId: '', userId: '' }

  const orderRes = await query(
    `SELECT TOP 1 OrderId, UserId, PaymentMethod, ISNULL(Status, 'pending') AS Status
     FROM Orders
     WHERE OrderId = @orderId`,
    { orderId },
  )

  const order = orderRes.recordset?.[0]
  if (!order) {
    return { exists: false, changed: false, orderId: '', userId: '' }
  }

  const currentStatus = String(order.Status || '').trim().toLowerCase()
  const userId = String(order.UserId || '').trim()
  const paymentMethod = String(order.PaymentMethod || '').trim().toLowerCase()
  const isOnlineOrder = paymentMethod === 'online'
  let changed = false

  if (isSuccess) {
    if (currentStatus === 'pending' || currentStatus === 'awaiting' || currentStatus === 'c' || currentStatus === 'failed') {
      if (isOnlineOrder) {
        await finalizeOrderAfterSuccessfulPayment(orderId, userId)
      }

      await query(
        `UPDATE Orders
         SET Status = @status
         WHERE OrderId = @orderId`,
        {
          status: 'Confirmed',
          orderId,
        },
      )
      changed = true
    }
  } else if (currentStatus === 'pending' || currentStatus === 'awaiting' || currentStatus === 'c') {
    if (isOnlineOrder) {
      await deleteOrderAfterPaymentFailure(orderId)
      changed = false
      return {
        exists: false,
        changed,
        orderId,
        userId,
      }
    }

    await query(
      `UPDATE Orders
       SET Status = @status
       WHERE OrderId = @orderId`,
      {
        status: 'Failed',
        orderId,
      },
    )
    changed = true
  }

  return {
    exists: true,
    changed,
    orderId,
    userId,
  }
}

async function applyBookingPaymentResult(orderIdInput, isSuccess) {
  const bookingId = String(orderIdInput || '').trim()
  if (!bookingId) return { exists: false, changed: false, bookingId: '', userId: '', bookingTime: null }

  const bookingRes = await query(
    `SELECT TOP 1 BookingId, CustomerUserId, BookingTime, ISNULL(Status, 'pending') AS Status
     FROM Bookings
     WHERE BookingId = @bookingId`,
    { bookingId },
  )

  const booking = bookingRes.recordset?.[0]
  if (!booking) return { exists: false, changed: false, bookingId: '', userId: '', bookingTime: null }

  const currentStatus = String(booking.Status || '').trim().toLowerCase()
  const userId = String(booking.CustomerUserId || '').trim()
  let changed = false

  if (isSuccess && (currentStatus === 'pending' || currentStatus === 'awaiting' || currentStatus === 'c')) {
    await query(
      `UPDATE Bookings
       SET Status = @status
       WHERE BookingId = @bookingId`,
      {
        status: 'booked',
        bookingId,
      },
    )
    changed = true
  } else if (!isSuccess && (currentStatus === 'pending' || currentStatus === 'awaiting' || currentStatus === 'c')) {
    await deleteBookingAfterPaymentFailure(bookingId)
    return {
      exists: false,
      changed: false,
      bookingId,
      userId,
      bookingTime: booking.BookingTime || null,
    }
  }

  return {
    exists: true,
    changed,
    bookingId,
    userId,
    bookingTime: booking.BookingTime || null,
  }
}

async function persistVnpayResult({ orderId, amount, transactionId, status }) {
  try {
    const invoiceId = await resolveInvoiceIdForPayment({
      orderId,
      amount,
    })

    if (!invoiceId) {
      console.warn(`[VNPAY] Skip payment persistence: unable to resolve invoice for ${orderId}`)
      return
    }

    await upsertPaymentRecord({
      invoiceId,
      amount,
      paymentMethod: 'VNPAY',
      status,
      transactionCode: transactionId,
      paidAt: status === 'Paid' ? new Date() : null,
    })
  } catch (err) {
    console.warn('[VNPAY] Payment persistence warning:', err?.message || err)
  }
}

function buildFrontendReturnUrl(params = {}, txnRef = '') {
  const originFromTxn = getFrontendOriginForTxnRef(txnRef)

  if (originFromTxn) {
    const base = `${originFromTxn}/payment/vnpay-return`
    try {
      const u = new URL(base)
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return
        u.searchParams.set(key, String(value))
      })
      return u.toString()
    } catch (_err) {
      // Fallback to env-defined frontend return URL below.
    }
  }

  const envBase = String(env.vnpay?.frontendReturnUrl || '').trim()
  const normalizedEnvOrigin = normalizeFrontendOrigin(envBase)
  const fallbackBase = normalizedEnvOrigin ? `${normalizedEnvOrigin}/payment/vnpay-return` : envBase
  if (!fallbackBase) return ''

  try {
    const u = new URL(fallbackBase)
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      u.searchParams.set(key, String(value))
    })
    return u.toString()
  } catch (_err) {
    return ''
  }
}

function sortVnpayObject(obj) {
  return Object.keys(obj || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = encodeURIComponent(String(obj[key] ?? '')).replace(/%20/g, '+')
      return acc
    }, {})
}

function buildRawHashData(sortedPayload) {
  return Object.keys(sortedPayload)
    .map((key) => `${key}=${String(sortedPayload[key] ?? '')}`)
    .join('&')
}

/**
 * VNPAY Return/Callback Handler
 * Receives payment result from VNPAY after customer completes payment
 */
async function vnpayReturn(req, res) {
  try {
    console.log('[VNPAY] Callback received:', req.query)

    // Get all params from query
    const params = { ...req.query }
    
    // Extract secure hash (checksum)
    const secureHash = params['vnp_SecureHash']
    delete params['vnp_SecureHash']
    delete params['vnp_SecureHashType']

    const sortedParams = sortVnpayObject(params)
    const queryString = buildRawHashData(sortedParams)

    const hmac = crypto
      .createHmac('sha512', env.vnpay.hashSecret)
      .update(queryString)
      .digest('hex')

    // Verify checksum
    if (String(hmac).toLowerCase() !== String(secureHash || '').toLowerCase()) {
      console.error('[VNPAY] Invalid secure hash')
      await notifyOwnerEvent({
        event: 'system_error',
        payload: { reason: 'VNPAY invalid secure hash callback detected.' },
      })
      const redirectUrl = buildFrontendReturnUrl({
        status: 'failed',
        code: 'INVALID_HASH',
      })
      if (redirectUrl) return res.redirect(302, redirectUrl)
      return res.status(400).json({
        success: false,
        message: 'Invalid secure hash',
        code: 'INVALID_HASH',
      })
    }

    // Check response code
    const responseCode = String(params['vnp_ResponseCode'] || '')
    const txnRef = String(params['vnp_TxnRef'] || '').trim()
    const transactionId = String(params['vnp_TransactionNo'] || txnRef || '')
    const orderId = String(params['vnp_OrderInfo'] || '').trim()
    const amount = Number(params['vnp_Amount'] || 0) / 100

    console.log(`[VNPAY] Transaction ${transactionId} for order ${orderId}:`, {
      responseCode,
      amount,
    })

    if (responseCode === '00') {
      // Payment successful
      console.log('[VNPAY] Payment successful!')
      await persistVnpayResult({ orderId, amount, transactionId, status: 'Paid' })
      const orderResult = await applyOrderPaymentResult(orderId, true)
      const bookingResult = await applyBookingPaymentResult(orderId, true)
      await notifyPaymentResult(orderId, true)
      await notifySuccessCreationEvents(orderId, { orderResult, bookingResult })
      const redirectUrl = buildFrontendReturnUrl({
        status: 'success',
        code: 'PAYMENT_SUCCESS',
        transactionId,
        orderId,
        amount,
      }, txnRef)
      if (redirectUrl) return res.redirect(302, redirectUrl)
      return res.json({
        success: true,
        message: 'Payment successful',
        code: 'PAYMENT_SUCCESS',
        transactionId,
        orderId,
        amount,
      })
    } else {
      // Payment failed
      console.warn(`[VNPAY] Payment failed with code: ${responseCode}`)
      await persistVnpayResult({ orderId, amount, transactionId, status: 'Failed' })
      const orderResult = await applyOrderPaymentResult(orderId, false)
      const bookingResult = await applyBookingPaymentResult(orderId, false)
      if (orderResult?.exists || bookingResult?.exists) {
        await notifyPaymentResult(orderId, false, `Payment failed with code ${responseCode}`)
      }
      const redirectUrl = buildFrontendReturnUrl({
        status: 'failed',
        code: `PAYMENT_FAILED_${responseCode}`,
        transactionId,
        orderId,
      }, txnRef)
      if (redirectUrl) return res.redirect(302, redirectUrl)
      return res.status(400).json({
        success: false,
        message: 'Payment failed',
        code: `PAYMENT_FAILED_${responseCode}`,
        transactionId,
        orderId,
      })
    }
  } catch (err) {
    console.error('[VNPAY] Error processing callback:', err)
    await notifyOwnerEvent({
      event: 'system_error',
      payload: { reason: `VNPAY callback error: ${err?.message || 'Unknown error'}` },
    })
    const redirectUrl = buildFrontendReturnUrl({
      status: 'failed',
      code: 'SERVER_ERROR',
    })
    if (redirectUrl) return res.redirect(302, redirectUrl)
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message,
    })
  }
}

/**
 * VNPAY IPN Handler (for async notifications)
 * Alternative endpoint that VNPAY can call for background notifications
 */
async function vnpayIpn(req, res) {
  try {
    console.log('[VNPAY IPN] Notification received:', req.body || req.query)

    const params = req.body || req.query
    const secureHash = params['vnp_SecureHash']

    const verifyParams = { ...params }
    delete verifyParams['vnp_SecureHash']
    delete verifyParams['vnp_SecureHashType']

    const sortedVerifyParams = sortVnpayObject(verifyParams)
    const queryString = buildRawHashData(sortedVerifyParams)

    const hmac = crypto
      .createHmac('sha512', env.vnpay.hashSecret)
      .update(queryString)
      .digest('hex')

    if (String(hmac).toLowerCase() !== String(secureHash || '').toLowerCase()) {
      console.error('[VNPAY IPN] Invalid secure hash')
      return res.status(400).json({ RspCode: '97', Message: 'Invalid secure hash' })
    }

    const responseCode = String(params['vnp_ResponseCode'] || '')
    const orderId = String(params['vnp_OrderInfo'] || '').trim()
    const transactionId = String(params['vnp_TransactionNo'] || params['vnp_TxnRef'] || '')
    const amount = Number(params['vnp_Amount'] || 0) / 100

    if (responseCode === '00') {
      await persistVnpayResult({ orderId, amount, transactionId, status: 'Paid' })
      const orderResult = await applyOrderPaymentResult(orderId, true)
      const bookingResult = await applyBookingPaymentResult(orderId, true)
      await notifyPaymentResult(orderId, true)
      await notifySuccessCreationEvents(orderId, { orderResult, bookingResult })
    } else {
      await persistVnpayResult({ orderId, amount, transactionId, status: 'Failed' })
      const orderResult = await applyOrderPaymentResult(orderId, false)
      const bookingResult = await applyBookingPaymentResult(orderId, false)
      if (orderResult?.exists || bookingResult?.exists) {
        await notifyPaymentResult(orderId, false, `Payment failed with code ${responseCode}`)
      }
    }

    // Return success for VNPAY
    res.json({ RspCode: '00', Message: 'Confirm received' })
  } catch (err) {
    console.error('[VNPAY IPN] Error:', err)
    res.status(500).json({ RspCode: '99', Message: 'Internal server error' })
  }
}

module.exports = {
  vnpayReturn,
  vnpayIpn,
}
