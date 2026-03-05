/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { api as backendApi } from '../lib/api'

const ScheduleContext = createContext(null)

export const DEFAULT_START_HOUR = 9
export const DEFAULT_END_HOUR = 23

const EMPTY_LIST = []

export function makeEmptySlots(startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR) {
  const hours = Math.max(1, endHour - startHour)
  return Array.from({ length: 7 * hours }, () => false)
}

export function slotIndex(dayIndex, hourIndex, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR) {
  const hours = Math.max(1, endHour - startHour)
  return dayIndex * hours + hourIndex
}

export function ScheduleProvider({ children }) {
  const [staffBySalonId, setStaffBySalonId] = useState({})
  const [availabilityByKey, setAvailabilityByKey] = useState({})
  const [shiftsByKey, setShiftsByKey] = useState({})
  const [loading, setLoading] = useState({ staff: false, availability: false, shifts: false })
  const [error, setError] = useState(null)

  const staffBySalonIdRef = useRef(staffBySalonId)
  const availabilityByKeyRef = useRef(availabilityByKey)
  const shiftsByKeyRef = useRef(shiftsByKey)

  const inFlight = useRef({
    staff: new Map(),
    availability: new Map(),
    shifts: new Map(),
  })

  const availKey = useCallback((weekStartISO, staffId) => {
    return `${String(weekStartISO || '').slice(0, 10)}::${String(staffId || '').trim()}`
  }, [])

  const shiftsKey = useCallback((weekStartISO, salonId) => {
    return `${String(weekStartISO || '').slice(0, 10)}::${String(salonId || '').trim()}`
  }, [])

  const loadStaff = useCallback(async (salonId, { force = false } = {}) => {
    const sid = String(salonId || '').trim()
    if (!sid) return []

    const cached = staffBySalonIdRef.current?.[sid]
    if (!force && Array.isArray(cached)) return cached

    const inFlightPromise = inFlight.current.staff.get(sid)
    if (inFlightPromise) return inFlightPromise

    setLoading((p) => ({ ...p, staff: true }))
    setError(null)

    const promise = (async () => {
      try {
        const res = await backendApi.listUsers({ salonId: sid })
        // Hide disabled/terminated staff so they don't appear in scheduling.
        const list = (res?.items || []).filter((u) => u?.role === 'staff' && u?.status !== 'disabled')
        setStaffBySalonId((prev) => {
          const next = { ...prev, [sid]: list }
          staffBySalonIdRef.current = next
          return next
        })
        return list
      } catch (e) {
        setError(e)
        return []
      } finally {
        setLoading((p) => ({ ...p, staff: false }))
        inFlight.current.staff.delete(sid)
      }
    })()

    inFlight.current.staff.set(sid, promise)
    return promise
  }, [])

  const loadAvailability = useCallback(async ({ weekStartISO, staffId, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR, force = false } = {}) => {
    if (!weekStartISO || !staffId) return null

    const key = availKey(weekStartISO, staffId)
    if (!force && Object.prototype.hasOwnProperty.call(availabilityByKeyRef.current || {}, key)) {
      return availabilityByKeyRef.current[key]
    }

    const inFlightPromise = inFlight.current.availability.get(key)
    if (inFlightPromise) return inFlightPromise

    setLoading((p) => ({ ...p, availability: true }))
    setError(null)

    const promise = (async () => {
      try {
        const res = await backendApi.getStaffAvailability({ weekStartISO, staffId, startHour, endHour })
        const item = res?.item
        setAvailabilityByKey((prev) => {
          const next = { ...prev, [key]: item }
          availabilityByKeyRef.current = next
          return next
        })
        return item
      } catch (e) {
        setError(e)
        return null
      } finally {
        setLoading((p) => ({ ...p, availability: false }))
        inFlight.current.availability.delete(key)
      }
    })()

    inFlight.current.availability.set(key, promise)
    return promise
  }, [availKey])

  const loadShifts = useCallback(async ({ weekStartISO, salonId, force = false } = {}) => {
    if (!weekStartISO || !salonId) return []

    const key = shiftsKey(weekStartISO, salonId)
    const cached = shiftsByKeyRef.current?.[key]
    if (!force && Array.isArray(cached)) return cached

    const inFlightPromise = inFlight.current.shifts.get(key)
    if (inFlightPromise) return inFlightPromise

    setLoading((p) => ({ ...p, shifts: true }))
    setError(null)

    const promise = (async () => {
      try {
        const res = await backendApi.listShifts({ weekStartISO, salonId })
        const list = res?.items || []
        setShiftsByKey((prev) => {
          const next = { ...prev, [key]: list }
          shiftsByKeyRef.current = next
          return next
        })
        return list
      } catch (e) {
        setError(e)
        return []
      } finally {
        setLoading((p) => ({ ...p, shifts: false }))
        inFlight.current.shifts.delete(key)
      }
    })()

    inFlight.current.shifts.set(key, promise)
    return promise
  }, [shiftsKey])

  const setShiftsCache = useCallback((weekStartISO, salonId, nextList) => {
    const key = shiftsKey(weekStartISO, salonId)
    setShiftsByKey((prev) => {
      const next = { ...prev, [key]: Array.isArray(nextList) ? nextList : [] }
      shiftsByKeyRef.current = next
      return next
    })
  }, [shiftsKey])

  const upsertShiftInCache = useCallback((weekStartISO, salonId, shift) => {
    if (!shift?.id) return
    const key = shiftsKey(weekStartISO, salonId)
    setShiftsByKey((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : []
      const exists = current.some((s) => s?.id === shift.id)
      const merged = exists
        ? current.map((s) => (s?.id === shift.id ? { ...s, ...shift } : s))
        : [...current, shift]
      merged.sort((a, b) => {
        const ad = Number(a?.dayIndex ?? 0)
        const bd = Number(b?.dayIndex ?? 0)
        if (ad !== bd) return ad - bd
        const ah = Number(a?.startHour ?? 0)
        const bh = Number(b?.startHour ?? 0)
        return ah - bh
      })
      const next = { ...prev, [key]: merged }
      shiftsByKeyRef.current = next
      return next
    })
  }, [shiftsKey])

  const removeShiftFromCache = useCallback((weekStartISO, salonId, shiftId) => {
    const key = shiftsKey(weekStartISO, salonId)
    setShiftsByKey((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : []
      const nextList = current.filter((s) => s?.id !== shiftId)
      const next = { ...prev, [key]: nextList }
      shiftsByKeyRef.current = next
      return next
    })
  }, [shiftsKey])

  const api = useMemo(() => {
    return {
      loading,
      error,

      loadStaff,
      loadAvailability,
      loadShifts,

      staffForSalon(salonId) {
        const sid = String(salonId || '').trim()
        return staffBySalonId[sid] || EMPTY_LIST
      },

      getAvailability(weekStartISO, staffId, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR) {
        const hours = Math.max(1, endHour - startHour)
        const item = availabilityByKey[availKey(weekStartISO, staffId)]
        const slots = item?.slots
        if (Array.isArray(slots) && slots.length === 7 * hours) return slots
        return makeEmptySlots(startHour, endHour)
      },

      async setAvailability(weekStartISO, staffId, slots, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR) {
        const key = availKey(weekStartISO, staffId)
        setAvailabilityByKey((prev) => ({
          ...prev,
          [key]: {
            weekStartISO: String(weekStartISO || '').slice(0, 10),
            staffId,
            startHour,
            endHour,
            slots: Array.isArray(slots) ? slots : [],
            updatedAt: new Date().toISOString(),
          },
        }))
        availabilityByKeyRef.current = {
          ...availabilityByKeyRef.current,
          [key]: {
            weekStartISO: String(weekStartISO || '').slice(0, 10),
            staffId,
            startHour,
            endHour,
            slots: Array.isArray(slots) ? slots : [],
            updatedAt: new Date().toISOString(),
          },
        }

        try {
          await backendApi.setStaffAvailability({ weekStartISO, staffId, startHour, endHour, slots })
        } catch (e) {
          setError(e)
        }
      },

      listShifts(weekStartISO, salonId) {
        return shiftsByKey[shiftsKey(weekStartISO, salonId)] || EMPTY_LIST
      },

      async createShift(weekStartISO, salonId, shift) {
        const payload = { weekStartISO, salonId, ...shift }
        const res = await backendApi.createShift(payload)
        const item = res?.item
        if (item) upsertShiftInCache(weekStartISO, salonId, item)
        // Ensure we revalidate against server, even if cache exists.
        void loadShifts({ weekStartISO, salonId, force: true })
        return item
      },

      async updateShift(weekStartISO, salonId, shiftId, patch) {
        await backendApi.updateShift(shiftId, patch)
        upsertShiftInCache(weekStartISO, salonId, { id: shiftId, ...patch })
        void loadShifts({ weekStartISO, salonId, force: true })
      },

      async removeShift(weekStartISO, salonId, shiftId) {
        await backendApi.deleteShift(shiftId)
        removeShiftFromCache(weekStartISO, salonId, shiftId)
        void loadShifts({ weekStartISO, salonId, force: true })
      },
    }
  }, [availabilityByKey, availKey, error, loadAvailability, loadShifts, loadStaff, loading, removeShiftFromCache, setShiftsCache, shiftsByKey, shiftsKey, staffBySalonId, upsertShiftInCache])

  return <ScheduleContext.Provider value={api}>{children}</ScheduleContext.Provider>
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider')
  return ctx
}
