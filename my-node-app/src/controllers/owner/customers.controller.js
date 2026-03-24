const { asyncHandler } = require('../../utils/asyncHandler')
const customersService = require('../../services/customers.service')
const customerCommerceService = require('../../services/customerCommerce.service')

const getCustomers = asyncHandler(async (req, res) => {
  const data = await customersService.listCustomers()
  res.json({ ok: true, data })
})

const postCustomer = asyncHandler(async (req, res) => {
  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await customersService.createCustomer(req.body)
  res.status(201).json({ ok: true, data })
})

const getCustomerById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await customersService.getCustomerById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Customer not found' })
    return
  }
  res.json({ ok: true, data })
})

const putCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await customersService.updateCustomer(id, req.body)
  res.json({ ok: true, data })
})

const deleteCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await customersService.deleteCustomer(id)
  res.json({ ok: true, data })
})

const getCustomerBookings = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await customerCommerceService.listBookings(id)
  res.json({ ok: true, data })
})

const getCustomerOrders = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await customerCommerceService.listOrders(id)
  res.json({ ok: true, data })
})

module.exports = {
  getCustomers,
  getCustomerById,
  postCustomer,
  putCustomer,
  deleteCustomer,
  getCustomerBookings,
  getCustomerOrders,
}
