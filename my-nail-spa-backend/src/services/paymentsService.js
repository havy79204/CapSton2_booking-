const { env } = require('../config/config')
const { getPool, sql } = require('../config/db')
const { query } = require('../config/query')
const repo = require('../repositories/paymentsRepository')
const ordersSvc = require('../services/ordersService')
const bookingsSvc = require('../services/bookingService')
const bookingRepo = require('../repositories/bookingRepository')
const ordersRepo = require('../repositories/ordersRepository')
const { buildVnpayPaymentUrl, verifyVnpaySignature } = require('../lib/vnpay')

function ensureVnpayConfigured() {
  if (!env.vnpay.enabled || !env.vnpay.tmnCode || !env.vnpay.hashSecret) {
    const err = new Error('VNPAY is not configured. Please set VNPAY_TMN_CODE and VNPAY_HASH_SECRET in .env')
    err.status = 400
    throw err
  }
}

async function initVnpayForOrder(payload, req) {
  ensureVnpayConfigured()
  await repo.ensurePaymentTable()

  const order = await ordersSvc.createOrderRecord({ ...payload, paymentMethod: 'VNPAY' }, { statusOverride: 'Pending', skipInventory: true, paymentMethod: 'VNPAY', user: req.user })
  const clientIp = req && req.ip ? req.ip : (req && req.headers && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : '')
  const apiBase = `${req.protocol}://${req.get('host')}`
  const returnUrl = payload.returnUrl || env.vnpay.returnUrl || `${apiBase}/api/payments/vnpay/return`

  const paymentId = require('../config/query').newId()
  const { url: paymentUrl, secureHash } = buildVnpayPaymentUrl({
    amount: order.totals.total,
    orderId: order.id,
    paymentId,
    ipAddr: clientIp,
    bankCode: payload.bankCode,
    locale: payload.locale || env.vnpay.locale,
    currency: env.vnpay.currency,
    tmnCode: env.vnpay.tmnCode,
    hashSecret: env.vnpay.hashSecret,
    vnpUrl: env.vnpay.url,
    returnUrl,
    orderInfo: `Pay order ${order.id}`,
  })

  if (!Number.isFinite(Number(order.totals?.total)) || Number(order.totals.total) <= 0) throw Object.assign(new Error('Order total must be greater than zero'), { status: 400 })
  const existingPaid = await repo.findExistingPaidByOrderId(order.id)
  if (existingPaid) throw Object.assign(new Error('Order already has a successful payment'), { status: 400 })

  await repo.persistPaymentInit({ paymentId, orderId: order.id, amount: order.totals.total, currency: env.vnpay.currency, txnRef: paymentId, secureHash })
  return { paymentUrl, orderId: order.id, paymentId, item: order }
}

async function initVnpayForBooking(payload, req) {
  ensureVnpayConfigured()
  await repo.ensurePaymentTable()

  const booking = await bookingsSvc.createBookingRecord(payload, { statusOverride: 'Pending', user: req.user })
  const clientIp = req && req.ip ? req.ip : (req && req.headers && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : '')
  const apiBase = `${req.protocol}://${req.get('host')}`
  const returnUrl = payload.returnUrl || env.vnpay.returnUrl || `${apiBase}/api/payments/vnpay/booking/return`

  const paymentId = require('../config/query').newId()
  const { url: paymentUrl, secureHash } = buildVnpayPaymentUrl({
    amount: booking.totalPrice || payload.totalPrice || 0,
    orderId: booking.id,
    paymentId,
    ipAddr: clientIp,
    bankCode: payload.bankCode,
    locale: payload.locale || env.vnpay.locale,
    currency: env.vnpay.currency,
    tmnCode: env.vnpay.tmnCode,
    hashSecret: env.vnpay.hashSecret,
    vnpUrl: env.vnpay.url,
    returnUrl,
    orderInfo: `Pay booking ${booking.id}`,
  })

  if (!Number.isFinite(Number(booking.totalPrice || payload.totalPrice || 0)) || Number(booking.totalPrice || payload.totalPrice || 0) <= 0) throw Object.assign(new Error('Booking total must be greater than zero'), { status: 400 })
  const existingBookingPaid = await repo.findExistingPaidByBookingId(booking.id)
  if (existingBookingPaid) throw Object.assign(new Error('Booking already has a successful payment'), { status: 400 })

  await repo.persistPaymentInit({ paymentId, refType: 'booking', refId: booking.id, bookingId: booking.id, amount: booking.totalPrice || payload.totalPrice || 0, currency: env.vnpay.currency, txnRef: paymentId, secureHash })
  return { paymentUrl, bookingId: booking.id, paymentId, item: booking }
}

async function finalizeVnpayPayment(vnpParams, source = 'return') {
  ensureVnpayConfigured()
  const { isValid } = verifyVnpaySignature(vnpParams, env.vnpay.hashSecret)
  if (!isValid) return { rspCode: '97', message: 'Checksum failed' }

  const paymentId = vnpParams.vnp_TxnRef
  const payment = await repo.getPaymentById(paymentId)
  if (!payment) return { rspCode: '01', message: 'Payment not found' }

  const amountFromGateway = Number(vnpParams.vnp_Amount || 0) / 100
  const expectedAmount = Number(payment.Amount || 0)
  if (Math.abs(amountFromGateway - expectedAmount) > 0.009) return { rspCode: '04', message: 'Amount invalid' }

  const alreadySuccess = ['paid','success'].includes(String(payment.Status || '').toLowerCase())
  if (alreadySuccess) return { rspCode: '02', message: 'Payment already confirmed', refType: payment.RefType || (payment.OrderId ? 'order' : (payment.BookingId ? 'booking' : null)), refId: payment.RefId || payment.OrderId || payment.BookingId, status: payment.Status }

  const responseCode = String(vnpParams.vnp_ResponseCode || '')
  const success = responseCode === '00'
  const nextStatus = success ? 'Success' : 'Failed'

  const pool = await getPool()
  const tx = new sql.Transaction(pool)
  try {
    await tx.begin()
    const req = new sql.Request(tx)

    // update payment
    await req.query(`
      UPDATE dbo.PaymentTransactions
         SET Status=@status,
             VnpResponseCode=@respCode,
             VnpBankCode=@bankCode,
             VnpCardType=@cardType,
             VnpTransactionNo=@tranNo,
             VnpPayDate=@payDate,
             Message=@message,
             PaidAt=CASE WHEN @success=1 THEN SYSUTCDATETIME() ELSE PaidAt END,
             UpdatedAt=SYSUTCDATETIME()
       WHERE PaymentId=@paymentId`,
      {
        status: nextStatus,
        respCode: responseCode || null,
        bankCode: vnpParams.vnp_BankCode || null,
        cardType: vnpParams.vnp_CardType || null,
        tranNo: vnpParams.vnp_TransactionNo || null,
        payDate: vnpParams.vnp_PayDate || null,
        message: source === 'ipn' ? 'IPN callback' : 'Return callback',
        success: success ? 1 : 0,
        paymentId,
      },
    )

    const refType = payment.RefType || (payment.OrderId ? 'order' : (payment.BookingId ? 'booking' : null))
    const refId = payment.RefId || payment.OrderId || payment.BookingId

    if (refType === 'booking') {
      if (success) {
        await bookingRepo.updateBookingStatusTx(req, refId, 'Confirmed')
      } else {
        await bookingRepo.updateBookingStatusTx(req, refId, 'Pending')
      }
    } else {
      if (success) {
        await ordersRepo.updateOrderStatusTx(req, refId, 'Paid')
        await ordersRepo.updateOrderPaymentMethodTx(req, refId, 'VNPAY')
      } else {
        await ordersRepo.updateOrderStatusTx(req, refId, 'PaymentFailed')
      }
    }

    await tx.commit()
  } catch (txErr) {
    try { await tx.rollback() } catch (rbErr) {}
    throw txErr
  }

  const refType = payment.RefType || (payment.OrderId ? 'order' : (payment.BookingId ? 'booking' : null))
  const refId = payment.RefId || payment.OrderId || payment.BookingId

  if (refType === 'booking') {
    return {
      rspCode: '00',
      message: success ? 'Success' : 'Failed',
      bookingId: refId,
      status: success ? 'Confirmed' : 'Pending',
      paymentStatus: success ? 'SUCCESS' : 'FAILED',
      responseCode,
      success,
    }
  }

  let inventoryOk = true
  if (success) {
    try {
      try { await ordersSvc.applyInventoryForOrder(refId) } catch (invErr) { try { await ordersSvc.applyInventoryForOrder(refId) } catch (invErr2) { inventoryOk = false; console.error('applyInventoryForOrder failed for', refId, invErr2 && invErr2.message ? invErr2.message : invErr2) } }
    } catch (e) {
      inventoryOk = false
    }

    if (!inventoryOk) {
      try { await query("UPDATE dbo.Orders SET Status=@status WHERE OrderId=@orderId", { status: 'PaidInventoryPending', orderId: refId }) } catch (e) { console.error('Failed to set PaidInventoryPending for', refId, e && e.message ? e.message : e) }
    }

    try {
      const orderRow = await query('SELECT TOP 1 CustomerUserId, CustomerEmail FROM dbo.Orders WHERE OrderId=@id', { id: refId })
      const cust = orderRow.recordset[0] || {}
      const userId = cust.CustomerUserId || null
      const email = cust.CustomerEmail || null
      if (userId || email) {
        await query(
          "DELETE FROM dbo.CartItems WHERE CartId IN (SELECT CartId FROM dbo.Carts WHERE Status='active' AND (UserId=@userId OR (CustomerEmail IS NOT NULL AND LOWER(CustomerEmail)=LOWER(@email))))",
          { userId, email },
        )
      }
    } catch (cartErr) {
      console.error('Failed to clear carts after payment for order', refId, cartErr && cartErr.message ? cartErr.message : cartErr)
    }
  }

  return {
    rspCode: '00',
    message: success ? (inventoryOk ? 'Success' : 'Success (inventory pending)') : 'Failed',
    orderId: refId,
    status: success ? (inventoryOk ? 'Paid' : 'PaidInventoryPending') : 'Failed',
    paymentStatus: success ? 'SUCCESS' : 'FAILED',
    responseCode,
    success,
  }
}

module.exports = {
  initVnpayForOrder,
  initVnpayForBooking,
  finalizeVnpayPayment,
  ensureVnpayConfigured,
}
