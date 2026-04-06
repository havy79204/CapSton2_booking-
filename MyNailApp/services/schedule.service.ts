import { get, post } from './apiClient'

export const scheduleService = {
  fetchSchedule: (params?: string) => get(`/staff/schedule${params || ''}`),
  createShift: (payload: any) => post('/staff/schedule', payload),
}

export default scheduleService
