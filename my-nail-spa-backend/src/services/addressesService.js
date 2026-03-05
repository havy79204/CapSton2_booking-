const repo = require('../repositories/addressesRepository')
const { newId } = require('../config/query')

function mapAddressRow(row) {
  if (!row) return null
  return {
    id: row.AddressId,
    userId: row.UserId,
    name: row.FullName,
    phone: row.PhoneNumber,
    address: row.AddressLine,
    city: row.City || '',
    country: row.Country || 'Vietnam',
    isDefault: row.IsDefault,
  }
}

async function listAddresses(userId) {
  const rows = await repo.findAddressesByUser(userId)
  return rows.map(mapAddressRow)
}

async function getAddress(id, userId) {
  const row = await repo.findAddressById(id)
  if (!row) throw new Error('Address not found')
  if (row.UserId !== userId) throw new Error('Unauthorized')
  return mapAddressRow(row)
}

async function createAddress(payload, userId) {
  const id = newId()
  
  // If this is set as default, clear other defaults first
  if (payload.isDefault) {
    await repo.clearDefaultForUser(userId)
  }

  const row = await repo.createAddress({
    id,
    userId,
    fullName: payload.name,
    phoneNumber: payload.phone,
    addressLine: payload.address,
    city: payload.city || null,
    country: payload.country || 'Vietnam',
    isDefault: payload.isDefault || false,
  })
  return mapAddressRow(row)
}

async function updateAddress(id, payload, userId) {
  const existing = await repo.findAddressById(id)
  if (!existing) throw new Error('Address not found')
  if (existing.UserId !== userId) throw new Error('Unauthorized')

  // If setting as default, clear other defaults first
  if (payload.isDefault && !existing.IsDefault) {
    await repo.clearDefaultForUser(userId)
  }

  // Build update object, only including provided fields
  const updates = {}
  if (payload.name !== undefined) updates.fullName = payload.name
  if (payload.phone !== undefined) updates.phoneNumber = payload.phone
  if (payload.address !== undefined) updates.addressLine = payload.address
  if (payload.city !== undefined) updates.city = payload.city
  if (payload.country !== undefined) updates.country = payload.country
  if (payload.isDefault !== undefined) updates.isDefault = payload.isDefault

  const row = await repo.updateAddress(id, updates)
  return mapAddressRow(row)
}

async function deleteAddress(id, userId) {
  const existing = await repo.findAddressById(id)
  if (!existing) throw new Error('Address not found')
  if (existing.UserId !== userId) throw new Error('Unauthorized')
  await repo.deleteAddress(id)
}

async function setDefaultAddress(id, userId) {
  const existing = await repo.findAddressById(id)
  if (!existing) throw new Error('Address not found')
  if (existing.UserId !== userId) throw new Error('Unauthorized')
  
  await repo.clearDefaultForUser(userId)
  const row = await repo.updateAddress(id, { isDefault: true })
  return mapAddressRow(row)
}

module.exports = {
  listAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
}
