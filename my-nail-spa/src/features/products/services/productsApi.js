import api from '../../../lib/api'

export function fetchProducts(params) {
  return api.listProducts(params)
}

export function fetchProduct(id) {
  return api.getProduct(id)
}
