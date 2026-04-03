const { asyncHandler } = require('../../utils/asyncHandler')
const settingsService = require('../../services/settings.service')

function getUserIdFromReq(req) {
  const userId = String(req.userId || req.user?.sub || '').trim()
  return userId || null
}

const getSettings = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await settingsService.getSettingsMap({ userId })
  res.json({ ok: true, data })
})

const putSettings = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const updates = req.body?.updates
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ ok: false, error: 'Missing updates object' })
    return
  }

  await settingsService.updateSettingsMap(updates, { userId })
  res.json({ ok: true })
})

module.exports = {
  getSettings,
  putSettings,
}
