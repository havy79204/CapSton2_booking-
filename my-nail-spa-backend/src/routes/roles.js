const express = require('express')
const { query } = require('../config/query')

const rolesRoutes = express.Router()

rolesRoutes.get('/', async (req, res, next) => {
  try {
    const result = await query('SELECT RoleKey AS [key], DisplayName AS displayName FROM dbo.Roles ORDER BY DisplayName')
    res.json({ items: result.recordset })
  } catch (err) {
    next(err)
  }
})

module.exports = { rolesRoutes }
