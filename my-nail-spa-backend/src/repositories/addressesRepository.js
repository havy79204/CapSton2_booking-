const { getPool } = require('../config/db')
const sql = require('mssql')

async function findAddressesByUser(userId) {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('UserId', sql.NVarChar(50), userId)
    .query(`
      SELECT AddressId, UserId, FullName, PhoneNumber, AddressLine, City, Country, IsDefault
      FROM dbo.Addresses
      WHERE UserId = @UserId
      ORDER BY IsDefault DESC
    `)
  return result.recordset
}

async function findAddressById(id) {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('Id', sql.NVarChar(50), id)
    .query('SELECT * FROM dbo.Addresses WHERE AddressId = @Id')
  return result.recordset[0]
}

async function createAddress(data) {
  const pool = await getPool()
  const result = await pool
    .request()
    .input('AddressId', sql.NVarChar(50), data.id)
    .input('UserId', sql.NVarChar(50), data.userId)
    .input('FullName', sql.NVarChar(200), data.fullName)
    .input('PhoneNumber', sql.NVarChar(50), data.phoneNumber)
    .input('AddressLine', sql.NVarChar(500), data.addressLine)
    .input('City', sql.NVarChar(100), data.city || null)
    .input('Country', sql.NVarChar(100), data.country || 'Vietnam')
    .input('IsDefault', sql.Bit, data.isDefault || false)
    .query(`
      INSERT INTO dbo.Addresses (AddressId, UserId, FullName, PhoneNumber, AddressLine, City, Country, IsDefault)
      OUTPUT INSERTED.*
      VALUES (@AddressId, @UserId, @FullName, @PhoneNumber, @AddressLine, @City, @Country, @IsDefault)
    `)
  return result.recordset[0]
}

async function updateAddress(id, data) {
  const pool = await getPool()
  const parts = []
  const request = pool.request().input('Id', sql.NVarChar(50), id)

  if (data.fullName !== undefined) {
    parts.push('FullName = @FullName')
    request.input('FullName', sql.NVarChar(200), data.fullName)
  }
  if (data.phoneNumber !== undefined) {
    parts.push('PhoneNumber = @PhoneNumber')
    request.input('PhoneNumber', sql.NVarChar(50), data.phoneNumber)
  }
  if (data.addressLine !== undefined) {
    parts.push('AddressLine = @AddressLine')
    request.input('AddressLine', sql.NVarChar(500), data.addressLine)
  }
  if (data.city !== undefined) {
    parts.push('City = @City')
    request.input('City', sql.NVarChar(100), data.city)
  }
  if (data.country !== undefined) {
    parts.push('Country = @Country')
    request.input('Country', sql.NVarChar(100), data.country)
  }
  if (data.isDefault !== undefined) {
    parts.push('IsDefault = @IsDefault')
    request.input('IsDefault', sql.Bit, data.isDefault)
  }

  if (parts.length === 0) {
    return await findAddressById(id)
  }

  const result = await request.query(`
    UPDATE dbo.Addresses
    SET ${parts.join(', ')}
    OUTPUT INSERTED.*
    WHERE AddressId = @Id
  `)
  return result.recordset[0]
}

async function deleteAddress(id) {
  const pool = await getPool()
  await pool.request().input('Id', sql.NVarChar(50), id).query('DELETE FROM dbo.Addresses WHERE AddressId = @Id')
}

async function clearDefaultForUser(userId) {
  const pool = await getPool()
  await pool
    .request()
    .input('UserId', sql.NVarChar(50), userId)
    .query('UPDATE dbo.Addresses SET IsDefault = 0 WHERE UserId = @UserId')
}

module.exports = {
  findAddressesByUser,
  findAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
  clearDefaultForUser,
}
