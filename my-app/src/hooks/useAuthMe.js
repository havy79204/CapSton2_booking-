import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export const AUTH_ME_UPDATED_EVENT = 'auth-me-updated'

export function notifyAuthMeUpdated(payload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUTH_ME_UPDATED_EVENT, { detail: payload || null }))
}

export function useAuthMe() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.get('/api/auth/me')
      const withVersion = data ? { ...data, _avatarVersion: Date.now() } : null
      setMe(withVersion)
      return withVersion
    } catch {
      setMe(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    
    const loadMe = async () => {
      try {
        setLoading(true)
        const data = await api.get('/api/auth/me')
        if (isMounted) {
          const withVersion = data ? { ...data, _avatarVersion: Date.now() } : null
          setMe(withVersion)
        }
      } catch {
        if (isMounted) {
          setMe(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadMe()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onUpdated = (event) => {
      const updated = event?.detail || null
      if (updated) {
        setMe({ ...updated, _avatarVersion: updated?._avatarVersion || Date.now() })
      } else {
        refresh().catch(() => {})
      }
    }

    window.addEventListener(AUTH_ME_UPDATED_EVENT, onUpdated)
    return () => {
      window.removeEventListener(AUTH_ME_UPDATED_EVENT, onUpdated)
    }
  }, [refresh])

  return { me, loading, refresh }
}
