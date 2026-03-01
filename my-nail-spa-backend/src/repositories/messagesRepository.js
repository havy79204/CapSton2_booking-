const { query, newId } = require('../config/query')

async function listThreadsBySalon(salonId) {
  const r = await query('SELECT * FROM dbo.MessageThreads WHERE SalonId=@salonId ORDER BY LastMessageAt DESC, CreatedAt DESC', { salonId })
  return r.recordset
}

async function findThreadByCustomer(salonId, customerId) {
  const r = await query('SELECT TOP 1 * FROM dbo.MessageThreads WHERE SalonId=@salonId AND CustomerId=@customerId', { salonId, customerId })
  return r.recordset[0] || null
}

async function findThreadByEmail(salonId, email) {
  const r = await query('SELECT TOP 1 * FROM dbo.MessageThreads WHERE SalonId=@salonId AND CustomerEmail=@email', { salonId, email })
  return r.recordset[0] || null
}

async function createThread({ threadId, salonId, customerId = null, customerName = null, customerEmail = null }) {
  await query(
    `INSERT INTO dbo.MessageThreads(ThreadId, CreatedAt, SalonId, CustomerId, CustomerName, CustomerEmail, LastMessageAt)
     VALUES(@threadId, SYSUTCDATETIME(), @salonId, @customerId, @customerName, @customerEmail, NULL)`,
    { threadId, salonId, customerId, customerName, customerEmail },
  )
  const r = await query('SELECT TOP 1 * FROM dbo.MessageThreads WHERE ThreadId=@threadId', { threadId })
  return r.recordset[0]
}

async function listMessages(threadId) {
  const r = await query('SELECT * FROM dbo.Messages WHERE ThreadId=@threadId ORDER BY CreatedAt', { threadId })
  return r.recordset
}

async function insertMessage({ id, threadId, fromRole, fromName = null, text }) {
  await query(
    `INSERT INTO dbo.Messages(MessageId, ThreadId, FromRole, FromName, Text, CreatedAt)
     VALUES(@id, @threadId, @fromRole, @fromName, @text, SYSUTCDATETIME())`,
    { id, threadId, fromRole, fromName, text },
  )
  await query('UPDATE dbo.MessageThreads SET LastMessageAt=SYSUTCDATETIME() WHERE ThreadId=@threadId', { threadId })
  const r = await query('SELECT TOP 1 * FROM dbo.Messages WHERE MessageId=@id', { id })
  return r.recordset[0]
}

module.exports = { listThreadsBySalon, findThreadByCustomer, findThreadByEmail, createThread, listMessages, insertMessage }
