const { query, newId } = require('../config/query')
const { emitCatMessageToUser, emitCatMessageToUsers } = require('../realtime/socket')

function normalizeAvatarUrl(rawValue) {
  const raw = String(rawValue || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw)) return raw

  const unixPath = raw.replace(/\\/g, '/')
  if (unixPath.startsWith('/uploads/')) return unixPath
  if (unixPath.startsWith('uploads/')) return `/${unixPath}`
  if (/\.(png|jpe?g|webp|gif)$/i.test(unixPath) && !unixPath.includes('/')) return `/uploads/avatars/${unixPath}`
  if (unixPath.startsWith('/')) return unixPath
  return `/${unixPath}`
}
function requireUserId(userId) {
  const value = String(userId || '').trim()
  if (!value) {
    const err = new Error('Unauthorized')
    err.status = 401
    throw err
  }
  return value
}

function parseThreadId(threadId) {
  const raw = String(threadId || '').trim()
  const m = raw.match(/^customer-(.+)$/)
  if (!m) return null
  const customerUserId = String(m[1] || '').trim()
  if (!customerUserId) return null
  return { customerUserId, threadId: raw }
}

function mapMessageForOwner(row, ownerUserId) {
  const sender = String(row.SenderId || '').trim()
  return {
    id: row.MessageId,
    from: sender === String(ownerUserId) ? 'owner' : 'customer',
    senderId: sender,
    senderName: String(row.SenderName || '').trim(),
    senderAvatar: normalizeAvatarUrl(row.SenderAvatar),
    text: String(row.MessageText || ''),
    createdAt: row.CreatedAt || new Date().toISOString(),
  }
}

function mapMessageForCustomer(row, customerUserId) {
  const sender = String(row.SenderId || '').trim()
  const senderIsUser = sender === String(customerUserId)
  return {
    id: row.MessageId,
    sender: senderIsUser ? 'user' : 'shop',
    senderId: sender,
    senderName: String(row.SenderName || '').trim() || (senderIsUser ? 'You' : 'Shop'),
    senderAvatar: normalizeAvatarUrl(row.SenderAvatar),
    text: String(row.MessageText || ''),
    createdAt: row.CreatedAt || new Date().toISOString(),
  }
}

async function getUserProfile(userIdInput) {
  const userId = String(userIdInput || '').trim()
  if (!userId) return { userId: '', name: '', avatarUrl: '' }

  const res = await query(
    `SELECT TOP 1 UserId, Name, AvatarUrl
     FROM Users
     WHERE UserId = @userId`,
    { userId },
  )

  const row = res.recordset?.[0] || {}
  return {
    userId,
    name: String(row.Name || '').trim(),
    avatarUrl: normalizeAvatarUrl(row.AvatarUrl),
  }
}

async function findConversationByCustomer(customerUserId) {
  const res = await query(
    `SELECT TOP 1 ConversationId, CustomerUserId, StaffId, CreatedAt
     FROM Conversations
     WHERE CustomerUserId = @customerUserId
     ORDER BY CreatedAt DESC, ConversationId DESC`,
    { customerUserId },
  )
  return res.recordset?.[0] || null
}

async function createConversation({ customerUserId, staffId = null } = {}) {
  const conversationId = `CVS-${newId()}`
  await query(
    `INSERT INTO Conversations (ConversationId, CustomerUserId, StaffId, CreatedAt)
     VALUES (@conversationId, @customerUserId, @staffId, SYSUTCDATETIME())`,
    { conversationId, customerUserId, staffId },
  )
  return {
    ConversationId: conversationId,
    CustomerUserId: customerUserId,
    StaffId: staffId,
    CreatedAt: new Date().toISOString(),
  }
}

async function ensureConversationByCustomer(customerUserId, preferredStaffId = null) {
  const current = await findConversationByCustomer(customerUserId)
  if (current) {
    if (!current.StaffId && preferredStaffId) {
      await query(
        `UPDATE Conversations
         SET StaffId = @staffId
         WHERE ConversationId = @conversationId`,
        { staffId: preferredStaffId, conversationId: current.ConversationId },
      )
      return { ...current, StaffId: preferredStaffId }
    }
    return current
  }
  return createConversation({ customerUserId, staffId: preferredStaffId })
}

async function listThreads(ownerUserIdInput) {
  requireUserId(ownerUserIdInput)

  const result = await query(
    `SELECT
        c.ConversationId,
        c.CustomerUserId,
        c.StaffId,
        c.CreatedAt,
        u.Name AS CustomerName,
        u.Email AS CustomerEmail,
        lm.MessageText AS LastMessage,
        lm.CreatedAt AS LastMessageAt
     FROM Conversations c
     LEFT JOIN Users u ON u.UserId = c.CustomerUserId
     OUTER APPLY (
       SELECT TOP 1 m.MessageText, m.CreatedAt
       FROM Messages m
       WHERE m.ConversationId = c.ConversationId
       ORDER BY m.CreatedAt DESC, m.MessageId DESC
     ) lm
     WHERE EXISTS (
         SELECT 1
         FROM Messages m2
         WHERE m2.ConversationId = c.ConversationId
       )
     ORDER BY COALESCE(lm.CreatedAt, c.CreatedAt) DESC, c.ConversationId DESC`,
    {},
  )

  return (result.recordset || [])
    .map((row) => ({
      id: `customer-${row.CustomerUserId}`,
      kind: 'customer',
      customerUserId: row.CustomerUserId,
      conversationId: row.ConversationId,
      title: row.CustomerName || `Customer ${row.CustomerUserId}`,
      subtitle: row.CustomerEmail || '',
      lastMessage: row.LastMessage || '',
      lastMessageAt: row.LastMessageAt || row.CreatedAt || null,
    }))
    .filter((x) => String(x.customerUserId || '').trim())
}

async function getMessages(ownerUserIdInput, threadId) {
  const ownerUserId = requireUserId(ownerUserIdInput)
  const parsed = parseThreadId(threadId)
  if (!parsed) {
    const err = new Error('Invalid threadId')
    err.status = 400
    throw err
  }

  const conversation = await ensureConversationByCustomer(parsed.customerUserId, ownerUserId)

  const result = await query(
    `SELECT
        m.MessageId,
        m.ConversationId,
        m.SenderId,
        su.Name AS SenderName,
        su.AvatarUrl AS SenderAvatar,
        m.MessageText,
        m.CreatedAt
      FROM Messages m
      LEFT JOIN Users su ON su.UserId = m.SenderId
      WHERE m.ConversationId = @conversationId
      ORDER BY m.CreatedAt ASC, m.MessageId ASC`,
    { conversationId: conversation.ConversationId },
  )

  return (result.recordset || []).map((row) => mapMessageForOwner(row, ownerUserId))
}

async function sendMessage(ownerUserIdInput, threadId, { text } = {}) {
  const ownerUserId = requireUserId(ownerUserIdInput)
  const parsed = parseThreadId(threadId)
  if (!parsed) {
    const err = new Error('Invalid threadId')
    err.status = 400
    throw err
  }

  const msgText = String(text || '').trim()
  if (!msgText) {
    const err = new Error('Missing text')
    err.status = 400
    throw err
  }

  const conversation = await ensureConversationByCustomer(parsed.customerUserId, ownerUserId)
  const messageId = `MSG-${newId()}`
  const createdAt = new Date().toISOString()
  const ownerProfile = await getUserProfile(ownerUserId)

  await query(
    `INSERT INTO Messages (MessageId, ConversationId, SenderId, MessageText, CreatedAt)
     VALUES (@messageId, @conversationId, @senderId, @messageText, @createdAt)`,
    {
      messageId,
      conversationId: conversation.ConversationId,
      senderId: ownerUserId,
      messageText: msgText,
      createdAt,
    },
  )

  const ownerMessage = {
    id: messageId,
    from: 'owner',
    senderId: ownerUserId,
    senderName: ownerProfile.name || 'You',
    senderAvatar: ownerProfile.avatarUrl,
    text: msgText,
    createdAt,
  }

  const customerMessage = {
    id: messageId,
    sender: 'shop',
    senderId: ownerUserId,
    senderName: ownerProfile.name || 'Shop',
    senderAvatar: ownerProfile.avatarUrl,
    text: msgText,
    createdAt,
  }

  emitCatMessageToUser(parsed.customerUserId, {
    scope: 'customer',
    conversationId: conversation.ConversationId,
    threadId: `customer-${parsed.customerUserId}`,
    message: customerMessage,
  })

  emitCatMessageToUser(ownerUserId, {
    scope: 'owner',
    conversationId: conversation.ConversationId,
    threadId: `customer-${parsed.customerUserId}`,
    message: ownerMessage,
  })

  return ownerMessage
}

async function resolveShopReceiverId() {
  const res = await query(
    `SELECT TOP 1 UserId
     FROM Users
     WHERE UPPER(CONVERT(nvarchar(20), RoleKey)) IN ('1', '2', 'OWNER', 'ADMIN', 'STAFF')
       AND (Status IS NULL OR UPPER(CONVERT(nvarchar(20), Status)) <> 'INACTIVE')
     ORDER BY UserId ASC`,
  )
  return String(res.recordset?.[0]?.UserId || '').trim() || null
}

async function listShopMemberIds() {
  const res = await query(
    `SELECT UserId
     FROM Users
     WHERE UPPER(CONVERT(nvarchar(20), RoleKey)) IN ('1', '2', 'OWNER', 'ADMIN', 'STAFF')
       AND (Status IS NULL OR UPPER(CONVERT(nvarchar(20), Status)) <> 'INACTIVE')`,
  )

  return Array.from(
    new Set(
      (res.recordset || [])
        .map((row) => String(row.UserId || '').trim())
        .filter(Boolean),
    ),
  )
}

async function listCustomerMessages(customerUserIdInput) {
  const customerUserId = requireUserId(customerUserIdInput)
  const conversation = await ensureConversationByCustomer(customerUserId)

  const result = await query(
    `SELECT
        m.MessageId,
        m.ConversationId,
        m.SenderId,
        su.Name AS SenderName,
        su.AvatarUrl AS SenderAvatar,
        m.MessageText,
        m.CreatedAt
      FROM Messages m
      LEFT JOIN Users su ON su.UserId = m.SenderId
      WHERE m.ConversationId = @conversationId
      ORDER BY m.CreatedAt ASC, m.MessageId ASC`,
    { conversationId: conversation.ConversationId },
  )

  return (result.recordset || []).map((row) => mapMessageForCustomer(row, customerUserId))
}

async function sendCustomerMessage(customerUserIdInput, { text } = {}) {
  const customerUserId = requireUserId(customerUserIdInput)
  const msgText = String(text || '').trim()
  if (!msgText) {
    const err = new Error('Missing text')
    err.status = 400
    throw err
  }

  const shopMemberIds = await listShopMemberIds()
  const shopReceiverId = shopMemberIds[0] || (await resolveShopReceiverId())
  const conversation = await ensureConversationByCustomer(customerUserId, shopReceiverId)
  const messageId = `MSG-${newId()}`
  const createdAt = new Date().toISOString()
  const customerProfile = await getUserProfile(customerUserId)

  await query(
    `INSERT INTO Messages (MessageId, ConversationId, SenderId, MessageText, CreatedAt)
     VALUES (@messageId, @conversationId, @senderId, @messageText, @createdAt)`,
    {
      messageId,
      conversationId: conversation.ConversationId,
      senderId: customerUserId,
      messageText: msgText,
      createdAt,
    },
  )

  const customerMessage = {
    id: messageId,
    sender: 'user',
    senderId: customerUserId,
    senderName: customerProfile.name || 'You',
    senderAvatar: customerProfile.avatarUrl,
    text: msgText,
    createdAt,
  }

  const ownerMessage = {
    id: messageId,
    from: 'customer',
    senderId: customerUserId,
    senderName: customerProfile.name || `Customer ${customerUserId}`,
    senderAvatar: customerProfile.avatarUrl,
    text: msgText,
    createdAt,
  }

  emitCatMessageToUsers([customerUserId, shopReceiverId], {
    scope: 'customer',
    conversationId: conversation.ConversationId,
    threadId: `customer-${customerUserId}`,
    message: customerMessage,
  })

  if (shopMemberIds.length) {
    emitCatMessageToUsers(shopMemberIds, {
      scope: 'owner',
      conversationId: conversation.ConversationId,
      threadId: `customer-${customerUserId}`,
      message: ownerMessage,
    })
  } else if (shopReceiverId) {
    emitCatMessageToUser(shopReceiverId, {
      scope: 'owner',
      conversationId: conversation.ConversationId,
      threadId: `customer-${customerUserId}`,
      message: ownerMessage,
    })
  }

  return customerMessage
}

module.exports = {
  listThreads,
  getMessages,
  sendMessage,
  listCustomerMessages,
  sendCustomerMessage,
}
