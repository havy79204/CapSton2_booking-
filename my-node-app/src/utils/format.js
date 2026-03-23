function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatVnd(value) {
  const n = Number(value || 0)
  return `${n.toLocaleString('en-US')} ₫`
}

function formatDmy(dateValue) {
  if (!dateValue) return ''
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return ''
  const dd = d.getDate()
  const mm = d.getMonth() + 1
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatHm(dateValue) {
  if (!dateValue) return ''
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function toDateLabel(dateValue) {
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
}

module.exports = {
  pad2,
  formatVnd,
  formatDmy,
  formatHm,
  toDateLabel,
}
