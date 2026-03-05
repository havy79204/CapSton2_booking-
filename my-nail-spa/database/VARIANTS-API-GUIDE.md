# Product Variants API Documentation

Complete API documentation for managing product variants (colors, types, sizes, etc.)

## Overview

Product variants allow you to offer different options for a single product, such as:
- **Colors**: Pink, Red, White, Blue, etc.
- **Sizes**: Small, Medium, Large
- **Types**: Classic, Premium, Deluxe
- **Scents**: Lavender, Rose, Unscented

Each variant can have:
- Individual price adjustment (±$X.XX from base product price)
- Individual stock quantity
- Optional custom image
- Display order
- Availability status

## API Endpoints

### 1. List Product Variants

Get all variants for a specific product.

**Endpoint:** `GET /api/products/:productId/variants`

**Auth Required:** No

**Example Request:**
```bash
curl http://localhost:3001/api/products/prod-cooling-gel-001/variants
```

**Example Response:**
```json
{
  "items": [
    {
      "id": "var-001",
      "productId": "prod-cooling-gel-001",
      "name": "Pink",
      "type": "Color",
      "priceAdjustment": 0,
      "stockQty": 45,
      "imageUrl": null,
      "displayOrder": 0,
      "isAvailable": true,
      "createdAt": "2026-03-05T10:30:00Z"
    },
    {
      "id": "var-002",
      "productId": "prod-cooling-gel-001",
      "name": "Red",
      "type": "Color",
      "priceAdjustment": 0,
      "stockQty": 38,
      "imageUrl": null,
      "displayOrder": 1,
      "isAvailable": true,
      "createdAt": "2026-03-05T10:30:00Z"
    }
  ]
}
```

---

### 2. Create Product Variant

Add a new variant to a product.

**Endpoint:** `POST /api/products/:productId/variants`

**Auth Required:** Yes (Admin or Owner)

**Request Body:**
```json
{
  "name": "Blue",              // Required
  "type": "Color",             // Optional, default: "Type"
  "priceAdjustment": 2.00,     // Optional, default: 0
  "stockQty": 50,              // Optional, default: null (use product stock)
  "imageUrl": "/images/blue-variant.jpg",  // Optional
  "displayOrder": 3,           // Optional, default: 0
  "isAvailable": true          // Optional, default: true
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3001/api/products/prod-cooling-gel-001/variants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Blue",
    "type": "Color",
    "priceAdjustment": 1.50,
    "stockQty": 60
  }'
```

**Example Response:**
```json
{
  "item": {
    "id": "var-004",
    "productId": "prod-cooling-gel-001",
    "name": "Blue",
    "type": "Color",
    "priceAdjustment": 1.5,
    "stockQty": 60,
    "imageUrl": null,
    "displayOrder": 0,
    "isAvailable": true,
    "createdAt": "2026-03-05T14:25:00Z"
  }
}
```

---

### 3. Update Product Variant

Update an existing variant.

**Endpoint:** `PATCH /api/products/:productId/variants/:variantId`

**Auth Required:** Yes (Admin or Owner)

**Request Body:** (All fields optional)
```json
{
  "name": "Royal Blue",
  "priceAdjustment": 2.50,
  "stockQty": 55,
  "isAvailable": true
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:3001/api/products/prod-cooling-gel-001/variants/var-004 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "stockQty": 45,
    "priceAdjustment": 2.00
  }'
```

**Example Response:**
```json
{
  "item": {
    "id": "var-004",
    "productId": "prod-cooling-gel-001",
    "name": "Blue",
    "type": "Color",
    "priceAdjustment": 2.0,
    "stockQty": 45,
    "imageUrl": null,
    "displayOrder": 0,
    "isAvailable": true,
    "createdAt": "2026-03-05T14:25:00Z"
  }
}
```

---

### 4. Delete Product Variant

Remove a variant from a product.

**Endpoint:** `DELETE /api/products/:productId/variants/:variantId`

**Auth Required:** Yes (Admin or Owner)

**Example Request:**
```bash
curl -X DELETE http://localhost:3001/api/products/prod-cooling-gel-001/variants/var-004 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Example Response:**
```json
{
  "ok": true
}
```

---

## Frontend Usage Examples

### Using with React

```javascript
import { api } from '../lib/api'

// List variants
const variants = await api.listProductVariants('prod-001')
console.log(variants.items)

// Create variant
const newVariant = await api.createProductVariant('prod-001', {
  name: 'Midnight Blue',
  type: 'Color',
  priceAdjustment: 3.00,
  stockQty: 30
})

// Update variant
await api.updateProductVariant('prod-001', 'var-123', {
  stockQty: 25
})

// Delete variant
await api.deleteProductVariant('prod-001', 'var-123')
```

### In Admin Panel Component

```jsx
function ProductVariantsManager({ productId }) {
  const [variants, setVariants] = useState([])
  
  useEffect(() => {
    loadVariants()
  }, [productId])
  
  async function loadVariants() {
    const res = await api.listProductVariants(productId)
    setVariants(res.items)
  }
  
  async function addVariant(data) {
    await api.createProductVariant(productId, data)
    await loadVariants()
  }
  
  async function updateVariant(variantId, data) {
    await api.updateProductVariant(productId, variantId, data)
    await loadVariants()
  }
  
  async function removeVariant(variantId) {
    if (confirm('Delete this variant?')) {
      await api.deleteProductVariant(productId, variantId)
      await loadVariants()
    }
  }
  
  return (
    <div>
      <h3>Product Variants</h3>
      {variants.map(v => (
        <div key={v.id}>
          <span>{v.name}</span>
          <span>Stock: {v.stockQty}</span>
          <button onClick={() => removeVariant(v.id)}>Delete</button>
        </div>
      ))}
      <button onClick={() => addVariant({ name: 'New Variant', type: 'Color' })}>
        Add Variant
      </button>
    </div>
  )
}
```

## Common Use Cases

### 1. Color Variants
```json
{
  "name": "Rose Gold",
  "type": "Color",
  "priceAdjustment": 0,
  "stockQty": 40
}
```

### 2. Size Variants with Price Difference
```json
{
  "name": "Large (16oz)",
  "type": "Size",
  "priceAdjustment": 5.00,
  "stockQty": 25
}
```

### 3. Premium Variant
```json
{
  "name": "Premium Edition",
  "type": "Tier",
  "priceAdjustment": 10.00,
  "stockQty": 15,
  "imageUrl": "/images/premium-edition.jpg"
}
```

### 4. Scented Variants
```json
{
  "name": "Lavender Scent",
  "type": "Scent",
  "priceAdjustment": 0,
  "stockQty": 100
}
```

## Permissions

- **Public**: Can view variants (GET)
- **Owner**: Can manage variants for their salon's products
- **Admin**: Can manage all variants

## Frontend Display Logic

The ProductDetailPage automatically:
1. Loads variants from API when fetching product
2. Shows variant selector only if variants exist
3. Updates price based on selected variant's priceAdjustment
4. Shows stock quantity for selected variant
5. Uses variant-specific image if available

## Error Handling

### 404 - Product Not Found
```json
{
  "error": "Product not found"
}
```

### 404 - Variant Not Found
```json
{
  "error": "Variant not found"
}
```

### 403 - Forbidden
```json
{
  "error": "Forbidden"
}
```

Owner trying to modify another salon's product variants.

### 400 - Validation Error
```json
{
  "error": "Validation failed",
  "details": [...]
}
```

## Best Practices

1. **Organize by Type**: Group similar variants (all colors together, all sizes together)
2. **Use Display Order**: Control the order variants appear in UI
3. **Stock Management**: Use variant-level stock for better inventory control
4. **Price Adjustments**: Keep adjustments reasonable (±20% of base price)
5. **Availability**: Mark variants as unavailable instead of deleting them
6. **Images**: Provide variant-specific images for visual clarity

## Testing

Test the API routes with sample data:

```bash
# 1. Create product
curl -X POST http://localhost:3001/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name": "Test Product", "price": 20.00}'

# 2. Add variants
curl -X POST http://localhost:3001/api/products/PRODUCT_ID/variants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name": "Pink", "type": "Color", "stockQty": 50}'

# 3. List variants
curl http://localhost:3001/api/products/PRODUCT_ID/variants

# 4. Update variant
curl -X PATCH http://localhost:3001/api/products/PRODUCT_ID/variants/VARIANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"stockQty": 45}'

# 5. Delete variant
curl -X DELETE http://localhost:3001/api/products/PRODUCT_ID/variants/VARIANT_ID \
  -H "Authorization: Bearer TOKEN"
```
