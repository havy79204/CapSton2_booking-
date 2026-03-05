const { query, newId } = require('../config/query')

async function ensureGiftCardTables() {
  // No-op here; schema managed externally
  return Promise.resolve()
}

async function getPublicBySalon(salonId) {
  return query('SELECT GiftCardId, SalonId, Title, Amount, Active, Description, CreatedAt, UpdatedAt FROM dbo.SalonGiftCards WHERE SalonId=@salonId ORDER BY CreatedAt DESC', { salonId })
}

async function findByCode(code) {
  return query('SELECT TOP 1 * FROM dbo.GiftCards WHERE Code=@code', { code })
}

async function updateBalanceAndSelect(code, amount) {
  const r = await query(
    `UPDATE dbo.GiftCards
     SET Balance = Balance - @amount, UpdatedAt = SYSUTCDATETIME()
     OUTPUT inserted.*
     WHERE Code=@code AND Balance >= @amount`,
    { code, amount },
  )
  return r.recordset && r.recordset[0] ? r.recordset[0] : null
}

async function insertRedemption({ id, giftCardId, code, amount, refType, refId, userId, userEmail, note }) {
  await query(
    `INSERT INTO dbo.GiftCardRedemptions(RedemptionId, GiftCardId, Code, Amount, RefType, RefId, UserId, UserEmail, Note, CreatedAt)
     VALUES(@id, @giftCardId, @code, @amount, @refType, @refId, @userId, @userEmail, @note, SYSUTCDATETIME())`,
    { id, giftCardId, code, amount, refType, refId, userId, userEmail, note },
  )
}

async function insertGiftCard({ id, code, salonId, amount, expiresAt, role, userId, userEmail, note }) {
  const giftId = id || newId()
  await query(
    `INSERT INTO dbo.GiftCards(GiftCardId, Code, SalonId, Amount, Balance, ExpiresAt, Role, UserId, UserEmail, Note, Status, CreatedAt, UpdatedAt)
     VALUES(@id, @code, @salonId, @amount, @amount, @expiresAt, @role, @userId, @userEmail, @note, @status, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    { id: giftId, code, salonId: salonId || null, amount, expiresAt: expiresAt || null, role: role || null, userId: userId || null, userEmail: userEmail || null, note: note || null, status: 'active' },
  )
  return query('SELECT TOP 1 * FROM dbo.GiftCards WHERE Code=@code', { code })
}

async function findByTitle(title) {
  return query('SELECT TOP 1 * FROM dbo.SalonGiftCards WHERE Title=@title', { title })
}

module.exports = { ensureGiftCardTables, getPublicBySalon, findByCode, updateBalanceAndSelect, insertRedemption, insertGiftCard, findByTitle }
