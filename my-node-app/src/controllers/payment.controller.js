const crypto = require('crypto')
const { env } = require('../config/config')
const { query } = require('../config/query')
const { notifyCustomerEvent, notifyOwnerEvent } = require('../services/notifications.service')

async function notifyPaymentResult(orderIdInput, isSuccess, reason = '') {
  const orderId = String(orderIdInput || '').trim()
  if (!orderId) return

  try {
    const orderRes = await query(
      `SELECT TOP 1 UserId
       FROM Orders
       WHERE OrderId = @orderId`,
      { orderId },
    )

    const userId = String(orderRes.recordset?.[0]?.UserId || '').trim()
    if (!userId) return

    await notifyCustomerEvent({
      userId,
      orderId,
      event: isSuccess ? 'payment_success' : 'payment_failed',
      payload: { orderId, reason },
    })

    await notifyOwnerEvent({
      event: isSuccess ? 'payment_success' : 'payment_failed',
      orderId,
      payload: { reason },
    })
  } catch (err) {
    console.warn('[payment] notify payment result failed:', err?.message || err)
  }
}

function buildFrontendReturnUrl(params = {}) {
  const base = String(env.vnpay?.frontendReturnUrl || '').trim()
  if (!base) return ''

  try {
    const u = new URL(base)
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      u.searchParams.set(key, String(value))
    })
    return u.toString()
  } catch (_err) {
    return ''
  }
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

    // Sort params and create checksum
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key]
        return acc
      }, {})

    const queryString = Object.keys(sortedParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(sortedParams[key])}`)
      .join('&')

    const hmac = crypto
      .createHmac('sha512', env.vnpay.hashSecret)
      .update(queryString)
      .digest('hex')

    // Verify checksum
    if (hmac !== secureHash) {
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
    const responseCode = params['vnp_ResponseCode']
    const transactionId = params['vnp_TransactionNo']
    const orderId = params['vnp_OrderInfo']
    const amount = params['vnp_Amount']

    console.log(`[VNPAY] Transaction ${transactionId} for order ${orderId}:`, {
      responseCode,
      amount,
    })

    if (responseCode === '00') {
      // Payment successful
      console.log('[VNPAY] Payment successful!')
      await notifyPaymentResult(orderId, true)
      const redirectUrl = buildFrontendReturnUrl({
        status: 'success',
        code: 'PAYMENT_SUCCESS',
        transactionId,
        orderId,
        amount,
      })
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
      await notifyPaymentResult(orderId, false, `Payment failed with code ${responseCode}`)
      const redirectUrl = buildFrontendReturnUrl({
        status: 'failed',
        code: `PAYMENT_FAILED_${responseCode}`,
        transactionId,
        orderId,
      })
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

    // Similar verification logic as vnpayReturn
    const verifyParams = { ...params }
    delete verifyParams['vnp_SecureHash']
    delete verifyParams['vnp_SecureHashType']

    const sortedParams = Object.keys(verifyParams)
      .sort()
      .reduce((acc, key) => {
        acc[key] = verifyParams[key]
        return acc
      }, {})

    const queryString = Object.keys(sortedParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(sortedParams[key])}`)
      .join('&')

    const hmac = crypto
      .createHmac('sha512', env.vnpay.hashSecret)
      .update(queryString)
      .digest('hex')

    if (hmac !== secureHash) {
      console.error('[VNPAY IPN] Invalid secure hash')
      return res.status(400).json({ RspCode: '97', Message: 'Invalid secure hash' })
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
