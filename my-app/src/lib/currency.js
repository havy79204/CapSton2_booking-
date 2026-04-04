export function formatVnd(value) {
  const amount = Number(value || 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0

  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(safeAmount)
}
