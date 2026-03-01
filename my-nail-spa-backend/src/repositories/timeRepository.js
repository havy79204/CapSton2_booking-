const { query, newId } = require('../config/query')

async function getTimeLogsByStaff(staffId, limit = 5000) {
  const r = await query('SELECT TOP (@limit) * FROM dbo.TimeLogs WHERE StaffId=@staffId ORDER BY At DESC', { staffId, limit })
  return r.recordset
}

async function insertTimeLog({ id = null, staffId, type, at, note }) {
  const nid = id || newId()
  await query(
    `INSERT INTO dbo.TimeLogs(TimeLogId, StaffId, Type, At, Note)
     VALUES(@id, @staffId, @type, @at, @note)`,
    { id: nid, staffId, type, at, note: note || null },
  )
  const res = await query('SELECT TOP 1 * FROM dbo.TimeLogs WHERE TimeLogId=@id', { id: nid })
  return res.recordset[0] || null
}

async function getTipLogsByStaff(staffId, limit = 5000) {
  const r = await query('SELECT TOP (@limit) * FROM dbo.TipLogs WHERE StaffId=@staffId ORDER BY At DESC', { staffId, limit })
  return r.recordset
}

async function insertTipLog({ id = null, staffId, amount, at }) {
  const nid = id || newId()
  await query(
    `INSERT INTO dbo.TipLogs(TipLogId, StaffId, Amount, At)
     VALUES(@id, @staffId, @amount, @at)`,
    { id: nid, staffId, amount, at },
  )
  const res = await query('SELECT TOP 1 * FROM dbo.TipLogs WHERE TipLogId=@id', { id: nid })
  return res.recordset[0] || null
}

module.exports = { getTimeLogsByStaff, insertTimeLog, getTipLogsByStaff, insertTipLog }
