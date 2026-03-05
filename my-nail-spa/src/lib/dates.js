export function startOfWeekISO(date = new Date()) {
  const base = typeof date === 'string' ? `${date.slice(0, 10)}T00:00:00Z` : `${new Date(date).toISOString().slice(0, 10)}T00:00:00Z`
  const d = new Date(base)
  const day = d.getUTCDay() // 0 = Sun
  const diff = (day + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function addDaysISO(iso, days) {
  const d = new Date(`${String(iso || '').slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatWeekRange(weekStartISO) {
  const start = new Date(`${weekStartISO}T12:00:00Z`)
  const end = new Date(`${addDaysISO(weekStartISO, 6)}T12:00:00Z`)
  const fmt = (x) =>
    x.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
  return `${fmt(start)} – ${fmt(end)}`
}
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}
export function parseHour(time) {
  const m = String(time || '').match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1])
}
