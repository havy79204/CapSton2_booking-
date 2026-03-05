import { useMemo } from 'react'
import { WEEK_DAYS, addDaysISO } from '../lib/dates'

export function WeeklyCalendar({
  startHour,
  endHour,
  events,
  availabilitySlots,
  onCellClick,
  headerRight,
  weekStartISO,
  slotVariant = 'available', // 'available' (green) | 'busy' (red)
}) {
  const hours = Math.max(1, endHour - startHour)

  const timeLabels = useMemo(() => {
    const list = []
    for (let h = startHour; h < endHour; h += 1) {
      list.push(`${String(h).padStart(2, '0')}:00`)
    }
    return list
  }, [startHour, endHour])

  function slotAt(dayIndex, hourIndex) {
    if (!availabilitySlots) return false
    const idx = dayIndex * hours + hourIndex
    return Boolean(availabilitySlots[idx])
  }

  const dayLabels = useMemo(() => {
    if (!weekStartISO) return WEEK_DAYS.map((name) => ({ name, date: '' }))
    return WEEK_DAYS.map((name, idx) => {
      const iso = addDaysISO(weekStartISO, idx)
      const date = new Date(`${iso}T12:00:00Z`)
      const dateLabel = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
      return { name, date: dateLabel }
    })
  }, [weekStartISO])

  return (
    <div className="weekCal">
      <div className="weekCalGrid weekCalHeader">
        <div className="weekCalCorner" />
        {dayLabels.map(({ name, date }) => (
          <div key={name} className="weekCalDay">
            <div>{name}</div>
            {date ? <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{date}</div> : null}
          </div>
        ))}
      </div>

      {headerRight ? (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {headerRight}
        </div>
      ) : null}

      <div className="weekCalGrid">
        {timeLabels.map((t, hourIndex) => {
          const row = hourIndex + 1
          const alt = hourIndex % 2 === 1
          return (
            <div key={t} style={{ display: 'contents' }}>
              <div className={`weekCalTime weekCalCell${alt ? ' alt' : ''}`} style={{ gridColumn: 1, gridRow: row }}>
                {t}
              </div>

              {Array.from({ length: 7 }).map((_, dayIndex) => {
                const active = slotAt(dayIndex, hourIndex)
                const variantClass = active ? ` ${slotVariant}` : ''
                return (
                  <button
                    key={`${t}-${dayIndex}`}
                    type="button"
                    className={`weekCalCell weekSlot${variantClass}${alt ? ' alt' : ''}`}
                    style={{ gridColumn: 2 + dayIndex, gridRow: row }}
                    onClick={() => onCellClick?.({ dayIndex, hour: startHour + hourIndex })}
                    aria-label={`${WEEK_DAYS[dayIndex]} at ${t}`}
                  />
                )
              })}
            </div>
          )
        })}

        {events.map((e) => {
          const col = 2 + e.dayIndex
          const row = 1 + (e.startHour - startHour)
          const span = Math.max(1, e.durationHours || 1)
          return (
            <div
              key={e.id}
              className="weekCalCell"
              style={{
                gridColumn: col,
                gridRow: `${row} / span ${span}`,
                zIndex: 2,
                background: 'transparent',
                border: 0,
              }}
            >
              <button
                type="button"
                className="weekEvent"
                onClick={() => e.onClick?.(e)}
                style={{
                  background: e.bg || undefined,
                  borderColor: e.border || undefined,
                }}
              >
                <div className="weekEventTitle">{e.title}</div>
                {e.subtitle ? <div className="weekEventSub">{e.subtitle}</div> : null}
                {e.meta ? <div className="weekEventMeta">{e.meta}</div> : null}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
