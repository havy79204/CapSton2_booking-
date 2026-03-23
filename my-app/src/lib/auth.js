const TOKEN_KEY = 'cap2_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token) {
  try {
    if (!token) {
      localStorage.removeItem(TOKEN_KEY)
      return
    }
    localStorage.setItem(TOKEN_KEY, String(token))
  } catch {
    // ignore
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}
