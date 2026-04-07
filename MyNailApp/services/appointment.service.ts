import { get, post, put, del } from './apiClient'

export const appointmentService = {
  list: (qs = '') => get(`/staff/appointments${qs}`),
  create: (payload: any) => post('/staff/appointments', payload),
  update: (id: string, payload: any) => put(`/staff/appointments/${id}`, payload),
  remove: (id: string) => del(`/staff/appointments/${id}`),
}

export default appointmentService
