import React from 'react'

/**
 * PromotionItem Component
 * Displays and edits a single promotion with validation
 *
 * @param {Object} props
 * @param {Object} props.promotion - Promotion data
 * @param {number} props.index - Index in the promotions array
 * @param {Function} props.onChange - Callback when promotion changes
 * @param {Function} props.onRemove - Callback to remove this promotion
 * @param {boolean} [props.showRemove] - Whether to show remove button
 */
export default function PromotionItem({ promotion, index, onChange, onRemove, showRemove = true }) {
  const handleChange = (field, value) => {
    onChange({
      ...promotion,
      [field]: value,
    })
  }

  const getErrors = () => {
    const errors = {}

    if (!promotion.title || promotion.title.trim() === '') {
      errors.title = 'Program name is required'
    }
    if (!promotion.code || promotion.code.trim() === '') {
      errors.code = 'Promotion code is required'
    }
    if (!promotion.discountType || promotion.discountType.trim() === '') {
      errors.discountType = 'Discount type is required'
    }
    if (promotion.value === undefined || promotion.value === null || promotion.value === '') {
      errors.value = 'Discount value is required'
    } else if (Number(promotion.value) < 0) {
      errors.value = 'Value cannot be negative'
    } else if (promotion.discountType === 'percentage' && Number(promotion.value) > 100) {
      errors.value = 'Percentage cannot exceed 100%'
    }
    if (!promotion.startDate) {
      errors.startDate = 'Start date is required'
    }
    if (!promotion.endDate) {
      errors.endDate = 'End date is required'
    }
    if (promotion.maxUsesPerUser !== null && promotion.maxUsesPerUser !== undefined && promotion.maxUsesPerUser !== '') {
      const perUser = Number(promotion.maxUsesPerUser)
      if (!Number.isFinite(perUser) || perUser < 1) {
        errors.maxUsesPerUser = 'Max uses per user must be at least 1'
      }
    }
    if (promotion.startDate && promotion.endDate && new Date(promotion.startDate) > new Date(promotion.endDate)) {
      errors.endDate = 'End date must be after start date'
    }

    return errors
  }

  const errors = getErrors()

  return (
    <div className="portal-promotionItem">
      <div className="portal-promotionItemHeader">
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Promotion #{index + 1}</h3>
        {showRemove && (
          <button
            type="button"
            className="portal-promotionRemoveBtn"
            onClick={onRemove}
            aria-label={`Remove promotion ${index + 1}`}
            style={{
              background: '#fee',
              color: '#d32f2f',
              border: '1px solid #ffcdd2',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#ffcdd2'
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#fee'
            }}
          >
            Remove
          </button>
        )}
      </div>

      <div className="portal-formGrid2" style={{ marginBottom: '12px' }}>
        <label className="portal-field">
          <span className="portal-label">
            Program Name <span style={{ color: '#d32f2f' }}>*</span>
          </span>
          <input
            className={`portal-input ${errors.title ? 'portal-input-error' : ''}`}
            type="text"
            placeholder="e.g., Summer Glow 2026"
            value={promotion.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            aria-invalid={!!errors.title}
          />
          {errors.title && <span style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>{errors.title}</span>}
        </label>

        <label className="portal-field">
          <span className="portal-label">
            Promotion Code <span style={{ color: '#d32f2f' }}>*</span>
          </span>
          <input
            className={`portal-input ${errors.code ? 'portal-input-error' : ''}`}
            type="text"
            placeholder="e.g., SUMMER20"
            value={promotion.code}
            onChange={(e) => handleChange('code', e.target.value)}
            aria-invalid={!!errors.code}
          />
          {errors.code && <span style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>{errors.code}</span>}
        </label>

        <label className="portal-field">
          <span className="portal-label">
            Discount Type <span style={{ color: '#d32f2f' }}>*</span>
          </span>
          <select
            className={`portal-input ${errors.discountType ? 'portal-input-error' : ''}`}
            value={promotion.discountType}
            onChange={(e) => handleChange('discountType', e.target.value)}
            aria-invalid={!!errors.discountType}
          >
            <option value="">-- Select Type --</option>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount</option>
          </select>
          {errors.discountType && <span style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>{errors.discountType}</span>}
        </label>

        <label className="portal-field">
          <span className="portal-label">
            Discount Value <span style={{ color: '#d32f2f' }}>*</span>
          </span>
          <input
            className={`portal-input ${errors.value ? 'portal-input-error' : ''}`}
            type="number"
            placeholder={promotion.discountType === 'percentage' ? '0 - 100' : '0.00'}
            value={promotion.value}
            onChange={(e) => handleChange('value', e.target.value)}
            min="0"
            step={promotion.discountType === 'percentage' ? '1' : '0.01'}
            aria-invalid={!!errors.value}
          />
          {errors.value && <span style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>{errors.value}</span>}
        </label>

        <label className="portal-field">
          <span className="portal-label">Max Uses (optional)</span>
          <input
            className="portal-input"
            type="number"
            placeholder="Leave blank for unlimited"
            value={promotion.maxUses || ''}
            onChange={(e) => handleChange('maxUses', e.target.value ? Number(e.target.value) : null)}
            min="1"
          />
        </label>

        <label className="portal-field">
          <span className="portal-label">Max Uses Per User (optional)</span>
          <input
            className={`portal-input ${errors.maxUsesPerUser ? 'portal-input-error' : ''}`}
            type="number"
            placeholder="Leave blank for unlimited"
            value={promotion.maxUsesPerUser || ''}
            onChange={(e) => handleChange('maxUsesPerUser', e.target.value ? Number(e.target.value) : null)}
            min="1"
            aria-invalid={!!errors.maxUsesPerUser}
          />
          {errors.maxUsesPerUser ? <span style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>{errors.maxUsesPerUser}</span> : null}
        </label>

        <label className="portal-field">
          <span className="portal-label">
            Valid From <span style={{ color: '#d32f2f' }}>*</span>
          </span>
          <input
            className={`portal-input ${errors.startDate ? 'portal-input-error' : ''}`}
            type="date"
            value={promotion.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            aria-invalid={!!errors.startDate}
          />
          {errors.startDate && <span style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>{errors.startDate}</span>}
        </label>

        <label className="portal-field">
          <span className="portal-label">
            Valid Until <span style={{ color: '#d32f2f' }}>*</span>
          </span>
          <input
            className={`portal-input ${errors.endDate ? 'portal-input-error' : ''}`}
            type="date"
            value={promotion.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
            aria-invalid={!!errors.endDate}
          />
          {errors.endDate && <span style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>{errors.endDate}</span>}
        </label>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={promotion.isActive || false}
            onChange={(e) => handleChange('isActive', e.target.checked)}
            style={{ marginTop: '4px' }}
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
