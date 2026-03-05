const express = require('express')
const cartsController = require('../controllers/cartsController')

const cartsRoutes = express.Router()

cartsRoutes.get('/:id', cartsController.getCart)
cartsRoutes.post('/', cartsController.upsertCart)
cartsRoutes.get('/:id/items', cartsController.getItems)
cartsRoutes.post('/:id/items', cartsController.addItem)
cartsRoutes.delete('/:id/items/:itemId', cartsController.deleteItem)

module.exports = { cartsRoutes }
