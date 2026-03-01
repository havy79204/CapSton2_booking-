const svc = require('../services/paymentsService')

async function postVnpay(req, res, next) {
  try {
    const result = await svc.initVnpayForOrder(req.body, req)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function postVnpayBooking(req, res, next) {
  try {
    const result = await svc.initVnpayForBooking(req.body, req)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function getVnpayReturn(req, res, next) {
  try {
    const result = await svc.finalizeVnpayPayment(req.query, 'return')
    if (result.rspCode !== '00') return res.status(400).json({ error: result.message, code: result.rspCode })

    const targetBase = req.app.get('env') && process.env.VNPAY_FRONTEND_RETURN_URL ? process.env.VNPAY_FRONTEND_RETURN_URL : ''
    // prefer env-based frontend redirect, otherwise respond with JSON
    if (targetBase) {
      const url = new URL(targetBase)
      if (result.bookingId) url.searchParams.set('bookingId', result.bookingId)
      if (result.orderId) url.searchParams.set('orderId', result.orderId)
      url.searchParams.set('paymentStatus', result.paymentStatus || result.status || '')
      url.searchParams.set('source', result.bookingId ? 'vnpay-booking' : 'vnpay')
      if (result.responseCode) url.searchParams.set('paymentCode', result.responseCode)
      return res.redirect(url.toString())
    }
    res.json(Object.assign({ paymentStatus: result.paymentStatus || result.status || '' }, result))
  } catch (err) {
    next(err)
  }
}

async function getVnpayIpn(req, res) {
  try {
    const result = await svc.finalizeVnpayPayment(req.query, 'ipn')
    if (result.rspCode !== '00') return res.status(200).json({ RspCode: result.rspCode, Message: result.message })
    return res.status(200).json({ RspCode: '00', Message: 'Success' })
  } catch (err) {
    return res.status(500).json({ RspCode: '99', Message: 'Unknown error' })
  }
}

module.exports = { postVnpay, postVnpayBooking, getVnpayReturn, getVnpayIpn }
