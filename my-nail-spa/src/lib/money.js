const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

export function formatVnd(amount) {
  const value = Number(amount) || 0
  return vndFormatter.format(value)
}

export const formatCurrency = formatVnd
export { formatVnd as formatUsd }
