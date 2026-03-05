const { query, newId } = require('../config/query')

async function getSalonReviews(salonId) {
  const r = await query('SELECT * FROM dbo.SalonReviews WHERE SalonId=@salonId ORDER BY CreatedAt DESC', { salonId })
  return r.recordset || []
}

async function insertSalonReview({ id, salonId, userId, userName, rating, text, verified }) {
  const rid = id || newId()
  await query(`
    INSERT INTO dbo.SalonReviews(ReviewId, SalonId, UserId, UserName, Rating, Text, CreatedAt, Verified) 
    VALUES(@id, @salonId, @userId, @userName, @rating, @text, SYSUTCDATETIME(), @verified)
  `, { 
    id: rid, 
    salonId, 
    userId: userId || null,
    userName, 
    rating, 
    text: text || null, 
    verified: verified ? 1 : 0 
  })
  const r = await query('SELECT TOP 1 * FROM dbo.SalonReviews WHERE ReviewId=@id', { id: rid })
  return r.recordset[0]
}

async function getProductReviews(productId) {
  const r = await query('SELECT * FROM dbo.ProductReviews WHERE ProductId=@productId ORDER BY CreatedAt DESC', { productId })
  return r.recordset || []
}

async function insertProductReview({ id, productId, userId, userName, rating, text, verified }) {
  const rid = id || newId()
  await query(`
    INSERT INTO dbo.ProductReviews(ReviewId, ProductId, UserId, UserName, Rating, Text, CreatedAt, Verified) 
    VALUES(@id, @productId, @userId, @userName, @rating, @text, SYSUTCDATETIME(), @verified)
  `, { 
    id: rid, 
    productId, 
    userId: userId || null,
    userName, 
    rating, 
    text: text || null, 
    verified: verified ? 1 : 0 
  })
  const r = await query('SELECT TOP 1 * FROM dbo.ProductReviews WHERE ReviewId=@id', { id: rid })
  return r.recordset[0]
}

async function getProductReviewsForSalon(salonId) {
  const r = await query(`
    SELECT pr.*, p.Name as ProductName
    FROM dbo.ProductReviews pr
    JOIN dbo.Products p ON pr.ProductId = p.ProductId
    WHERE p.SalonId = @salonId
    ORDER BY pr.CreatedAt DESC
  `, { salonId })
  return r.recordset || []
}

async function deleteReviewById(id) {
  await query('DELETE FROM dbo.SalonReviews WHERE ReviewId=@id', { id })
  await query('DELETE FROM dbo.ProductReviews WHERE ReviewId=@id', { id })
}

module.exports = {
  getSalonReviews,
  insertSalonReview,
  getProductReviews,
  insertProductReview,
  getProductReviewsForSalon,
  deleteReviewById,
}
