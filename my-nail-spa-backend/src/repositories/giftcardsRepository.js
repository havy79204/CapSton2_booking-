const { query, newId } = require('../config/query')

async function findPublicBySalon(salonId) {
  return query('SELECT * FROM dbo.SalonGiftCards WHERE SalonId=@salonId ORDER BY CreatedAt DESC', { salonId })
}

async function findByCode(code) {
  return query('SELECT TOP 1 * FROM dbo.GiftCards WHERE Code=@code', { code })
}

async function insertGiftCard({ id, salonId, title, amount, description, active }) {
  const giftId = id || newId()
  await query(
    `INSERT INTO dbo.GiftCards(GiftCardId, SalonId, Title, Amount, Description, Active, CreatedAt, UpdatedAt)
     VALUES(@id, @salonId, @title, @amount, @description, @active, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    { id: giftId, salonId, title, amount, description, active: active ? 1 : 0 },
  )
  return query('SELECT TOP 1 * FROM dbo.GiftCards WHERE GiftCardId=@id', { id: giftId })
}

async function applyGiftCard(code, amount) {
  // Find and ensure active
  const r = await findByCode(code)
  const row = r.recordset[0]
  if (!row || !row.Active) return null
  // Business rules for applying value kept in service layer
  return row
}

module.exports = { findPublicBySalon, findByCode, insertGiftCard, applyGiftCard }
