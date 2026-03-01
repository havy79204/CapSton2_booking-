const { query, newId } = require('../config/query')

async function getAllPromotions() {
  const r = await query('SELECT * FROM dbo.Promotions ORDER BY CreatedAt DESC')
  return r.recordset || []
}

async function getPromotionSalonMap(promoIds = []) {
  if (!promoIds || !promoIds.length) return {}
  const params = Object.fromEntries(promoIds.map((id, i) => [`p${i}`, id]))
  const sql = `SELECT PromotionId, SalonId FROM dbo.PromotionSalons WHERE PromotionId IN (${promoIds.map((_, i) => `@p${i}`).join(',')})`
  const r = await query(sql, params)
  return (r.recordset || []).reduce((acc, row) => {
    if (!acc[row.PromotionId]) acc[row.PromotionId] = []
    acc[row.PromotionId].push(row.SalonId)
    return acc
  }, {})
}

async function insertPromotion({ id, title, description, discountType, discountValue, startDate, endDate, active }) {
  const pid = id || newId()
  await query(
    `INSERT INTO dbo.Promotions(PromotionId, Title, Description, DiscountType, DiscountValue, StartDate, EndDate, Active, CreatedAt, UpdatedAt)
     VALUES(@id,@title,@description,@discountType,@discountValue,@startDate,@endDate,@active,SYSUTCDATETIME(),SYSUTCDATETIME())`,
    { id: pid, title, description: description || '', discountType, discountValue, startDate: startDate || null, endDate: endDate || null, active: active ? 1 : 0 },
  )
  return pid
}

async function insertPromotionSalons(promotionId, salonIds = []) {
  for (const sid of salonIds || []) {
    await query('INSERT INTO dbo.PromotionSalons(PromotionId, SalonId) VALUES(@promotionId, @salonId)', { promotionId, salonId: sid })
  }
}

async function updatePromotion(id, { title, description, discountType, discountValue, startDate, endDate, active }) {
  await query(
    `UPDATE dbo.Promotions SET Title=@title, Description=@description, DiscountType=@discountType, DiscountValue=@discountValue, StartDate=@startDate, EndDate=@endDate, Active=@active, UpdatedAt=SYSUTCDATETIME() WHERE PromotionId=@id`,
    { id, title, description: description || '', discountType, discountValue, startDate: startDate || null, endDate: endDate || null, active: active ? 1 : 0 },
  )
}

async function deletePromotion(id) {
  await query('DELETE FROM dbo.PromotionSalons WHERE PromotionId=@id', { id })
  await query('DELETE FROM dbo.Promotions WHERE PromotionId=@id', { id })
}

async function findActiveByTitle(title) {
  const r = await query('SELECT TOP 1 * FROM dbo.Promotions WHERE Title=@title AND Active=1 AND (StartDate IS NULL OR StartDate<=SYSUTCDATETIME()) AND (EndDate IS NULL OR EndDate>=SYSUTCDATETIME())', { title })
  return r.recordset[0] || null
}

async function getPromotionSalons(promotionId) {
  const r = await query('SELECT SalonId FROM dbo.PromotionSalons WHERE PromotionId=@id', { id: promotionId })
  return (r.recordset || []).map((r2) => r2.SalonId)
}

module.exports = {
  getAllPromotions,
  getPromotionSalonMap,
  insertPromotion,
  insertPromotionSalons,
  updatePromotion,
  deletePromotion,
  findActiveByTitle,
  getPromotionSalons,
}
