import React from 'react'
import { IconClock } from './Layout portal/PortalIcons.jsx'

/**
 * TimeInputGroup Component
 * Reusable component for time input fields with better UI
 *
 * @param {Object} props
 * @param {string} props.label - Label for the time field
 * @param {string} props.value - Current time value (HH:mm format)
 * @param {Function} props.onChange - Callback when time changes
 * @param {string} [props.error] - Error message to display
 * @param {string} [props.hint] - Helper text below the field
 * @param {boolean} [props.required] - Whether field is required
 * @param {boolean} [props.hideIcon] - Hide the clock icon
 */
export default function TimeInputGroup({ label, value, onChange, error, hint, required = false, hideIcon = false }) {
  return (
    <label className="portal-field" data-hide-icon={hideIcon}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span className="portal-label">{label}</span>
        {required && <span style={{ color: '#d32f2f', fontSize: '14px' }}>*</span>}
      </div>
      <div className="portal-inputWithIcon">
        <input
          className={`portal-input ${error ? 'portal-input-error' : ''}`}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={error ? `${label}-error` : hint ? `${label}-hint` : undefined}
        />
        {!hideIcon && (
          <span className="portal-inputIcon" aria-hidden="true">
            <IconClock />
          </span>
        )}
      </div>
      {error && (
        <span id={`${label}-error`} className="portal-fieldError" style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
          {error}
        </span>
      )}
      {hint && !error && (
        <span id={`${label}-hint`} className="portal-fieldHint" style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
          {hint}
        </span>
      )}
    </label>
  )
}
