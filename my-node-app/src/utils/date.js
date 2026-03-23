const { pad2, toDateLabel } = require('./format')

function mondayOf(dateValue) {
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDay() 
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekNumber(dateValue) {
  // ISO week number (rough, sufficient for label)
  const d = new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

function toIsoDate(dateValue) {
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function buildWeekColumns(weekStart) {
  const columns = []
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  for (let i = 0; i < 7; i++) {
    const dt = new Date(weekStart)
    dt.setDate(dt.getDate() + i)
    columns.push({
      day: dayNames[dt.getDay()],
      date: toDateLabel(dt),
    })
  }
  return columns
}

function buildWeekRangeLabel(weekStart) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  return {
    from: toDateLabel(weekStart),
    to: `${toDateLabel(weekEnd)}/${weekEnd.getFullYear()}`,
    weekLabel: `Week ${getWeekNumber(weekStart)}`,
    weekStart: toIsoDate(weekStart),
  }
}

module.exports = {
  mondayOf,
  getWeekNumber,
  toIsoDate,
  buildWeekColumns,
  buildWeekRangeLabel,
}
