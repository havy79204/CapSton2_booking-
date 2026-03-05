import { useEffect, useState } from 'react'
import api from '../../../lib/api'

export function useProducts({ salonId, includeDraft } = {}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .listProducts({ salonId, includeDraft })
      .then((res) => {
        if (!alive) return
        setItems(Array.isArray(res?.items) ? res.items : [])
      })
      .catch((err) => {
        if (!alive) return
        setError(err)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [salonId, includeDraft])

  return { items, loading, error }
}
