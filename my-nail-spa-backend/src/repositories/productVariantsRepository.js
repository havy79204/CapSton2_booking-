const { query, newId } = require('../config/query')

/**
 * Get all variants for a product
 */
async function findByProductId(productId) {
  const sql = `
    SELECT 
      VariantId, ProductId, VariantName, VariantType, 
      PriceAdjustment, StockQty, ImageUrl, DisplayOrder, IsAvailable,
      CreatedAt
    FROM dbo.ProductVariants 
    WHERE ProductId = @productId 
    ORDER BY DisplayOrder ASC, VariantName ASC
  `
  try {
    const r = await query(sql, { productId })
    return r.recordset || []
  } catch {
    return []
  }
}
async function findById(variantId) {
  const sql = `
    SELECT TOP 1
      VariantId, ProductId, VariantName, VariantType, 
      PriceAdjustment, StockQty, ImageUrl, DisplayOrder, IsAvailable,
      CreatedAt
    FROM dbo.ProductVariants 
    WHERE VariantId = @variantId
  `
  try {
    const r = await query(sql, { variantId })
    return r.recordset[0] || null
  } catch {
    return null
  }
}

/**
 * Create a new variant
 */
async function create({ productId, variantName, variantType, priceAdjustment, stockQty, imageUrl, displayOrder, isAvailable }) {
  const variantId = newId()
  const sql = `
    INSERT INTO dbo.ProductVariants (
      VariantId, ProductId, VariantName, VariantType, 
      PriceAdjustment, StockQty, ImageUrl, DisplayOrder, IsAvailable,
      CreatedAt
    )
    VALUES (
      @variantId, @productId, @variantName, @variantType,
      @priceAdjustment, @stockQty, @imageUrl, @displayOrder, @isAvailable,
      SYSUTCDATETIME()
    )
  `
  await query(sql, {
    variantId,
    productId,
    variantName,
    variantType: variantType || 'Type',
    priceAdjustment: priceAdjustment || 0,
    stockQty: stockQty !== undefined ? stockQty : null,
    imageUrl: imageUrl || null,
    displayOrder: displayOrder !== undefined ? displayOrder : 0,
    isAvailable: isAvailable !== undefined ? isAvailable : true
  })
  return variantId
}

/**
 * Update a variant
 */
async function update(variantId, { variantName, variantType, priceAdjustment, stockQty, imageUrl, displayOrder, isAvailable }) {
  const updates = []
  const params = { variantId }
  
  if (variantName !== undefined) {
    updates.push('VariantName = @variantName')
    params.variantName = variantName
  }
  if (variantType !== undefined) {
    updates.push('VariantType = @variantType')
    params.variantType = variantType
  }
  if (priceAdjustment !== undefined) {
    updates.push('PriceAdjustment = @priceAdjustment')
    params.priceAdjustment = priceAdjustment
  }
  if (stockQty !== undefined) {
    updates.push('StockQty = @stockQty')
    params.stockQty = stockQty
  }
  if (imageUrl !== undefined) {
    updates.push('ImageUrl = @imageUrl')
    params.imageUrl = imageUrl
  }
  if (displayOrder !== undefined) {
    updates.push('DisplayOrder = @displayOrder')
    params.displayOrder = displayOrder
  }
  if (isAvailable !== undefined) {
    updates.push('IsAvailable = @isAvailable')
    params.isAvailable = isAvailable
  }
  
  if (updates.length === 0) return
  
  const sql = `UPDATE dbo.ProductVariants SET ${updates.join(', ')} WHERE VariantId = @variantId`
  await query(sql, params)
}

/**
 * Delete a variant (hard delete)
 */
async function deleteVariant(variantId) {
  const sql = `DELETE FROM dbo.ProductVariants WHERE VariantId = @variantId`
  await query(sql, { variantId })
}

/**
 * Bulk create variants for a product
 */
async function bulkCreate(productId, variants = []) {
  if (!Array.isArray(variants) || variants.length === 0) return []
  
  const createdIds = []
  for (const variant of variants) {
    const id = await create({
      productId,
      variantName: variant.name,
      variantType: variant.type,
      priceAdjustment: variant.priceAdjustment,
      stockQty: variant.stockQty,
      imageUrl: variant.imageUrl,
      displayOrder: variant.displayOrder,
      isAvailable: variant.isAvailable
    })
    createdIds.push(id)
  }
  
  return createdIds
}

module.exports = {
  findByProductId,
  findById,
  create,
  update,
  deleteVariant,
  bulkCreate
}
