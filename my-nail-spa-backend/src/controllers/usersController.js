const { z } = require('zod')
const usersService = require('../services/usersService')
const usersRepo = require('../repositories/usersRepository')

async function listUsers(req, res, next) {
  try {
    const roleKey = req.query.role ? String(req.query.role).trim() : null
    const salonId = req.query.salonId ? String(req.query.salonId).trim() : null
    const result = await usersService.listUsers({ role: roleKey, salonId, requester: req.user })
    res.json({ items: result.recordset.map(usersService.mapUserRow) })
  } catch (err) {
    next(err)
  }
}

async function getUser(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const result = await usersRepo.findUserById(id)
    const row = result.recordset[0]
    if (!row) return res.status(404).json({ error: 'User not found' })
    if (req.user.role === 'owner') usersService.assertSalonScope(req, row.SalonId)
    res.json({ item: usersService.mapUserRow(row) })
  } catch (err) {
    next(err)
  }
}

async function createUserHandler(req, res, next) {
  try {
    const result = await usersService.createUser(req.body, req.user)
    const createdRow = result.created.recordset[0]
    res.status(201).json({ item: usersService.mapUserRow(createdRow), emailSent: result.emailSent })
  } catch (err) {
    next(err)
  }
}

async function patchUserHandler(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const updatedRes = await usersService.patchUser(id, req.body, req.user)
    const row = updatedRes.recordset[0]
    res.json({ item: usersService.mapUserRow(row) })
  } catch (err) {
    next(err)
  }
}

async function deleteUserHandler(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    await usersRepo.deleteUser(id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listUsers,
  getUser,
  createUserHandler,
  patchUserHandler,
  deleteUserHandler,
}
