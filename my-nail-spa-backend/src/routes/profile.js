const express = require('express')
const { authRequired } = require('../middleware/auth')
const { query } = require('../config/query')
const sql = require('mssql')

const profileRoutes = express.Router()

// All profile routes require authentication
profileRoutes.use(authRequired)

// Get profile stats
profileRoutes.get('/stats', async (req, res, next) => {
  try {
    // Since Bookings table doesn't have CustomerUserId/CustomerEmail yet,
    // return zeros until migration is run
    res.json({
      upcoming: 0,
      pending: 0,
      inProgress: 0,
      completed: 0
    })
  } catch (err) {
    next(err)
  }
})

// Get profile bookings
profileRoutes.get('/bookings', async (req, res, next) => {
  try {
    // Since Bookings table doesn't have CustomerUserId/CustomerEmail yet,
    // return empty array until migration is run
    res.json({ items: [] })
  } catch (err) {
    next(err)
  }
})

// Get profile orders
profileRoutes.get('/orders', async (req, res, next) => {
  try {
    const userId = req.user.id
    
    const result = await query(`
      SELECT 
        o.OrderId,
        o.CustomerUserId,
        o.Total as TotalAmount,
        o.Status,
        o.PaymentMethod,
        o.CustomerAddress as ShippingAddress,
        o.CreatedAt,
        oi.ProductId,
        p.Name as ProductName,
        p.ImageUrl as ProductImage
      FROM Orders o
      LEFT JOIN OrderItems oi ON o.OrderId = oi.OrderId
      LEFT JOIN Products p ON oi.ProductId = p.ProductId
      WHERE o.CustomerUserId = @userId
      ORDER BY o.CreatedAt DESC
    `, { userId })
    
    // Group order items by order
    const ordersMap = new Map()
    result.recordset.forEach(row => {
      if (!ordersMap.has(row.OrderId)) {
        ordersMap.set(row.OrderId, {
          id: row.OrderId,
          orderNumber: row.OrderId.substring(0, 8), // Use first 8 chars as order number
          customerId: row.CustomerUserId,
          totalAmount: parseFloat(row.TotalAmount || 0),
          status: row.Status,
          paymentMethod: row.PaymentMethod,
          shippingAddress: row.ShippingAddress,
          orderDate: row.CreatedAt,
          createdAt: row.CreatedAt,
          productName: row.ProductName,
          productImage: row.ProductImage,
          items: []
        })
      }
      
      if (row.ProductId) {
        const order = ordersMap.get(row.OrderId)
        order.items.push({
          productId: row.ProductId,
          productName: row.ProductName,
          productImage: row.ProductImage
        })
      }
    })
    
    const items = Array.from(ordersMap.values())
    res.json(items)
  } catch (err) {
    next(err)
  }
})

module.exports = { profileRoutes }
