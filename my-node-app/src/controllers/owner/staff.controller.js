const { asyncHandler } = require('../../utils/asyncHandler')
const staffService = require('../../services/staff.service')

const getStaff = asyncHandler(async (req, res) => {
  const data = await staffService.listStaff(req.query || {})
  res.json({ ok: true, data })
})

const getStaffSkillCategories = asyncHandler(async (req, res) => {
  const data = await staffService.listStaffSkillCategories()
  res.json({ ok: true, data })
})

const postStaff = asyncHandler(async (req, res) => {
  const { name } = req.body || {}
  if (!name) {
    res.status(400).json({ ok: false, error: 'Missing name' })
    return
  }

  const data = await staffService.createStaff(req.body)
  res.status(201).json({ ok: true, data })
})

const getStaffById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await staffService.getStaffById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Staff not found' })
    return
  }

  res.json({ ok: true, data })
})

const putStaff = asyncHandler(async (req, res) => {
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

  const data = await staffService.updateStaff(id, req.body)
  res.json({ ok: true, data })
})

const deleteStaff = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await staffService.deleteStaff(id)
  res.json({ ok: true, data })
})

const postStaffAvatar = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const { dataUrl } = req.body || {}
  const data = await staffService.uploadStaffAvatarFromDataUrl(id, { dataUrl })
  res.json({ ok: true, data })
})

module.exports = {
  getStaff,
  getStaffSkillCategories,
  getStaffById,
  postStaff,
  putStaff,
  deleteStaff,
  postStaffAvatar,
}
