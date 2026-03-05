/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api as backendApi } from '../lib/api'

const BookingContext = createContext(null)

export function BookingProvider({ children }) {
  const [bookings, setBookings] = useState([])

  useEffect(() => {
    let alive = true
    backendApi
      .listBookings()
      .then((r) => {
        if (!alive) return
        setBookings(Array.isArray(r?.items) ? r.items : [])
      })
      .catch(() => {
      })
    return () => {
      alive = false
    }
  }, [])

  const ctx = useMemo(() => {
    return {
      bookings,
      async refresh(params) {
        const r = await backendApi.listBookings(params || {})
        const next = Array.isArray(r?.items) ? r.items : []
        setBookings(next)
        return next
      },
      async create(booking) {
        const r = await backendApi.createBooking(booking)
        const record = r?.item
        if (record) setBookings((prev) => [record, ...prev])
        return record
      },
      async updateStatus(bookingId, status) {
        const r = await backendApi.updateBookingStatus(bookingId, status)
        const updated = r?.item
        if (updated) {
          setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)))
        }
        return updated
      },
      forSalonOnDay(salonId, dateISO) {
        return bookings.filter(
          (b) => b.salonId === salonId && b.dateISO === dateISO,
        )
      },
    }
  }, [bookings])

  return (
    <BookingContext.Provider value={ctx}>{children}</BookingContext.Provider>
  )
}

export function useBookings() {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBookings must be used within BookingProvider')
  return ctx
}
