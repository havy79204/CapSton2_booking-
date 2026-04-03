const { query, newId } = require('../config/query')

let _paymentIdMetaPromise = null
let _invoiceColumnsPromise = null

async function getPaymentIdMeta() {
  if (_paymentIdMetaPromise) return _paymentIdMetaPromise

  _paymentIdMetaPromise = query(
    `SELECT TOP 1
        c.DATA_TYPE AS DataType,
        c.IS_NULLABLE AS IsNullable,
        c.CHARACTER_MAXIMUM_LENGTH AS CharMaxLen,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS IsIdentity
     FROM INFORMATION_SCHEMA.COLUMNS c
     WHERE c.TABLE_NAME = 'Payments'
       AND c.COLUMN_NAME = 'PaymentId'`
  )
    .then((res) => {
      const row = res.recordset?.[0] || null
      return {
        exists: Boolean(row),
        dataType: String(row?.DataType || '').toLowerCase(),
        isNullable: String(row?.IsNullable || '').toUpperCase() === 'YES',
        isIdentity: Number(row?.IsIdentity || 0) === 1,
        charMaxLen: Number(row?.CharMaxLen || 0),
      }
    })
    .catch((_err) => ({
      exists: false,
      dataType: '',
      isNullable: true,
      isIdentity: false,
      charMaxLen: 0,
    }))

  return _paymentIdMetaPromise
}

async function getInvoiceColumns() {
  if (_invoiceColumnsPromise) return _invoiceColumnsPromise

  _invoiceColumnsPromise = query(
    `SELECT
        c.COLUMN_NAME AS ColumnName,
        c.DATA_TYPE AS DataType,
        c.IS_NULLABLE AS IsNullable,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS IsIdentity
     FROM INFORMATION_SCHEMA.COLUMNS c
     WHERE c.TABLE_NAME = 'Invoices'`
  )
    .then((res) => {
      const rows = res.recordset || []
      return rows.map((row) => ({
        name: String(row.ColumnName || ''),
        key: String(row.ColumnName || '').toLowerCase(),
        dataType: String(row.DataType || '').toLowerCase(),
        isNullable: String(row.IsNullable || '').toUpperCase() === 'YES',
        isIdentity: Number(row.IsIdentity || 0) === 1,
      }))
    })
    .catch((_err) => [])

  return _invoiceColumnsPromise
}

function pickExistingColumn(columns, preferredNames = []) {
  for (const n of preferredNames) {
    const found = columns.find((c) => c.key === String(n).toLowerCase())
    if (found) return found
  }
  return null
}

function buildInvoiceIdFromOrder(orderId) {
  const raw = String(orderId || '').trim()
  if (!raw) return `INV-${newId()}`
  return raw.startsWith('INV-') ? raw : `INV-${raw}`
}

async function ensureInvoiceRow({ invoiceId, orderId, userId, amount }) {
  const safeInvoiceId = String(invoiceId || '').trim()
  if (!safeInvoiceId) return null

  const existsRes = await query(
    `SELECT TOP 1 InvoiceId
     FROM Invoices
     WHERE InvoiceId = @invoiceId`,
    { invoiceId: safeInvoiceId }
  )
  if (existsRes.recordset?.length) return safeInvoiceId

  const columns = await getInvoiceColumns()
  if (!columns.length) return null

  const colMap = new Map(columns.map((c) => [c.key, c]))
  const hasInvoiceId = colMap.has('invoiceid')
  if (!hasInvoiceId) return null

  const insertCols = []
  const valueExprs = []
  const bind = {}

  insertCols.push('InvoiceId')
  valueExprs.push('@invoiceId')
  bind.invoiceId = safeInvoiceId

  const orderIdCol = pickExistingColumn(columns, ['OrderId', 'OrderID', 'OrderRef', 'ReferenceOrderId'])
  if (orderIdCol) {
    insertCols.push(orderIdCol.name)
    valueExprs.push('@orderId')
    bind.orderId = String(orderId || '').trim() || safeInvoiceId
  }

  const userIdCol = pickExistingColumn(columns, ['UserId', 'CustomerUserId', 'CustomerId'])
  if (userIdCol) {
    insertCols.push(userIdCol.name)
    valueExprs.push('@userId')
    bind.userId = String(userId || '').trim() || null
  }

  const amountCol = pickExistingColumn(columns, ['Amount', 'Total', 'GrandTotal', 'TotalAmount', 'Subtotal'])
  if (amountCol) {
    insertCols.push(amountCol.name)
    valueExprs.push('@amount')
    bind.amount = Number(amount || 0)
  }

  const statusCol = pickExistingColumn(columns, ['Status', 'InvoiceStatus'])
  if (statusCol) {
    insertCols.push(statusCol.name)
    valueExprs.push('@status')
    bind.status = 'Pending'
  }

  const createdCol = pickExistingColumn(columns, ['CreatedAt', 'IssuedAt', 'InvoiceDate', 'CreatedDate'])
  if (createdCol) {
    insertCols.push(createdCol.name)
    valueExprs.push('SYSUTCDATETIME()')
  }

  await query(
    `INSERT INTO Invoices (${insertCols.join(', ')})
     VALUES (${valueExprs.join(', ')})`,
    bind
  )

  return safeInvoiceId
}

async function resolveInvoiceIdForPayment({ invoiceId, orderId, userId, amount }) {
  const preferred = String(invoiceId || '').trim() || buildInvoiceIdFromOrder(orderId)

  try {
    const resolved = await ensureInvoiceRow({
      invoiceId: preferred,
      orderId,
      userId,
      amount,
    })
    if (resolved) return resolved
  } catch (_err) {
    // try fallbacks below
  }

  const orderAsInvoice = String(orderId || '').trim()
  if (orderAsInvoice) {
    const exists = await query(
      `SELECT TOP 1 InvoiceId
       FROM Invoices
       WHERE InvoiceId = @invoiceId`,
      { invoiceId: orderAsInvoice }
    )
    if (exists.recordset?.length) return orderAsInvoice
  }

  // Final guard: only return an id that is confirmed to exist in Invoices.
  // Returning an arbitrary id can trigger FK/constraint failures in Payments inserts.
  if (preferred) {
    const preferredExists = await query(
      `SELECT TOP 1 InvoiceId
       FROM Invoices
       WHERE InvoiceId = @invoiceId`,
      { invoiceId: preferred }
    )
    if (preferredExists.recordset?.length) return preferred
  }

  return null
}

function buildStringPaymentId(maxLen) {
  const raw = `PAY-${newId()}`
  if (!Number.isFinite(maxLen) || maxLen <= 0) return raw
  return raw.slice(0, maxLen)
}

async function insertPaymentRowBase({ invoiceId, amount, paymentMethod, status, transactionCode, paidAt }) {
  await query(
    `INSERT INTO Payments (InvoiceId, Amount, PaymentMethod, Status, TransactionCode, PaidAt)
     VALUES (@invoiceId, @amount, @paymentMethod, @status, @transactionCode, @paidAt)`,
    {
      invoiceId,
      amount,
      paymentMethod,
      status,
      transactionCode,
      paidAt,
    }
  )
}

async function insertPaymentRowWithPaymentId({ invoiceId, amount, paymentMethod, status, transactionCode, paidAt }) {
  const meta = await getPaymentIdMeta()
  if (!meta.exists || meta.isIdentity || meta.isNullable) {
    await insertPaymentRowBase({ invoiceId, amount, paymentMethod, status, transactionCode, paidAt })
    return
  }

  const dt = meta.dataType

  if (dt === 'uniqueidentifier') {
    await query(
      `INSERT INTO Payments (PaymentId, InvoiceId, Amount, PaymentMethod, Status, TransactionCode, PaidAt)
       VALUES (NEWID(), @invoiceId, @amount, @paymentMethod, @status, @transactionCode, @paidAt)`,
      {
        invoiceId,
        amount,
        paymentMethod,
        status,
        transactionCode,
        paidAt,
      }
    )
    return
  }

  if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric'].includes(dt)) {
    await query(
      `DECLARE @nextPaymentId BIGINT;
       SELECT @nextPaymentId = ISNULL(MAX(TRY_CONVERT(BIGINT, PaymentId)), 0) + 1
       FROM Payments WITH (UPDLOCK, HOLDLOCK);

       INSERT INTO Payments (PaymentId, InvoiceId, Amount, PaymentMethod, Status, TransactionCode, PaidAt)
       VALUES (@nextPaymentId, @invoiceId, @amount, @paymentMethod, @status, @transactionCode, @paidAt)`,
      {
        invoiceId,
        amount,
        paymentMethod,
        status,
        transactionCode,
        paidAt,
      }
    )
    return
  }

  await query(
    `INSERT INTO Payments (PaymentId, InvoiceId, Amount, PaymentMethod, Status, TransactionCode, PaidAt)
     VALUES (@paymentId, @invoiceId, @amount, @paymentMethod, @status, @transactionCode, @paidAt)`,
    {
      paymentId: buildStringPaymentId(meta.charMaxLen),
      invoiceId,
      amount,
      paymentMethod,
      status,
      transactionCode,
      paidAt,
    }
  )
}

async function upsertPaymentRecord({ invoiceId, amount, paymentMethod, status, transactionCode, paidAt }) {
  const safeInvoiceId = String(invoiceId || '').trim()
  if (!safeInvoiceId) return

  const payload = {
    invoiceId: safeInvoiceId,
    amount: Number(amount || 0),
    paymentMethod: String(paymentMethod || 'VNPAY').trim(),
    status: String(status || 'Pending').trim(),
    transactionCode: transactionCode ? String(transactionCode).trim() : null,
    paidAt: paidAt || null,
  }

  const existsRes = await query(
    `SELECT TOP 1 1 AS ok
     FROM Payments
     WHERE InvoiceId = @invoiceId`,
    { invoiceId: safeInvoiceId }
  )

  if (existsRes.recordset?.length) {
    await query(
      `UPDATE Payments
       SET Amount = @amount,
           PaymentMethod = @paymentMethod,
           Status = @status,
           TransactionCode = @transactionCode,
           PaidAt = @paidAt
       WHERE InvoiceId = @invoiceId`,
      payload
    )
    return
  }

  try {
    await insertPaymentRowBase(payload)
  } catch (err) {
    const msg = String(err?.message || '')
    if (!/paymentid|cannot insert the value null into column 'paymentid'/i.test(msg)) {
      throw err
    }
    await insertPaymentRowWithPaymentId(payload)
  }
}

module.exports = {
  upsertPaymentRecord,
  resolveInvoiceIdForPayment,
}
