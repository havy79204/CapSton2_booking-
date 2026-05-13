import React from 'react'

export default function PromotionItem({ promotion, index, onChange, onRemove, showRemove = true }) {
  const handleChange = (field, value) => {
    onChange({
      ...promotion,
      [field]: value,
    })
  }

  return (
    <div className="portal-promotionItem">
      <div className="portal-promotionItemHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Promotion #{index + 1}</h3>
        {showRemove ? (
          <button
            type="button"
            className="portal-promotionRemoveBtn"
            onClick={onRemove}
            aria-label={`Remove promotion ${index + 1}`}
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="portal-formGrid2" style={{ marginBottom: 12 }}>
        <label className="portal-field">
          <span className="portal-label">Program Name</span>
          <input
            className="portal-input"
            type="text"
            placeholder="e.g., Summer Glow"
            value={promotion.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
          />
        </label>

        <label className="portal-field">
          <span className="portal-label">Promotion Code</span>
          <input
            className="portal-input"
            type="text"
            placeholder="e.g., SUMMER20"
            value={promotion.code || ''}
            onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
          />
        </label>

        <label className="portal-field">
          <span className="portal-label">Discount Type</span>
          <select
            className="portal-input"
            value={promotion.discountType || 'percentage'}
            onChange={(e) => handleChange('discountType', e.target.value)}
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount</option>
          </select>
        </label>

        <label className="portal-field">
          <span className="portal-label">Discount Value</span>
          <input
            className="portal-input"
            type="number"
            min="0"
            step={promotion.discountType === 'percentage' ? '1' : '0.01'}
            placeholder={promotion.discountType === 'percentage' ? '0 - 100' : '0.00'}
            value={promotion.value ?? ''}
            onChange={(e) => handleChange('value', e.target.value)}
          />
        </label>

        <label className="portal-field">
          <span className="portal-label">Valid From</span>
          <input
            className="portal-input"
            type="date"
            value={promotion.startDate || ''}
            onChange={(e) => handleChange('startDate', e.target.value)}
          />
        </label>

        <label className="portal-field">
          <span className="portal-label">Valid Until</span>
          <input
            className="portal-input"
            type="date"
            value={promotion.endDate || ''}
            onChange={(e) => handleChange('endDate', e.target.value)}
          />
        </label>

        <label className="portal-field">
          <span className="portal-label">Max Uses (optional)</span>
          <input
            className="portal-input"
            type="number"
            min="1"
            placeholder="Leave blank for unlimited"
            value={promotion.maxUses ?? ''}
            onChange={(e) => handleChange('maxUses', e.target.value ? Number(e.target.value) : null)}
          />
        </label>

        <label className="portal-field">
          <span className="portal-label">Max Uses Per User (optional)</span>
          <input
            className="portal-input"
            type="number"
            min="1"
            placeholder="Leave blank for unlimited"
            value={promotion.maxUsesPerUser ?? ''}
            onChange={(e) => handleChange('maxUsesPerUser', e.target.value ? Number(e.target.value) : null)}
          />
        </label>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(promotion.isActive)}
            onChange={(e) => handleChange('isActive', e.target.checked)}
          />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600' }}>Active</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Enable this promotion for use</div>
          </div>
        </label>
      </div>
    </div>
  )
}
