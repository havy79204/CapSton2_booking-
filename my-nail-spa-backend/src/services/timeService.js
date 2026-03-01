const repo = require('../repositories/timeRepository')

function mapTimeRow(r) {
  return {
    id: r.TimeLogId,
    staffId: r.StaffId,
    type: r.Type,
    at: r.At,
    note: r.Note,
  }
}

function mapTipRow(r) {
  return {
    id: r.TipLogId,
    staffId: r.StaffId,
    amount: Number(r.Amount),
    at: r.At,
  }
}

async function listTimeLogs(staffId, limit = 5000) {
  const rows = await repo.getTimeLogsByStaff(staffId, limit)
  return rows.map(mapTimeRow)
}

async function createTimeLog(payload) {
  const r = await repo.insertTimeLog(payload)
  return r ? mapTimeRow(r) : null
}

async function listTipLogs(staffId, limit = 5000) {
  const rows = await repo.getTipLogsByStaff(staffId, limit)
  return rows.map(mapTipRow)
}

async function createTipLog(payload) {
  const r = await repo.insertTipLog(payload)
  return r ? mapTipRow(r) : null
}

module.exports = { listTimeLogs, createTimeLog, listTipLogs, createTipLog }
