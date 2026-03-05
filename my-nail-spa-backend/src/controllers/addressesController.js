const { z } = require('zod')
const addressesService = require('../services/addressesService')

const addressSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone number is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().optional(),
  country: z.string().optional(),
  isDefault: z.boolean().optional(),
})

async function listAddresses(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const items = await addressesService.listAddresses(req.user.id)
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function getAddress(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const id = req.params.id
    const item = await addressesService.getAddress(id, req.user.id)
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

async function createAddress(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const payload = addressSchema.parse(req.body)
    const item = await addressesService.createAddress(payload, req.user.id)
    res.status(201).json({ item })
  } catch (err) {
    next(err)
  }
}

async function updateAddress(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const id = req.params.id
    const payload = addressSchema.partial().parse(req.body)
    const item = await addressesService.updateAddress(id, payload, req.user.id)
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

async function deleteAddress(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const id = req.params.id
    await addressesService.deleteAddress(id, req.user.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

async function setDefaultAddress(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const id = req.params.id
    const item = await addressesService.setDefaultAddress(id, req.user.id)
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
}
