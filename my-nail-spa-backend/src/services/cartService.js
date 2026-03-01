const cartRepo = require('../repositories/cartRepository')

async function getCart(cartId) {
  return cartRepo.getCartById(cartId)
}

async function upsertCart(cartId, payload) {
  return cartRepo.upsertCart(cartId, payload)
}

async function getItems(cartId) {
  return cartRepo.getCartItems(cartId)
}

async function addItem(cartId, productId, qty) {
  return cartRepo.upsertCartItem({ cartId, productId, qty })
}

async function removeItem(itemId) {
  return cartRepo.deleteCartItem(itemId)
}

module.exports = { getCart, upsertCart, getItems, addItem, removeItem }
