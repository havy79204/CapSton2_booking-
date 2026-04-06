import { get } from './apiClient'

export const payrollService = {
  staffPayroll: (staffId: string) => get(`/staff/payroll/${staffId}`),
  summary: () => get('/staff/dashboard/summary'),
}

export default payrollService
