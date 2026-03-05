const { z } = require('zod')
const variantsRepo = require('../repositories/productVariantsRepository')
const productsRepo = require('../repositories/productsRepository')

/**
 * List all variants for a product
 * GET /api/products/:productId/variants
 */
async function listVariants(req, res, next) {
  try {
    const productId = String(req.params.productId || '').trim()
    const variants = await variantsRepo.findByProductId(productId)
    
    const items = variants.map(v => ({
      id: v.VariantId,
      productId: v.ProductId,
      name: v.VariantName,
      type: v.VariantType,
      priceAdjustment: v.PriceAdjustment ? Number(v.PriceAdjustment) : 0,
      stockQty: v.StockQty !== null ? Number(v.StockQty) : null,
      imageUrl: v.ImageUrl,
      displayOrder: v.DisplayOrder,
      isAvailable: Boolean(v.IsAvailable),
      createdAt: v.CreatedAt
    }))
    
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

/**
 * Create a new variant
 * POST /api/products/:productId/variants
 */
async function createVariant(req, res, next) {
  try {
    const productId = String(req.params.productId || '').trim()
    
    // Check if product exists
    const includeSku = await productsRepo.hasProductsSkuColumn()
    const product = await productsRepo.findById(productId, includeSku)
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    
    // Validate permissions
    if (req.user?.role === 'owner') {
      const mySalonId = String(req.user.salonId || '').trim()
      const productSalonId = product.SalonId ? String(product.SalonId) : 'global'
      if (!mySalonId || productSalonId !== mySalonId) {
        return res.status(403).json({ error: 'Forbidden' })
      }
    }
    
    const schema = z.object({
      name: z.string().min(1),
      type: z.string().optional(),
      priceAdjustment: z.number().optional(),
      stockQty: z.number().int().nonnegative().optional(),
      imageUrl: z.string().optional(),
      displayOrder: z.number().int().optional(),
      isAvailable: z.boolean().optional()
    })
    
    const data = schema.parse(req.body)
    
    const variantId = await variantsRepo.create({
      productId,
      variantName: data.name,
      variantType: data.type || 'Type',
      priceAdjustment: data.priceAdjustment || 0,
      stockQty: data.stockQty,
      imageUrl: data.imageUrl,
      displayOrder: data.displayOrder || 0,
      isAvailable: data.isAvailable !== false
    })
    
    const created = await variantsRepo.findById(variantId)
    
    res.status(201).json({
      item: {
        id: created.VariantId,
        productId: created.ProductId,
        name: created.VariantName,
        type: created.VariantType,
        priceAdjustment: created.PriceAdjustment ? Number(created.PriceAdjustment) : 0,
        stockQty: created.StockQty !== null ? Number(created.StockQty) : null,
        imageUrl: created.ImageUrl,
        displayOrder: created.DisplayOrder,
        isAvailable: Boolean(created.IsAvailable),
        createdAt: created.CreatedAt
      }
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Update a variant
 * PATCH /api/products/:productId/variants/:variantId
 */
async function updateVariant(req, res, next) {
  try {
    const productId = String(req.params.productId || '').trim()
    const variantId = String(req.params.variantId || '').trim()
    
    const existing = await variantsRepo.findById(variantId)
    if (!existing || existing.ProductId !== productId) {
      return res.status(404).json({ error: 'Variant not found' })
    }
    
    // Check product ownership
    const includeSku = await productsRepo.hasProductsSkuColumn()
    const product = await productsRepo.findById(productId, includeSku)
    if (req.user?.role === 'owner') {
      const mySalonId = String(req.user.salonId || '').trim()
      const productSalonId = product.SalonId ? String(product.SalonId) : 'global'
      if (!mySalonId || productSalonId !== mySalonId) {
        return res.status(403).json({ error: 'Forbidden' })
      }
    }
    
    const schema = z.object({
      name: z.string().min(1).optional(),
      type: z.string().optional(),
      priceAdjustment: z.number().optional(),
      stockQty: z.number().int().nonnegative().optional().nullable(),
      imageUrl: z.string().optional().nullable(),
      displayOrder: z.number().int().optional(),
      isAvailable: z.boolean().optional()
    })
    
    const data = schema.parse(req.body)
    
    await variantsRepo.update(variantId, {
      variantName: data.name,
      variantType: data.type,
      priceAdjustment: data.priceAdjustment,
      stockQty: data.stockQty,
      imageUrl: data.imageUrl,
      displayOrder: data.displayOrder,
      isAvailable: data.isAvailable
    })
    
    const updated = await variantsRepo.findById(variantId)
    
    res.json({
      item: {
        id: updated.VariantId,
        productId: updated.ProductId,
        name: updated.VariantName,
        type: updated.VariantType,
        priceAdjustment: updated.PriceAdjustment ? Number(updated.PriceAdjustment) : 0,
        stockQty: updated.StockQty !== null ? Number(updated.StockQty) : null,
        imageUrl: updated.ImageUrl,
        displayOrder: updated.DisplayOrder,
        isAvailable: Boolean(updated.IsAvailable),
        createdAt: updated.CreatedAt
      }
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Delete a variant
 * DELETE /api/products/:productId/variants/:variantId
 */
async function deleteVariant(req, res, next) {
  try {
    const productId = String(req.params.productId || '').trim()
    const variantId = String(req.params.variantId || '').trim()
    
    const existing = await variantsRepo.findById(variantId)
    if (!existing || existing.ProductId !== productId) {
      return res.status(404).json({ error: 'Variant not found' })
    }
    
    // Check product ownership
    const includeSku = await productsRepo.hasProductsSkuColumn()
    const product = await productsRepo.findById(productId, includeSku)
    if (req.user?.role === 'owner') {
      const mySalonId = String(req.user.salonId || '').trim()
      const productSalonId = product.SalonId ? String(product.SalonId) : 'global'
      if (!mySalonId || productSalonId !== mySalonId) {
        return res.status(403).json({ error: 'Forbidden' })
      }
    }
    
    await variantsRepo.deleteVariant(variantId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant
}
