import { useState, useEffect } from 'react'
import { api, resolveApiImageUrl } from '../lib/api'

/**
 * Hook to fetch homepage data from backend
 */
export function useHomepage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchHomepage() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get('/api/homepage')
        setData(result)
      } catch (err) {
        console.error('Error fetching homepage:', err)
        setError(err.message || 'Failed to fetch homepage data')
      } finally {
        setLoading(false)
      }
    }

    fetchHomepage()
  }, [])

  return { data, loading, error }
}

/**
 * Hook to fetch services from backend
 */
export function useServices() {
  const [services, setServices] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchServices() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get('/api/homepage/services')
        const normalizedServices = (Array.isArray(result) ? result : []).map((service) => {
          const rawImages = Array.isArray(service?.Images) ? service.Images : []
          const images = rawImages
            .map((img) => resolveApiImageUrl(img))
            .filter(Boolean)

          const primaryImage = resolveApiImageUrl(service?.ImageUrl) || images[0] || ''
          if (primaryImage && !images.includes(primaryImage)) {
            images.unshift(primaryImage)
          }

          return {
            ...service,
            ImageUrl: primaryImage,
            Images: images,
          }
        })

        setServices(normalizedServices)
      } catch (err) {
        console.error('Error fetching services:', err)
        setError(err.message || 'Failed to fetch services')
      } finally {
        setLoading(false)
      }
    }

    fetchServices()
  }, [])

  return { services, loading, error }
}

/**
 * Hook to fetch products from backend
 */
export function useProducts() {
  const [products, setProducts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get('/api/homepage/products')
        const normalizedProducts = (Array.isArray(result) ? result : []).map((product) => {
          const rawImages = Array.isArray(product?.Images) ? product.Images : []
          const images = rawImages
            .map((img) => resolveApiImageUrl(img))
            .filter(Boolean)

          const primaryImage = resolveApiImageUrl(product?.ImageUrl) || images[0] || ''
          if (primaryImage && !images.includes(primaryImage)) {
            images.unshift(primaryImage)
          }

          return {
            ...product,
            ImageUrl: primaryImage,
            Images: images,
          }
        })

        setProducts(normalizedProducts)
      } catch (err) {
        console.error('Error fetching products:', err)
        setError(err.message || 'Failed to fetch products')
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  return { products, loading, error }
}

/**
 * Hook to fetch reviews from backend
 */
export function useReviews(limit = 10) {
  const [reviews, setReviews] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchReviews() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get(`/api/homepage/reviews?limit=${limit}`)
        const avatarVersion = Date.now()
        const normalized = (Array.isArray(result) ? result : []).map((review) => ({
          ...review,
          Avatar: resolveApiImageUrl(review?.Avatar),
          _avatarVersion: avatarVersion,
        }))
        setReviews(normalized)
      } catch (err) {
        console.error('Error fetching reviews:', err)
        setError(err.message || 'Failed to fetch reviews')
      } finally {
        setLoading(false)
      }
    }

    fetchReviews()
  }, [limit])

  return { reviews, loading, error }
}

/**
 * Hook to get reviews by service from DB
 */
export function useServiceReviews(serviceId, limit = 50) {
  const [reviews, setReviews] = useState([])
  const [ratingSummary, setRatingSummary] = useState({ AverageRating: 0, ReviewCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!serviceId) {
      setReviews([])
      setRatingSummary({ AverageRating: 0, ReviewCount: 0 })
      setLoading(false)
      return
    }

    async function fetchServiceReviews() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get(`/api/homepage/services/${serviceId}/reviews?limit=${limit}`)
        const avatarVersion = Date.now()
        const normalizedReviews = (Array.isArray(result?.reviews) ? result.reviews : []).map((review) => ({
          ...review,
          Avatar: resolveApiImageUrl(review?.Avatar),
          _avatarVersion: avatarVersion,
        }))
        setReviews(normalizedReviews)
        setRatingSummary(result?.ratingSummary || { AverageRating: 0, ReviewCount: 0 })
      } catch (err) {
        console.error('Error fetching service reviews:', err)
        setError(err.message || 'Failed to fetch service reviews')
      } finally {
        setLoading(false)
      }
    }

    fetchServiceReviews()
  }, [serviceId, limit])

  return {
    reviews,
    ratingSummary,
    loading,
    error,
    async submitReview(payload) {
      const result = await api.post(`/api/homepage/services/${serviceId}/reviews`, payload || {})
      const avatarVersion = Date.now()
      const normalizedReviews = (Array.isArray(result?.reviews) ? result.reviews : []).map((review) => ({
        ...review,
        Avatar: resolveApiImageUrl(review?.Avatar),
        _avatarVersion: avatarVersion,
      }))
      setReviews(normalizedReviews)
      setRatingSummary(result?.ratingSummary || { AverageRating: 0, ReviewCount: 0 })
      return result
    },
  }
}

/**
 * Hook to get rating for product
 */
export function useProductRating(productId) {
  const [ratingSummary, setRatingSummary] = useState({ AverageRating: 0, ReviewCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!productId) {
      setRatingSummary({ AverageRating: 0, ReviewCount: 0 })
      setLoading(false)
      return
    }

    async function fetchProductRating() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get(`/api/homepage/products/${productId}/rating`)
        setRatingSummary(result || { AverageRating: 0, ReviewCount: 0 })
      } catch (err) {
        console.error('Error fetching product rating:', err)
        setError(err.message || 'Failed to fetch product rating')
      } finally {
        setLoading(false)
      }
    }

    fetchProductRating()
  }, [productId])

  return { ratingSummary, loading, error }
}

/**
 * Hook to get reviews by product from DB
 */
export function useProductReviews(productId, limit = 50) {
  const [reviews, setReviews] = useState([])
  const [ratingSummary, setRatingSummary] = useState({ AverageRating: 0, ReviewCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!productId) {
      setReviews([])
      setRatingSummary({ AverageRating: 0, ReviewCount: 0 })
      setLoading(false)
      return
    }

    async function fetchProductReviews() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get(`/api/homepage/products/${productId}/reviews?limit=${limit}`)
        const avatarVersion = Date.now()
        const normalizedReviews = (Array.isArray(result?.reviews) ? result.reviews : []).map((review) => ({
          ...review,
          Avatar: resolveApiImageUrl(review?.Avatar),
          _avatarVersion: avatarVersion,
        }))
        setReviews(normalizedReviews)
        setRatingSummary(result?.ratingSummary || { AverageRating: 0, ReviewCount: 0 })
      } catch (err) {
        console.error('Error fetching product reviews:', err)
        setError(err.message || 'Failed to fetch product reviews')
      } finally {
        setLoading(false)
      }
    }

    fetchProductReviews()
  }, [productId, limit])

  return {
    reviews,
    ratingSummary,
    loading,
    error,
    async submitReview(payload) {
      const result = await api.post(`/api/homepage/products/${productId}/reviews`, payload || {})
      const avatarVersion = Date.now()
      const normalizedReviews = (Array.isArray(result?.reviews) ? result.reviews : []).map((review) => ({
        ...review,
        Avatar: resolveApiImageUrl(review?.Avatar),
        _avatarVersion: avatarVersion,
      }))
      setReviews(normalizedReviews)
      setRatingSummary(result?.ratingSummary || { AverageRating: 0, ReviewCount: 0 })
      return result
    },
  }
}

/**
 * Hook to fetch salon stats from backend
 */
export function useSalonStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true)
        setError(null)
        const result = await api.get('/api/homepage/stats')
        setStats(result)
      } catch (err) {
        console.error('Error fetching salon stats:', err)
        setError(err.message || 'Failed to fetch salon stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return { stats, loading, error }
}
