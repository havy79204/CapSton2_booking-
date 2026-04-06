import { get, post, put } from './apiClient'

export const authService = {
  login: (payload: any) => post('/auth/login', payload),
  quickLogin: (payload: any) => post('/auth/quick-login', payload),
  me: () => get('/auth/me'),
  logout: () => post('/auth/logout', {}),
  updateProfile: (data: any) => put('/auth/me', data),
}

export default authService
