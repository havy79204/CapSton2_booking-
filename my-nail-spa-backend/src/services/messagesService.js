const repo = require('../repositories/messagesRepository')
const { newId } = require('../config/query')

function mapThreadRow(r) {
  return {
    id: r.ThreadId,
    createdAt: r.CreatedAt,
    salonId: r.SalonId,
    customerId: r.CustomerId,
    customerName: r.CustomerName,
    customerEmail: r.CustomerEmail,
    lastMessageAt: r.LastMessageAt,
  }
}

function mapMessageRow(r) {
  return {
    id: r.MessageId,
    threadId: r.ThreadId,
    fromRole: r.FromRole,
    fromName: r.FromName,
    text: r.Text,
    createdAt: r.CreatedAt,
  }
}

async function listThreads(salonId) {
  const rows = await repo.listThreadsBySalon(salonId)
  return rows.map(mapThreadRow)
}

async function createThread(payload) {
  // payload: { salonId, customerId?, customerName?, customerEmail? }
  const email = payload.customerEmail ? String(payload.customerEmail).trim().toLowerCase() : null
  let existing = null
  if (payload.customerId) existing = await repo.findThreadByCustomer(payload.salonId, payload.customerId)
  if (!existing && email) existing = await repo.findThreadByEmail(payload.salonId, email)
  if (existing) return mapThreadRow(existing)

  const threadId = newId()
  const row = await repo.createThread({ threadId, salonId: payload.salonId, customerId: payload.customerId || null, customerName: payload.customerName || null, customerEmail: email })
  return mapThreadRow(row)
}

async function listMessages(threadId) {
  const rows = await repo.listMessages(threadId)
  return rows.map(mapMessageRow)
}

async function postMessage(threadId, payload) {
  const id = newId()
  const row = await repo.insertMessage({ id, threadId, fromRole: payload.fromRole, fromName: payload.fromName || null, text: payload.text })
  return mapMessageRow(row)
}

module.exports = { listThreads, createThread, listMessages, postMessage }
