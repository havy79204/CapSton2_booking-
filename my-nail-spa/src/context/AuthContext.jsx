/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadJson, saveJson } from '../lib/storage'
import { api as backendApi } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const existing = loadJson('auth', null)
    if (!existing) return { user: null, token: null }
    if (existing?.email) return { user: null, token: null }
    return {
      user: existing?.user || null,
      token: existing?.token || null,
    }
  })

  function persistSession(next) {
    const safe = {
      user: next?.user || null,
      token: next?.token || null,
    }
    setSession(safe)
    saveJson('auth', safe)
  }

  const user = session?.user || null
  const token = session?.token || null

  useEffect(() => {
    let cancelled = false

    async function refreshMe() {
      if (!token) return
      try {
        const res = await backendApi.me()
        if (cancelled) return
        if (!res?.user?.email) return
        persistSession({
          user: res.user,
          token: res.token || token,
        })
      } catch {
        if (!cancelled) persistSession({ user: null, token: null })
      }
    }

    void refreshMe()
    return () => {
      cancelled = true
    }
  }, [token])

  const ctx = useMemo(() => {
    return {
      user,
      isAuthed: Boolean(user?.email && token),
      async login({ email, password }) {
        const cleanEmail = String(email || '').trim().toLowerCase()
        const cleanPassword = String(password || '')

        if (!cleanEmail) throw new Error('Please enter your email')
        if (!cleanPassword) throw new Error('Please enter your password')

        const result = await backendApi.login({ email: cleanEmail, password: cleanPassword })
        persistSession({ user: result.user, token: result.token })
        return result.user
      },
      async signup({ name, email, password }) {
        const cleanEmail = String(email || '').trim().toLowerCase()
        const cleanName = String(name || '').trim()
        const cleanPassword = String(password || '')
        if (!cleanName) throw new Error('Please enter your name')
        if (!cleanEmail) throw new Error('Please enter your email')
        if (!cleanPassword) throw new Error('Please enter your password')

        const result = await backendApi.signup({ name: cleanName, email: cleanEmail, password: cleanPassword })
        if (result?.requiresVerification) {
          return { requiresVerification: true, email: cleanEmail, devToken: result?.devToken }
        }

        persistSession({ user: result.user, token: result.token })
        return result.user
      },
      logout() {
        persistSession({ user: null, token: null })
        // Clear server cart cookie to force new cart on next visit
        document.cookie = 'serverCartId=; Max-Age=0; path=/;'
        // Optionally trigger a reload or event if needed, but simple logout usually re-mounts providers or redirects
        window.location.reload()
      },
      async updateProfile(patch) {
        const payload = {}
        if (patch?.name) payload.name = String(patch.name).trim()
        if (patch?.email) payload.email = String(patch.email).trim().toLowerCase()
        if (!payload.name && !payload.email) throw new Error('Nothing to update')

        const res = await backendApi.updateMe(payload)
        persistSession({ user: res.user, token: res.token || token })
        return res.user
      },
      async changePassword({ currentPassword, newPassword }) {
        const current = String(currentPassword || '')
        const next = String(newPassword || '')
        if (!current) throw new Error('Enter your current password')
        if (!next) throw new Error('Enter a new password')
        await backendApi.changePassword({ currentPassword: current, newPassword: next })
        return true
      },
    }
  }, [token, user])

  return <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
