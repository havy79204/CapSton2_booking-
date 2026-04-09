const { query, newId } = require('../config/query')

async function listTipsForStaff(staffId, options = {}) {
  const params = { staffId }
  let where = 'WHERE StaffId = @staffId'

  if (options.month) {
    // month in YYYY-MM
    const month = String(options.month || '').trim()
    if (month.match(/^\d{4}-\d{2}$/)) {
      params.monthStart = `${month}-01`
      // Use DATEFROMPARTS for SQL Server or convert
      where += ` AND CAST(At AS DATE) >= @monthStart AND CAST(At AS DATE) < DATEADD(MONTH, 1, @monthStart)`
    }
  }

  const sql = `SELECT TipLogId, StaffId, Amount, At FROM TipLogs ${where} ORDER BY At DESC`
  const res = await query(sql, params)
  return (res.recordset || []).map((r) => ({
    TipLogId: r.TipLogId,
    StaffId: r.StaffId,
    Amount: Number(r.Amount || 0),
    At: r.At,
  }))
}

async function addTipForStaff(staffId, amount, at = null) {
  const tipId = `TIP-${newId()}`
  const safeAmount = Number(amount || 0)
  const atValue = at ? new Date(at) : new Date()

  await query(
    `INSERT INTO TipLogs (TipLogId, StaffId, Amount, At)
     VALUES (@tipId, @staffId, @amount, @at)`,
    {
      tipId,
      staffId,
      amount: safeAmount,
      at: atValue,
    }
  )

  return {
    TipLogId: tipId,
    StaffId: staffId,
    Amount: safeAmount,
    At: atValue,
  }
}

module.exports = {
  listTipsForStaff,
  addTipForStaff,
}
