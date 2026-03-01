const { query } = require('../config/query')

let _paymentTableEnsured = false
async function ensurePaymentTable() {
  if (_paymentTableEnsured) return
  try {
    await query('SELECT TOP 1 1 FROM dbo.PaymentTransactions')
  } catch (err) {
  }
  _paymentTableEnsured = true
}

async function persistPaymentInit({ paymentId, refType, refId, orderId, bookingId, amount, currency, txnRef, secureHash }) {
  await ensurePaymentTable()
  // validate XOR: exactly one of orderId or bookingId must be present
  const hasOrder = Boolean(orderId || (refType === 'order' && refId))
  const hasBooking = Boolean(bookingId || (refType === 'booking' && refId))
  if ((hasOrder && hasBooking) || (!hasOrder && !hasBooking)) {
    throw Object.assign(new Error('Payment must reference exactly one of orderId or bookingId'), { status: 400 })
  }

  await query(
    `INSERT INTO dbo.PaymentTransactions(
      PaymentId, RefType, RefId, OrderId, BookingId, Provider, Amount, Currency, Status,
      VnpTxnRef, VnpSecureHash, CreatedAt, UpdatedAt
    ) VALUES(
      @paymentId, @refType, @refId, @orderId, @bookingId, 'VNPAY', @amount, @currency, 'Pending',
      @txnRef, @secureHash, SYSUTCDATETIME(), SYSUTCDATETIME()
    )`,
    { paymentId, refType, refId, orderId: orderId || null, bookingId: bookingId || null, amount, currency, txnRef, secureHash },
  )
}

async function getPaymentById(paymentId) {
  await ensurePaymentTable()
  const r = await query('SELECT TOP 1 * FROM dbo.PaymentTransactions WHERE PaymentId=@id', { id: paymentId })
  return r.recordset[0] || null
}

async function findExistingPaidByOrderId(orderId) {
  await ensurePaymentTable()
  const r = await query("SELECT TOP 1 1 FROM dbo.PaymentTransactions WHERE OrderId=@id AND UPPER(ISNULL(Status,'')) IN ('PAID','SUCCESS')", { id: orderId })
  return r.recordset.length > 0
}

async function findExistingPaidByBookingId(bookingId) {
  await ensurePaymentTable()
  const r = await query("SELECT TOP 1 1 FROM dbo.PaymentTransactions WHERE BookingId=@id AND UPPER(ISNULL(Status,'')) IN ('PAID','SUCCESS')", { id: bookingId })
  return r.recordset.length > 0
}

async function updatePaymentTransaction(paymentId, updates = {}) {
  // updates may include: status, respCode, bankCode, cardType, tranNo, payDate, message, successFlag
  const parts = []
  const params = { paymentId }
  if ('status' in updates) { parts.push('Status=@status'); params.status = updates.status }
  if ('respCode' in updates) { parts.push('VnpResponseCode=@respCode'); params.respCode = updates.respCode }
  if ('bankCode' in updates) { parts.push('VnpBankCode=@bankCode'); params.bankCode = updates.bankCode }
  if ('cardType' in updates) { parts.push('VnpCardType=@cardType'); params.cardType = updates.cardType }
  if ('tranNo' in updates) { parts.push('VnpTransactionNo=@tranNo'); params.tranNo = updates.tranNo }
  if ('payDate' in updates) { parts.push('VnpPayDate=@payDate'); params.payDate = updates.payDate }
  if ('message' in updates) { parts.push('Message=@message'); params.message = updates.message }
  if ('success' in updates) { parts.push('PaidAt=CASE WHEN @success=1 THEN SYSUTCDATETIME() ELSE PaidAt END'); params.success = updates.success ? 1 : 0 }

  if (parts.length === 0) return
  const sql = `UPDATE dbo.PaymentTransactions SET ${parts.join(',')}, UpdatedAt=SYSUTCDATETIME() WHERE PaymentId=@paymentId`
  await query(sql, params)
}

module.exports = {
  ensurePaymentTable,
  persistPaymentInit,
  getPaymentById,
  findExistingPaidByOrderId,
  findExistingPaidByBookingId,
  updatePaymentTransaction,
}
